import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

type ManifestIcon = {
  src: string
  sizes: string
  type: string
}

type WebAppManifest = {
  display?: string
  id?: string
  icons?: ManifestIcon[]
  name?: string
  short_name?: string
  start_url?: string
}

describe('PWA release manifest', () => {
  it('keeps the app installable with real 192px and 512px PNG icons', async () => {
    const manifestPath = new URL(
      '../public/manifest.webmanifest',
      import.meta.url,
    )
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as WebAppManifest

    expect(manifest.name || manifest.short_name).toBeTruthy()
    expect(manifest.name).toBe('Migratory Time')
    expect(manifest.id).toBe('./')
    expect(manifest.start_url).toBe('./')
    expect(manifest.display).toBe('standalone')

    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons?.find(
        (candidate) =>
          candidate.sizes === size && candidate.type === 'image/png',
      )

      expect(icon, `missing ${size} PNG icon`).toBeDefined()
      await expect(
        access(new URL(`../public/${icon?.src}`, import.meta.url)),
      ).resolves.toBeUndefined()
    }
  })
})
