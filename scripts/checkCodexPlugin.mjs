import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')
const pluginManifest = JSON.parse(
  await readFile(
    resolve(repoRoot, 'plugins/migratory-time/.codex-plugin/plugin.json'),
    'utf8',
  ),
)
const escapedPluginVersion = pluginManifest.version.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)

async function findCodexBinary() {
  const candidates = [
    process.env.CODEX_BIN,
    resolve(homedir(), '.codex/plugins/.plugin-appserver/codex'),
    'codex',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate === 'codex') return candidate
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next supported Codex installation route.
    }
  }

  return 'codex'
}

async function runCodex(codexBinary, args, timeout = 30_000) {
  return execFileAsync(codexBinary, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout,
  })
}

async function runFreshCodexTask(codexBinary, args, timeout = 180_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBinary, args, {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      rejectPromise(new Error(`Fresh Codex task timed out after ${timeout}ms`))
    }, timeout)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      assert.ok(stdout.length < 4 * 1024 * 1024, 'Fresh task output exceeded 4 MiB')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      assert.ok(stderr.length < 4 * 1024 * 1024, 'Fresh task errors exceeded 4 MiB')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectPromise(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolvePromise({ stderr, stdout })
      } else {
        rejectPromise(
          new Error(`Fresh Codex task exited ${code}: ${stderr || stdout}`),
        )
      }
    })
    child.stdin.end()
  })
}

const codexBinary = await findCodexBinary()
const pluginList = await runCodex(codexBinary, ['plugin', 'list'])
assert.match(
  `${pluginList.stdout}\n${pluginList.stderr}`,
  new RegExp(
    `migratory-time@personal\\s+installed, enabled\\s+${escapedPluginVersion}`,
  ),
  `Installed Migratory Time version must match ${pluginManifest.version}`,
)

const mcpState = await runCodex(codexBinary, ['mcp', 'get', 'migratory_time'])
assert.match(mcpState.stdout, /enabled:\s+true/)
assert.match(mcpState.stdout, new RegExp(escapedPluginVersion))

const prompt = [
  'Call the MCP server migratory_time tool current_times exactly once.',
  'Use exactly this JSON input:',
  '{"locale":"zh","targetTimeZones":["北京时间","欧洲中部"]}.',
  'Do not call web, shell, or any other tool. After the tool succeeds, answer only OK.',
].join(' ')
const freshTask = await runFreshCodexTask(
  codexBinary,
  [
    'exec',
    '--ephemeral',
    '--json',
    '--sandbox',
    'read-only',
    '--ignore-rules',
    '-C',
    repoRoot,
    prompt,
  ],
  180_000,
)

const events = freshTask.stdout
  .split(/\r?\n/)
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line))
const toolCalls = events.filter(
  (event) => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call',
)
assert.equal(toolCalls.length, 1, 'Fresh Codex task must make exactly one tool call')

const call = toolCalls[0].item
assert.equal(call.server, 'migratory_time')
assert.equal(call.tool, 'current_times')
assert.deepEqual(call.arguments, {
  locale: 'zh',
  targetTimeZones: ['北京时间', '欧洲中部'],
})
assert.equal(call.status, 'completed')
assert.equal(call.error, null)
assert.deepEqual(
  call.result?.structured_content?.results?.map((result) => result.timeZone),
  ['Asia/Shanghai', 'Europe/Berlin'],
)

console.log(
  `Fresh Codex task check passed: ${pluginManifest.version} exposed migratory_time.current_times and completed the dominant route in one call.`,
)
