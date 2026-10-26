// Network first (so updates show up at once), cache fallback (so it plays offline / off the tailnet).
// Only the clean file URLs are cached; version-check requests (?vc=...) always go to the network.
const C='lattice-v1',FILES=['./','./index.html','./solver.js','./puzzles.js','./manifest.json','./icon-180.png','./icon-192.png','./icon-512.png','./fonts/cormorant.woff2','./fonts/cormorant-italic.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.search||url.origin!==location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;// saves and other hub paths are never cached
 const net=new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),8000);fetch(req,{cache:'no-store'}).then(r=>{clearTimeout(t);res(r);},err=>{clearTimeout(t);rej(err);});});
 e.respondWith(net.then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(req,cp));}return r;}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));});
