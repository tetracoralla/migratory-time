import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  convertTime,
  currentTimes,
  listTimeZones,
  SUPPORTED_TIME_ZONE_COUNT,
  TIME_ZONE_INPUT_VALUES,
  type ConvertTimeResult,
  type CurrentTimesResult,
} from '../src/lib/agentTimeTools'
import { initializeTemporal } from '../src/lib/temporal'

const localeSchema = z
  .enum(['zh', 'en'])
  .optional()
  .describe('Language for human-readable region labels. Defaults to en.')
const timeZoneInputSchema = z.union([
  z.enum(TIME_ZONE_INPUT_VALUES),
  z.string().trim().min(1).max(80),
])
const targetTimeZonesSchema = z
  .array(timeZoneInputSchema)
  .min(1)
  .max(SUPPORTED_TIME_ZONE_COUNT)
  .optional()
  .describe(
    'Configured target regions in output order. Natural aliases such as 北京时间, US Eastern, UK, and 欧洲中部 are accepted. Omit to return all regions.',
  )

const zoneResultSchema = z.object({
  abbreviation: z.string(),
  dateTime: z.string(),
  label: z.string(),
  timeZone: z.string(),
  utcOffset: z.string(),
})

const convertedTimeSchema = z.object({
  copyText: z.string(),
  instant: z.string(),
  results: z.array(zoneResultSchema),
  shareUrl: z.string(),
})

const sourceSchema = z.object({
  localDateTime: z.string(),
  timeZone: z.string(),
})

const sourceOccurrenceSchema = z.object({
  abbreviation: z.string(),
  timeZone: z.string(),
  utcOffset: z.string(),
})

const convertTimeOutputSchema = z.object({
  candidates: z
    .array(
      convertedTimeSchema.extend({
        choice: z.enum(['earlier', 'later']),
        sourceOccurrence: sourceOccurrenceSchema,
      }),
    )
    .optional(),
  copyText: z.string().optional(),
  instant: z.string().optional(),
  reason: z.string().optional(),
  results: z.array(zoneResultSchema).optional(),
  shareUrl: z.string().optional(),
  source: sourceSchema,
  status: z.enum(['converted', 'ambiguous', 'nonexistent']),
})

const listTimeZonesOutputSchema = z.object({
  timeZones: z.array(
    z.object({
      abbreviations: z.array(z.string()),
      aliases: z.array(z.string()),
      label: z.string(),
      labelEn: z.string(),
      shareCode: z.string(),
      timeZone: z.string(),
    }),
  ),
})

const readOnlyAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const

function summarizeConversion(result: ConvertTimeResult | CurrentTimesResult) {
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

  return result.reason
}

function successResult(structuredContent: object, text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { ...structuredContent },
  }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const code = error instanceof RangeError ? 'INVALID_INPUT' : 'INTERNAL_ERROR'
  return {
    content: [{ type: 'text' as const, text: `${code}: ${message}` }],
    isError: true,
  }
}

export function createMigratoryTimeServer() {
  const server = new McpServer(
    { name: 'migratory-time', version: '1.1.0' },
    {
      instructions:
        'Use these deterministic tools for exact time-zone conversion. Never calculate offsets manually. If convert_time returns ambiguous, ask the user to choose earlier or later; if it returns nonexistent, do not substitute a different time.',
    },
  )

  server.registerTool(
    'convert_time',
    {
      annotations: readOnlyAnnotations,
      description:
        'Convert one exact local date and time across Beijing/China, US Eastern, US Pacific, UK, or Central Europe. Accepts the listed region aliases directly, handles daylight-saving transitions, and refuses to guess when a local time occurs twice.',
      inputSchema: z.object({
        disambiguation: z
          .enum(['reject', 'earlier', 'later'])
          .optional()
          .describe(
            'How to resolve a repeated daylight-saving local time. Defaults to reject so the user can choose.',
          ),
        localDateTime: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
          .describe('Local wall-clock date and time in exact YYYY-MM-DD HH:mm format.'),
        locale: localeSchema,
        sourceTimeZone: timeZoneInputSchema.describe(
          'Source region alias or IANA time zone, such as 北京时间, US Pacific, Asia/Shanghai, or pt.',
        ),
        targetTimeZones: targetTimeZonesSchema,
      }).strict(),
      outputSchema: convertTimeOutputSchema,
      title: 'Convert time zones',
    },
    async (input) => {
      try {
        const result = convertTime(input)
        return successResult(result, summarizeConversion(result))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'current_times',
    {
      annotations: readOnlyAnnotations,
      description:
        'Get current times now in Beijing/China, US Eastern, US Pacific, UK, or Central Europe in one call. Accepts natural region aliases such as 北京时间, US Eastern, UK, and 欧洲中部.',
      inputSchema: z.object({
        locale: localeSchema,
        targetTimeZones: targetTimeZonesSchema,
      }).strict(),
      outputSchema: convertedTimeSchema.extend({
        status: z.literal('converted'),
      }),
      title: 'Get current regional times',
    },
    async (input) => {
      try {
        const result = currentTimes(input)
        return successResult(result, summarizeConversion(result))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'list_time_zones',
    {
      annotations: readOnlyAnnotations,
      description:
        'List the exact IANA time zones, localized labels, and daylight/standard abbreviations supported by Migratory Time. Use this before conversion when a requested region is unclear.',
      inputSchema: z.object({}).strict(),
      outputSchema: listTimeZonesOutputSchema,
      title: 'List supported time zones',
    },
    async () => {
      const result = listTimeZones()
      return successResult(
        result,
        result.timeZones
          .map(
            (zone) =>
              `${zone.timeZone} — ${zone.labelEn} / ${zone.label} — ${zone.abbreviations.join(', ')}`,
          )
          .join('\n'),
      )
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
