import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('open-source release metadata', () => {
  it('publishes Migratory Time under Apache-2.0 with openAdam attribution', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { author?: string; license?: string; name?: string }
    const license = await readFile(
      new URL('../LICENSE', import.meta.url),
      'utf8',
    )
    const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8')

    expect(packageJson).toMatchObject({
      author: 'openAdam',
      license: 'Apache-2.0',
      name: 'migratory-time',
    })
    expect(license).toContain('Apache License')
    expect(license).toContain('Version 2.0, January 2004')
    expect(notice).toContain('openAdam')
    expect(notice).toContain('github.com/tetracoralla/migratory-time')
  })
})
