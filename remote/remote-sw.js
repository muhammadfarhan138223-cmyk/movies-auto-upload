/* A shell-only offline fallback. No authenticated pages, private queue data, or APIs are cached. */
const CACHE='moviehub-upload-remote-offline-v1';
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.add('/offline.html')).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).then(async response=>{
    if(response.status>=500){return await caches.match('/offline.html')||response;}
    return response;
  }).catch(async()=>await caches.match('/offline.html')||Response.error()));
});
