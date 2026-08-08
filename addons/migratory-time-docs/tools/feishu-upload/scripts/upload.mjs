import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { lstat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const toolRoot = resolve(import.meta.dirname, '..')
const addonRoot = resolve(toolRoot, '../..')
const distRoot = resolve(addonRoot, 'dist')
const opdev = resolve(toolRoot, 'node_modules/.bin/opdev')

const entries = await readdir(distRoot)
for (const required of [
  'index.html',
  'modal.html',
  'index.json',
  'project.config.json',
]) {
  assert.ok(entries.includes(required), `Missing trusted build output: ${required}`)
}
assert.equal((await lstat(distRoot)).isSymbolicLink(), false)

const child = spawn(opdev, ['upload', distRoot], {
  cwd: addonRoot,
  stdio: 'inherit',
})
child.on('error', (error) => {
  console.error(
    `Isolated Feishu uploader is unavailable. Run npm ci in ${toolRoot} first.`,
  )
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
