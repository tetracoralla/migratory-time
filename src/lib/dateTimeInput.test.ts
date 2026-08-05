import { describe, expect, it } from 'vitest'
import {
  deleteFromDateTimeInput,
  formatDateTimeInputEdit,
  getSelectedDateTimeText,
} from './dateTimeInput'

describe('date-time input editing', () => {
  it('copies the exact selected text, including generated separators', () => {
    const value = '2026-08-04 13:30'

    expect(getSelectedDateTimeText(value, 0, value.length)).toBe(value)
    expect(getSelectedDateTimeText(value, 2, 8)).toBe('26-08-')
    expect(getSelectedDateTimeText('2026-08-', 0, 8)).toBe('2026-08-')
    expect(getSelectedDateTimeText('2026-02-30 12:00', 0, 16)).toBe(
      '2026-02-30 12:00',
    )
    expect(getSelectedDateTimeText(value, 4, 4)).toBeNull()
  })

  it('formats typed and pasted digits while keeping the caret after a generated separator', () => {
    expect(formatDateTimeInputEdit('2026', 4)).toEqual({
      value: '2026-',
      selectionStart: 5,
    })
    expect(formatDateTimeInputEdit('2026/08/04T13:30', 16)).toEqual({
      value: '2026-08-04 13:30',
      selectionStart: 16,
    })
  })

  it('deletes digits while regenerating separators from the remaining value', () => {
    expect(deleteFromDateTimeInput('2026-', 5, 5, 'backward')).toEqual({
      value: '202',
      selectionStart: 3,
    })
    expect(
      deleteFromDateTimeInput('2026-08-04 13:30', 4, 4, 'forward'),
    ).toEqual({
      value: '2026-80-41 33:0',
      selectionStart: 5,
    })
    expect(
      deleteFromDateTimeInput('2026-08-04 13:30', 5, 8, 'backward'),
    ).toEqual({
      value: '2026-04-13 30:',
      selectionStart: 5,
    })
  })

  it('does not remove an automatic separator when no digit is selected', () => {
    expect(
      deleteFromDateTimeInput('2026-08-', 4, 5, 'forward'),
    ).toEqual({
      value: '2026-08-',
      selectionStart: 5,
    })
  })
})
