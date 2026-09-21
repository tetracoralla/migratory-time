import assert from 'node:assert/strict'
import { cp, lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repoRoot = resolve(import.meta.dirname, '..')
const pluginRoot = resolve(repoRoot, 'plugins/migratory-time')
const expectedFiles = [
  '.codex-plugin/plugin.json',
  '.mcp.json',
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
  'assets/migratory-color.png',
  'server/index.mjs',
  'skills/convert-time-zones/SKILL.md',
  'skills/convert-time-zones/agents/openai.yaml',
  'skills/find-shared-time-windows/SKILL.md',
  'skills/plan-time-commitments/SKILL.md',
]
const expectedTools = [
  'compute_deadline',
  'convert_time',
  'current_times',
  'expand_schedule',
  'find_time_windows',
  'list_time_zones',
  'resolve_time',
  'search_time_zones',
  'validate_time_plan',
]
const expectedResources = [
  'migratory-time://schemas/compute_deadline/result.json',
  'migratory-time://schemas/expand_schedule/result.json',
  'migratory-time://schemas/find_time_windows/result.json',
  'migratory-time://schemas/resolve_time/result.json',
  'migratory-time://schemas/validate_time_plan/result.json',
]

async function listPackageFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const stats = await lstat(absolutePath)
    assert.equal(stats.isSymbolicLink(), false, `Plugin package must not contain symlinks: ${relativePath}`)
    if (entry.isDirectory()) {
      files.push(...(await listPackageFiles(absolutePath, relativePath)))
    } else {
      assert.equal(entry.isFile(), true, `Plugin package entry must be a regular file: ${relativePath}`)
      files.push(relativePath)
    }
  }
  return files.sort()
}

function resolveContained(root, relativePath, field) {
  assert.equal(typeof relativePath, 'string', `${field} must be a string path`)
  assert.ok(relativePath.startsWith('./'), `${field} must be plugin-relative`)
  const absolutePath = resolve(root, relativePath)
  assert.ok(
    absolutePath.startsWith(`${root}${sep}`),
    `${field} must resolve inside the plugin package`,
  )
  return absolutePath
}

const actualFiles = await listPackageFiles(pluginRoot)
assert.deepEqual(actualFiles, expectedFiles, 'Standalone plugin package file inventory drifted')

const rootPackage = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'))
const pluginManifest = JSON.parse(
  await readFile(resolve(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'),
)
assert.equal(pluginManifest.name, 'migratory-time')
assert.match(pluginManifest.version, /^2\.0\.0\+codex\.\d{14}$/u)
assert.equal(pluginManifest.license, 'Apache-2.0')
assert.equal(pluginManifest.skills, './skills/')
const marketplace = JSON.parse(
  await readFile(resolve(repoRoot, '.agents/plugins/marketplace.json'), 'utf8'),
)
assert.equal(marketplace.name, 'migratory-time')
assert.equal(marketplace.interface?.displayName, pluginManifest.interface?.displayName)
assert.deepEqual(marketplace.plugins, [
  {
    category: pluginManifest.interface.category,
    name: pluginManifest.name,
    policy: {
      authentication: 'ON_INSTALL',
      installation: 'AVAILABLE',
    },
    source: {
      path: './plugins/migratory-time',
      source: 'local',
    },
  },
])
assert.equal(
  resolveContained(repoRoot, marketplace.plugins[0].source.path, 'marketplace.plugins[0].source.path'),
  pluginRoot,
)
for (const [field, path] of [
  ['interface.composerIcon', pluginManifest.interface?.composerIcon],
  ['interface.logo', pluginManifest.interface?.logo],
]) {
  const resolvedPath = resolveContained(pluginRoot, path, field)
  assert.equal((await lstat(resolvedPath)).isFile(), true, `${field} must name a packaged file`)
}

const mcpManifest = JSON.parse(await readFile(resolve(pluginRoot, '.mcp.json'), 'utf8'))
assert.deepEqual(Object.keys(mcpManifest.mcpServers ?? {}), ['migratory_time'])
const serverConfig = mcpManifest.mcpServers.migratory_time
assert.deepEqual(serverConfig, {
  args: ['./server/index.mjs'],
  command: 'node',
  cwd: '.',
})
resolveContained(pluginRoot, serverConfig.args[0], 'mcpServers.migratory_time.args[0]')

const conversionSkill = await readFile(
  resolve(pluginRoot, 'skills/convert-time-zones/SKILL.md'),
  'utf8',
)
const planningSkill = await readFile(
  resolve(pluginRoot, 'skills/plan-time-commitments/SKILL.md'),
  'utf8',
)
const availabilitySkill = await readFile(
  resolve(pluginRoot, 'skills/find-shared-time-windows/SKILL.md'),
  'utf8',
)
assert.match(conversionSkill, /^---\nname: convert-time-zones\n/mu)
assert.match(planningSkill, /^---\nname: plan-time-commitments\n/mu)
assert.match(availabilitySkill, /^---\nname: find-shared-time-windows\n/mu)
for (const tool of [
  'convert_time',
  'current_times',
  'list_time_zones',
  'resolve_time',
  'search_time_zones',
  'validate_time_plan',
]) {
  assert.match(conversionSkill, new RegExp(`\\b${tool}\\b`, 'u'))
}
for (const tool of [
  'compute_deadline',
  'expand_schedule',
  'resolve_time',
  'validate_time_plan',
]) {
  assert.match(planningSkill, new RegExp(`\\b${tool}\\b`, 'u'))
}
for (const tool of ['find_time_windows', 'validate_time_plan']) {
  assert.match(availabilitySkill, new RegExp(`\\b${tool}\\b`, 'u'))
}

const stagingRoot = await mkdtemp(resolve(tmpdir(), 'migratory-time-plugin-package-'))
const stagedPluginRoot = resolve(stagingRoot, 'migratory-time')
let client
try {
  await cp(pluginRoot, stagedPluginRoot, { recursive: true })
  const transport = new StdioClientTransport({
    args: serverConfig.args,
    command: serverConfig.command,
    cwd: resolve(stagedPluginRoot, serverConfig.cwd),
    stderr: 'pipe',
  })
  client = new Client({ name: 'migratory-time-package-check', version: '1.0.0' })
  await client.connect(transport)
  assert.equal(client.getServerVersion()?.name, 'migratory-time')
  assert.equal(client.getServerVersion()?.version, rootPackage.version)

  const tools = await client.listTools()
  assert.deepEqual(
    tools.tools.map(({ name }) => name).sort(),
    expectedTools,
    'Relocated plugin tool inventory drifted',
  )
  const resources = await client.listResources()
  assert.deepEqual(
    resources.resources.map(({ uri }) => uri).sort(),
    expectedResources,
    'Relocated plugin schema-resource inventory drifted',
  )
  const conversion = await client.callTool({
    arguments: {
      localDateTime: '2026-09-01 09:00',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['Europe/London'],
    },
    name: 'convert_time',
  })
  assert.equal(conversion.structuredContent?.result?.status, 'converted')
  assert.equal(
    conversion.structuredContent?.result?.results?.[0]?.timeZone,
    'Europe/London',
  )
} finally {
  await client?.close()
  await rm(stagingRoot, { force: true, recursive: true })
}

console.log(
  `PASS installable repository marketplace and standalone plugin ${pluginManifest.version}: ${actualFiles.length} files relocate cleanly with ${expectedTools.length} tools and ${expectedResources.length} schema resources.`,
)
