export function fingerprintDefinition(value: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let hash = 0xcbf29ce484222325n
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}
