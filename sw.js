const V="crush214-29d8b14239";const CORE=["/","/index.html","/app.js","/data.js","/manifest.webmanifest","/icon.svg","/icon-192.png","/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET")return;
 const ok=u.origin===location.origin||/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);if(!ok)return;
 e.respondWith(caches.open(V).then(c=>c.match(e.request,{ignoreSearch:u.origin===location.origin}).then(hit=>{const net=fetch(e.request).then(r=>{if(r&&(r.ok||r.type==="opaque"))c.put(e.request,r.clone());return r}).catch(()=>hit||c.match("/index.html"));return hit||net})))});
