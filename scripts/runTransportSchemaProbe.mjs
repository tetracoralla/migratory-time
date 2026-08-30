#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import {
  connectMigratoryTimeClient,
  readConvertTool,
  repositoryRoot,
  schemaDigest,
} from './capabilityProviderLib.mjs'

const capabilityId = 'org.openadam.time-zone.convert'
const capabilityVersion = '0.2.0'

async function observeBinding() {
  const client = await connectMigratoryTimeClient('migratory-time-transport-schema-probe')
  try {
    const tool = await readConvertTool(client)
    return {
      operationId: 'convert',
      transport: 'mcp-tool',
      target: 'convert_time',
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }
  } finally {
    await client.close()
  }
}

async function selfCheck() {
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, 'capabilities/provider.json'), 'utf8'),
  )
  const implementation = manifest.implementations?.find(
    (candidate) =>
      candidate.capabilityId === capabilityId
      && candidate.capabilityVersion === capabilityVersion,
  )
  assert.ok(implementation, 'Migratory Time capability implementation is missing')
  assert.equal(
    implementation.transportSchemaProbe?.protocol,
    'openadam.transport-schema-jsonl.v0.1',
  )
  const declared = implementation.bindings?.[0]
  const observed = await observeBinding()
  assert.equal(observed.operationId, declared?.operationId)
  assert.equal(observed.transport, declared?.transport)
  assert.equal(observed.target, declared?.target)
  assert.equal(schemaDigest(observed.inputSchema), declared?.transportSchemaDigests?.input)
  assert.equal(schemaDigest(observed.outputSchema), declared?.transportSchemaDigests?.output)
  console.log('PASS Migratory Time live transport schema probe')
}

async function serveOneRequest() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let request
  for await (const line of lines) {
    if (line === '') continue
    assert.equal(request, undefined, 'transport schema probe accepts exactly one request')
    request = JSON.parse(line)
  }
  assert.ok(request, 'transport schema probe request is missing')
  assert.deepEqual(
    Object.keys(request).sort(),
    ['capabilityId', 'capabilityVersion', 'id'],
  )
  assert.equal(request.id, 'transport-schema')
  assert.equal(request.capabilityId, capabilityId)
  assert.equal(request.capabilityVersion, capabilityVersion)
  const binding = await observeBinding()
  process.stdout.write(`${JSON.stringify({
    id: request.id,
    ok: true,
    bindings: [binding],
  })}\n`)
}

if (process.argv[2] === '--check') await selfCheck()
else await serveOneRequest()
