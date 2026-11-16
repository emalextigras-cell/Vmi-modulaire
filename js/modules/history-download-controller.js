// Orchestration du téléchargement de l'historique VMI+.
// Le décodage et les offsets des trames BLE restent dans app.js.
export function createHistoryDownloadController({
 $, getDownload, setDownload, getHistory, parseCell, num, recFrom, ingest,
 armDownloadTimeout, setClock, send, setCommandsDisabled, connected,
 markSync, disconnectIntentionally, showError, log, hasCommandChannel, getAutoDone, setAutoDone
}) {
 const sigOf = row => row.rk + '|' + row.d;
 function parseDownloadLine(line) {
  const download = getDownload();
  if (!download.on || !/^\\d{1,2}\\/\\d{1,2}\\/\\d{4} \\d{1,2}:\\d{2}:\\d{2};/.test(line)) return;
  const fields = line.split(';');
  const parsed = parseCell(fields[0]);
  if (!parsed) return;
  if (download.sigs.size && download.sigs.has(parsed.rk + '|' + num(fields[11]))) { finishDownload(true); return; }
  const record = recFrom(fields);
  if (record) download.rows.push(record);
 }
 function armTimer() { armDownloadTimeout(getDownload(), finishDownload); }
 function finishDownload(reachedCut, timeout = false) {
  const download = getDownload();
  if (!download.on) return;
  download.on = false;
  clearTimeout(download.timeout);
  const count = download.rows.length;
  if (count) ingest(download.rows, 'Téléchargement');
  if (download.got) markSync();
  $('dlh').disabled = false;
  setCommandsDisabled(false);
  $('dlp').textContent = `Terminé : ${count} nouvelles lignes${reachedCut ? ' · historique à jour' : timeout ? (download.got ? ' · arrêt après une pause de 20 s' : ' · aucune réponse de la VMI') : (download.sigs.size ? ' · attention : trou possible avant la dernière ligne mémorisée' : ' · historique complet')}`;
  if (reachedCut && connected()) disconnectIntentionally();
 }
 async function startDownload(auto = false) {
  if (!hasCommandChannel()) { if (!auto) showError('Connecte-toi d’abord à la VMI.'); return; }
  if (getDownload().on) return;
  showError('');
  setDownload({ on: true, rows: [], buf: '', total: 0, sigs: new Set(getHistory().filter(row => row.rk && Number.isFinite(row.d)).map(sigOf)), got: false, lastPacket: Date.now(), timeout: null });
  $('dlh').disabled = true;
  setCommandsDisabled(true);
  $('dlp').textContent = auto ? 'Téléchargement automatique de l’historique…' : 'Démarrage du téléchargement…';
  const ok = await setClock();
  if (!ok) { getDownload().on = false; $('dlh').disabled = false; setCommandsDisabled(false); return; }
  await send(0x2c, 0);
  await send(0x20, 0);
  await send(0x22, 0);
  armTimer();
 }
 function autoHistory() {
  if (getAutoDone() || getDownload().on || !connected()) return;
  setAutoDone(true); // Une seule tentative par connexion : évite une boucle de reconnexion.
  startDownload(true).catch(error => log('Téléchargement automatique impossible : ' + (error.message || error)));
 }
 $('dlh').onclick = () => startDownload(false);
 return { parseDownloadLine, armTimer, finishDownload, startDownload, autoHistory };
}
