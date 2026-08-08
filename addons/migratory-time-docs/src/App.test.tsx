// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const api = vi.hoisted(() => ({
  applyTransaction: vi.fn(),
  getActiveDocumentRef: vi.fn(),
  getDocumentPermission: vi.fn(),
  getLanguage: vi.fn(),
  getRecord: vi.fn(),
  notifyAppReady: vi.fn(),
  offRecordChange: vi.fn(),
  onRecordChange: vi.fn(),
  openModal: vi.fn(),
  updateHeight: vi.fn(),
}))

vi.mock('./docApi', () => ({
  docsApi: {
    Bridge: { updateHeight: api.updateHeight },
    Env: { Language: { getLanguage: api.getLanguage } },
    LifeCycle: { notifyAppReady: api.notifyAppReady },
    Record: {
      applyTransaction: api.applyTransaction,
      getRecord: api.getRecord,
      offRecordChange: api.offRecordChange,
      onRecordChange: api.onRecordChange,
    },
    Service: {
      Permission: { getDocumentPermission: api.getDocumentPermission },
    },
    View: { Action: { openModal: api.openModal } },
    getActiveDocumentRef: api.getActiveDocumentRef,
  },
}))

type FailurePhase = 'record' | 'permission' | 'subscription' | 'ready'

describe('Feishu Docs widget initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    api.getLanguage.mockResolvedValue('zh-CN')
    api.getRecord.mockResolvedValue({
      instant: '2026-08-08T04:30:00Z',
      stageLabel: '发布',
      version: 1,
      zoneIds: ['Asia/Shanghai'],
    })
    api.getActiveDocumentRef.mockResolvedValue('document-ref')
    api.getDocumentPermission.mockResolvedValue({ editable: true })
    api.onRecordChange.mockResolvedValue(undefined)
    api.notifyAppReady.mockResolvedValue(undefined)
    api.offRecordChange.mockResolvedValue(undefined)
    api.updateHeight.mockResolvedValue(undefined)
  })

  afterEach(() => cleanup())

  it.each<FailurePhase>([
    'record',
    'permission',
    'subscription',
    'ready',
  ])('stays read-only and shows failure when %s initialization fails', async (phase) => {
    const failure = new Error(`${phase} failed`)
    if (phase === 'record') api.getRecord.mockRejectedValue(failure)
    if (phase === 'permission') api.getDocumentPermission.mockRejectedValue(failure)
    if (phase === 'subscription') api.onRecordChange.mockRejectedValue(failure)
    if (phase === 'ready') api.notifyAppReady.mockRejectedValue(failure)

    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toBe(
      '无法连接文档，当前为只读模式',
    )
    expect(screen.queryByRole('textbox', { name: '阶段名称' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示地区' })).toBeNull()
    expect(
      screen.getByRole('button', { name: '编辑北京时间' }).hasAttribute('disabled'),
    ).toBe(true)
  })
})
