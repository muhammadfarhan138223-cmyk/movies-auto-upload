const CACHE='moviehub-monitor-v2.0.0';
const SHELL=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/config.js'))return; // always online; never cache project config
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;
 }
 if(SHELL.map(p=>new URL(p,self.registration.scope).href).includes(event.request.url)){
  event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request)));return;
 }
});
