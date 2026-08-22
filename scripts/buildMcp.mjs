import { build } from 'esbuild'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { writeThirdPartyNotices } from './generateThirdPartyNotices.mjs'

const outfile = 'plugins/migratory-time/server/index.mjs'

const result = await build({
  bundle: true,
  entryPoints: ['mcp/server.ts'],
  format: 'esm',
  legalComments: 'external',
  logLevel: 'info',
  metafile: true,
  minifyWhitespace: true,
  outfile,
  platform: 'node',
  target: 'node20',
})

const bundle = await readFile(outfile, 'utf8')
await writeFile(outfile, bundle.replace(/[ \t]+(?=\r?$)/gm, ''))

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
await writeThirdPartyNotices({
  repositoryRoot,
  bundledInputs: Object.keys(result.metafile.inputs),
  outputPaths: [
    fileURLToPath(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url)),
    fileURLToPath(
      new URL('../plugins/migratory-time/THIRD_PARTY_NOTICES.md', import.meta.url),
    ),
  ],
  productName: 'Migratory Time',
})

await Promise.all([
  copyFile(
    new URL('../LICENSE', import.meta.url),
    new URL('../plugins/migratory-time/LICENSE', import.meta.url),
  ),
  copyFile(
    new URL('../NOTICE', import.meta.url),
    new URL('../plugins/migratory-time/NOTICE', import.meta.url),
  ),
])
