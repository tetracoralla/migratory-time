import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const assetsDirectory = new URL('../dist/assets/', import.meta.url)
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const assetFiles = await readdir(assetsDirectory)
const mainMatch = html.match(/<script[^>]+src="\.\/assets\/([^"?]+\.js)"/)

if (!mainMatch) {
  throw new Error('Unable to identify the initial JavaScript bundle')
}

const mainFile = mainMatch[1]
const temporalChunks = assetFiles.filter(
  (file) => file.startsWith('temporal-polyfill-') && file.endsWith('.js'),
)

if (temporalChunks.length !== 1) {
  throw new Error('Temporal fallback must be emitted as one dynamic chunk')
}

if (html.includes(temporalChunks[0])) {
  throw new Error('Temporal fallback must not be loaded by the initial HTML')
}

const mainSource = await readFile(new URL(mainFile, assetsDirectory))
const mainGzipBytes = gzipSync(mainSource).byteLength
const maximumInitialGzipBytes = 80 * 1024

if (mainGzipBytes > maximumInitialGzipBytes) {
  throw new Error(
    `Initial JavaScript is ${(mainGzipBytes / 1024).toFixed(2)} kB gzip; expected at most 80 kB`,
  )
}

console.log(
  `Initial JavaScript: ${(mainGzipBytes / 1024).toFixed(2)} kB gzip; Temporal fallback: ${temporalChunks[0]}`,
)
