import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { computeDeadlineResultSchema } from './businessCalendarSchemas'
import { findTimeWindowsResultSchema } from './availabilitySchemas'
import { expandScheduleResultSchema } from './scheduleSchemas'
import {
  resolveTimeResultSchema,
} from './timePlanSchemas'
import { validateTemporalPlanResultSchema } from './planValidationSchemas'

const semanticResultSchemas = [
  ['resolve_time', resolveTimeResultSchema],
  ['validate_time_plan', validateTemporalPlanResultSchema],
  ['expand_schedule', expandScheduleResultSchema],
  ['compute_deadline', computeDeadlineResultSchema],
  ['find_time_windows', findTimeWindowsResultSchema],
] as const

export function registerSemanticSchemaResources(server: McpServer) {
  for (const [toolName, schema] of semanticResultSchemas) {
    const uri = `migratory-time://schemas/${toolName}/result.json`
    const text = JSON.stringify(
      z.toJSONSchema(schema, {
        io: 'output',
        reused: 'ref',
        target: 'draft-7',
      }),
      null,
      2,
    )
    server.registerResource(
      `${toolName}-result-schema`,
      uri,
      {
        description: `Closed result JSON Schema for ${toolName}; read only when a caller needs the full branch contract.`,
        mimeType: 'application/schema+json',
        title: `${toolName} result schema`,
      },
      async () => ({ contents: [{ mimeType: 'application/schema+json', text, uri }] }),
    )
  }
}
