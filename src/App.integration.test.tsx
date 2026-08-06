// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { writeClipboardText } from './lib/clipboard'

vi.mock('./lib/clipboard', () => ({ writeClipboardText: vi.fn() }))

const writeClipboard = vi.mocked(writeClipboardText)

beforeEach(() => {
  window.localStorage.clear()
  writeClipboard.mockReset()
  writeClipboard.mockResolvedValue(undefined)
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0),
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (timer: number) => window.clearTimeout(timer),
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function enterTime(
  user: ReturnType<typeof userEvent.setup>,
  zoneLabel: string,
  digits: string,
) {
  await user.click(screen.getByRole('button', { name: `编辑${zoneLabel}` }))
  const input = screen.getByRole('textbox', {
    name: `编辑${zoneLabel}的日期和时间`,
  })
  await user.clear(input)
  await user.type(input, digits)
  return input
}

describe('application editing flow', () => {
  it('keeps invalid input open and blocks copy and region switching', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = await enterTime(user, '北京时间', '202602301200')
    await user.click(screen.getByRole('button', { name: '复制所示时间' }))

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('日期或时间无效')
    expect(writeClipboard).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()

    await user.click(screen.getByRole('button', { name: '编辑美东时间' }))

    expect(
      screen.getByRole('textbox', {
        name: '编辑北京时间的日期和时间',
      }),
    ).toBe(input)
    expect(
      screen.queryByRole('textbox', {
        name: '编辑美东时间的日期和时间',
      }),
    ).toBeNull()
  })

  it('continues a deferred copy after resolving a repeated DST time', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await enterTime(user, '美东时间', '202611010130')
    await user.click(screen.getByRole('button', { name: '复制所示时间' }))

    expect(screen.getByRole('group', { name: '重复时刻' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '第 1 次' }))

    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1))
    const copiedText = writeClipboard.mock.calls[0][0]
    expect(copiedText).toBe(
      [
        'CST | 2026-11-01 13:30',
        'EDT | 2026-11-01 01:30',
        'PDT | 2026-10-31 22:30',
        'GMT | 2026-11-01 05:30',
        'CET | 2026-11-01 06:30',
      ].join('\n'),
    )
    expect(screen.getByRole('status').textContent).toContain('已复制所示时间')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('13:30')
    expect(
      container.querySelector('[data-zone="America/New_York"] time')
        ?.textContent,
    ).toBe('01:30')
  })

  it('continues a deferred region switch after resolving a repeated DST time', async () => {
    const user = userEvent.setup()
    render(<App />)

    await enterTime(user, '美东时间', '202611010130')
    await user.click(screen.getByRole('button', { name: '编辑美西时间' }))
    await user.click(screen.getByRole('button', { name: '第 1 次' }))

    const westEditor = screen.getByRole('textbox', {
      name: '编辑美西时间的日期和时间',
    })
    expect((westEditor as HTMLInputElement).value).toBe('2026-10-31 22:30')
    expect(
      screen.queryByRole('textbox', {
        name: '编辑美东时间的日期和时间',
      }),
    ).toBeNull()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('opens the region picker after resolving a repeated DST time', async () => {
    const user = userEvent.setup()
    render(<App />)

    await enterTime(user, '美东时间', '202611010130')
    await user.click(screen.getByRole('button', { name: '显示地区' }))

    expect(screen.getByRole('group', { name: '重复时刻' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '显示地区' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '第 1 次' }))
    expect(screen.getByRole('dialog', { name: '显示地区' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('uses the visible region selection for both the list and copied text', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('button', { name: '显示地区' }))
    const picker = screen.getByRole('dialog', { name: '显示地区' })
    await user.click(
      within(picker).getByRole('button', { name: /美东时间/ }),
    )
    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(
      screen.queryByRole('button', { name: '编辑美东时间' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: '复制所示时间' }))

    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1))
    expect(writeClipboard.mock.calls[0][0].split('\n')).toHaveLength(4)
    expect(writeClipboard.mock.calls[0][0]).not.toMatch(/^(EST|EDT) \|/m)

    unmount()
    render(<App />)
    expect(
      screen.queryByRole('button', { name: '编辑美东时间' }),
    ).toBeNull()
  })

  it('switches viewer language without changing the selected instant', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const timeBefore = container.querySelector('[data-zone="Asia/Shanghai"] time')
      ?.textContent

    await user.click(
      screen.getByRole('button', { name: 'Switch to English' }),
    )

    expect(screen.getByRole('button', { name: 'Edit CST' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Regions' })).toBeTruthy()
    expect(container.querySelector('.result-date')?.textContent).toMatch(
      /^[A-Z][a-z]{2} \d{2} · [A-Z][a-z]{2}$/,
    )
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe(timeBefore)
  })

  it('undoes and redoes committed times without adding visible controls', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const firstInput = await enterTime(user, '北京时间', '202608051213')
    await user.type(firstInput, '{Enter}')
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('12:13')

    const secondInput = await enterTime(user, '北京时间', '202608051415')
    await user.type(secondInput, '{Enter}')
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('14:15')

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('12:13')

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('14:15')

    expect(screen.queryByText('撤回')).toBeNull()
    expect(screen.queryByText('重做')).toBeNull()
  })

  it('keeps input undo separate from clock undo', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const committedInput = await enterTime(user, '北京时间', '202608051213')
    await user.type(committedInput, '{Enter}')

    const draftInput = await enterTime(user, '北京时间', '202608051415')
    fireEvent.keyDown(draftInput, { key: 'z', metaKey: true })

    expect(screen.getByRole('textbox')).toBe(draftInput)
    fireEvent.keyDown(draftInput, { key: 'Escape' })
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('12:13')
  })

  it('keeps reset undo available after its feedback disappears', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '编辑北京时间' }))
    const input = screen.getByRole('textbox', {
      name: '编辑北京时间的日期和时间',
    })
    fireEvent.change(input, { target: { value: '202608051213' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: '恢复到现在' }))

    expect(screen.getByRole('status').textContent).toContain('已恢复到现在')
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('12:13')

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(
      screen.getByRole('button', { name: '恢复到现在' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
  })
})
