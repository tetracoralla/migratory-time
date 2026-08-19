import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  connectMigratoryTimeClient,
  readConvertTool,
  repositoryRoot,
  schemaDigest,
} from './capabilityProviderLib.mjs'

const mode = process.argv[2]
if (mode !== '--write' && mode !== '--check') {
  throw new Error('Use --write to refresh generated capability files or --check to verify them')
}

const capabilityRoot = resolve(repositoryRoot, 'capabilities')
const schemaRoot = resolve(capabilityRoot, 'schemas')
const inputPath = resolve(schemaRoot, 'time-zone.convert.input.schema.json')
const outputPath = resolve(schemaRoot, 'time-zone.convert.output.schema.json')
const manifestPath = resolve(capabilityRoot, 'provider.json')
const client = await connectMigratoryTimeClient('migratory-time-capability-export')

try {
  const tool = await readConvertTool(client)
  const liveInput = tool.inputSchema
  const liveOutput = tool.outputSchema

  const contractInput = JSON.parse(await readFile(inputPath, 'utf8'))
  const contractOutput = JSON.parse(await readFile(outputPath, 'utf8'))

  const manifest = {
    schemaVersion: 'openadam.provider-manifest.v0.1',
    provider: {
      id: 'io.github.tetracoralla.migratory-time',
      name: 'Migratory Time',
      version: '1.1.1',
      homepage: 'https://tetracoralla.github.io/migratory-time/',
    },
    implementations: [
      {
        capabilityId: 'org.openadam.time-zone.convert',
        capabilityVersion: '0.1.0',
        adapter: {
          protocol: 'openadam.capability-jsonl.v0.1',
          command: 'node',
          args: ['scripts/runCapabilityAdapter.mjs'],
        },
        bindings: [
          {
            operationId: 'convert',
            transport: 'mcp-tool',
            target: 'convert_time',
            contractSchemaDigests: {
              input: schemaDigest(contractInput),
              output: schemaDigest(contractOutput),
            },
            transportSchemaDigests: {
              input: schemaDigest(liveInput),
              output: schemaDigest(liveOutput),
            },
            annotations: tool.annotations ?? {},
          },
        ],
      },
    ],
  }
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`
  if (mode === '--write') {
    await mkdir(capabilityRoot, { recursive: true })
    await writeFile(manifestPath, serialized, 'utf8')
  } else {
    assert.equal(
      await readFile(manifestPath, 'utf8'),
      serialized,
      'capabilities/provider.json is stale; run npm run capability:export',
    )
  }
  console.log(`PASS Migratory Time provider manifest ${mode.slice(2)}`)
} finally {
  await client.close()
}
