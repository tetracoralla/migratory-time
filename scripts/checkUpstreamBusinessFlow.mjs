import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repoRoot = resolve(import.meta.dirname, '..')
const pluginRoot = resolve(repoRoot, 'plugins/migratory-time')
const snapshotPath = resolve(
  repoRoot,
  'scripts/fixtures/nager-holidays-us-2026.json',
)
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))

assert.equal(snapshot.sourceURL, 'https://nagerholidays.com/api/v4/Holidays/US/2026')
assert.equal(snapshot.response.length, 17)
assert.equal(
  createHash('sha256')
    .update(JSON.stringify(snapshot.response))
    .digest('hex'),
  snapshot.responseSha256,
  'Recorded upstream response must retain its observed byte-equivalent JSON projection',
)

const nationalPublicDates = [
  ...new Set(
    snapshot.response
      .filter(
        (holiday) =>
          holiday.countryCode === 'US'
          && holiday.nationalHoliday === true
          && holiday.holidayTypes.includes('Public'),
      )
      .map((holiday) => holiday.date),
  ),
].sort()
assert.ok(nationalPublicDates.includes('2026-09-07'))

const weeklyHours = Object.fromEntries(
  ['MO', 'TU', 'WE', 'TH', 'FR'].map((weekday) => [
    weekday,
    [{ end: '17:00', start: '09:00' }],
  ]),
)
const policyVersion = 'wd-0900-1700-ny-v1'
const calendar = {
  exceptions: nationalPublicDates.map((date) => ({ date, intervals: [] })),
  id: 'experiment.nager-us-2026.support-policy',
  schemaVersion: 'migratory.business-calendar.v0.1',
  timeZone: 'America/New_York',
  version: `nager-${snapshot.responseSha256.slice(0, 12)}+${policyVersion}`,
  weeklyHours,
}
assert.ok(calendar.version.length <= 64)

function resultOf(response) {
  const result = response.structuredContent?.result
  assert.ok(result, `Missing structured result: ${JSON.stringify(response)}`)
  return result
}

function prepareDryRunHandoff(validation) {
  if (validation.status !== 'unchanged') return null
  return {
    deadlineInstant: validation.currentPlan.resolution.deadlineInstant,
    plan: validation.currentPlan,
  }
}

const transport = new StdioClientTransport({
  args: ['./server/index.mjs'],
  command: process.execPath,
  cwd: pluginRoot,
  stderr: 'pipe',
})
const client = new Client({
  name: 'migratory-time-upstream-business-flow',
  version: '1.0.0',
})

try {
  await client.connect(transport)
  const computed = resultOf(
    await client.callTool({
      arguments: {
        calendar,
        durationMinutes: 240,
        startInstant: '2026-09-04T20:00:00Z',
      },
      name: 'compute_deadline',
    }),
  )
  assert.equal(computed.status, 'computed')
  assert.equal(
    computed.plan.resolution.deadlineInstant,
    '2026-09-08T16:00:00Z',
  )

  const persistedPlan = JSON.parse(JSON.stringify(computed.plan))
  const unchanged = resultOf(
    await client.callTool({
      arguments: {
        currentCalendar: calendar,
        kind: 'business_deadline',
        plan: persistedPlan,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchanged.status, 'unchanged')
  assert.deepEqual(unchanged.dependencyChanges, [])

  const refetchedCalendar = structuredClone(calendar)
  refetchedCalendar.version = `${calendar.version}+refetch-2`
  assert.ok(refetchedCalendar.version.length <= 64)
  const versionOnly = resultOf(
    await client.callTool({
      arguments: {
        currentCalendar: refetchedCalendar,
        kind: 'business_deadline',
        plan: persistedPlan,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(versionOnly.status, 'unchanged')
  assert.deepEqual(
    versionOnly.dependencyChanges.map(({ field }) => field),
    ['dependencies[0].version'],
  )

  const revisedCalendar = structuredClone(refetchedCalendar)
  revisedCalendar.version = `${calendar.version}+revision-2`
  revisedCalendar.exceptions = revisedCalendar.exceptions.filter(
    ({ date }) => date !== '2026-09-07',
  )
  const drifted = resultOf(
    await client.callTool({
      arguments: {
        currentCalendar: revisedCalendar,
        kind: 'business_deadline',
        plan: persistedPlan,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(drifted.status, 'drifted')
  assert.equal(
    drifted.current.plan.resolution.deadlineInstant,
    '2026-09-07T16:00:00Z',
  )
  assert.deepEqual(
    drifted.differences.map(({ field }) => field),
    [
      'dependencies[0].version',
      'dependencies[0].definitionFingerprint',
      'resolution.deadlineInstant',
      'resolution.deadlineLocalDateTime',
    ],
  )

  const downstreamHandoff = prepareDryRunHandoff(versionOnly)
  const blockedDriftedHandoff = prepareDryRunHandoff(drifted)
  assert.ok(downstreamHandoff)
  assert.equal(downstreamHandoff.deadlineInstant, '2026-09-08T16:00:00Z')
  assert.equal(downstreamHandoff.plan.schemaVersion, 'migratory.business-deadline.v0.1')
  assert.equal(blockedDriftedHandoff, null)

  console.log(JSON.stringify({
    downstreamHandoff: {
      deadlineInstant: downstreamHandoff.deadlineInstant,
      planSchemaVersion: downstreamHandoff.plan.schemaVersion,
      revalidatedStatus: versionOnly.status,
    },
    liveObservation: {
      lastModified: snapshot.lastModified,
      observedAt: snapshot.observedAt,
      responseSha256: snapshot.responseSha256,
      sourceURL: snapshot.sourceURL,
    },
    replay: {
      driftedDeadlineInstant: drifted.current.plan.resolution.deadlineInstant,
      driftedStatus: drifted.status,
      initialDeadlineInstant: computed.plan.resolution.deadlineInstant,
      unchangedStatus: unchanged.status,
      versionOnlyChanges: versionOnly.dependencyChanges.map(({ field }) => field),
      versionOnlyStatus: versionOnly.status,
    },
    translation: {
      nationalPublicClosureDates: nationalPublicDates.length,
      policyVersion,
      providerRecords: snapshot.response.length,
    },
  }, null, 2))
} finally {
  await client.close()
}
