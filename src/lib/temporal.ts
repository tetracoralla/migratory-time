export type TemporalNamespace =
  typeof import('@js-temporal/polyfill')['Temporal']

type TemporalModule = { Temporal: TemporalNamespace }

function isUsableTemporal(
  candidate: TemporalNamespace | undefined,
): candidate is TemporalNamespace {
  return (
    typeof candidate?.Now?.instant === 'function' &&
    typeof candidate?.ZonedDateTime?.from === 'function'
  )
}

export async function resolveTemporal(
  nativeTemporal: TemporalNamespace | undefined,
  loadPolyfill: () => Promise<TemporalModule> = () =>
    import('@js-temporal/polyfill'),
) {
  if (isUsableTemporal(nativeTemporal)) return nativeTemporal
  return (await loadPolyfill()).Temporal
}

const nativeTemporal = (
  globalThis as typeof globalThis & { Temporal?: TemporalNamespace }
).Temporal

let activeTemporal = isUsableTemporal(nativeTemporal)
  ? nativeTemporal
  : undefined
let temporalPromise: Promise<TemporalNamespace> | undefined

export async function initializeTemporal() {
  if (activeTemporal) return activeTemporal

  temporalPromise ??= resolveTemporal(nativeTemporal)
  activeTemporal = await temporalPromise
  return activeTemporal
}

export function getTemporal() {
  if (!activeTemporal) {
    throw new Error('Temporal must be initialized before time conversion')
  }
  return activeTemporal
}
