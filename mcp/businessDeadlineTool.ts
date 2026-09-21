import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  computeDeadline,
  type ComputeDeadlineResult,
} from '../src/lib/businessDeadline'
import {
  computeDeadlineInputSchema,
  computeDeadlineResultSchema,
} from './businessCalendarSchemas'
import {
  readOnlyAnnotations,
  timePlanContext,
  validatedToolResult,
} from './toolSupport'

function deadlineText(result: ComputeDeadlineResult) {
  if (result.status === 'computed') {
    return `Business deadline: ${result.plan.resolution.deadlineInstant} (${result.plan.resolution.deadlineLocalDateTime} ${result.plan.dependencies[0].timeZone}).`
  }
  if (result.status === 'conflict') {
    return `Business deadline stopped at ${result.conflict.kind}; choose an explicit policy before retrying.`
  }
  if (result.status === 'unsatisfiable') {
    return `No business time was available within the bounded ${result.scannedDays}-day search.`
  }
  return `${result.error.code}: ${result.error.message}`
}

export function registerBusinessDeadlineTool(server: McpServer) {
  server.registerTool(
    'compute_deadline',
    {
      annotations: readOnlyAnnotations,
      description:
        'Add exact business minutes using a versioned JSON calendar with weekly hours, date exceptions, overnight shifts, and explicit start/DST policy.',
      inputSchema: computeDeadlineInputSchema,
      title: 'Compute a business deadline',
    },
    async (input) => {
      const result = computeDeadline(input, timePlanContext)
      return validatedToolResult(
        computeDeadlineResultSchema,
        result,
        deadlineText(result),
      )
    },
  )
}
