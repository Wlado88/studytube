"use strict";

const CACHE_PREFIX = `studytube-shell:${self.registration.scope}:`;
const CACHE = `${CACHE_PREFIX}v4.5`;
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./direct/index.html", "./direct/StudyTube-Direct.user.js"];
const SHELL_URLS = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...SHELL_URLS].map(url => new Request(url, {cache: "reload"})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE &&
      (key.startsWith(CACHE_PREFIX) || /^studytube-shell-v[234]$/.test(key))
    ).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;

  const isNavigation = request.mode === "navigate";
  const assetUrl = new URL(url);
  assetUrl.search = "";
  assetUrl.hash = "";
  if (!isNavigation && !SHELL_URLS.has(assetUrl.href)) return;

  // Only application assets are cached; never video streams or API responses.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const directUrl = new URL("./direct/index.html", self.registration.scope).href;
    const directPath = new URL("./direct/", self.registration.scope).pathname;
    let cacheKey = assetUrl.href;
    if (isNavigation) {
      if (url.pathname===directPath||url.pathname===directPath+"index.html") cacheKey=directUrl;
      else if (!SHELL_URLS.has(assetUrl.href)||assetUrl.href===self.registration.scope) cacheKey=INDEX_URL;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque" && !response.redirected) {
        try { await cache.put(cacheKey, response.clone()); } catch {}
      }
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      throw error;
    }
  })());
});
