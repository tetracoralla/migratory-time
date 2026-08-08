import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const addonRoot = resolve(import.meta.dirname, '..')
const appConfig = JSON.parse(
  await readFile(resolve(addonRoot, 'app.json'), 'utf8'),
)

assert.equal(appConfig.appType, 'docs-addon')
assert.equal(typeof appConfig.appID, 'string')
assert.equal(typeof appConfig.blockTypeID, 'string')
assert.equal(typeof appConfig.projectName, 'string')
assert.ok(appConfig.contributes?.addPanel?.view === 'index.html')
assert.ok(appConfig.contributes?.modal?.regions?.view === 'modal.html')

const projectConfig = {
  appid: appConfig.appID,
  projectname: appConfig.projectName,
  blocks: ['index'],
}
const blockConfig = {
  blockTypeID: appConfig.blockTypeID,
  blockRenderType: 'offlineWeb',
  offlineWebConfig: {
    initialHeight: appConfig.initialHeight,
    contributes: appConfig.contributes,
  },
}

await Promise.all([
  writeFile(
    resolve(addonRoot, 'dist/project.config.json'),
    `${JSON.stringify(projectConfig)}\n`,
  ),
  writeFile(
    resolve(addonRoot, 'dist/index.json'),
    `${JSON.stringify(blockConfig)}\n`,
  ),
])
