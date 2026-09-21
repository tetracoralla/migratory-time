import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const pluginRoot = resolve(repositoryRoot, 'plugins/migratory-time')
const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
)
const sequentialWindowCount = Number(
  process.env.MIGRATORY_TIME_MEASURE_WINDOWS ?? '5',
)
assert.ok(
  Number.isInteger(sequentialWindowCount)
    && sequentialWindowCount >= 1
    && sequentialWindowCount <= 100,
  'MIGRATORY_TIME_MEASURE_WINDOWS must be an integer from 1 to 100',
)

const transport = new StdioClientTransport({
  args: ['./server/index.mjs'],
  command: process.execPath,
  cwd: pluginRoot,
  stderr: 'pipe',
})
const client = new Client({
  name: 'migratory-time-semantics-measurement',
  version: packageJson.version,
})

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function summarizeSamples(latencies, responseBytes) {
  return {
    calls: latencies.length,
    latencyMs: {
      max: Math.max(...latencies),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    responseBytes: {
      max: Math.max(...responseBytes),
      mean:
        responseBytes.reduce((total, value) => total + value, 0) /
        responseBytes.length,
    },
  }
}

async function readRssKib(pid) {
  if (pid === null) return null
  try {
    const { stdout } = await execFileAsync('ps', [
      '-o',
      'rss=',
      '-p',
      String(pid),
    ])
    const value = Number(stdout.trim())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function resultOf(response) {
  return response.structuredContent?.result
}

const resolveArguments = {
  intent: {
    anchor: 'fixed_wall_time',
    localDateTime: '2026-09-01T16:30',
    timeZone: 'Asia/Shanghai',
  },
}

const startupStarted = performance.now()
await client.connect(transport)
const listed = await client.listTools()
const startupMs = performance.now() - startupStarted
const toolCatalogBytes = Buffer.byteLength(JSON.stringify(listed.tools))
assert.ok(toolCatalogBytes < 48 * 1024)

try {
  const initial = await client.callTool({
    arguments: resolveArguments,
    name: 'resolve_time',
  })
  const initialResult = resultOf(initial)
  assert.equal(initialResult?.status, 'resolved')
  assert.equal(initialResult?.plan?.resolution?.instant, '2026-09-01T08:30:00Z')
  const plan = initialResult.plan

  const scheduleArguments = {
    rule: { frequency: 'daily' },
    startLocalDateTime: '2026-09-01T09:00',
    timeZone: 'UTC',
    window: {
      endDateExclusive: '2026-09-04',
      startDateInclusive: '2026-09-01',
    },
  }
  const initialSchedule = resultOf(await client.callTool({
    arguments: scheduleArguments,
    name: 'expand_schedule',
  }))
  assert.equal(initialSchedule?.status, 'expanded')

  const businessArguments = {
    calendar: {
      id: 'measurement-calendar',
      schemaVersion: 'migratory.business-calendar.v0.1',
      timeZone: 'Asia/Shanghai',
      version: '1',
      weeklyHours: {
        FR: [{ end: '18:00', start: '09:00' }],
        MO: [{ end: '18:00', start: '09:00' }],
        TH: [{ end: '18:00', start: '09:00' }],
        TU: [{ end: '18:00', start: '09:00' }],
        WE: [{ end: '18:00', start: '09:00' }],
      },
    },
    durationMinutes: 240,
    startInstant: '2026-09-03T08:40:00Z',
  }
  const initialBusiness = resultOf(await client.callTool({
    arguments: businessArguments,
    name: 'compute_deadline',
  }))
  assert.equal(initialBusiness?.status, 'computed')

  const availabilityArguments = {
    durationMinutes: 60,
    maxCandidates: 3,
    participants: [
      {
        availability: [
          { end: '2026-09-01T06:00:00Z', start: '2026-09-01T00:00:00Z' },
        ],
        id: 'shanghai',
        preferred: [
          { end: '2026-09-01T06:00:00Z', start: '2026-09-01T04:00:00Z' },
        ],
        timeZone: 'Asia/Shanghai',
      },
      {
        availability: [
          { end: '2026-09-01T06:00:00Z', start: '2026-09-01T03:00:00Z' },
        ],
        id: 'london',
        timeZone: 'Europe/London',
      },
    ],
    search: {
      end: '2026-09-01T08:00:00Z',
      start: '2026-09-01T00:00:00Z',
    },
    snapshot: { id: 'measurement-availability', version: '1' },
    stepMinutes: 60,
  }
  const initialAvailability = resultOf(await client.callTool({
    arguments: availabilityArguments,
    name: 'find_time_windows',
  }))
  assert.equal(initialAvailability?.status, 'solved')

  const workloads = [
    {
      call: { arguments: resolveArguments, name: 'resolve_time' },
      verify(result) {
        assert.equal(result?.status, 'resolved')
        assert.equal(result.plan.resolution.instant, '2026-09-01T08:30:00Z')
      },
    },
    {
      call: { arguments: { plan }, name: 'validate_time_plan' },
      verify(result) {
        assert.equal(result?.status, 'unchanged')
        assert.equal(result.currentPlan.resolution.instant, '2026-09-01T08:30:00Z')
      },
    },
    {
      call: {
        arguments: scheduleArguments,
        name: 'expand_schedule',
      },
      verify(result) {
        assert.equal(result?.status, 'expanded')
        assert.equal(result.instances.length, 3)
      },
    },
    {
      call: {
        arguments: businessArguments,
        name: 'compute_deadline',
      },
      verify(result) {
        assert.equal(result?.status, 'computed')
        assert.equal(result.plan.resolution.deadlineInstant, '2026-09-04T03:40:00Z')
      },
    },
    {
      call: {
        arguments: availabilityArguments,
        name: 'find_time_windows',
      },
      verify(result) {
        assert.equal(result?.status, 'solved')
        assert.equal(result.candidates.length, 3)
      },
    },
    {
      call: {
        arguments: { kind: 'schedule', plan: initialSchedule },
        name: 'validate_time_plan',
      },
      verify(result) {
        assert.equal(result?.status, 'unchanged')
        assert.equal(result.currentPlan.instances.length, 3)
      },
    },
    {
      call: {
        arguments: {
          currentCalendar: businessArguments.calendar,
          kind: 'business_deadline',
          plan: initialBusiness.plan,
        },
        name: 'validate_time_plan',
      },
      verify(result) {
        assert.equal(result?.status, 'unchanged')
        assert.equal(result.currentPlan.resolution.deadlineInstant, '2026-09-04T03:40:00Z')
      },
    },
    {
      call: {
        arguments: {
          currentSnapshot: {
            participants: availabilityArguments.participants,
            snapshot: availabilityArguments.snapshot,
          },
          kind: 'availability',
          plan: initialAvailability,
        },
        name: 'validate_time_plan',
      },
      verify(result) {
        assert.equal(result?.status, 'unchanged')
        assert.equal(result.currentPlan.candidates.length, 3)
      },
    },
  ]

  async function measuredCall(index) {
    const workload = workloads[index % workloads.length]
    const started = performance.now()
    const response = await client.callTool(workload.call)
    const latency = performance.now() - started
    const result = resultOf(response)
    workload.verify(result)
    const bytes = Buffer.byteLength(JSON.stringify(response))
    assert.ok(bytes < 64 * 1024)
    return { bytes, latency }
  }

  for (let index = 0; index < 50; index += 1) {
    await measuredCall(index)
  }

  const rssSeriesKib = [await readRssKib(transport.pid)]
  const sequentialLatencies = []
  const sequentialBytes = []
  for (let windowIndex = 0; windowIndex < sequentialWindowCount; windowIndex += 1) {
    for (let index = 0; index < 1_000; index += 1) {
      const sample = await measuredCall(windowIndex * 1_000 + index)
      sequentialLatencies.push(sample.latency)
      sequentialBytes.push(sample.bytes)
    }
    rssSeriesKib.push(await readRssKib(transport.pid))
  }

  const burstStarted = performance.now()
  const burstGroups = await Promise.all(
    Array.from({ length: 8 }, async (_, workerIndex) => {
      const samples = []
      for (let index = 0; index < 25; index += 1) {
        samples.push(await measuredCall(workerIndex + index))
      }
      return samples
    }),
  )
  const burstWallMs = performance.now() - burstStarted
  const burstSamples = burstGroups.flat()
  const rssAfterBurstKib = await readRssKib(transport.pid)

  const report = {
    environment: {
      node: process.version,
      temporalPackage: packageJson.dependencies['@js-temporal/polyfill'],
      timeZoneDataPackage: packageJson.dependencies['@vvo/tzdb'],
      timeZoneDataVersion: process.versions.tz ?? 'runtime-provided',
    },
    method: {
      burst: '8 workers x 25 sequential calls rotating resolve, fixed-time validation, recurrence, schedule validation, deadline, availability, deadline validation, and availability validation',
      heap: 'unobserved: the stdio server is an isolated child process without heap instrumentation',
      sequential: `${sequentialWindowCount} consecutive 1,000-call windows rotating eight semantic workloads after 50 warmups`,
    },
    startupMs,
    toolCatalogBytes,
    sequential: summarizeSamples(sequentialLatencies, sequentialBytes),
    burst: {
      ...summarizeSamples(
        burstSamples.map((sample) => sample.latency),
        burstSamples.map((sample) => sample.bytes),
      ),
      concurrency: 8,
      wallMs: burstWallMs,
    },
    serverRssKib: {
      afterBurst: rssAfterBurstKib,
      sequentialWindows: rssSeriesKib,
      sequentialTotalDelta:
        rssSeriesKib[0] === null || rssSeriesKib.at(-1) === null
          ? null
          : rssSeriesKib.at(-1) - rssSeriesKib[0],
      totalDelta:
        rssSeriesKib[0] === null || rssAfterBurstKib === null
          ? null
          : rssAfterBurstKib - rssSeriesKib[0],
    },
  }

  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.close()
}
