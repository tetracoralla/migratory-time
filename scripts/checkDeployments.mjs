import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const repoRoot = resolve(import.meta.dirname, '..')
const distRoot = resolve(repoRoot, 'dist')
const execFileAsync = promisify(execFile)
const deployments = {
  githubPages: 'https://tetracoralla.github.io/migratory-time/',
}
const removedPaths = ['icon.svg']

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await listFiles(resolve(directory, entry.name), relativePath)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files.sort()
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function download(url) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--retry',
      '3',
      '--retry-all-errors',
      url.toString(),
    ],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  )
  return stdout
}

async function responseStatus(url) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--location',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      '--retry',
      '3',
      '--retry-all-errors',
      url.toString(),
    ],
    { encoding: 'utf8', maxBuffer: 1024 },
  )
  return Number(stdout)
}

const localFiles = await listFiles(distRoot)
assert.ok(localFiles.includes('index.html'), 'dist/index.html is required')

for (const [name, baseUrl] of Object.entries(deployments)) {
  for (const relativePath of localFiles) {
    const localBytes = await readFile(resolve(distRoot, relativePath))
    const url = new URL(relativePath, baseUrl)
    url.searchParams.set('release', digest(localBytes).slice(0, 12))
    const remoteBytes = await download(url)
    assert.equal(
      digest(remoteBytes),
      digest(localBytes),
      `${name} ${relativePath} differs from local dist`,
    )
  }
  for (const removedPath of removedPaths) {
    const status = await responseStatus(new URL(removedPath, baseUrl))
    assert.equal(status, 404, `${name} still serves removed ${removedPath}`)
  }
  console.log(
    `${name}: ${localFiles.length} files match local dist byte-for-byte; removed legacy paths are absent`,
  )
}
