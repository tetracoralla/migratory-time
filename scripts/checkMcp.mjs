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
    ['convert_time', 'current_times', 'list_time_zones', 'search_time_zones'],
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
    'Tool discovery must remain below the schema context budget',
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

  const searchTool = listed.tools.find((tool) => tool.name === 'search_time_zones')
  const listTool = listed.tools.find((tool) => tool.name === 'list_time_zones')
  assert.equal(searchTool?.inputSchema?.properties?.limit?.maximum, 10)
  assert.equal(listTool?.inputSchema?.properties?.limit?.maximum, 50)
  assert.equal(listTool?.inputSchema?.properties?.cursor?.pattern, undefined)

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
    assert.equal(typeof resultOf(response).error.retryable, 'boolean')
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
    'MCP runtime check passed: global discovery, compact schemas, closed result unions, provenance, bounded search/list/output, aliases, fixed offsets, DST branches, and transport-visible structured errors.',
  )
} finally {
  await client.close()
}
