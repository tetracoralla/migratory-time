import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'

const outfile = 'plugins/migratory-time/server/index.mjs'

await build({
  bundle: true,
  entryPoints: ['mcp/server.ts'],
  format: 'esm',
  logLevel: 'info',
  minifyWhitespace: true,
  outfile,
  platform: 'node',
  target: 'node20',
})

const bundle = await readFile(outfile, 'utf8')
await writeFile(outfile, bundle.replace(/[ \t]+(?=\r?$)/gm, ''))
