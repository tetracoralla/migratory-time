// Stored plans arrive as caller-supplied JSON whose object key order is not
// under this runtime's control, and fingerprints also back dependency-identity
// comparison between a stored plan and a fresh computation. Serialize with
// recursively sorted keys so reordering alone can never read as drift.
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalValue(child)]),
    )
  }
  return value
}

export function fingerprintDefinition(value: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)))
  let hash = 0xcbf29ce484222325n
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}
