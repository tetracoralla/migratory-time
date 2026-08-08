import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const pluginRoot = resolve(
  process.argv[2] ?? 'plugins/migratory-time',
)
const transport = new StdioClientTransport({
  args: ['./server/index.mjs'],
  command: process.execPath,
  cwd: pluginRoot,
  stderr: 'pipe',
})
const client = new Client({ name: 'migratory-time-check', version: '1.1.0' })

try {
  await client.connect(transport)

  const listed = await client.listTools()
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    ['convert_time', 'current_times', 'list_time_zones'],
  )
  assert.ok(
    listed.tools.every(
      (tool) =>
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint === false,
    ),
  )
  const currentTimesTool = listed.tools.find(
    (tool) => tool.name === 'current_times',
  )
  const targetZoneItemSchema =
    currentTimesTool?.inputSchema?.properties?.targetTimeZones?.items
  const advertisedTargetAliases = [
    ...(targetZoneItemSchema?.enum ?? []),
    ...(targetZoneItemSchema?.anyOf?.flatMap((schema) => schema.enum ?? []) ?? []),
  ]
  assert.ok(
    advertisedTargetAliases.includes('欧洲中部'),
    'current_times must expose ordinary region aliases in its executable schema',
  )

  const supportedZones = await client.callTool({
    arguments: {},
    name: 'list_time_zones',
  })
  assert.equal(supportedZones.structuredContent?.timeZones?.length, 5)

  const current = await client.callTool({
    arguments: {
      targetTimeZones: ['北京时间', '欧洲中部'],
    },
    name: 'current_times',
  })
  assert.equal(current.structuredContent?.status, 'converted')
  assert.equal(
    current.structuredContent?.results?.[0]?.timeZone,
    'Asia/Shanghai',
  )
  assert.equal(
    current.structuredContent?.results?.[1]?.timeZone,
    'Europe/Berlin',
  )

  const unknownInput = await client.callTool({
    arguments: {
      locations: ['Asia/Shanghai'],
    },
    name: 'current_times',
  })
  assert.equal(unknownInput.isError, true)
  assert.match(
    unknownInput.content?.[0]?.text ?? '',
    /Unrecognized key|additional properties/i,
  )

  const converted = await client.callTool({
    arguments: {
      localDateTime: '2026-08-03 16:30',
      sourceTimeZone: '北京时间',
      targetTimeZones: ['US Pacific', 'UK'],
    },
    name: 'convert_time',
  })
  assert.equal(converted.isError, undefined, JSON.stringify(converted))
  assert.equal(converted.structuredContent?.status, 'converted')
  assert.equal(converted.structuredContent?.results?.[0]?.abbreviation, 'PDT')

  const ambiguous = await client.callTool({
    arguments: {
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    },
    name: 'convert_time',
  })
  assert.equal(ambiguous.structuredContent?.status, 'ambiguous')
  assert.deepEqual(
    ambiguous.structuredContent?.candidates?.map(
      (candidate) =>
        `${candidate.sourceOccurrence.abbreviation} ${candidate.sourceOccurrence.utcOffset}`,
    ),
    ['EDT UTC−4', 'EST UTC−5'],
  )
  assert.deepEqual(
    ambiguous.structuredContent?.candidates?.map(
      (candidate) => candidate.results[0].timeZone,
    ),
    ['Asia/Shanghai', 'Asia/Shanghai'],
  )

  const invalid = await client.callTool({
    arguments: {
      localDateTime: '2026-08-03 16:30',
      sourceTimeZone: 'EST',
    },
    name: 'convert_time',
  })
  assert.equal(invalid.isError, true)
  assert.match(invalid.content?.[0]?.text ?? '', /^INVALID_INPUT:/)

  console.log('MCP runtime check passed: discovery, strict one-call inputs, alias-first routes, all tools, conversion, DST ambiguity, and invalid-zone handling.')
} finally {
  await client.close()
}
