const CACHE_NAME = "futpontos-v2";

// Arquivos estáticos principais do aplicativo.
// A versão do cache é incrementada quando uma página/asset novo entra no projeto.
const STATIC_ASSETS = [
  "/index.html",
  "/classificacao.css",
  "/common-nav.css",
  "/globais.js",
  "/classificacao.js",
  "/goleiros.html",
  "/futponts_large.png",
  "/manifest.json",
  "/montar-times.html",
  "/montar-times.css",
  "/montar-times.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

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

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // API: sempre tenta a rede. Não cachear dados dinâmicos.
  if (
    url.pathname.startsWith("/jogadores") ||
    url.pathname.startsWith("/goleiros") ||
    url.pathname.startsWith("/desempenho") ||
    url.hostname !== self.location.hostname
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  // Estáticos: cache first, mas grava uma cópia clonada da resposta de rede.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
