import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')
const sourcePluginRoot = resolve(repoRoot, 'plugins/migratory-time')
const sourceServerPath = resolve(sourcePluginRoot, 'server/index.mjs')
const pluginManifest = JSON.parse(
  await readFile(
    resolve(repoRoot, 'plugins/migratory-time/.codex-plugin/plugin.json'),
    'utf8',
  ),
)
const repositoryMarketplace = JSON.parse(
  await readFile(resolve(repoRoot, '.agents/plugins/marketplace.json'), 'utf8'),
)
const marketplaceName =
  process.env.MIGRATORY_TIME_PLUGIN_MARKETPLACE ?? repositoryMarketplace.name
const pluginId = `${pluginManifest.name}@${marketplaceName}`
const escapedPluginVersion = pluginManifest.version.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)
const installedSkillPath = resolve(
  homedir(),
  '.codex/plugins/cache',
  marketplaceName,
  pluginManifest.name,
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
const codexRoot = resolve(homedir(), '.codex')
const escapedCodexRoot = codexRoot.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&',
)
const installedMarketplaceCacheRoot = resolve(
  codexRoot,
  'plugins/cache',
  marketplaceName,
)
const escapedInstalledMarketplaceCacheRoot =
  installedMarketplaceCacheRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const skillSearchRoots = [
  resolve(homedir(), '.codex/skills'),
  resolve(homedir(), '.codex/plugins/cache'),
]
const memoryRoot = resolve(codexRoot, 'memories')
const ROUTING_MODEL = 'gpt-5.6-luna'
const ROUTING_REASONING_EFFORT = 'low'
const ROUTING_START_CASE = Number.parseInt(
  process.env.MIGRATORY_TIME_ROUTING_START_CASE ?? '1',
  10,
)
assert.ok(
  Number.isInteger(ROUTING_START_CASE) &&
    ROUTING_START_CASE >= 1 &&
    ROUTING_START_CASE <= 13,
  'MIGRATORY_TIME_ROUTING_START_CASE must be an integer from 1 through 13',
)
let routingWorkspace
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
      cwd: routingWorkspace,
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
const pluginList = await runCodex(
  codexBinary,
  ['plugin', 'list', '--available', '--json'],
)
const pluginListing = JSON.parse(pluginList.stdout)
const pluginEntry = [
  ...(pluginListing.installed ?? []),
  ...(pluginListing.available ?? []),
].find((entry) => entry.pluginId === pluginId)
assert.ok(
  pluginEntry,
  `${pluginId} is absent. Register the current repository marketplace before installation.`,
)
assert.equal(
  pluginEntry.installed,
  true,
  `${pluginId} must be installed; current version is ${pluginEntry.version}`,
)
assert.equal(
  pluginEntry.enabled,
  true,
  `${pluginId} must be enabled`,
)
assert.equal(
  pluginEntry.version,
  pluginManifest.version,
  `Installed ${pluginId} version must match source ${pluginManifest.version}`,
)

const mcpState = await runCodex(codexBinary, ['mcp', 'get', 'migratory_time'])
assert.match(mcpState.stdout, /enabled:\s+true/)
assert.match(mcpState.stdout, new RegExp(escapedPluginVersion))
routingWorkspace = await mkdtemp(
  resolve(tmpdir(), 'migratory-time-installed-routing-'),
)

