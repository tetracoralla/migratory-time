// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeClipboardText } from '../lib/clipboard'
import {
  canUseSystemShare,
  copyShareImage,
  downloadShareImage,
  shareWithSystem,
} from '../lib/shareImage'
import { convertInstant } from '../lib/timeConversion'
import { getTemporal } from '../lib/temporal'
import type { ShareSnapshot } from '../types'
import { ShareDialog } from './ShareDialog'

vi.mock('../lib/clipboard', () => ({ writeClipboardText: vi.fn() }))
vi.mock('../lib/shareImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shareImage')>()
  return {
    ...actual,
    canUseSystemShare: vi.fn(),
    copyShareImage: vi.fn(),
    downloadShareImage: vi.fn(),
    shareWithSystem: vi.fn(),
  }
})

const mockedCanUseSystemShare = vi.mocked(canUseSystemShare)
const mockedCopyShareImage = vi.mocked(copyShareImage)
const mockedDownloadShareImage = vi.mocked(downloadShareImage)
const mockedShareWithSystem = vi.mocked(shareWithSystem)
const mockedWriteClipboardText = vi.mocked(writeClipboardText)

const snapshot: ShareSnapshot = {
  locale: 'zh',
  results: convertInstant(
    getTemporal().Instant.from('2026-08-17T07:00:00Z'),
  ).filter((result) =>
    ['Asia/Shanghai', 'America/Los_Angeles'].includes(result.id),
  ),
  url: 'https://example.com/?t=20260817T0700Z&z=cn,pt',
}

beforeEach(() => {
  mockedCanUseSystemShare.mockReset()
  mockedCanUseSystemShare.mockReturnValue(false)
  mockedCopyShareImage.mockReset()
  mockedCopyShareImage.mockResolvedValue(undefined)
  mockedDownloadShareImage.mockReset()
  mockedDownloadShareImage.mockResolvedValue(undefined)
  mockedShareWithSystem.mockReset()
  mockedShareWithSystem.mockResolvedValue(undefined)
  mockedWriteClipboardText.mockReset()
  mockedWriteClipboardText.mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('share dialog', () => {
  it('keeps every action on the same frozen snapshot', async () => {
    const user = userEvent.setup()
    render(<ShareDialog onClose={() => undefined} snapshot={snapshot} />)

    const dialog = screen.getByRole('dialog', { name: '分享' })
    const preview = within(dialog).getByRole('img', {
      name: '时间列表分享图片预览',
    })
    const link = within(dialog).getByRole('textbox', { name: '分享链接' })

    expect(preview.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect((link as HTMLInputElement).readOnly).toBe(true)
    expect((link as HTMLInputElement).value).toBe(snapshot.url)
    expect(within(dialog).queryByRole('button', { name: '更多' })).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: '复制图片' }))
    await waitFor(() => expect(mockedCopyShareImage).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status').textContent).toContain('图片已复制')

    await user.click(within(dialog).getByRole('button', { name: '下载图片' }))
    await waitFor(() =>
      expect(mockedDownloadShareImage).toHaveBeenCalledWith(
        expect.objectContaining({ width: 375 }),
        snapshot.url,
      ),
    )
    expect(screen.getByRole('status').textContent).toContain('图片已下载')

    await user.click(within(dialog).getByRole('button', { name: '复制链接' }))
    await waitFor(() =>
      expect(mockedWriteClipboardText).toHaveBeenCalledWith(snapshot.url),
    )
    expect(screen.getByRole('status').textContent).toContain('链接已复制')
  })

  it('shows More only when native sharing is available', async () => {
    mockedCanUseSystemShare.mockReturnValue(true)
    const user = userEvent.setup()
    render(<ShareDialog onClose={() => undefined} snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: '更多' }))

    await waitFor(() =>
      expect(mockedShareWithSystem).toHaveBeenCalledWith(
        expect.objectContaining({ width: 375 }),
        snapshot.results,
        snapshot.url,
      ),
    )
    expect(screen.getByRole('status').textContent).toContain(
      '已打开更多分享方式',
    )
  })

  it('keeps the dialog open and offers a useful fallback after image-copy failure', async () => {
    mockedCopyShareImage.mockRejectedValue(new Error('permission denied'))
    const user = userEvent.setup()
    render(<ShareDialog onClose={() => undefined} snapshot={snapshot} />)

    await user.click(screen.getByRole('button', { name: '复制图片' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '无法复制图片，请下载图片',
    )
    expect(screen.getByRole('dialog', { name: '分享' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: '下载图片' }).hasAttribute('disabled'),
    ).toBe(false)
  })

  it('closes with Escape without changing the snapshot', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ShareDialog onClose={onClose} snapshot={snapshot} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockedCopyShareImage).not.toHaveBeenCalled()
    expect(mockedDownloadShareImage).not.toHaveBeenCalled()
    expect(mockedWriteClipboardText).not.toHaveBeenCalled()
  })
})
