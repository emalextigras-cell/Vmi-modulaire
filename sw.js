const CACHE_NAME = 'vmi-modulaire-v14-cache-34';
const CACHE_PREFIX = 'vmi-modulaire-';
const APP_SHELL = [
  './','./index.html','./manifest.json','./css/style.css','./js/app.js',
  './js/modules/core.js','./js/modules/store.js','./js/modules/analysis.js','./js/modules/statistics.js','./js/modules/operating-reference.js',
  './js/modules/charts.js','./js/modules/ble.js','./js/modules/sync.js',
  './js/modules/dataio.js','./js/modules/clock-correction.js',
  './js/modules/legacy-migration.js','./js/modules/history.js',
  './js/modules/backup.js','./js/modules/date-utils.js',
  './js/modules/bluetooth-protocol.js','./js/modules/psychrometry.js',
  './js/modules/data-quality.js','./js/modules/chart-renderer.js','./js/modules/energy-meter.js','./js/modules/energy-estimate.js','./js/modules/energy-climate.js','./js/modules/weekly-diagnostic.js',
  './js/modules/bluetooth-autoconnect.js','./js/modules/live-freshness.js','./js/modules/diagnostic-confidence.js','./js/modules/seasonal-advice.js','./js/modules/assistant-summary.js','./js/modules/assistant-format.js','./js/modules/assistant-recommendations.js','./js/modules/assistant-renderer.js','./js/modules/history-selection.js','./js/modules/format-utils.js','./js/modules/history-freshness.js','./js/modules/history-freshness-view.js','./js/modules/history-insight-renderers.js','./js/modules/energy-renderers.js','./js/modules/hygrometric-renderers.js','./js/modules/import-controller.js','./js/modules/history-export-controller.js','./js/modules/hygrometric-diagnosis.js','./js/modules/temporal-analysis.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match(event.request)).then(cached=>cached||caches.open(CACHE_NAME).then(cache=>cache.match('./index.html')))));
});
