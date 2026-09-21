import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const pluginRoot = resolve(process.argv[2] ?? 'plugins/migratory-time')
const transport = new StdioClientTransport({
  args: ['./server/index.mjs'],
  command: process.execPath,
  cwd: pluginRoot,
  stderr: 'pipe',
})
const client = new Client({ name: 'migratory-time-check', version: '2.0.0' })

function resultOf(response) {
  return response.structuredContent?.result
}

try {
  await client.connect(transport)

  const listed = await client.listTools()
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      'compute_deadline',
      'convert_time',
      'current_times',
      'expand_schedule',
      'find_time_windows',
      'list_time_zones',
      'resolve_time',
      'search_time_zones',
      'validate_time_plan',
    ],
  )
  assert.ok(
    listed.tools.every(
      (tool) =>
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint === false,
    ),
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(listed.tools)) < 48 * 1024,
    `Tool discovery must remain below the 48 KiB schema context budget; observed ${Buffer.byteLength(JSON.stringify(listed.tools))} bytes`,
  )

  const convertTool = listed.tools.find((tool) => tool.name === 'convert_time')
  const resultSchema = convertTool?.outputSchema?.properties?.result
  const resultBranches = resultSchema?.oneOf ?? resultSchema?.anyOf
  assert.equal(resultBranches?.length, 4)
  assert.deepEqual(
    resultBranches
      .map((branch) => branch.properties?.status?.const)
      .sort(),
    ['ambiguous', 'converted', 'error', 'nonexistent'],
  )
  assert.ok(
    resultBranches.every((branch) => branch.additionalProperties === false),
    'Every conversion result branch must be closed',
  )
  const currentTimesTool = listed.tools.find(
    (tool) => tool.name === 'current_times',
  )
  const targetZoneItemSchema =
    currentTimesTool?.inputSchema?.properties?.targetTimeZones?.items
  assert.equal(targetZoneItemSchema?.type, 'string')
  assert.equal(targetZoneItemSchema?.enum, undefined)
  assert.equal(
    currentTimesTool?.inputSchema?.properties?.targetTimeZones?.maxItems,
    20,
  )
  assert.equal(
    convertTool?.inputSchema?.properties?.targetTimeZones?.maxItems,
    20,
  )

  const searchTool = listed.tools.find((tool) => tool.name === 'search_time_zones')
  const listTool = listed.tools.find((tool) => tool.name === 'list_time_zones')
  const resolveTool = listed.tools.find((tool) => tool.name === 'resolve_time')
  const validateTool = listed.tools.find((tool) => tool.name === 'validate_time_plan')
  const scheduleTool = listed.tools.find((tool) => tool.name === 'expand_schedule')
  const deadlineTool = listed.tools.find((tool) => tool.name === 'compute_deadline')
  const windowsTool = listed.tools.find((tool) => tool.name === 'find_time_windows')
  assert.equal(searchTool?.inputSchema?.properties?.limit?.maximum, 10)
  assert.equal(listTool?.inputSchema?.properties?.limit?.maximum, 50)
  assert.equal(listTool?.inputSchema?.properties?.cursor?.pattern, undefined)
  for (const tool of [resolveTool, validateTool, scheduleTool, deadlineTool, windowsTool]) {
    assert.equal(
      tool?.outputSchema,
      undefined,
      `${tool?.name} must keep its large result schema out of always-loaded discovery`,
    )
  }
  const listedResources = await client.listResources()
  assert.deepEqual(
    listedResources.resources.map((resource) => resource.uri).sort(),
    [
      'migratory-time://schemas/compute_deadline/result.json',
      'migratory-time://schemas/expand_schedule/result.json',
      'migratory-time://schemas/find_time_windows/result.json',
      'migratory-time://schemas/resolve_time/result.json',
      'migratory-time://schemas/validate_time_plan/result.json',
    ],
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(listedResources.resources)) < 2 * 1024,
    'On-demand result-schema resource discovery must remain below 2 KiB',
  )
  async function readResultSchema(toolName) {
    const response = await client.readResource({
      uri: `migratory-time://schemas/${toolName}/result.json`,
    })
    const resource = response.contents[0]
    assert.equal(resource.mimeType, 'application/schema+json')
    assert.equal(typeof resource.text, 'string')
    assert.ok(
      Buffer.byteLength(resource.text) < 64 * 1024,
      `${toolName} result-schema resource must remain below 64 KiB`,
    )
    return JSON.parse(resource.text)
  }

  function resolveLocalRef(schema, root) {
    if (!schema?.$ref?.startsWith('#/')) return schema
    return schema.$ref
      .slice(2)
      .split('/')
      .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce((value, part) => value?.[part], root)
  }

  function schemaLeaves(schema, root) {
    const resolved = resolveLocalRef(schema, root)
    const alternatives = resolved?.oneOf ?? resolved?.anyOf
    if (alternatives) {
      return alternatives.flatMap((branch) => schemaLeaves(branch, root))
    }
    return [resolved]
  }

  function schemaConst(schema, root) {
    const resolved = resolveLocalRef(schema, root)
    if (resolved?.const !== undefined) return resolved.const
    return resolved?.enum?.length === 1 ? resolved.enum[0] : undefined
  }

  const resolveResultSchema = await readResultSchema('resolve_time')
  const resolveResultBranches =
    resolveResultSchema?.oneOf ?? resolveResultSchema?.anyOf
  assert.deepEqual(
    resolveResultBranches
      .map((branch) => branch.properties?.status?.const)
      .sort(),
    ['ambiguous', 'error', 'nonexistent', 'resolved', 'underspecified'],
  )
  assert.ok(resolveResultBranches.every((branch) => branch.additionalProperties === false))
  const validateResultSchema = await readResultSchema('validate_time_plan')
  const validateResultBranches = schemaLeaves(
    validateResultSchema,
    validateResultSchema,
  ).filter((branch) => branch?.properties?.status)
  assert.deepEqual(
    [...new Set(
      validateResultBranches
        .map((branch) => schemaConst(branch.properties.status, validateResultSchema))
        .filter((status) => typeof status === 'string'),
    )].sort(),
    ['drifted', 'error', 'unchanged', 'unverifiable'],
  )
  assert.ok(validateResultBranches.every((branch) => branch.additionalProperties === false))
  const scheduleResultSchema = await readResultSchema('expand_schedule')
  const scheduleResultBranches = schemaLeaves(
    scheduleResultSchema,
    scheduleResultSchema,
  ).filter((branch) => branch?.properties?.status)
  assert.deepEqual(
    scheduleResultBranches
      .map((branch) => schemaConst(branch.properties.status, scheduleResultSchema))
      .sort(),
    ['conflict', 'error', 'expanded'],
  )
  assert.ok(scheduleResultBranches.every((branch) => branch.additionalProperties === false))
  assert.equal(
    scheduleTool?.inputSchema?.properties?.maxInstances?.maximum,
    32,
  )
  const deadlineResultSchema = await readResultSchema('compute_deadline')
  const deadlineResultBranches = schemaLeaves(
    deadlineResultSchema,
    deadlineResultSchema,
  ).filter((branch) => branch?.properties?.status)
  assert.deepEqual(
    deadlineResultBranches
      .map((branch) => schemaConst(branch.properties.status, deadlineResultSchema))
      .sort(),
    ['computed', 'conflict', 'error', 'unsatisfiable'],
  )
  assert.ok(deadlineResultBranches.every((branch) => branch.additionalProperties === false))
  assert.equal(
    deadlineTool?.inputSchema?.properties?.durationMinutes?.maximum,
    525600,
  )
  const windowsResultSchema = await readResultSchema('find_time_windows')
  const windowsResultBranches = schemaLeaves(
    windowsResultSchema,
    windowsResultSchema,
  ).filter((branch) => branch?.properties?.status)
  assert.deepEqual(
    windowsResultBranches
      .map((branch) => schemaConst(branch.properties.status, windowsResultSchema))
      .sort(),
    ['error', 'solved', 'unsatisfiable'],
  )
  assert.ok(windowsResultBranches.every((branch) => branch.additionalProperties === false))
  assert.equal(
    windowsTool?.inputSchema?.properties?.participants?.maxItems,
    12,
  )
  assert.equal(
    windowsTool?.inputSchema?.properties?.maxCandidates?.maximum,
    10,
  )

  const supportedZones = await client.callTool({
    arguments: { limit: 50 },
    name: 'list_time_zones',
  })
  const firstPage = resultOf(supportedZones)
  assert.equal(firstPage.status, 'listed')
  assert.equal(firstPage.items.length, 50)
  assert.ok(firstPage.total > 300)
  assert.equal(firstPage.nextCursor, '50')
  assert.equal(
    supportedZones.structuredContent?.provenance?.timeZoneData,
    'IANA',
  )

  const secondPage = resultOf(
    await client.callTool({
      arguments: { cursor: firstPage.nextCursor, limit: 50 },
      name: 'list_time_zones',
    }),
  )
  assert.equal(secondPage.items.length, 50)
  assert.equal(
    new Set([...firstPage.items, ...secondPage.items].map((zone) => zone.id))
      .size,
    100,
  )

  const invalidCursor = await client.callTool({
    arguments: { cursor: 'not-a-cursor' },
    name: 'list_time_zones',
  })
  assert.equal(invalidCursor.isError, undefined)
  assert.equal(resultOf(invalidCursor).status, 'error')
  assert.equal(resultOf(invalidCursor).error.code, 'INVALID_CURSOR')

  const searched = resultOf(
    await client.callTool({
      arguments: { query: 'Paris', limit: 10 },
      name: 'search_time_zones',
    }),
  )
  assert.equal(searched.status, 'found')
  assert.equal(searched.items[0].id, 'Europe/Paris')
  assert.ok(searched.items.length <= 10)

  const current = await client.callTool({
    arguments: {
      targetTimeZones: ['北京时间', 'Nepal', 'Pacific/Chatham'],
    },
    name: 'current_times',
  })
  const currentResult = resultOf(current)
  assert.equal(currentResult.status, 'converted')
  assert.deepEqual(
    currentResult.results.map((zone) => zone.timeZone),
    ['Asia/Shanghai', 'Asia/Kathmandu', 'Pacific/Chatham'],
  )

  const fixedOffsets = resultOf(
    await client.callTool({
      arguments: { targetTimeZones: ['UTC-5', 'GMT+8'] },
      name: 'current_times',
    }),
  )
  assert.equal(fixedOffsets.status, 'converted')
  assert.deepEqual(
    fixedOffsets.results.map((zone) => [zone.timeZone, zone.utcOffset]),
    [
      ['Etc/GMT+5', 'UTC−5'],
      ['Etc/GMT-8', 'UTC+8'],
    ],
  )

  const unsignedOffset = resultOf(
    await client.callTool({
      arguments: { targetTimeZones: ['UTC 5'] },
      name: 'current_times',
    }),
  )
  assert.equal(unsignedOffset.status, 'error')
  assert.equal(unsignedOffset.error.code, 'UNKNOWN_TIME_ZONE')

  const ambiguousPlace = resultOf(
    await client.callTool({
      arguments: { targetTimeZones: ['United States'] },
      name: 'current_times',
    }),
  )
  assert.equal(ambiguousPlace.status, 'error')
  assert.equal(ambiguousPlace.error.code, 'AMBIGUOUS_TIME_ZONE')
  assert.ok(ambiguousPlace.error.candidates.length > 1)
  assert.ok(ambiguousPlace.error.candidates.length <= 10)

  const unknownEnvelope = await client.callTool({
    arguments: { locations: ['Asia/Shanghai'] },
    name: 'current_times',
  })
  assert.equal(unknownEnvelope.isError, true)
  assert.match(
    unknownEnvelope.content?.[0]?.text ?? '',
    /Unrecognized key|additional properties/i,
  )

  const converted = await client.callTool({
    arguments: {
      localDateTime: '2026-08-03 16:30',
      sourceTimeZone: '北京时间',
      targetTimeZones: ['Kathmandu', 'Pacific/Chatham', 'Australia/Lord_Howe'],
    },
    name: 'convert_time',
  })
  const convertedResult = resultOf(converted)
  assert.equal(converted.isError, undefined, JSON.stringify(converted))
  assert.equal(convertedResult.status, 'converted')
  assert.deepEqual(
    convertedResult.results.map((zone) => zone.utcOffset),
    ['UTC+5:45', 'UTC+12:45', 'UTC+10:30'],
  )

  const ambiguous = await client.callTool({
    arguments: {
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    },
    name: 'convert_time',
  })
  const ambiguousResult = resultOf(ambiguous)
  assert.equal(ambiguousResult.status, 'ambiguous')
  assert.deepEqual(
    ambiguousResult.candidates.map(
      (candidate) =>
        `${candidate.sourceOccurrence.abbreviation} ${candidate.sourceOccurrence.utcOffset}`,
    ),
    ['EDT UTC−4', 'EST UTC−5'],
  )

  const nonexistent = resultOf(
    await client.callTool({
      arguments: {
        localDateTime: '2026-03-08 02:30',
        sourceTimeZone: 'America/New_York',
        targetTimeZones: ['Asia/Shanghai'],
      },
      name: 'convert_time',
    }),
  )
  assert.equal(nonexistent.status, 'nonexistent')

  const incompletePlan = resultOf(
    await client.callTool({
      arguments: { intent: { anchor: 'fixed_wall_time' } },
      name: 'resolve_time',
    }),
  )
  assert.deepEqual(incompletePlan, {
    missing: ['intent.localDateTime', 'intent.timeZone'],
    status: 'underspecified',
  })

  const resolvedPlan = resultOf(
    await client.callTool({
      arguments: {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-09-01T16:30',
          timeZone: '北京时间',
        },
        locale: 'zh',
      },
      name: 'resolve_time',
    }),
  )
  assert.equal(resolvedPlan.status, 'resolved')
  assert.equal(resolvedPlan.plan.schemaVersion, 'migratory.time-plan.v0.1')
  assert.equal(resolvedPlan.plan.anchor, 'fixed_wall_time')
  assert.equal(resolvedPlan.plan.intent.timeZone, 'Asia/Shanghai')
  assert.equal(resolvedPlan.plan.resolution.instant, '2026-09-01T08:30:00Z')
  assert.equal(resolvedPlan.plan.resolution.offset, '+08:00')
  assert.equal(
    resolvedPlan.plan.dependencies[0].version,
    process.versions.tz ?? 'runtime-provided',
  )

  const repeatedPlan = resultOf(
    await client.callTool({
      arguments: {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-11-01T01:30',
          timeZone: 'America/New_York',
        },
      },
      name: 'resolve_time',
    }),
  )
  assert.equal(repeatedPlan.status, 'ambiguous')
  assert.deepEqual(
    repeatedPlan.candidates.map(({ choice, plan }) => [
      choice,
      plan.resolution.instant,
      plan.resolution.offset,
    ]),
    [
      ['earlier', '2026-11-01T05:30:00Z', '-04:00'],
      ['later', '2026-11-01T06:30:00Z', '-05:00'],
    ],
  )

  const nonexistentPlan = resultOf(
    await client.callTool({
      arguments: {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-03-08T02:30',
          timeZone: 'America/New_York',
        },
      },
      name: 'resolve_time',
    }),
  )
  assert.equal(nonexistentPlan.status, 'nonexistent')

  const invalidPlanDate = resultOf(
    await client.callTool({
      arguments: {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-02-30T12:00',
          timeZone: 'UTC',
        },
      },
      name: 'resolve_time',
    }),
  )
  assert.equal(invalidPlanDate.status, 'error')
  assert.equal(invalidPlanDate.error.code, 'INVALID_FORMAT')
  assert.equal(invalidPlanDate.error.retryable, false)

  const unchangedPlan = resultOf(
    await client.callTool({
      arguments: { plan: resolvedPlan.plan },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchangedPlan.status, 'unchanged')
  assert.deepEqual(unchangedPlan.dependencyChanges, [])

  const olderVersionPlan = structuredClone(resolvedPlan.plan)
  olderVersionPlan.dependencies[0].version = 'older-tzdb'
  const unchangedAfterDependencyChange = resultOf(
    await client.callTool({
      arguments: { plan: olderVersionPlan },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchangedAfterDependencyChange.status, 'unchanged')
  assert.equal(
    unchangedAfterDependencyChange.dependencyChanges[0].field,
    'dependencies[0].version',
  )

  const previousResolutionPlan = structuredClone(olderVersionPlan)
  previousResolutionPlan.resolution = {
    instant: '2026-09-01T09:30:00Z',
    offset: '+07:00',
  }
  const driftedPlan = resultOf(
    await client.callTool({
      arguments: { plan: previousResolutionPlan },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(driftedPlan.status, 'drifted')
  assert.deepEqual(
    driftedPlan.differences.map(({ field }) => field),
    ['dependencies[0].version', 'resolution.instant', 'resolution.offset'],
  )

  const unknownPlanVersion = structuredClone(resolvedPlan.plan)
  unknownPlanVersion.schemaVersion = 'migratory.time-plan.v9'
  const unverifiablePlan = resultOf(
    await client.callTool({
      arguments: { plan: unknownPlanVersion },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unverifiablePlan.status, 'unverifiable')

  const scheduleConflict = resultOf(
    await client.callTool({
      arguments: {
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-03-07T02:30',
        timeZone: 'America/New_York',
        window: {
          endDateExclusive: '2026-03-10',
          startDateInclusive: '2026-03-07',
        },
      },
      name: 'expand_schedule',
    }),
  )
  assert.equal(scheduleConflict.status, 'conflict')
  assert.equal(scheduleConflict.conflict.kind, 'dst_gap')

  const invalidScheduleCursor = resultOf(
    await client.callTool({
      arguments: {
        cursor: 'not-a-cursor',
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-03-07T02:30',
        timeZone: 'America/New_York',
        window: {
          endDateExclusive: '2026-03-10',
          startDateInclusive: '2026-03-07',
        },
      },
      name: 'expand_schedule',
    }),
  )
  assert.equal(invalidScheduleCursor.status, 'error')
  assert.equal(invalidScheduleCursor.error.code, 'INVALID_CURSOR')

  const shiftedSchedule = resultOf(
    await client.callTool({
      arguments: {
        policies: { gap: 'shift_forward' },
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-03-07T02:30',
        timeZone: 'America/New_York',
        window: {
          endDateExclusive: '2026-03-10',
          startDateInclusive: '2026-03-07',
        },
      },
      name: 'expand_schedule',
    }),
  )
  assert.equal(shiftedSchedule.status, 'expanded')
  assert.equal(shiftedSchedule.instances.length, 3)
  assert.deepEqual(shiftedSchedule.instances[1].plans[0].resolution, {
    instant: '2026-03-08T07:30:00Z',
    offset: '-04:00',
  })
  assert.deepEqual(shiftedSchedule.effects[0], {
    direction: 'forward',
    fromLocalDateTime: '2026-03-08T02:30',
    kind: 'gap_shifted',
    toLocalDateTime: '2026-03-08T03:30',
  })

  const maximumScheduleResponse = await client.callTool({
    arguments: {
      maxInstances: 32,
      rule: { frequency: 'daily' },
      startLocalDateTime: '2026-01-01T09:00',
      timeZone: 'UTC',
      window: {
        endDateExclusive: '2026-02-15',
        startDateInclusive: '2026-01-01',
      },
    },
    name: 'expand_schedule',
  })
  assert.equal(resultOf(maximumScheduleResponse).status, 'expanded')
  assert.equal(resultOf(maximumScheduleResponse).instances.length, 32)
  assert.equal(resultOf(maximumScheduleResponse).truncated, true)
  assert.equal(
    resultOf(maximumScheduleResponse).schemaVersion,
    'migratory.schedule-plan.v0.1',
  )
  assert.deepEqual(resultOf(maximumScheduleResponse).revalidation.triggers, [
    'tzdb_change',
  ])
  assert.ok(
    Buffer.byteLength(JSON.stringify(maximumScheduleResponse)) < 64 * 1024,
    'Maximum schedule response must remain below 64 KiB including text and structured content',
  )

  const unchangedSchedule = resultOf(
    await client.callTool({
      arguments: {
        kind: 'schedule',
        plan: resultOf(maximumScheduleResponse),
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchangedSchedule.status, 'unchanged')
  assert.deepEqual(unchangedSchedule.dependencyChanges, [])

  const alteredSchedulePlan = structuredClone(resultOf(maximumScheduleResponse))
  alteredSchedulePlan.instances.shift()
  const driftedSchedule = resultOf(
    await client.callTool({
      arguments: { kind: 'schedule', plan: alteredSchedulePlan },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(driftedSchedule.status, 'drifted')
  assert.equal(
    driftedSchedule.differences.at(-1).field,
    'resolution.expansion',
  )

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
  const businessDeadlineResponse = await client.callTool({
    arguments: {
      calendar: businessCalendar,
      durationMinutes: 240,
      startInstant: '2026-09-03T08:40:00Z',
    },
    name: 'compute_deadline',
  })
  const businessDeadline = resultOf(businessDeadlineResponse)
  assert.equal(businessDeadline.status, 'computed')
  assert.equal(
    businessDeadline.plan.resolution.deadlineInstant,
    '2026-09-04T03:40:00Z',
  )
  assert.match(
    businessDeadline.plan.dependencies[0].definitionFingerprint,
    /^fnv1a64:[0-9a-f]{16}$/,
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(businessDeadlineResponse)) < 64 * 1024,
    'Business deadline response must remain below 64 KiB including text and structured content',
  )

  const unchangedBusinessDeadline = resultOf(
    await client.callTool({
      arguments: {
        currentCalendar: businessCalendar,
        kind: 'business_deadline',
        plan: businessDeadline.plan,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchangedBusinessDeadline.status, 'unchanged')
  assert.deepEqual(unchangedBusinessDeadline.dependencyChanges, [])

  const versionOnlyBusinessCalendar = structuredClone(businessCalendar)
  versionOnlyBusinessCalendar.version = '2026.10'
  const versionOnlyBusinessDeadlineResponse = await client.callTool({
    arguments: {
      currentCalendar: versionOnlyBusinessCalendar,
      kind: 'business_deadline',
      plan: businessDeadline.plan,
    },
    name: 'validate_time_plan',
  })
  const versionOnlyBusinessDeadline = resultOf(
    versionOnlyBusinessDeadlineResponse,
  )
  assert.equal(versionOnlyBusinessDeadline.status, 'unchanged')
  assert.deepEqual(
    versionOnlyBusinessDeadline.dependencyChanges.map(({ field }) => field),
    ['dependencies[0].version'],
  )
  assert.equal(
    versionOnlyBusinessDeadlineResponse.content[0].text,
    'The plan still resolves to the same result; dependencies changed: dependencies[0].version.',
  )

  const fingerprintOnlyBusinessCalendar = structuredClone(businessCalendar)
  fingerprintOnlyBusinessCalendar.exceptions = [
    { date: '2026-12-25', intervals: [] },
  ]
  const fingerprintOnlyBusinessDeadlineResponse = await client.callTool({
    arguments: {
      currentCalendar: fingerprintOnlyBusinessCalendar,
      kind: 'business_deadline',
      plan: businessDeadline.plan,
    },
    name: 'validate_time_plan',
  })
  const fingerprintOnlyBusinessDeadline = resultOf(
    fingerprintOnlyBusinessDeadlineResponse,
  )
  assert.equal(fingerprintOnlyBusinessDeadline.status, 'unchanged')
  assert.deepEqual(
    fingerprintOnlyBusinessDeadline.dependencyChanges.map(({ field }) => field),
    ['dependencies[0].definitionFingerprint'],
  )
  assert.equal(
    fingerprintOnlyBusinessDeadlineResponse.content[0].text,
    'The plan still resolves to the same result; dependencies changed: dependencies[0].definitionFingerprint.',
  )

  const changedBusinessCalendar = structuredClone(businessCalendar)
  changedBusinessCalendar.version = '2026.10'
  changedBusinessCalendar.weeklyHours.FR = [{ end: '10:00', start: '09:00' }]
  const driftedBusinessDeadline = resultOf(
    await client.callTool({
      arguments: {
        currentCalendar: changedBusinessCalendar,
        kind: 'business_deadline',
        plan: businessDeadline.plan,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(driftedBusinessDeadline.status, 'drifted')
  assert.ok(
    driftedBusinessDeadline.differences.some(
      ({ field }) => field === 'resolution.deadlineInstant',
    ),
  )

  const outsideBusinessStart = resultOf(
    await client.callTool({
      arguments: {
        calendar: businessCalendar,
        durationMinutes: 60,
        startInstant: '2026-09-03T12:00:00Z',
      },
      name: 'compute_deadline',
    }),
  )
  assert.equal(outsideBusinessStart.status, 'conflict')
  assert.equal(outsideBusinessStart.conflict.kind, 'start_outside_business_time')

  const availabilityArguments = {
      durationMinutes: 60,
      maxCandidates: 3,
      participants: [
        {
          availability: [
            { end: '2026-09-01T06:00:00Z', start: '2026-09-01T00:00:00Z' },
          ],
          busy: [
            { end: '2026-09-01T03:00:00Z', start: '2026-09-01T02:00:00Z' },
          ],
          id: 'shanghai',
          preferred: [
            { end: '2026-09-01T06:00:00Z', start: '2026-09-01T04:00:00Z' },
          ],
          timeZone: 'Asia/Shanghai',
        },
        {
          availability: [
            { end: '2026-09-01T06:00:00Z', start: '2026-09-01T01:00:00Z' },
          ],
          id: 'london',
          preferred: [
            { end: '2026-09-01T05:00:00Z', start: '2026-09-01T04:00:00Z' },
          ],
          timeZone: 'Europe/London',
        },
        {
          availability: [
            { end: '2026-09-01T07:00:00Z', start: '2026-09-01T03:00:00Z' },
          ],
          id: 'new-york',
          timeZone: 'America/New_York',
        },
      ],
      search: {
        end: '2026-09-01T08:00:00Z',
        start: '2026-09-01T00:00:00Z',
      },
      snapshot: { id: 'freebusy/team-a', version: '2026-09-01T00:00Z' },
      stepMinutes: 60,
  }
  const availabilityResponse = await client.callTool({
    arguments: availabilityArguments,
    name: 'find_time_windows',
  })
  const availability = resultOf(availabilityResponse)
  assert.equal(availability.status, 'solved')
  assert.deepEqual(
    availability.candidates.map((candidate) => candidate.startInstant),
    [
      '2026-09-01T04:00:00Z',
      '2026-09-01T05:00:00Z',
      '2026-09-01T03:00:00Z',
    ],
  )
  assert.deepEqual(
    availability.candidates.map((candidate) => candidate.preferenceSatisfied),
    [2, 1, 0],
  )

  const unchangedAvailability = resultOf(
    await client.callTool({
      arguments: {
        currentSnapshot: {
          participants: [...availabilityArguments.participants].reverse(),
          snapshot: { id: 'freebusy/team-a', version: '2026-09-01T00:00Z' },
        },
        kind: 'availability',
        plan: availability,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(unchangedAvailability.status, 'unchanged')
  assert.deepEqual(unchangedAvailability.dependencyChanges, [])

  const changedAvailabilitySnapshot = structuredClone(
    unchangedAvailability.currentPlan,
  )
  const driftedAvailability = resultOf(
    await client.callTool({
      arguments: {
        currentSnapshot: {
          participants: [
            {
              availability: [
                { end: '2026-09-01T06:00:00Z', start: '2026-09-01T00:00:00Z' },
              ],
              busy: [
                { end: '2026-09-01T05:00:00Z', start: '2026-09-01T04:00:00Z' },
              ],
              id: 'shanghai',
              preferred: [
                { end: '2026-09-01T06:00:00Z', start: '2026-09-01T04:00:00Z' },
              ],
              timeZone: 'Asia/Shanghai',
            },
            {
              availability: [
                { end: '2026-09-01T06:00:00Z', start: '2026-09-01T01:00:00Z' },
              ],
              id: 'london',
              preferred: [
                { end: '2026-09-01T05:00:00Z', start: '2026-09-01T04:00:00Z' },
              ],
              timeZone: 'Europe/London',
            },
            {
              availability: [
                { end: '2026-09-01T07:00:00Z', start: '2026-09-01T03:00:00Z' },
              ],
              id: 'new-york',
              timeZone: 'America/New_York',
            },
          ],
          snapshot: { id: 'freebusy/team-a', version: 'next' },
        },
        kind: 'availability',
        plan: changedAvailabilitySnapshot,
      },
      name: 'validate_time_plan',
    }),
  )
  assert.equal(driftedAvailability.status, 'drifted')
  assert.ok(
    driftedAvailability.differences.some(
      ({ field }) => field === 'resolution.candidates',
    ),
  )

  const maximumAvailabilityResponse = await client.callTool({
    arguments: {
      durationMinutes: 30,
      maxCandidates: 10,
      participants: Array.from({ length: 12 }, (_, index) => ({
        availability: [
          { end: '2026-09-01T12:00:00Z', start: '2026-09-01T00:00:00Z' },
        ],
        id: `participant-${index}`,
        preferred: [
          { end: '2026-09-01T12:00:00Z', start: '2026-09-01T00:00:00Z' },
        ],
        timeZone: 'UTC',
      })),
      search: {
        end: '2026-09-01T12:00:00Z',
        start: '2026-09-01T00:00:00Z',
      },
      snapshot: { id: 'max-response', version: '1' },
      stepMinutes: 30,
    },
    name: 'find_time_windows',
  })
  assert.equal(resultOf(maximumAvailabilityResponse).status, 'solved')
  assert.equal(resultOf(maximumAvailabilityResponse).candidates.length, 10)
  assert.equal(resultOf(maximumAvailabilityResponse).candidates[0].localViews.length, 12)
  assert.ok(
    Buffer.byteLength(JSON.stringify(maximumAvailabilityResponse)) < 64 * 1024,
    'Maximum availability response must remain below 64 KiB including text and structured content',
  )

  const functionalErrors = [
    [
      {
        localDateTime: '1900-12-31 12:00',
        sourceTimeZone: 'Asia/Shanghai',
      },
      'UNSUPPORTED_YEAR',
    ],
    [
      {
        localDateTime: '2026/08/03 16:30',
        sourceTimeZone: 'Asia/Shanghai',
      },
      'INVALID_FORMAT',
    ],
    [
      {
        localDateTime: '2026-08-03 16:30',
        sourceTimeZone: 'not/a-zone',
      },
      'UNKNOWN_TIME_ZONE',
    ],
    [
      {
        localDateTime: '1971-01-01 12:00',
        sourceTimeZone: 'Africa/Monrovia',
        targetTimeZones: ['UTC'],
      },
      'UNSUPPORTED_PRECISION',
    ],
  ]
  for (const [arguments_, code] of functionalErrors) {
    const response = await client.callTool({
      arguments: arguments_,
      name: 'convert_time',
    })
    assert.equal(response.isError, undefined)
    assert.equal(resultOf(response).status, 'error')
    assert.equal(resultOf(response).error.code, code)
    assert.equal(resultOf(response).error.retryable, false)
  }

  const twentyIds = firstPage.items.slice(0, 20).map((zone) => zone.id)
  const maxResponse = await client.callTool({
    arguments: { targetTimeZones: twentyIds },
    name: 'current_times',
  })
  assert.equal(resultOf(maxResponse).results.length, 20)
  assert.ok(
    Buffer.byteLength(JSON.stringify(maxResponse.structuredContent)) < 64 * 1024,
    'Maximum successful output must remain below 64 KiB',
  )

  console.log(
    'MCP runtime check passed: global discovery, compact schemas, on-demand closed semantic results, provenance, bounded search/list/schedule/deadline/availability output, aliases, fixed offsets, DST branches, plan revalidation, business calendars, availability ranking, and transport-visible structured errors.',
  )
} finally {
  await client.close()
}
