const CACHE_NAME = "futpontos-v1";

// Arquivos que ficam disponíveis offline
const STATIC_ASSETS = [
  "/index.html",
  "/classificacao.css",
  "/common-nav.css",
  "/globais.js",
  "/classificacao.js",
  "/goleiros.html",
  "/futponts_large.png",
  "/manifest.json"
];

// ── INSTALL: faz cache dos assets estáticos ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: limpa caches antigos ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: estratégia por tipo de recurso ──
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Chamadas de API: network first, sem fallback de cache
  if (
    url.pathname.startsWith("/jogadores") ||
    url.pathname.startsWith("/goleiros") ||
    url.hostname !== self.location.hostname
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // API offline: retorna JSON vazio para não quebrar o render
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  // Assets estáticos: cache first, fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Atualiza cache com a versão mais recente
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
