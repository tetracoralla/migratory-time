const CACHE_PREFIX = 'migratory-time-'
const LEGACY_CACHE_PREFIX = 'time-zone-app-'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const SCOPE_URL = new URL('./', self.location.href)
const INDEX_URL = new URL('index.html', SCOPE_URL)

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const indexResponse = await fetch(INDEX_URL)
  const indexForCache = indexResponse.clone()
  const html = await indexResponse.text()
  const assetPaths = Array.from(
    html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g),
    (match) => new URL(match[1], SCOPE_URL).href,
  )
  const staticUrls = [
    new URL('manifest.webmanifest', SCOPE_URL).href,
    new URL('icon-192.png', SCOPE_URL).href,
    new URL('icon-512.png', SCOPE_URL).href,
    new URL('icon.svg', SCOPE_URL).href,
    ...assetPaths,
  ]

  await cache.put(SCOPE_URL, indexForCache.clone())
  await cache.put(INDEX_URL, indexForCache)
  await cache.addAll([...new Set(staticUrls)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) ||
                  key.startsWith(LEGACY_CACHE_PREFIX)) &&
                key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const isDocumentNavigation =
    event.request.mode === 'navigate' || event.request.destination === 'document'
  const cacheKey = isDocumentNavigation ? SCOPE_URL.href : event.request
  const networkRequest = fetch(event.request)

  event.waitUntil(
    networkRequest
      .then((response) => {
        if (!response.ok) return undefined

        const responseForCache = response.clone()
        return caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(cacheKey, responseForCache))
      })
      .catch(() => undefined),
  )

  event.respondWith(
    networkRequest.catch(() =>
      caches
        .match(cacheKey)
        .then((cached) => cached || caches.match(SCOPE_URL)),
    ),
  )
})
