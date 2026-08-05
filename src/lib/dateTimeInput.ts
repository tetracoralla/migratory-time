import { formatEditableDateTimeInput } from './timeConversion'

export type DateTimeDeletionDirection = 'backward' | 'forward'

export interface DateTimeInputEdit {
  selectionStart: number
  value: string
}

function clampSelectionIndex(value: string, index: number) {
  return Math.min(Math.max(index, 0), value.length)
}

function countDigits(value: string) {
  return value.replace(/\D/g, '').length
}

function getCaretAfterDigitCount(value: string, digitCount: number) {
  if (digitCount <= 0) return 0

  let seenDigits = 0
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) {
      seenDigits += 1
    }

    if (seenDigits === digitCount) {
      let caret = index + 1
      while (caret < value.length && /\D/.test(value[caret])) {
        caret += 1
      }
      return caret
    }
  }

  return value.length
}

export function formatDateTimeInputEdit(
  rawValue: string,
  rawSelectionStart: number,
): DateTimeInputEdit {
  const selectionStart = clampSelectionIndex(rawValue, rawSelectionStart)
  const digitsBeforeCaret = countDigits(rawValue.slice(0, selectionStart))
  const value = formatEditableDateTimeInput(rawValue)

  return {
    value,
    selectionStart: getCaretAfterDigitCount(value, digitsBeforeCaret),
  }
}

export function getSelectedDateTimeText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const start = clampSelectionIndex(value, Math.min(selectionStart, selectionEnd))
  const end = clampSelectionIndex(value, Math.max(selectionStart, selectionEnd))

  return start === end ? null : value.slice(start, end)
}

export function deleteFromDateTimeInput(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: DateTimeDeletionDirection,
): DateTimeInputEdit {
  const start = clampSelectionIndex(value, Math.min(selectionStart, selectionEnd))
  const end = clampSelectionIndex(value, Math.max(selectionStart, selectionEnd))
  const digits = value.replace(/\D/g, '').slice(0, 12)
  const digitsBeforeStart = countDigits(value.slice(0, start))
  const digitsBeforeEnd = countDigits(value.slice(0, end))

  let removalStart = digitsBeforeStart
  let removalEnd = digitsBeforeEnd

  if (start === end) {
    if (direction === 'backward') {
      if (digitsBeforeStart === 0) {
        return { value, selectionStart: start }
      }
      removalStart = digitsBeforeStart - 1
      removalEnd = digitsBeforeStart
    } else {
      if (digitsBeforeStart >= digits.length) {
        return { value, selectionStart: start }
      }
      removalEnd = digitsBeforeStart + 1
    }
  }

  const remainingDigits =
    digits.slice(0, removalStart) + digits.slice(removalEnd)
  const formattedValue = formatEditableDateTimeInput(remainingDigits)

  return {
    value: formattedValue,
    selectionStart: getCaretAfterDigitCount(formattedValue, removalStart),
  }
}
