import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function schemaDigest(schema) {
  return `sha256:${createHash('sha256').update(canonicalJson(schema)).digest('hex')}`
}

export async function connectMigratoryTimeClient(name) {
  const pluginRoot = resolve(repositoryRoot, 'plugins/migratory-time')
  const transport = new StdioClientTransport({
    args: ['./server/index.mjs'],
    command: process.execPath,
    cwd: pluginRoot,
    stderr: 'pipe',
  })
  const client = new Client({ name, version: '1.1.1' })
  await client.connect(transport)
  return client
}

export async function readConvertTool(client) {
  const listed = await client.listTools()
  const tool = listed.tools.find((candidate) => candidate.name === 'convert_time')
  if (tool === undefined) throw new Error('MCP tool convert_time is missing')
  if (tool.inputSchema === undefined || tool.outputSchema === undefined) {
    throw new Error('MCP tool convert_time must advertise input and output schemas')
  }
  return tool
}
