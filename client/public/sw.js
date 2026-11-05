/**
 * Service worker de KRONOS-SPACE (bloque 1.6).
 *
 * Alcance deliberadamente pequeño y honesto:
 *  - Guarda el armazón de la aplicación (documento y estáticos de `/assets`)
 *    para que una recarga sin red no muestre la pantalla del navegador.
 *  - **No** cachea respuestas de la API ni del socket: mostrar una bandeja de
 *    mensajes vieja como si fuera actual es peor que decir «sin conexión».
 *  - Recibe los avisos del cliente (`showNotification` desde la página) y los
 *    manda al abrirse con el `url` que traían.
 */

const CACHE = "kronos-shell-v1";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API y el socket nunca salen de la caché.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;

  // Navegación: red primero y, si falla, el armazón guardado.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((hit) => hit || Response.error()))
    );
    return;
  }

  // Estáticos con hash: caché primero (su nombre cambia cuando cambian).
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copia = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copia));
        }
        return response;
      }))
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || "/home";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if (cliente.url.includes(destino) && "focus" in cliente) return cliente.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
