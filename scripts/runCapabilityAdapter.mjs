import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { connectMigratoryTimeClient } from './capabilityProviderLib.mjs'
import { repositoryRoot } from './capabilityProviderLib.mjs'

const MAX_REQUEST_LINE_BYTES = 64 * 1024
const MAX_PROVIDER_TARGETS = 20
const schemaRoot = resolve(repositoryRoot, 'capabilities/schemas')
const [inputSchema, outputSchema] = await Promise.all([
  readFile(resolve(schemaRoot, 'time-zone.convert.input.schema.json'), 'utf8').then(JSON.parse),
  readFile(resolve(schemaRoot, 'time-zone.convert.output.schema.json'), 'utf8').then(JSON.parse),
])
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true })
addFormats(ajv)
const validateInput = ajv.compile(inputSchema)
const validateOutput = ajv.compile(outputSchema)

const client = await connectMigratoryTimeClient('migratory-time-capability-adapter')

function formatValidationErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ')
}

async function* readBoundedLines(input) {
  let buffered = []
  let bufferedBytes = 0
  let oversized = false

  for await (const chunkValue of input) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
    let start = 0
    let newline = chunk.indexOf(0x0a, start)

    while (newline !== -1) {
      const segment = chunk.subarray(start, newline)
      if (!oversized && bufferedBytes + segment.length <= MAX_REQUEST_LINE_BYTES) {
        buffered.push(segment)
        const line = Buffer.concat(buffered, bufferedBytes + segment.length)
        yield { line: line.subarray(0, line.at(-1) === 0x0d ? -1 : undefined).toString('utf8') }
      } else {
        yield { error: `Request line exceeds ${MAX_REQUEST_LINE_BYTES} bytes` }
      }
      buffered = []
      bufferedBytes = 0
      oversized = false
      start = newline + 1
      newline = chunk.indexOf(0x0a, start)
    }

    const remainder = chunk.subarray(start)
    if (oversized) continue
    if (bufferedBytes + remainder.length > MAX_REQUEST_LINE_BYTES) {
      buffered = []
      bufferedBytes = 0
      oversized = true
    } else if (remainder.length > 0) {
      buffered.push(remainder)
      bufferedBytes += remainder.length
    }
  }

  if (oversized) {
    yield { error: `Request line exceeds ${MAX_REQUEST_LINE_BYTES} bytes` }
  } else if (bufferedBytes > 0) {
    const line = Buffer.concat(buffered, bufferedBytes)
    yield { line: line.subarray(0, line.at(-1) === 0x0d ? -1 : undefined).toString('utf8') }
  }
}

function canonicalLocalDateTime(value) {
  return value.replace(' ', 'T')
}

function providerLocalDateTime(value) {
  return value.replace('T', ' ')
}

function canonicalOffset(value) {
  // The product labels a zero offset as the bare string "UTC".
  if (value === 'UTC') return '+00:00'
  const match = /^UTC([+−-])(\d{1,2})(?::(\d{2}))?$/.exec(value)
  if (match === null) throw new Error(`Unsupported provider UTC offset ${value}`)
  const sign = match[1] === '−' ? '-' : match[1]
  return `${sign}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`
}

function canonicalTargetResult(result) {
  return {
    timeZone: result.timeZone,
    localDateTime: canonicalLocalDateTime(result.dateTime),
    offset: canonicalOffset(result.utcOffset),
  }
}

function runtimeContext(provenance) {
  if (provenance?.timeZoneDataVersion === undefined) {
    throw new Error('Provider result does not report a time-zone database version')
  }
  return {
    calendar: 'iso8601',
    timeZoneDatabase: provenance.timeZoneDataVersion,
  }
}

