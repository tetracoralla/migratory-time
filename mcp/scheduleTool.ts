import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  expandSchedule,
  type ExpandScheduleResult,
} from '../src/lib/schedule'
import {
  expandScheduleInputSchema,
  expandScheduleResultSchema,
} from './scheduleSchemas'
import {
  readOnlyAnnotations,
  timePlanContext,
  validatedToolResult,
} from './toolSupport'

function scheduleText(result: ExpandScheduleResult) {
  if (result.status === 'expanded') {
    const continuation = result.truncated && result.nextCursor
      ? ` Continue after cursor ${result.nextCursor}.`
      : ''
    return `Expanded ${result.instances.length} schedule instances with ${result.effects.length} explicit effects.${continuation}`
  }
  if (result.status === 'conflict') {
    return `Schedule expansion stopped at ${result.conflict.kind}; choose an explicit policy before retrying.`
  }
  return `${result.error.code}: ${result.error.message}`
}

export function registerScheduleTool(server: McpServer) {
  server.registerTool(
    'expand_schedule',
    {
      annotations: readOnlyAnnotations,
      description:
        'Expand bounded daily, weekly, or monthly local recurrence into TimePlans with explicit exceptions, pagination, and DST/month-overflow policy.',
      inputSchema: expandScheduleInputSchema,
      title: 'Expand a bounded time schedule',
    },
    async (input) => {
      const result = expandSchedule(input, timePlanContext)
      return validatedToolResult(
        expandScheduleResultSchema,
        result,
        scheduleText(result),
      )
    },
  )
}
