import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('responsive interaction layout', () => {
  it('keeps floating actions fixed at every viewport size', async () => {
    const styles = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    )
    const floatingActionBlocks = styles.match(/\.floating-actions\s*\{[^}]*\}/gs)

    expect(floatingActionBlocks).not.toBeNull()
    expect(floatingActionBlocks?.some((block) => /position:\s*static/.test(block))).toBe(
      false,
    )
    expect(floatingActionBlocks?.some((block) => /position:\s*fixed/.test(block))).toBe(
      true,
    )
  })

  it('does not recolor a row time on pointer hover', async () => {
    const styles = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    )

    expect(styles).not.toContain('.edit-trigger:hover .result-time')
  })

  it('keeps the edit target local to the time and preserves vertical touch scrolling', async () => {
    const styles = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    )
    const editTrigger = styles.match(/\.edit-trigger\s*\{[^}]*\}/s)?.[0]

    expect(editTrigger).toContain('justify-self: end')
    expect(editTrigger).toContain('touch-action: pan-y')
    expect(editTrigger).not.toContain('align-self: stretch')
  })

  it('terminates the axis inside the first and last dots', async () => {
    const styles = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    )

    expect(styles).toContain(
      'top: calc(var(--row-height) / 2 - var(--dot-size) / 2 + 2px)',
    )
    expect(styles).toContain(
      'bottom: calc(var(--row-height) / 2 - var(--dot-size) / 2 + 2px)',
    )
  })

  it('changes type sizes only at explicit breakpoints', async () => {
    const styles = await readFile(
      new URL('../src/styles.css', import.meta.url),
      'utf8',
    )

    expect(styles).not.toMatch(/font-size\s*:[^;]*(?:clamp\(|\b(?:vw|vmin|vmax)\b)/)
  })
})
