import { z } from 'zod'

const provenanceSchema = z
  .object({
    engine: z.literal('Temporal+Intl'),
    timeZoneData: z.literal('IANA'),
    timeZoneDataVersion: z.string(),
  })
  .strict()

export const readOnlyAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const

export const provenance = {
  engine: 'Temporal+Intl' as const,
  timeZoneData: 'IANA' as const,
  timeZoneDataVersion: process.versions.tz ?? 'runtime-provided',
}

export const timePlanContext = {
  timeZoneData: provenance.timeZoneData,
  timeZoneDataVersion: provenance.timeZoneDataVersion,
}

export function outputSchema<T extends z.ZodTypeAny>(result: T) {
  return z.object({ provenance: provenanceSchema, result }).strict()
}

export function toolResult(result: object, text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { provenance, result },
  }
}

export function validatedToolResult<T extends z.ZodTypeAny>(
  resultSchema: T,
  result: object,
  text: string,
) {
  const validated = resultSchema.parse(result) as object
  return toolResult(validated, text)
}