async function createBusinessDeadlineFixture() {
  const transport = new StdioClientTransport({
    args: [sourceServerPath],
    command: process.execPath,
    cwd: sourcePluginRoot,
    stderr: 'pipe',
  })
  const client = new Client({
    name: 'migratory-time-installed-agent-fixture',
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

async function assertNaturalRoute({
  expectedCalls,
  expectedChoices,
  expectedConflictKind,
  expectedCurrentDeadlineInstant,
  expectedDeadlineInstant,
  expectedErrorCode,
  expectedServer = 'migratory_time',
  expectedStatus = 'converted',
  expectedTool,
  expectedWindowStarts,
  expectedZones,
  prompt,
}) {
  const freshTask = await runFreshCodexTask(
    codexBinary,
    [
      'exec',
      '--skip-git-repo-check',
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
      routingWorkspace,
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
  const expectedCallSpecs = expectedCalls ?? [
    {
      resultCode: expectedErrorCode,
      resultStatus: expectedStatus,
      server: expectedServer,
      tool: expectedTool,
    },
  ]
  assert.equal(
    toolCalls.length,
    expectedCallSpecs.length,
    `Natural request must use exactly ${expectedCallSpecs.length} domain call(s): ${prompt}\nCalls: ${JSON.stringify(toolCalls.map((item) => ({ error: item.error, server: item.server, status: item.status, tool: item.tool })))}`,
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
  const installedMarketplaceSkillFindPattern = new RegExp(
    `^/bin/zsh -lc 'find ${escapedInstalledMarketplaceCacheRoot} (?:(?:-maxdepth \\d+ -name SKILL\\.md)|(?:-name SKILL\\.md(?: -maxdepth \\d+)?)) -print'$`,
  )
  const isSkillRead = (command) => {
    if (typeof command !== 'string' || command.includes('\n')) return false
    const shellPrefix = '/bin/zsh -lc "'
    const body = command.startsWith(shellPrefix) && command.endsWith('"')
      ? command.slice(shellPrefix.length, -1)
      : command
    const match = /^sed -n '1,\d+p' '?([^'"]+)'?$/u.exec(body)
    const skillPath = match?.[1]
    return (
      typeof skillPath === 'string' &&
      skillPath.startsWith(`${codexRoot}/`) &&
      skillPath.includes('/migratory-time/') &&
      skillPath.endsWith('/convert-time-zones/SKILL.md')
    )
  }
  const isSkillPathSearch = (command) => {
    if (typeof command !== 'string' || command.includes('\n')) return false
    if (!command.startsWith('/bin/zsh -lc "rg --files ')) return false
    if (!skillSearchRoots.every((root) => command.includes(root))) return false
    if (!command.includes('2>/dev/null | rg ')) return false
    if (!command.includes('migratory-time') || !command.includes('SKILL.md')) {
      return false
    }
    const commandWithoutStderrRedirect = command.replace('2>/dev/null', '')
    if (/[;&`<>]|\$\(|\|\|/u.test(commandWithoutStderrRedirect)) {
      return false
    }
    const pipeline = command.split(' | ')
    return (
      pipeline.length >= 2 &&
      pipeline.length <= 3 &&
      pipeline[1].startsWith('rg ') &&
      (pipeline.length === 2 || /^head -5"$/u.test(pipeline[2]))
    )
  }
  const isInstalledSkillFind = (command) => {
    if (typeof command !== 'string' || command.includes('\n')) return false
    let body = command
    for (const quote of ['"', "'"]) {
      const prefix = `/bin/zsh -lc ${quote}`
      if (body.startsWith(prefix) && body.endsWith(quote)) {
        body = body.slice(prefix.length, -1)
        break
      }
    }
    if (/[;&`<>]|\$\(|\|\|/u.test(body)) return false
    const tokens = body.match(/'[^']*'|"[^"]*"|\S+/gu) ?? []
    const unquoteToken = (token) => token?.replace(/^(['"])(.*)\1$/u, '$2')
    const findRoot = unquoteToken(tokens[1])
    const isMarketplaceScoped = findRoot === installedMarketplaceCacheRoot
    if (
      tokens[0] !== 'find' ||
      (!isMarketplaceScoped && findRoot !== codexRoot) ||
      tokens.at(-1) !== '-print'
    ) {
      return false
    }
    let hasSkillPredicate = false
    let hasMigratoryScope = isMarketplaceScoped
    let hasMaxDepth = false
    for (let index = 2; index < tokens.length - 1; index += 1) {
      const token = tokens[index]
      const value = tokens[index + 1]
      if (token === '-name' && value === 'SKILL.md' && !hasSkillPredicate) {
        hasSkillPredicate = true
        index += 1
        continue
      }
      if (token === '-path') {
        const pathPattern = unquoteToken(value)
        if (
          ![
            '*/SKILL.md',
            '*migratory-time*',
            '*migratory-time*SKILL.md',
          ].includes(pathPattern)
        ) {
          return false
        }
        hasSkillPredicate ||= pathPattern.endsWith('SKILL.md')
        hasMigratoryScope ||= pathPattern.includes('migratory-time')
        index += 1
        continue
      }
      if (
        token === '-maxdepth' &&
        /^\d+$/u.test(value ?? '') &&
        Number(value) <= 16 &&
        !hasMaxDepth
      ) {
        hasMaxDepth = true
        index += 1
        continue
      }
      return false
    }
    return hasSkillPredicate && hasMigratoryScope
  }
  const isBoundedReadOnlyContextLookup = (command) => {
    if (typeof command !== 'string' || command.includes('\n')) return false
    let body = command
    for (const quote of ['"', "'"]) {
      const prefix = `/bin/zsh -lc ${quote}`
      if (body.startsWith(prefix) && body.endsWith(quote)) {
        body = body.slice(prefix.length, -1)
        break
      }
    }
    body = body.replaceAll('\\"', '"').replaceAll("\\'", "'")
    if (/`|\$\(|\$\{|\n|\r/u.test(body)) return false
    const withoutStderrRedirects = body.replaceAll('2>/dev/null', '')
    if (/[<>]/u.test(withoutStderrRedirects)) return false
    if (/\bfind\b[^;&|]*(?:-delete|-exec|-execdir|-ok|-fprint|-fprintf|-fls)\b/u.test(body)) {
      return false
    }
    const sedCount = body.match(/\bsed\b/gu)?.length ?? 0
    const boundedSedCount = body.match(/\bsed -n '1,\d+p'/gu)?.length ?? 0
    if (sedCount !== boundedSedCount) return false
    const sedLimits = [...body.matchAll(/\bsed -n '1,(\d+)p'/gu)]
    if (sedLimits.some((match) => Number(match[1]) > 300)) return false
    const headLimits = [...body.matchAll(/\bhead -(\d+)\b/gu)]
    if (headLimits.some((match) => Number(match[1]) > 100)) return false
    const maskQuotedContent = (value) => {
      let quote = null
      let escaped = false
      return [...value].map((character) => {
        if (escaped) {
          escaped = false
          return quote ? ' ' : character
        }
        if (character === '\\') {
          escaped = true
          return quote ? ' ' : character
        }
        if (quote) {
          if (character === quote) quote = null
          return ' '
        }
        if (character === '"' || character === "'") {
          quote = character
          return ' '
        }
        return character
      }).join('')
    }
    const masked = maskQuotedContent(withoutStderrRedirects)
    const commandNames = [
      ...masked.matchAll(/(?:^|&&|\|\||;|\|)\s*([A-Za-z0-9_./-]+)/gu),
    ].map((match) => match[1].split('/').at(-1))
    if (
      commandNames.length === 0 ||
      commandNames.some(
        (name) => !['find', 'head', 'rg', 'sed', 'sort', 'true'].includes(name),
      )
    ) {
      return false
    }
    const absolutePaths =
      body.match(/\/Users\/[^\s'";|]+/gu)?.map((path) => resolve(path)) ?? []
    if (absolutePaths.length === 0) return false
    const isInside = (path, root) => path === root || path.startsWith(`${root}/`)
    if (
      absolutePaths.some(
        (path) =>
          ![
            installedMarketplaceCacheRoot,
            memoryRoot,
            ...skillSearchRoots,
          ].some((root) => isInside(path, root)),
      )
    ) {
      return false
    }
    if (body.includes('/memories/') && headLimits.length === 0) return false
    if (body.includes('find ') && !body.includes('SKILL.md')) return false
    const isBoundedPluginFileList =
      body.includes('rg --files') &&
      headLimits.length > 0 &&
      absolutePaths.every((path) =>
        skillSearchRoots.some((root) => isInside(path, root)),
      )
    return (
      body.includes('SKILL.md') ||
      body.includes('/memories/') ||
      isBoundedPluginFileList
    )
  }
  assert.ok(
    commands.every((item) =>
      [
        installedSkillReadPattern,
        fallbackSkillReadPattern,
        skillFindPattern,
        installedMarketplaceSkillFindPattern,
      ].some((pattern) => pattern.test(item.command ?? '')) ||
      isSkillRead(item.command) ||
      isSkillPathSearch(item.command) ||
      isInstalledSkillFind(item.command) ||
      isBoundedReadOnlyContextLookup(item.command),
    ),
    `Shell is allowed only for bounded installed-domain Skill or memory lookup, never as a data or calculation fallback: ${prompt}\nCommands: ${JSON.stringify(commands.map((item) => item.command))}`,
  )
  for (const [index, expectedCall] of expectedCallSpecs.entries()) {
    const actualCall = toolCalls[index]
    assert.equal(actualCall.server, expectedCall.server)
    assert.equal(actualCall.tool, expectedCall.tool)
    assert.equal(
      actualCall.status,
      'completed',
      `Installed MCP call failed: ${JSON.stringify({
        arguments: actualCall.arguments,
        error: actualCall.error,
        result: actualCall.result,
        status: actualCall.status,
        tool: actualCall.tool,
      })}`,
    )
    assert.equal(actualCall.error, null)
    const actualResult = actualCall.result?.structured_content?.result
    if (expectedCall.resultStatus !== null) {
      assert.equal(actualResult?.status, expectedCall.resultStatus)
    }
    if (expectedCall.resultCode) {
      assert.equal(actualResult?.error?.code, expectedCall.resultCode)
    }
  }
  const call = toolCalls.at(-1)
  const result = call.result?.structured_content?.result
  if (!expectedCalls && expectedStatus !== null) {
    assert.equal(result?.status, expectedStatus)
  }
  if (expectedZones) {
    assert.deepEqual(
      result?.results?.map((zone) => zone.timeZone),
      expectedZones,
    )
  }
  if (expectedChoices) {
    assert.deepEqual(
      result?.candidates?.map((candidate) => candidate.choice),
      expectedChoices,
    )
  }
  if (expectedConflictKind) {
    assert.equal(result?.conflict?.kind, expectedConflictKind)
  }
  if (expectedDeadlineInstant) {
    assert.equal(result?.plan?.resolution?.deadlineInstant, expectedDeadlineInstant)
  }
  if (expectedCurrentDeadlineInstant) {
    assert.equal(
      result?.currentPlan?.resolution?.deadlineInstant,
      expectedCurrentDeadlineInstant,
    )
  }
  if (expectedWindowStarts) {
    assert.deepEqual(
      result?.candidates?.map((candidate) => candidate.startInstant),
      expectedWindowStarts,
    )
  }
  console.log(
    `PASS installed route ${expectedCallSpecs.map((item) => `${item.server}.${item.tool}`).join(' -> ')}: ${prompt}`,
  )
}

async function runRoutingCase(index, details) {
  if (index < ROUTING_START_CASE) return
  await assertNaturalRoute(details)
}

try {
  await runRoutingCase(1, {
    expectedTool: 'current_times',
    expectedZones: ['Asia/Shanghai', 'Europe/Berlin'],
    prompt: '北京和柏林现在几点？',
  })
  await runRoutingCase(2, {
    expectedTool: 'convert_time',
    expectedZones: ['Asia/Kathmandu', 'Pacific/Chatham'],
    prompt: 'What is 2026-08-03 16:30 Beijing time in Kathmandu and the Chatham Islands?',
  })
  await runRoutingCase(3, {
    expectedTool: 'current_times',
    expectedZones: ['Etc/GMT+5', 'Etc/GMT-8'],
    prompt: 'What time is it now at UTC-5 and GMT+8?',
  })
  await runRoutingCase(4, {
    expectedChoices: ['earlier', 'later'],
    expectedStatus: 'ambiguous',
    expectedTool: 'resolve_time',
    prompt: 'Create a reusable fixed-wall-time commitment for 2026-11-01T01:30 in America/New_York. Do not choose the earlier or later occurrence for me.',
  })
  await runRoutingCase(5, {
    expectedConflictKind: 'dst_gap',
    expectedStatus: 'conflict',
    expectedTool: 'expand_schedule',
    prompt: 'Expand a daily 02:30 America/New_York schedule in the local date window 2026-03-07 inclusive through 2026-03-10 exclusive. Do not choose a DST gap policy for me.',
  })
  await runRoutingCase(6, {
    expectedDeadlineInstant: '2026-09-04T03:40:00Z',
    expectedStatus: 'computed',
    expectedTool: 'compute_deadline',
    prompt: 'Compute a 240-business-minute deadline from exact start 2026-09-03T08:40:00Z using this complete calendar: schemaVersion migratory.business-calendar.v0.1, id company.support.cn, version 2026.09, timeZone Asia/Shanghai, and Monday through Friday hours 09:00-18:00. Use the default reject policies.',
  })
  const businessDeadlinePlan =
    ROUTING_START_CASE <= 7 ? await createBusinessDeadlineFixture() : null
  await runRoutingCase(7, {
    expectedCurrentDeadlineInstant: '2026-09-04T03:40:00Z',
    expectedStatus: 'unchanged',
    expectedTool: 'validate_time_plan',
    prompt: `Use Migratory Time exactly once to revalidate this stored business-deadline plan against the supplied current calendar. Do not recompute it manually. Stored plan: ${JSON.stringify(businessDeadlinePlan)} Current calendar: ${JSON.stringify(businessCalendar)}`,
  })
  await runRoutingCase(8, {
    expectedStatus: 'solved',
    expectedTool: 'find_time_windows',
    expectedWindowStarts: [
      '2026-09-01T04:00:00Z',
      '2026-09-01T05:00:00Z',
      '2026-09-01T03:00:00Z',
    ],
    prompt: 'Find three ranked 60-minute windows on a 60-minute step in search 2026-09-01T00:00:00Z to 2026-09-01T08:00:00Z, snapshot id freebusy/team-a version 1. Shanghai is available 00:00Z-06:00Z, busy 02:00Z-03:00Z, preferred 04:00Z-06:00Z, zone Asia/Shanghai. London is available 01:00Z-06:00Z, preferred 04:00Z-05:00Z, zone Europe/London. New York is available 03:00Z-07:00Z, zone America/New_York.',
  })
  await runRoutingCase(9, {
    expectedErrorCode: 'AMBIGUOUS_TIME_ZONE',
    expectedStatus: 'error',
    expectedTool: 'convert_time',
    prompt: 'Convert 2026-09-01 09:00 from United States to Europe/London. Preserve United States exactly as supplied and use Migratory Time once; if it is ambiguous, return the tool candidates instead of choosing one.',
  })
  await runRoutingCase(10, {
    expectedErrorCode: 'INVALID_CURSOR',
    expectedStatus: 'error',
    expectedTool: 'expand_schedule',
    prompt: 'Use Migratory Time once to continue a daily 09:00 Asia/Shanghai schedule in local date window 2026-09-01 inclusive through 2026-09-03 exclusive, with cursor not-a-valid-cursor exactly as supplied. Report the structured result and do not repair or replace the cursor.',
  })
  await runRoutingCase(11, {
    expectedServer: 'schedule-algebra',
    expectedStatus: null,
    expectedTool: 'schedule_run',
    prompt: 'Compute the exact intersection of two instant-interval schedules. The explicit horizon is 2026-09-01T00:00:00Z inclusive to 2026-09-02T00:00:00Z exclusive. Schedule A contains 2026-09-01T01:00:00Z to 2026-09-01T05:00:00Z. Schedule B contains 2026-09-01T03:00:00Z to 2026-09-01T07:00:00Z. Use the deterministic domain tool exactly once.',
  })
  await runRoutingCase(12, {
    expectedServer: 'equatorium',
    expectedStatus: null,
    expectedTool: 'sei_run',
    prompt: 'Interpret the concrete ISO 8601 duration expression P3DT4H with the deterministic standard-expression tool exactly once.',
  })
  await runRoutingCase(13, {
    expectedCalls: [
      {
        resultStatus: 'computed',
        server: 'migratory_time',
        tool: 'compute_deadline',
      },
      {
        resultStatus: 'unchanged',
        server: 'migratory_time',
        tool: 'validate_time_plan',
      },
    ],
    expectedStatus: null,
    prompt: `Use Migratory Time to complete this exact two-step workflow without manual time arithmetic: first compute a 240-business-minute deadline from 2026-09-03T08:40:00Z, then immediately revalidate the returned stored plan against the same supplied calendar. Make exactly those two domain calls in that order and report the validation status. Calendar: ${JSON.stringify(businessCalendar)}`,
  })
} finally {
  await rm(routingWorkspace, { force: true, recursive: true })
}

console.log(
  `Fresh Codex routing check passed: ${pluginManifest.version} with ${ROUTING_MODEL}/${ROUTING_REASONING_EFFORT} independently selected the exact domain call sequence for ordinary time, conversion, fixed offsets, TimePlan ambiguity, recurrence conflict, business deadline, business-plan revalidation, availability solving, structured error preservation, competing Schedule Algebra and Equatorium requests, and composed deadline-to-revalidation flow, with no Web or time-data shell fallback; shell use, if any, was bounded read-only Skill or memory lookup.`,
)
