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
import { PREFERENCES_STORAGE_KEY } from './lib/preferences'

vi.mock('./lib/clipboard', () => ({ writeClipboardText: vi.fn() }))

const writeClipboard = vi.mocked(writeClipboardText)

beforeEach(() => {
  window.history.replaceState({}, '', '/')
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

  it('continues a deferred share after resolving a repeated DST time', async () => {
    const user = userEvent.setup()
    render(<App />)

    await enterTime(user, '美东时间', '202611010130')
    await user.click(screen.getByRole('button', { name: '分享当前时间' }))

    expect(screen.getByRole('group', { name: '重复时刻' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '第 1 次' }))

    const dialog = screen.getByRole('dialog', { name: '分享' })
    const link = within(dialog).getByRole('textbox', { name: '分享链接' })
    expect((link as HTMLInputElement).value).toContain(
      '?t=20261101T0530Z&z=cn,et,pt,uk,ce',
    )
    expect(writeClipboard).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('textbox', {
        name: '编辑美东时间的日期和时间',
      }),
    ).toBeNull()
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

  it('searches, adds, persists, copies, and shares a global region', async () => {
    const user = userEvent.setup()
    const firstView = render(<App />)

    await user.click(screen.getByRole('button', { name: '显示地区' }))
    const picker = screen.getByRole('dialog', { name: '显示地区' })
    const search = within(picker).getByRole('searchbox', { name: '搜索地区' })
    await user.type(search, 'Paris')
    await user.click(
      within(picker).getByRole('button', { name: /Europe\/Paris/ }),
    )
    await user.click(within(picker).getByRole('button', { name: '关闭' }))

    expect(firstView.container.querySelector('[data-zone="Europe/Paris"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑巴黎' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '复制所示时间' }))
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1))
    expect(writeClipboard.mock.calls[0][0].split('\n')).toHaveLength(6)

    await user.click(screen.getByRole('button', { name: '分享当前时间' }))
    const share = screen.getByRole('dialog', { name: '分享' })
    expect(
      (within(share).getByRole('textbox', { name: '分享链接' }) as HTMLInputElement)
        .value,
    ).toContain('Europe%2FParis')
    await user.click(within(share).getByRole('button', { name: '关闭' }))

    firstView.unmount()
    render(<App />)
    expect(document.querySelector('[data-zone="Europe/Paris"]')).toBeTruthy()
  })

  it('opens a shared fixed time with only its selected regions', () => {
    window.history.replaceState(
      {},
      '',
      '/?t=20260817T0700Z&z=cn,pt',
    )
    const { container } = render(<App />)

    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('15:00')
    expect(
      container.querySelector('[data-zone="America/Los_Angeles"] time')
        ?.textContent,
    ).toBe('00:00')
    expect(
      screen.queryByRole('button', { name: '编辑美东时间' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: '恢复到现在' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
  })

  it('opens a frozen image preview and copies its exact snapshot link', async () => {
    const user = userEvent.setup()
    window.history.replaceState(
      {},
      '',
      '/?t=20260817T0700Z&z=cn,pt',
    )
    render(<App />)

    await user.click(screen.getByRole('button', { name: '分享当前时间' }))

    const dialog = screen.getByRole('dialog', { name: '分享' })
    expect(
      within(dialog).getByRole('img', {
        name: '时间列表分享图片预览',
      }),
    ).toBeTruthy()
    expect(
      within(dialog).getByRole('button', { name: '复制图片' }),
    ).toBeTruthy()
    expect(
      within(dialog).getByRole('button', { name: '下载图片' }),
    ).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: '更多' })).toBeNull()
    const link = within(dialog).getByRole('textbox', { name: '分享链接' })
    expect((link as HTMLInputElement).readOnly).toBe(true)
    expect((link as HTMLInputElement).value).toBe(
      `${window.location.origin}/?t=20260817T0700Z&z=cn,pt`,
    )

    await user.click(within(dialog).getByRole('button', { name: '复制链接' }))
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(1))
    expect(writeClipboard.mock.calls[0][0]).toBe(
      `${window.location.origin}/?t=20260817T0700Z&z=cn,pt`,
    )
    expect(screen.getByRole('status').textContent).toContain('链接已复制')

    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '分享当前时间' }),
      ),
    )
  })

  it('does not overwrite saved region preferences when opening a share', () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ locale: 'zh', zoneIds: ['Europe/London'] }),
    )
    window.history.replaceState(
      {},
      '',
      '/?t=20260817T0700Z&z=cn,pt',
    )
    const firstView = render(<App />)

    expect(screen.getByRole('button', { name: '编辑北京时间' })).toBeTruthy()
    firstView.unmount()
    window.history.replaceState({}, '', '/')
    render(<App />)

    expect(screen.getByRole('button', { name: '编辑英国时间' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: '编辑北京时间' }),
    ).toBeNull()
  })

  it('rejects an invalid share link instead of presenting it as a schedule', () => {
    window.history.replaceState(
      {},
      '',
      '/?t=20260230T0700Z&z=cn,pt',
    )
    render(<App />)

    expect(screen.getByRole('alert').textContent).toContain(
      '分享链接无效，已显示当前时间',
    )
    expect(
      screen.getByRole('button', { name: '恢复到现在' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
  })

  it('keeps invalid editing open and blocks sharing old time', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = await enterTime(user, '北京时间', '202602301200')
    await user.click(screen.getByRole('button', { name: '分享当前时间' }))

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('日期或时间无效')
    expect(screen.queryByRole('dialog', { name: '分享' })).toBeNull()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('switches viewer language without changing the selected instant', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const timeBefore = container.querySelector('[data-zone="Asia/Shanghai"] time')
      ?.textContent

    await user.click(
      screen.getByRole('button', { name: 'Switch to English' }),
    )

    expect(screen.getByRole('button', { name: 'Edit China' })).toBeTruthy()
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

  it('undoes reset to an unchanged fixed time instead of skipping it', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const firstInput = await enterTime(user, '北京时间', '202608051213')
    await user.type(firstInput, '{Enter}')

    fireEvent.click(screen.getByRole('button', { name: '编辑北京时间' }))
    const unchangedInput = screen.getByRole('textbox', {
      name: '编辑北京时间的日期和时间',
    })
    expect((unchangedInput as HTMLInputElement).value).toBe(
      '2026-08-05 12:13',
    )

    fireEvent.click(screen.getByRole('button', { name: '恢复到现在' }))
    fireEvent.keyDown(window, { key: 'z', metaKey: true })

    expect(
      container.querySelector('[data-zone="Asia/Shanghai"] time')?.textContent,
    ).toBe('12:13')
    expect(
      screen.getByRole('button', { name: '恢复到现在' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
  })
})
