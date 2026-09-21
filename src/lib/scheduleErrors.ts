import type {
  ScheduleError,
  ScheduleErrorCode,
  ScheduleErrorResult,
} from './scheduleTypes'

export class ScheduleInputError extends Error {
  readonly detail: ScheduleError

  constructor(detail: Omit<ScheduleError, 'retryable'>) {
    super(detail.message)
    this.detail = { ...detail, retryable: false }
  }
}

export function scheduleErrorResult(error: unknown): ScheduleErrorResult {
  if (error instanceof ScheduleInputError) {
    return { error: error.detail, status: 'error' }
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected internal error',
      retryable: false,
    },
    status: 'error',
  }
}

export function scheduleInputError(
  code: ScheduleErrorCode,
  field: string,
  message: string,
  input?: string,
): never {
  throw new ScheduleInputError({ code, field, input, message })
}

export function mapTimePlanError(error: {
  candidates?: ScheduleError['candidates']
  code: string
  field?: string
  input?: string
  message: string
}): never {
  const supportedCodes: ScheduleErrorCode[] = [
    'AMBIGUOUS_TIME_ZONE',
    'INVALID_FORMAT',
    'UNKNOWN_TIME_ZONE',
    'UNSUPPORTED_PRECISION',
    'UNSUPPORTED_YEAR',
  ]
  throw new ScheduleInputError({
    candidates: error.candidates,
    code: supportedCodes.includes(error.code as ScheduleErrorCode)
      ? (error.code as ScheduleErrorCode)
      : 'INVALID_SCHEDULE',
    field: error.field,
    input: error.input,
    message: error.message,
  })
}
