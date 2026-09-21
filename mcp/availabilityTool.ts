import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  findTimeWindows,
  type FindTimeWindowsResult,
} from '../src/lib/availabilitySolver'
import {
  findTimeWindowsInputSchema,
  findTimeWindowsResultSchema,
} from './availabilitySchemas'
import {
  readOnlyAnnotations,
  timePlanContext,
  validatedToolResult,
} from './toolSupport'

function availabilityText(result: FindTimeWindowsResult) {
  if (result.status === 'solved') {
    return `Found ${result.eligibleCandidateCount} eligible starts; returned ${result.candidates.length} ranked candidates.`
  }
  if (result.status === 'unsatisfiable') {
    return `No time window satisfies ${result.conflict.kind}; irreducible participants: ${result.conflict.participantIds.join(', ')}.`
  }
  return `${result.error.code}: ${result.error.message}`
}

export function registerAvailabilityTool(server: McpServer) {
  server.registerTool(
    'find_time_windows',
    {
      annotations: readOnlyAnnotations,
      description:
        'Find bounded exact meeting windows from caller-supplied availability, busy intervals, and explicit preferred intervals. Returns deterministic preference ranking or an irreducible participant conflict.',
      inputSchema: findTimeWindowsInputSchema,
      title: 'Find shared time windows',
    },
    async (input) => {
      const result = findTimeWindows(input, timePlanContext)
      return validatedToolResult(
        findTimeWindowsResultSchema,
        result,
        availabilityText(result),
      )
    },
  )
}
