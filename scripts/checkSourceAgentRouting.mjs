import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const pluginRoot = resolve(repositoryRoot, 'plugins/migratory-time')
const serverPath = resolve(pluginRoot, 'server/index.mjs')
const taskWorkspace = tmpdir()
const routingModel = 'gpt-5.6-luna'
const reasoningEffort = 'low'
const selectedCase = process.env.MIGRATORY_TIME_SOURCE_AGENT_CASE
const businessCalendar = {
  id: 'company.support.cn',
  schemaVersion: 'migratory.business-calendar.v0.1',
  timeZone: 'Asia/Shanghai',
  version: '2026.09',
  weeklyHours: {
    FR: [{ end: '18:00', start: '09:00' }],
    MO: [{ end: '18:00', start: '09:00' }],
    TH: [{ end: '18:00', start: '09:00' }],
    TU: [{ end: '18:00', start: '09:00' }],
    WE: [{ end: '18:00', start: '09:00' }],
  },
}

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
      // Try the next supported Codex route.
    }
  }
  return 'codex'
}

async function runTask(codexBinary, prompt) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      codexBinary,
      [
        'exec',
        '--model',
        routingModel,
        '--ephemeral',
        '--ignore-user-config',
        '--json',
        '--sandbox',
        'read-only',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--config',
        `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
        '--config',
        `mcp_servers.migratory_time_source.command=${JSON.stringify(process.execPath)}`,
        '--config',
        `mcp_servers.migratory_time_source.args=[${JSON.stringify(serverPath)}]`,
        '--config',
        `mcp_servers.migratory_time_source.cwd=${JSON.stringify(pluginRoot)}`,
        '-C',
        taskWorkspace,
        prompt,
      ],
      { cwd: taskWorkspace, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      rejectPromise(new Error('Source Agent routing task timed out after 180 seconds'))
    }, 180_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      assert.ok(stdout.length < 4 * 1024 * 1024)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      assert.ok(stderr.length < 4 * 1024 * 1024)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectPromise(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(stdout)
      else rejectPromise(new Error(`Source Agent routing exited ${code}: ${stderr || stdout}`))
    })
  })
}

function completedItems(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((event) => event.type === 'item.completed')
    .map((event) => event.item)
}

async function assertRoute(codexBinary, test) {
  const items = completedItems(await runTask(codexBinary, test.prompt))
  const itemSummary = items.map((item) => ({
    type: item?.type,
    server: item?.server,
    tool: item?.tool,
    command: item?.command,
    status: item?.status,
  }))
  const toolCalls = items.filter((item) => item?.type === 'mcp_tool_call')
  assert.equal(toolCalls.length, 1, `Expected one MCP call for: ${test.prompt}`)
  assert.equal(
    items.filter((item) => item?.type === 'web_search').length,
    0,
    `Unexpected Web fallback: ${JSON.stringify(itemSummary)}`,
  )
  assert.equal(
    items.filter((item) => item?.type === 'command_execution').length,
    0,
    `Unexpected shell fallback: ${JSON.stringify(itemSummary)}`,
  )
  const call = toolCalls[0]
  assert.equal(call.server, 'migratory_time_source')
  assert.equal(call.tool, test.tool)
  assert.equal(
    call.status,
    'completed',
    `MCP call failed: ${JSON.stringify({
      arguments: call.arguments,
      error: call.error,
      result: call.result,
      status: call.status,
      tool: call.tool,
    })}`,
  )
  assert.equal(call.error, null)
  const result = call.result?.structured_content?.result
  assert.equal(result?.status, test.status)
  test.verify(result)
}

async function assertSelectedRoute(name, codexBinary, test) {
  if (selectedCase && selectedCase !== name) return
  await assertRoute(codexBinary, test)
}

const codexBinary = await findCodexBinary()

async function createBusinessDeadlineFixture() {
  const transport = new StdioClientTransport({
    args: [serverPath],
    command: process.execPath,
    cwd: pluginRoot,
    stderr: 'pipe',
  })
  const client = new Client({
    name: 'migratory-time-source-agent-fixture',
    version: '1.0.0',
  })
  try {
    await client.connect(transport)
    const response = await client.callTool({
      arguments: {
        calendar: businessCalendar,
        durationMinutes: 240,
        startInstant: '2026-09-03T08:40:00Z',
      },
      name: 'compute_deadline',
    })
    const result = response.structuredContent?.result
    assert.equal(result?.status, 'computed')
    return result.plan
  } finally {
    await client.close()
  }
}

await assertSelectedRoute('time_plan_ambiguity', codexBinary, {
  prompt:
    'Use Migratory Time to create a reusable fixed-wall-time commitment for 2026-11-01T01:30 in America/New_York. Do not choose the earlier or later occurrence for me.',
  status: 'ambiguous',
  tool: 'resolve_time',
  verify(result) {
    assert.deepEqual(result.candidates.map(({ choice }) => choice), [
      'earlier',
      'later',
    ])
  },
})

await assertSelectedRoute('business_deadline', codexBinary, {
  prompt:
    'Use Migratory Time to compute a 240-business-minute deadline from exact start 2026-09-03T08:40:00Z. Calendar: schemaVersion migratory.business-calendar.v0.1, id company.support.cn, version 2026.09, timeZone Asia/Shanghai, Monday through Friday 09:00-18:00. Keep default reject policies.',
  status: 'computed',
  tool: 'compute_deadline',
  verify(result) {
    assert.equal(result.plan.resolution.deadlineInstant, '2026-09-04T03:40:00Z')
  },
})

if (!selectedCase || selectedCase === 'business_revalidation') {
  const businessDeadlinePlan = await createBusinessDeadlineFixture()
  await assertRoute(codexBinary, {
    prompt:
      `Use Migratory Time exactly once to revalidate this stored business-deadline plan against the supplied current calendar. Do not recompute it manually. Stored plan: ${JSON.stringify(businessDeadlinePlan)} Current calendar: ${JSON.stringify(businessCalendar)}`,
    status: 'unchanged',
    tool: 'validate_time_plan',
    verify(result) {
      assert.equal(
        result.currentPlan.resolution.deadlineInstant,
        '2026-09-04T03:40:00Z',
      )
    },
  })
}

await assertSelectedRoute('availability', codexBinary, {
  prompt:
    'Use Migratory Time to find three ranked 60-minute windows on a 60-minute step in search 2026-09-01T00:00:00Z to 2026-09-01T08:00:00Z, snapshot id freebusy/team-a version 1. Shanghai is available 00:00Z-06:00Z, busy 02:00Z-03:00Z, preferred 04:00Z-06:00Z, zone Asia/Shanghai. London is available 01:00Z-06:00Z, preferred 04:00Z-05:00Z, zone Europe/London. New York is available 03:00Z-07:00Z, zone America/New_York.',
  status: 'solved',
  tool: 'find_time_windows',
  verify(result) {
    assert.deepEqual(
      result.candidates.map(({ startInstant }) => startInstant),
      [
        '2026-09-01T04:00:00Z',
        '2026-09-01T05:00:00Z',
        '2026-09-01T03:00:00Z',
      ],
    )
  },
})

console.log(
  `Source Agent routing passed with ${routingModel}/${reasoningEffort}: ${selectedCase ?? 'all cases'} used one MCP call per case and no Web or shell fallback.`,
)
