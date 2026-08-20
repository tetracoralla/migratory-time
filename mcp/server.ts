import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  convertTime,
  currentTimes,
  listTimeZones,
  MAX_LIST_TIME_ZONES_LIMIT,
  searchTimeZones,
  type AgentErrorResult,
  type ConvertTimeResult,
  type CurrentTimesResultUnion,
  type ListTimeZonesResult,
  type SearchTimeZonesResult,
} from '../src/lib/agentTimeTools'
import { MAX_SELECTED_TIME_ZONES, MAX_TIME_ZONE_SEARCH_LIMIT } from '../src/data/timeZoneRegistry'
import { initializeTemporal } from '../src/lib/temporal'

const localeSchema = z
  .enum(['zh', 'en'])
  .optional()
  .describe('Language for human-readable region labels. Defaults to en.')
const timeZoneInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe(
    'An IANA time-zone id, explicit UTC/GMT offset such as UTC-5, or an unambiguous city, country, or region name.',
  )
const targetTimeZonesSchema = z
  .array(timeZoneInputSchema)
  .max(100)
  .optional()
  .describe(
    `Target regions in output order. Omit for the five default regions. Functional limit: ${MAX_SELECTED_TIME_ZONES}.`,
  )

const candidateSchema = z
  .object({
    countryCode: z.string(),
    countryName: z.string(),
    id: z.string(),
    label: z.string(),
    labelEn: z.string(),
    mainCities: z.array(z.string()),
  })
  .strict()

const errorSchema = z
  .object({
    candidates: z.array(candidateSchema).optional(),
    code: z.enum([
      'AMBIGUOUS_TIME_ZONE',
      'DUPLICATE_TIME_ZONE',
      'EMPTY_QUERY',
      'EMPTY_TARGETS',
      'INTERNAL_ERROR',
      'INVALID_CURSOR',
      'INVALID_FORMAT',
      'TOO_MANY_TARGETS',
      'UNKNOWN_TIME_ZONE',
      'UNSUPPORTED_PRECISION',
      'UNSUPPORTED_YEAR',
    ]),
    field: z.string().optional(),
    input: z.string().optional(),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict()

const errorResultSchema = z
  .object({ error: errorSchema, status: z.literal('error') })
  .strict()

const zoneResultSchema = z
  .object({
    abbreviation: z.string(),
    dateTime: z.string(),
    label: z.string(),
    timeZone: z.string(),
    utcOffset: z.string(),
  })
  .strict()

const convertedFields = {
  copyText: z.string(),
  instant: z.string(),
  results: z.array(zoneResultSchema).max(MAX_SELECTED_TIME_ZONES),
  shareUrl: z.string(),
}

const sourceSchema = z
  .object({ localDateTime: z.string(), timeZone: z.string() })
  .strict()
const sourceOccurrenceSchema = z
  .object({
    abbreviation: z.string(),
    timeZone: z.string(),
    utcOffset: z.string(),
  })
  .strict()

const convertedResultSchema = z
  .object({
    ...convertedFields,
    source: sourceSchema,
    status: z.literal('converted'),
  })
  .strict()
const ambiguousResultSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            ...convertedFields,
            choice: z.enum(['earlier', 'later']),
            sourceOccurrence: sourceOccurrenceSchema,
          })
          .strict(),
      )
      .length(2),
    source: sourceSchema,
    status: z.literal('ambiguous'),
  })
  .strict()
const nonexistentResultSchema = z
  .object({
    reason: z.string(),
    source: sourceSchema,
    status: z.literal('nonexistent'),
  })
  .strict()
const convertTimeResultSchema = z.discriminatedUnion('status', [
  convertedResultSchema,
  ambiguousResultSchema,
  nonexistentResultSchema,
  errorResultSchema,
])
const currentTimesResultSchema = z.discriminatedUnion('status', [
  z.object({ ...convertedFields, status: z.literal('converted') }).strict(),
  errorResultSchema,
])
const searchTimeZonesResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      items: z
        .array(
          candidateSchema.extend({
            abbreviation: z.string(),
            utcOffset: z.string(),
          }),
        )
        .max(MAX_TIME_ZONE_SEARCH_LIMIT),
      query: z.string(),
      status: z.literal('found'),
    })
    .strict(),
  errorResultSchema,
])
const listTimeZonesResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      items: z.array(candidateSchema).max(MAX_LIST_TIME_ZONES_LIMIT),
      nextCursor: z.string().nullable(),
      status: z.literal('listed'),
      total: z.number().int().nonnegative(),
    })
    .strict(),
  errorResultSchema,
])

const provenanceSchema = z
  .object({
    engine: z.literal('Temporal+Intl'),
    timeZoneData: z.literal('IANA'),
    timeZoneDataVersion: z.string(),
  })
  .strict()

function outputSchema<T extends z.ZodTypeAny>(result: T) {
  return z.object({ provenance: provenanceSchema, result }).strict()
}

const readOnlyAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const

const provenance = {
  engine: 'Temporal+Intl' as const,
  timeZoneData: 'IANA' as const,
  timeZoneDataVersion: process.versions.tz ?? 'runtime-provided',
}

