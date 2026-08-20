import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const child = spawn(process.execPath, ['scripts/runCapabilityAdapter.mjs'], {
  cwd: repositoryRoot,
  stdio: ['pipe', 'pipe', 'pipe'],
})
const responses = []
let stdout = ''
let stderr = ''

child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})

const requests = [
  {
    id: 'converted',
    operationId: 'convert',
    input: {
      localDateTime: '2026-08-03T16:30',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: [
        'America/Los_Angeles',
        'Europe/London',
        'Asia/Kathmandu',
        'Pacific/Chatham',
      ],
    },
  },
  {
    id: 'ambiguous',
    operationId: 'convert',
    input: {
      localDateTime: '2026-11-01T01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    },
  },
  {
    id: 'later',
    operationId: 'convert',
    input: {
      disambiguation: 'later',
      localDateTime: '2026-11-01T01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    },
  },
  {
    id: 'nonexistent',
    operationId: 'convert',
    input: {
      localDateTime: '2026-03-08T02:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    },
  },
  {
    extra: true,
    id: 'extra-envelope-field',
    operationId: 'convert',
    input: {
      localDateTime: '2026-08-03T16:30',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['Europe/London'],
    },
  },
  {
    id: 'product-field-leak',
    operationId: 'convert',
    input: {
      localDateTime: '2026-08-03T16:30',
      locale: 'zh',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['Europe/London'],
    },
  },
  {
    id: 'provider-limit',
    operationId: 'convert',
    input: {
      localDateTime: '2026-08-03T16:30',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: [
        'Asia/Shanghai',
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Kathmandu',
        'Pacific/Chatham',
        'Australia/Lord_Howe',
        'Europe/Paris',
        'Europe/Rome',
        'Europe/Madrid',
        'Europe/Moscow',
        'Asia/Dubai',
        'Asia/Kolkata',
        'Asia/Singapore',
        'Asia/Seoul',
        'Australia/Sydney',
        'Pacific/Auckland',
        'Pacific/Honolulu',
        'Africa/Cairo',
      ],
    },
  },
  {
    id: 'utc-target',
    operationId: 'convert',
    input: {
      localDateTime: '2026-01-15T12:00',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['UTC'],
    },
  },
  {
    id: 'canonical-fixed-offsets',
    operationId: 'convert',
    input: {
      localDateTime: '2026-01-15T12:00',
      sourceTimeZone: 'UTC',
      targetTimeZones: ['Etc/GMT+5', 'Etc/GMT-14'],
    },
  },
  {
    id: 'ambiguous-zero-offset-source',
    operationId: 'convert',
    input: {
      localDateTime: '2026-10-25T01:30',
      sourceTimeZone: 'Europe/London',
      targetTimeZones: ['Asia/Shanghai'],
    },
  },
  {
    id: 'historical-subminute-offset',
    operationId: 'convert',
    input: {
      localDateTime: '1971-01-01T12:00',
      sourceTimeZone: 'Africa/Monrovia',
      targetTimeZones: ['UTC'],
    },
  },
  {
    id: 'historical-offset-limit',
    operationId: 'convert',
    input: {
      localDateTime: '1900-12-31T12:00',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['Europe/London'],
    },
  },
]

for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`)
child.stdin.write('{bad json\n')
child.stdin.write(`${'x'.repeat(70 * 1024)}\n`)
child.stdin.write(
  `${JSON.stringify({
    id: 'recovered-after-invalid-lines',
    operationId: 'convert',
    input: {
      localDateTime: '2026-08-03T16:30',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['Europe/London'],
    },
  })}\n`,
)
child.stdin.end()

const exit = await new Promise((resolveExit, reject) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    reject(new Error('Capability adapter check timed out'))
  }, 10_000)
  child.on('error', reject)
  child.on('close', (code, signal) => {
    clearTimeout(timer)
    resolveExit({ code, signal })
  })
})

assert.deepEqual(exit, { code: 0, signal: null }, stderr)
for (const line of stdout.split(/\r?\n/).filter(Boolean)) responses.push(JSON.parse(line))
assert.equal(responses.length, requests.length + 3)

const byId = new Map(responses.map((response) => [response.id, response]))
assert.equal(byId.get('converted')?.result?.status, 'converted')
assert.deepEqual(
  byId.get('converted')?.result?.results?.map((result) => result.timeZone),
  [
    'America/Los_Angeles',
    'Europe/London',
    'Asia/Kathmandu',
    'Pacific/Chatham',
  ],
)
assert.equal(byId.get('ambiguous')?.result?.status, 'ambiguous')
assert.deepEqual(
  byId.get('ambiguous')?.result?.candidates?.map((candidate) => candidate.choice),
  ['earlier', 'later'],
)
assert.equal(byId.get('later')?.result?.status, 'converted')
assert.equal(byId.get('later')?.result?.instant, '2026-11-01T06:30:00Z')
assert.equal(byId.get('nonexistent')?.result?.status, 'nonexistent')
assert.equal(byId.get('extra-envelope-field')?.error?.code, 'ADAPTER_INVALID_REQUEST')
assert.equal(byId.get('product-field-leak')?.error?.code, 'INVALID_INPUT')
assert.equal(byId.get('provider-limit')?.error?.code, 'INVALID_INPUT')
assert.doesNotMatch(byId.get('provider-limit')?.error?.message ?? '', /MCP|convert_time/)
assert.equal(byId.get('utc-target')?.result?.status, 'converted')
assert.equal(byId.get('utc-target')?.result?.results?.[0]?.offset, '+00:00')
assert.deepEqual(
  byId
    .get('canonical-fixed-offsets')
    ?.result?.results?.map((result) => [result.timeZone, result.offset]),
  [
    ['Etc/GMT+5', '-05:00'],
    ['Etc/GMT-14', '+14:00'],
  ],
)
assert.equal(byId.get('ambiguous-zero-offset-source')?.result?.status, 'ambiguous')
assert.deepEqual(
  byId
    .get('ambiguous-zero-offset-source')
    ?.result?.candidates?.map((candidate) => candidate.sourceOffset),
  ['+01:00', '+00:00'],
)
assert.equal(byId.get('historical-offset-limit')?.error?.code, 'UNSUPPORTED_YEAR')
assert.equal(
  byId.get('historical-subminute-offset')?.error?.code,
  'UNSUPPORTED_PRECISION',
)
assert.equal(responses.at(-3)?.error?.code, 'ADAPTER_INVALID_REQUEST')
assert.equal(responses.at(-2)?.error?.code, 'ADAPTER_INVALID_REQUEST')
assert.match(responses.at(-2)?.error?.message ?? '', /exceeds 65536 bytes/)
assert.equal(responses.at(-1)?.id, 'recovered-after-invalid-lines')
assert.equal(responses.at(-1)?.result?.status, 'converted')

console.log(
  'PASS capability adapter: global canonical validation, conversion, ambiguity choices, nonexistent time, structured provider limits, sub-minute refusal, and malformed requests.',
)
