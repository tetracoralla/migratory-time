import { access, readFile } from 'node:fs/promises'
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
    ) as {
      interface?: { composerIcon?: string; logo?: string }
      version?: string
    }
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
      version: '2.0.0',
    })
    expect(pluginManifest.version).toMatch(/^2\.0\.0\+codex\.\d{14}$/)
    expect(pluginManifest.interface).toMatchObject({
      composerIcon: './assets/migratory-color.png',
      logo: './assets/migratory-color.png',
    })
    expect(license).toContain('Apache License')
    expect(license).toContain('Version 2.0, January 2004')
    expect(notice).toContain('openAdam')
    expect(notice).toContain('github.com/tetracoralla/migratory-time')
  })

  it('keeps only the current referenced product artwork', async () => {
    await access(
      new URL('../plugins/migratory-time/assets/migratory-color.png', import.meta.url),
    )

    for (const path of [
      '../docs/design/list-edit-concept.png',
      '../docs/design/simple-mode-concept.png',
      '../docs/design/titleless-floating-actions-concept.png',
      '../plugins/migratory-time/assets/icon.png',
      '../plugins/migratory-time/assets/migratory-bird.png',
      '../plugins/migratory-time/assets/migratory-globe.png',
    ]) {
      await expect(access(new URL(path, import.meta.url))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    }
  })

  it('does not ship the vulnerable deferred Feishu upload tool', async () => {
    const addonPackage = JSON.parse(
      await readFile(
        new URL('../addons/migratory-time-docs/package.json', import.meta.url),
        'utf8',
      ),
    ) as { scripts?: Record<string, string> }

    expect(addonPackage.scripts).not.toHaveProperty('upload')
    await expect(
      access(
        new URL(
          '../addons/migratory-time-docs/tools/feishu-upload/package-lock.json',
          import.meta.url,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('runs the complete repository check before a Pages deployment', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
      'utf8',
    )

    expect(workflow).toContain('- run: npm run check')
    expect(workflow).not.toContain('- run: npm test\n')
  })

  it('runs the complete repository check on pull requests without deploying', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    )

    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('- run: npm run check')
    expect(workflow).not.toContain('deploy-pages')
  })

  it('uses GitHub Pages as the only official human web deployment', async () => {
    const readme = await readFile(
      new URL('../README.md', import.meta.url),
      'utf8',
    )
    const deploymentGuide = await readFile(
      new URL('../docs/deployment.md', import.meta.url),
      'utf8',
    )
    const deploymentCheck = await readFile(
      new URL('../scripts/checkDeployments.mjs', import.meta.url),
      'utf8',
    )
    const publicUrl = 'https://tetracoralla.github.io/migratory-time/'

    expect(readme).toContain(publicUrl)
    expect(deploymentGuide).toContain('GitHub Pages 是唯一正式网页入口')
    expect(deploymentCheck).toContain(`githubPages: '${publicUrl}'`)
    for (const source of [readme, deploymentGuide, deploymentCheck]) {
      expect(source).not.toMatch(/feishuapp\.com|miaoda\.feishu\.cn/)
    }
  })
})