function summarizeConversion(result: ConvertTimeResult | CurrentTimesResultUnion) {
  if (result.status === 'converted') {
    return `${result.copyText}\n\nShare: ${result.shareUrl}`
  }
  if (result.status === 'ambiguous') {
    const choices = result.candidates.map((candidate) => {
      const sourceDescription = `${candidate.sourceOccurrence.abbreviation} ${candidate.sourceOccurrence.utcOffset}`
      return `${candidate.choice}: ${sourceDescription} (${candidate.instant})`
    })
    return `This local time occurs twice. Ask the user to choose earlier or later.\n${choices.join('\n')}`
  }
  if (result.status === 'nonexistent') return result.reason
  return `${result.error.code}: ${result.error.message}`
}

function resultText(
  result: SearchTimeZonesResult | ListTimeZonesResult | AgentErrorResult,
) {
  if (result.status === 'error') return `${result.error.code}: ${result.error.message}`
  if (result.status === 'found') {
    if (!result.items.length) return `No time zones matched “${result.query}”.`
    return result.items
      .map(
        (zone) =>
          `${zone.id} — ${zone.labelEn} / ${zone.label} — ${zone.utcOffset} ${zone.abbreviation}`,
      )
      .join('\n')
  }
  const lines = result.items.map(
    (zone) => `${zone.id} — ${zone.labelEn} / ${zone.label}`,
  )
  const continuation = result.nextCursor
    ? `\nNext cursor: ${result.nextCursor}`
    : '\nEnd of list.'
  return `${lines.join('\n')}${continuation}`
}

function toolResult(result: object, text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { provenance, result },
  }
}

export function createMigratoryTimeServer() {
  const server = new McpServer(
    { name: 'migratory-time', version: '2.0.0' },
    {
      instructions:
        'Use current_times for current time and convert_time for exact civil-time conversion anywhere in the world. Pass ordinary city, country, or region names directly; use search_time_zones only for explicit exploration or after an AMBIGUOUS_TIME_ZONE/UNKNOWN_TIME_ZONE result. Never calculate offsets manually. If convert_time returns ambiguous, ask the user to choose earlier or later; if it returns nonexistent, do not substitute another time.',
    },
  )

  server.registerTool(
    'convert_time',
    {
      annotations: readOnlyAnnotations,
      description:
        'Convert one exact local date and time between civil time zones worldwide. Accepts IANA ids and unambiguous city, country, or region names. Handles daylight-saving gaps and repeats without guessing.',
      inputSchema: z
        .object({
          disambiguation: z
            .enum(['reject', 'earlier', 'later'])
            .optional()
            .describe('How to resolve a repeated local time. Defaults to reject.'),
          localDateTime: z
            .string()
            .trim()
            .min(1)
            .max(32)
            .describe('Local wall-clock time; expected format YYYY-MM-DD HH:mm, year 1901+.'),
          locale: localeSchema,
          sourceTimeZone: timeZoneInputSchema,
          targetTimeZones: targetTimeZonesSchema,
        })
        .strict(),
      outputSchema: outputSchema(convertTimeResultSchema),
      title: 'Convert world time zones',
    },
    async (input) => {
      const result = convertTime(input)
      return toolResult(result, summarizeConversion(result))
    },
  )

  server.registerTool(
    'current_times',
    {
      annotations: readOnlyAnnotations,
      description:
        'Get current civil times worldwide in one call. Accepts IANA ids and unambiguous city, country, or region names; omit targets for the five default regions.',
      inputSchema: z
        .object({ locale: localeSchema, targetTimeZones: targetTimeZonesSchema })
        .strict(),
      outputSchema: outputSchema(currentTimesResultSchema),
      title: 'Get current world times',
    },
    async (input) => {
      const result = currentTimes(input)
      return toolResult(result, summarizeConversion(result))
    },
  )

  server.registerTool(
    'search_time_zones',
    {
      annotations: readOnlyAnnotations,
      description:
        'Search for IANA time zones by city, country, region, or id. Use for explicit discovery or to recover from an unresolved time-zone name; ordinary conversion normally needs no search call.',
      inputSchema: z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_TIME_ZONE_SEARCH_LIMIT)
            .optional(),
          locale: localeSchema,
          query: z.string().max(120),
        })
        .strict(),
      outputSchema: outputSchema(searchTimeZonesResultSchema),
      title: 'Search world time zones',
    },
    async (input) => {
      const result = searchTimeZones(input)
      return toolResult(result, resultText(result))
    },
  )

  server.registerTool(
    'list_time_zones',
    {
      annotations: readOnlyAnnotations,
      description:
        `Page through the canonical IANA time-zone registry, at most ${MAX_LIST_TIME_ZONES_LIMIT} items per call, in stable IANA-id order. Prefer search_time_zones for finding a region.`,
      inputSchema: z
        .object({
          cursor: z
            .string()
            .max(16)
            .describe(
              'Opaque cursor returned by the previous page. Invalid values receive a structured INVALID_CURSOR result.',
            )
            .optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_LIST_TIME_ZONES_LIMIT)
            .optional(),
          locale: localeSchema,
        })
        .strict(),
      outputSchema: outputSchema(listTimeZonesResultSchema),
      title: 'List canonical time zones',
    },
    async (input) => {
      const result = listTimeZones(input)
      return toolResult(result, resultText(result))
    },
  )

  return server
}

async function main() {
  await initializeTemporal()
  const server = createMigratoryTimeServer()
  await server.connect(new StdioServerTransport())
}

main().catch((error) => {
  console.error('Migratory Time MCP server failed:', error)
  process.exitCode = 1
})
