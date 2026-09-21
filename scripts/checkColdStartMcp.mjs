import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const repositoryRoot = resolve(import.meta.dirname, '..')
const pluginRoot = resolve(repositoryRoot, 'plugins/migratory-time')
const serverPath = resolve(pluginRoot, 'server/index.mjs')
const packageVersion = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
).version
const runCount = Number.parseInt(
  process.env.MIGRATORY_TIME_COLD_START_RUNS ?? '12',
  10,
)

assert.ok(
  Number.isInteger(runCount) && runCount >= 1 && runCount <= 50,
  'MIGRATORY_TIME_COLD_START_RUNS must be an integer from 1 through 50',
)

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1,
  )
  return sorted[index]
}

const durations = []

for (let index = 0; index < runCount; index += 1) {
  const transport = new StdioClientTransport({
    args: [serverPath],
    command: process.execPath,
    cwd: pluginRoot,
    stderr: 'pipe',
  })
  const stderrChunks = []
  let stderrBytes = 0
  transport.stderr?.on('data', (chunk) => {
    const remaining = 64 * 1024 - stderrBytes
    if (remaining <= 0) return
    const boundedChunk = Buffer.from(chunk).subarray(0, remaining)
    stderrChunks.push(boundedChunk)
    stderrBytes += boundedChunk.length
  })
  const client = new Client({
    name: 'migratory-time-cold-start-check',
    version: '1.0.0',
  })
  const startedAt = performance.now()

  try {
    await client.connect(transport)
    assert.equal(client.getServerVersion()?.name, 'migratory-time')
    assert.equal(client.getServerVersion()?.version, packageVersion)

    const response = await client.callTool(
      {
        arguments: {
          locale: 'en',
          targetTimeZones: ['Asia/Shanghai', 'Europe/Berlin'],
        },
        name: 'current_times',
      },
      undefined,
      { timeout: 10_000 },
    )
    const result = response.structuredContent?.result
    assert.equal(response.isError, undefined, JSON.stringify(response))
    assert.equal(result?.status, 'converted')
    assert.deepEqual(
      result.results.map(({ timeZone }) => timeZone),
      ['Asia/Shanghai', 'Europe/Berlin'],
    )
    assert.equal(response.content?.[0]?.type, 'text')
    assert.ok(response.content[0].text.length > 0)
  } catch (error) {
    const durationMs = performance.now() - startedAt
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
    throw new Error(
      `Fresh MCP server run ${index + 1}/${runCount} failed after ${durationMs.toFixed(1)} ms${stderr ? `\nserver stderr:\n${stderr}` : ''}`,
      { cause: error },
    )
  } finally {
    await client.close().catch(() => {})
  }

  durations.push(performance.now() - startedAt)
}

console.log(
  `PASS fresh MCP process first-call check: ${runCount}/${runCount} current_times calls completed; `
  + `p50 ${percentile(durations, 0.5).toFixed(1)} ms, `
  + `p95 ${percentile(durations, 0.95).toFixed(1)} ms, `
  + `max ${Math.max(...durations).toFixed(1)} ms.`,
)
