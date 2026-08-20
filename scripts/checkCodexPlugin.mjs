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
const installedSkillPath = resolve(
  homedir(),
  '.codex/plugins/cache/personal/migratory-time',
  pluginManifest.version,
  'skills/convert-time-zones/SKILL.md',
)
const escapedInstalledSkillPath = installedSkillPath.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)
const fallbackSkillPath = resolve(
  homedir(),
  '.codex/skills/migratory-time/convert-time-zones/SKILL.md',
)
const escapedFallbackSkillPath = fallbackSkillPath.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)
const escapedCodexRoot = resolve(homedir(), '.codex').replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)
const ROUTING_MODEL = 'gpt-5.6-luna'
const ROUTING_REASONING_EFFORT = 'low'

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

async function assertNaturalRoute({ expectedTool, expectedZones, prompt }) {
  const freshTask = await runFreshCodexTask(
    codexBinary,
    [
      'exec',
      '--model',
      ROUTING_MODEL,
      '--ephemeral',
      '--json',
      '--sandbox',
      'read-only',
      '--ignore-rules',
      '--config',
      `model_reasoning_effort="${ROUTING_REASONING_EFFORT}"`,
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
  const completedItems = events
    .filter((event) => event.type === 'item.completed')
    .map((event) => event.item)
  const toolCalls = completedItems.filter((item) => item?.type === 'mcp_tool_call')
  const webCalls = completedItems.filter((item) => item?.type === 'web_search')
  const commands = completedItems.filter((item) => item?.type === 'command_execution')
  assert.equal(
    toolCalls.length,
    1,
    `Natural request must use exactly one domain call: ${prompt}`,
  )
  assert.equal(webCalls.length, 0, `Natural request must not use Web: ${prompt}`)
  const installedSkillReadPattern = new RegExp(
    `^(?:/bin/zsh -lc ")?sed -n '1,\\d+p' '?${escapedInstalledSkillPath}'?"?$`,
  )
  const fallbackSkillReadPattern = new RegExp(
    `^(?:/bin/zsh -lc ")?sed -n '1,\\d+p' '?${escapedFallbackSkillPath}'?"?$`,
  )
  const skillFindPattern = new RegExp(
    `^/bin/zsh -lc "find ${escapedCodexRoot} -path '\\*migratory-time\\*SKILL\\.md' -print"$`,
  )
  assert.ok(
    commands.every((item) =>
      [
        installedSkillReadPattern,
        fallbackSkillReadPattern,
        skillFindPattern,
      ].some((pattern) => pattern.test(item.command ?? '')),
    ),
    `Shell is allowed only to locate or read the Migratory Time skill, never as a time-data fallback: ${prompt}\nCommands: ${JSON.stringify(commands.map((item) => item.command))}`,
  )
  const call = toolCalls[0]
  assert.equal(call.server, 'migratory_time')
  assert.equal(call.tool, expectedTool)
  assert.equal(call.status, 'completed')
  assert.equal(call.error, null)
  const result = call.result?.structured_content?.result
  assert.equal(result?.status, 'converted')
  assert.deepEqual(
    result?.results?.map((zone) => zone.timeZone),
    expectedZones,
  )
}

await assertNaturalRoute({
  expectedTool: 'current_times',
  expectedZones: ['Asia/Shanghai', 'Europe/Berlin'],
  prompt: '北京和中欧现在几点？',
})
await assertNaturalRoute({
  expectedTool: 'convert_time',
  expectedZones: ['Asia/Kathmandu', 'Pacific/Chatham'],
  prompt: 'What is 2026-08-03 16:30 Beijing time in Kathmandu and the Chatham Islands?',
})
await assertNaturalRoute({
  expectedTool: 'current_times',
  expectedZones: ['Etc/GMT+5', 'Etc/GMT-8'],
  prompt: 'What time is it now at UTC-5 and GMT+8?',
})

console.log(
  `Fresh Codex routing check passed: ${pluginManifest.version} with ${ROUTING_MODEL}/${ROUTING_REASONING_EFFORT} independently selected one Migratory Time call for ordinary Chinese current-time, English global-conversion, and explicit fixed-offset requests, with no Web or shell fallback.`,
)
