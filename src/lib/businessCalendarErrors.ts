import type {
  BusinessDeadlineError,
  BusinessDeadlineErrorCode,
  BusinessDeadlineErrorResult,
} from './businessCalendarTypes'

export class BusinessCalendarInputError extends Error {
  readonly detail: BusinessDeadlineError

  constructor(detail: Omit<BusinessDeadlineError, 'retryable'>) {
    super(detail.message)
    this.detail = { ...detail, retryable: false }
  }
}

export function businessErrorResult(error: unknown): BusinessDeadlineErrorResult {
  if (error instanceof BusinessCalendarInputError) {
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

export function businessInputError(
  code: BusinessDeadlineErrorCode,
  field: string,
  message: string,
  input?: string,
): never {
  throw new BusinessCalendarInputError({ code, field, input, message })
}

export function mapBusinessTimePlanError(error: {
  candidates?: BusinessDeadlineError['candidates']
  code: string
  field?: string
  input?: string
  message: string
}): never {
  const supportedCodes: BusinessDeadlineErrorCode[] = [
    'AMBIGUOUS_TIME_ZONE',
    'INVALID_FORMAT',
    'INVALID_INSTANT',
    'UNKNOWN_TIME_ZONE',
    'UNSUPPORTED_PRECISION',
    'UNSUPPORTED_YEAR',
  ]
  throw new BusinessCalendarInputError({
    candidates: error.candidates,
    code: supportedCodes.includes(error.code as BusinessDeadlineErrorCode)
      ? (error.code as BusinessDeadlineErrorCode)
      : 'INVALID_BUSINESS_CALENDAR',
    field: error.field,
    input: error.input,
    message: error.message,
  })
}
