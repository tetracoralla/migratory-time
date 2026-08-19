import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('open-source release metadata', () => {
  it('publishes Migratory Time under Apache-2.0 with openAdam attribution', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      author?: string
      engines?: { node?: string }
      license?: string
      name?: string
      private?: boolean
      repository?: { url?: string }
      version?: string
    }
    const pluginManifest = JSON.parse(
      await readFile(
        new URL(
          '../plugins/migratory-time/.codex-plugin/plugin.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { version?: string }
    const license = await readFile(
      new URL('../LICENSE', import.meta.url),
      'utf8',
    )
    const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8')

    expect(packageJson).toMatchObject({
      author: 'openAdam',
      engines: { node: '^20.19.0 || >=22.12.0' },
      license: 'Apache-2.0',
      name: 'migratory-time',
      private: true,
      repository: {
        url: 'https://github.com/tetracoralla/migratory-time.git',
      },
      version: '1.1.1',
    })
    expect(pluginManifest.version).toMatch(/^1\.1\.1\+codex\.\d{14}$/)
    expect(license).toContain('Apache License')
    expect(license).toContain('Version 2.0, January 2004')
    expect(notice).toContain('openAdam')
    expect(notice).toContain('github.com/tetracoralla/migratory-time')
  })

  it('runs the complete repository check before a Pages deployment', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
      'utf8',
    )

    expect(workflow).toContain('- run: npm run check')
    expect(workflow).not.toContain('- run: npm test\n')
  })
})
