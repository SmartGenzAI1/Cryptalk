/* Cryptalk Service Worker */
const CACHE_VERSION = 'cryptalk-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

// Pre-cached static assets (do NOT pre-cache root '/' to avoid caching stale HTML & CSP headers)
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/logo.png',
  '/logo-small.png',
  '/favicon-32.png',
  '/apple-icon.png',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
});

// Activate: clean up all old caches immediately and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Allow the page to trigger immediate activation of a new SW version
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Helper: is this an API, websocket, or cross-origin data request?
function isApiOrDynamicRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket') ||
    url.pathname.includes('supabase') ||
    url.hostname !== self.location.hostname
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET requests
  if (request.method !== 'GET') {
    if (!navigator.onLine && isSyncableRequest(request)) {
      queueFailedRequest(request);
    }
    return;
  }

  const url = new URL(request.url);

  // Skip non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // NEVER intercept API, socket, Supabase, or external backend requests in the service worker!
  // Let the browser make direct network requests so CSP and cookies work naturally without SW interference.
  if (isApiOrDynamicRequest(url)) {
    return;
  }

  // Navigation requests (HTML pages): ALWAYS network-first to get latest CSP headers and scripts
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets (images, fonts, scripts): cache-first fallback
  event.respondWith(cacheFirst(request));
});

function isSyncableRequest(request) {
  const url = new URL(request.url);
  return (
    request.method === 'POST' &&
    (url.pathname.startsWith('/api/messages') || url.pathname.startsWith('/api/'))
  );
}

// Cache-first: serve from cache, fall back to network and update cache
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match(OFFLINE_URL);
      if (offlineResponse) return offlineResponse;
    }
    throw err;
  }
}

// Network-first: try network, fall back to cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

/* ---------- Background Sync for failed requests ---------- */

const SYNC_TAG = 'cryptalk-failed-requests';
const FAILED_STORE = 'failed-requests';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cryptalk-sw', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FAILED_STORE)) {
        req.result.createObjectStore(FAILED_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueFailedRequest(request) {
  try {
    const body = await request.clone().text();
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FAILED_STORE, 'readwrite');
      tx.objectStore(FAILED_STORE).add({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
        timestamp: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    if ('sync' in self.registration) {
      await self.registration.sync.register(SYNC_TAG);
    }
  } catch (err) {
    console.error('[SW] Failed to queue request:', err);
  }
}

async function replayFailedRequests() {
  const db = await openDb();
  const requests = await new Promise((resolve, reject) => {
    const tx = db.transaction(FAILED_STORE, 'readonly');
    const req = tx.objectStore(FAILED_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const replayed = [];
  for (let i = 0; i < requests.length; i++) {
    const item = requests[i];
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      replayed.push(i);
    } catch (err) {
      break; // still offline; stop and retry later
    }
  }

  // Remove successfully replayed entries
  if (replayed.length > 0) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FAILED_STORE, 'readwrite');
      const store = tx.objectStore(FAILED_STORE);
      replayed.forEach((i) => store.delete(i + 1));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();

  // Notify clients that messages were synced
  if (replayed.length > 0) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) =>
      client.postMessage({ type: 'SYNC_COMPLETE', count: replayed.length })
    );
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayFailedRequests());
  }
});

/* ---------- Push notification support ---------- */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Cryptalk';
  const options = {
    body: data.body || 'New message',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'cryptalk-message',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