function canonicalResult(result, provenance) {
  const common = {
    status: result.status,
    source: {
      localDateTime: canonicalLocalDateTime(result.source.localDateTime),
      timeZone: result.source.timeZone,
    },
    context: runtimeContext(provenance),
  }
  if (result.status === 'converted') {
    return {
      ...common,
      instant: result.instant,
      results: result.results.map(canonicalTargetResult),
    }
  }
  if (result.status === 'ambiguous') {
    return {
      ...common,
      candidates: result.candidates.map((candidate) => ({
        choice: candidate.choice,
        instant: candidate.instant,
        sourceOffset: canonicalOffset(candidate.sourceOccurrence.utcOffset),
        results: candidate.results.map(canonicalTargetResult),
      })),
    }
  }
  if (result.status === 'nonexistent') return common
  throw new Error(`Unsupported provider result status ${result.status}`)
}

function providerError(response) {
  const structured = response.structuredContent?.result
  if (structured?.status === 'error') {
    return {
      code: structured.error.code,
      message: structured.error.message,
      retryable: structured.error.retryable,
    }
  }
  const text = response.content?.find((item) => item.type === 'text')?.text ?? ''
  const match = /^([A-Z][A-Z0-9_]*):/.exec(text)
  if (match !== null) {
    return {
      code: match[1],
      message: text.slice(match[0].length).trim() || 'Provider rejected the request',
    }
  }
  if (/^MCP error -32602:/.test(text)) {
    return {
      code: 'INVALID_INPUT',
      message: 'The input is outside this provider\'s supported limits.',
    }
  }
  return {
    code: 'PROVIDER_ERROR',
    message: 'The provider could not complete the request.',
  }
}

function assertRequestEnvelope(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Request must be an object')
  }
  const keys = Object.keys(request).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['id', 'input', 'operationId'])) {
    throw new Error(`Invalid request fields: ${keys.join(', ')}`)
  }
  if (typeof request.id !== 'string' || request.id.length === 0 || request.id.length > 128) {
    throw new Error('Request id must be a non-empty string of at most 128 characters')
  }
  if (request.operationId !== 'convert') {
    throw new Error(`Unsupported operationId ${request.operationId}`)
  }
}

function assertCanonicalInput(input) {
  if (!validateInput(input)) {
    const error = new Error(`Invalid canonical input: ${formatValidationErrors(validateInput.errors)}`)
    error.code = 'INVALID_INPUT'
    throw error
  }
  if (input.targetTimeZones.length > MAX_PROVIDER_TARGETS) {
    const error = new Error(
      `targetTimeZones exceeds this provider's supported limit of ${MAX_PROVIDER_TARGETS}`,
    )
    error.code = 'INVALID_INPUT'
    throw error
  }
}

function assertCanonicalOutput(output) {
  if (!validateOutput(output)) {
    throw new Error(
      `Provider result violates the canonical output contract: ${formatValidationErrors(validateOutput.errors)}`,
    )
  }
}

try {
  for await (const entry of readBoundedLines(process.stdin)) {
    if (entry.line?.trim() === '') continue
    let request
    try {
      if (entry.error !== undefined) throw new Error(entry.error)
      request = JSON.parse(entry.line)
      assertRequestEnvelope(request)
      assertCanonicalInput(request.input)
      const response = await client.callTool({
        name: 'convert_time',
        arguments: {
          ...request.input,
          localDateTime: providerLocalDateTime(request.input.localDateTime),
        },
      })
      const providerResult = response.structuredContent?.result
      if (response.isError === true || providerResult?.status === 'error') {
        const error = providerError(response)
        process.stdout.write(
          `${JSON.stringify({
            id: request.id,
            ok: false,
            error,
          })}\n`,
        )
      } else {
        const result = canonicalResult(
          providerResult,
          response.structuredContent?.provenance,
        )
        assertCanonicalOutput(result)
        process.stdout.write(
          `${JSON.stringify({
            id: request.id,
            ok: true,
            result,
          })}\n`,
        )
      }
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          id: request?.id ?? null,
          ok: false,
          error: {
            code: error?.code ?? 'ADAPTER_INVALID_REQUEST',
            message: error instanceof Error ? error.message : String(error),
          },
        })}\n`,
      )
    }
  }
} finally {
  await client.close()
}
