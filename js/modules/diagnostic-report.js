// Construction du rapport de diagnostic local. Aucun accès matériel ni action de pilotage.
export function buildDiagnosticReport({
 appVersion, now = Date.now(), userAgent = '', bluetoothAvailable = false, connected = false,
 serviceWorkerStatus = 'absent', sheetJsLoaded = false, hist = [], live = [], minValid = 0,
 fmtLocal, fmtShort, absoluteHumidity, lastSeen = {}, source = 'hist', selectedDate = null,
 daysSetting = 30, chartPaths = {}, downloadOn = false, downloadProgress = '—',
 commandResult = '—', errors = [], logLines = [], lastSync = null
}) {
 const L = [];
 const ago = timestamp => timestamp ? Math.round((now - timestamp) / 1000) + ' s' : 'jamais';
 L.push(`VMI Purevent – diagnostic – version ${appVersion} – ${new Date(now).toLocaleString('fr-FR')}`);
 L.push('Navigateur : ' + userAgent);
 L.push(`Bluetooth : ${bluetoothAvailable ? 'disponible' : 'indisponible'} · connecté : ${connected ? 'oui' : 'non'} · service worker : ${serviceWorkerStatus} · SheetJS : ${sheetJsLoaded ? 'chargé' : 'non chargé'}`);
 const valid = hist.filter(row => row.t >= minValid);
 L.push(`Historique : ${hist.length} relevés dont ${valid.length} valides`);
 if (valid.length) {
  const timestamps = valid.map(row => row.t);
  L.push(`  période : ${fmtLocal(timestamps[0])} → ${fmtLocal(timestamps[timestamps.length - 1])}`);
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) if (timestamps[i] - timestamps[i - 1] > 2 * 3600e3) gaps.push(`${fmtShort(timestamps[i - 1])} → ${fmtShort(timestamps[i])} (${((timestamps[i] - timestamps[i - 1]) / 3600e3).toFixed(1)} h)`);
  L.push(`  trous > 2 h : ${gaps.length}${gaps.length ? ' : ' + gaps.slice(0, 8).join(' ; ') : ''}`);
  const missing = key => valid.filter(row => row[key] == null).length;
  L.push(`  valeurs manquantes : salon T ${missing('st')}, ext. VMI+ T ${missing('tExt')}, salon HR ${missing('sh')}, sonde 1 T ${missing('t1')}, air entrant T ${missing('te')}, air entrant HR ${missing('he')}, régime ${missing('rpm')}`);
  for (const [key, label] of [['st', 'Salon'], ['t1', 'Sonde résistances'], ['te', 'Air entrant']]) {
   const extreme = valid.filter(row => Number.isFinite(row[key]) && row[key] > 40);
   L.push(`  Température >40°C – ${label} : ${extreme.length}${extreme.length ? ' · ' + extreme.slice(0, 8).map(row => fmtLocal(row.t) + ' = ' + row[key] + '°C').join(' ; ') : ''}`);
  }
  for (const [temperatureKey, humidityKey, label] of [['st', 'sh', 'Salon'], ['t1', 'h1', 'Sonde résistances'], ['te', 'he', 'Air entrant']]) {
   const extreme = valid.map(row => ({ row, value: Number.isFinite(row[temperatureKey]) && Number.isFinite(row[humidityKey]) ? absoluteHumidity(row[temperatureKey], row[humidityKey]) : null })).filter(item => Number.isFinite(item.value) && item.value > 35);
   L.push(`  Humidité absolue calculée >35 g/m³ – ${label} : ${extreme.length}${extreme.length ? ' · ' + extreme.slice(0, 8).map(item => fmtLocal(item.row.t) + ' = ' + item.value.toFixed(1)).join(' ; ') : ''}`);
  }
  L.push(`  relevés avec compteur de jours : ${valid.filter(row => Number.isFinite(row.d)).length} · avec date brute : ${valid.filter(row => row.rk).length}`);
 }
 L.push(`Direct : ${live.length} relevés${live.length ? ` (du ${fmtShort(live[0].t)} au ${fmtShort(live[live.length - 1].t)})` : ''}`);
 L.push(`Synchro : dernière ${lastSync ? fmtLocal(lastSync) : 'jamais'} · mesures reçues : salon ${ago(lastSeen.salon)}, sondes ${ago(lastSeen.probes)}, état ${ago(lastSeen.state)}`);
 L.push(`Affichage : source ${source}, jour ${selectedDate || 'aucun'}, période ${daysSetting ? daysSetting + ' j' : 'tout'}`);
 L.push('Graphiques : ' + ['chartRH', 'chartHA', 'chartTemp', 'chartRPM'].map(id => `${id} ${chartPaths[id] || 0} courbe(s)`).join(' · '));
 L.push('Téléchargement : ' + (downloadOn ? 'en cours' : 'inactif') + ` · ${downloadProgress}`);
 L.push('Commandes : ' + commandResult);
 L.push('Erreurs : ' + (errors.length ? '\\n  ' + errors.join('\\n  ') : 'aucune'));
 L.push('Journal (25 dernières lignes) :');
 logLines.slice(-25).forEach(line => L.push('  ' + line));
 return L.join('\\n');
}
