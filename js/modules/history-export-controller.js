// Export CSV et sauvegardes JSON de l'historique VMI+.
// La restauration valide et persiste les données avant de modifier l'état en mémoire.
function downloadText(content, name, type, bom = true) {
 const blob = new Blob(bom ? ['\ufeff', content] : [content], { type });
 const url = URL.createObjectURL(blob);
 const anchor = document.createElement('a');
 anchor.href = url; anchor.download = name; anchor.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const decFr = value => (value == null || !Number.isFinite(value)) ? '' : String(Math.round(value * 100) / 100).replace('.', ',');
const fmtLocal = (timestamp, pad) => {
 const date = new Date(timestamp);
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export function createHistoryExportController({ $, getState, setState, dbSetMany, createBackupSnapshot, mergeBackupData, pruneHistory, psychro, pad, localDay, minValid, maxHistory, render }) {
 function historyToCsv(rows) {
  const header = ['date_heure','salon_temp_C','salon_HR_pct','temperature_exterieure_vmi_plus_C','salon_HA_calculee_g_m3','salon_rosee_C','sonde1_temp_C','sonde1_HR_pct','vmi_plus_P0_Hum_abs_brute','air_entrant_temp_C','air_entrant_HR_pct','vmi_plus_P1_Hum_abs_brute','air_entrant_HA_calculee_g_m3','regime_tr_min','etat_filtre_brut','indice_encrassement_pct','duree_fonctionnement_j','debit_vmi_plus_brut','vitesse_vmi_plus_code_brut','pwm_vmi_plus_brut','mode_vmi_plus_brut','volume_vmi_plus_m3_brut','cons_dp_vmi_plus_brut'];
  const lines = [header.join(';')];
  for (const row of rows) {
   const calculated = psychro({ st: row.st, sh: row.sh, te: row.te, he: row.he });
   lines.push([fmtLocal(row.t, pad),decFr(row.st),decFr(row.sh),decFr(row.tExt),decFr(calculated.haIn),decFr(calculated.dewIn),decFr(row.t1),decFr(row.h1),decFr(row.vmiAbsP0),decFr(row.te),decFr(row.he),decFr(row.vmiAbsP1),decFr(calculated.haOut),decFr(row.rpm),decFr(row.fil),decFr(row.filterIndexPct),decFr(row.d),decFr(row.debit),decFr(row.vmiSpeedRaw),decFr(row.vmiPwmRaw),decFr(row.vmiModeRaw),decFr(row.volumeRaw),decFr(row.consDpRaw)].join(';'));
  }
  return lines.join('\r\n');
 }
 function makeBackup() {
  const state = getState();
  return createBackupSnapshot({ hist: state.hist, live: state.live, meta: state.meta, energyReadings: state.energyReadings });
 }
 async function restoreBackup(backup) {
  const state = getState();
  const result = mergeBackupData({ backup, currentHist: state.hist, currentLive: state.live, currentMeta: state.meta, currentEnergyReadings: state.energyReadings, minValid });
  const nextHist = pruneHistory(result.hist, maxHistory).records;
  const entries = [['hist', nextHist], ['live', result.live], ['energyReadings', result.energyReadings]];
  if (result.meta.lastSync !== state.meta.lastSync) entries.push(['meta', result.meta]);
  await dbSetMany(entries);
  setState({ hist: nextHist, live: result.live, meta: result.meta, energyReadings: result.energyReadings });
  return { add: result.addedHistory, enriched: result.enrichedHistory, addL: result.addedLive, addEnergy: result.addedEnergyReadings };
 }
 $('expHist').onclick = () => {
  const state = getState();
  const rows = state.hist.filter(row => row.t >= minValid);
  if (!rows.length) { $('backupInfo').textContent = 'Aucun historique à exporter.'; return; }
  downloadText(historyToCsv(rows), `vmi-historique-${localDay()}.csv`, 'text/csv;charset=utf-8');
  $('backupInfo').textContent = `${rows.length} relevés exportés (séparateur « ; », virgule décimale, prêt pour Excel).`;
 };
 $('expBackup').onclick = () => {
  const state = getState();
  downloadText(JSON.stringify(makeBackup()), `vmi-sauvegarde-${localDay()}.json`, 'application/json', false);
  $('backupInfo').textContent = `Sauvegarde créée : ${state.hist.length} relevés d’historique, ${state.live.length} relevés en direct.`;
 };
 $('restoreFile').onchange = async event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
   const backup = JSON.parse(await file.text());
   const { add, enriched, addL, addEnergy } = await restoreBackup(backup);
   $('backupInfo').textContent = 'Sauvegarde restaurée : ' + add + ' relevés d’historique ajoutés, ' + enriched + ' complétés, ' + addL + ' relevés en direct et ' + addEnergy + ' index de compteur ajoutés.';
   render();
  } catch (error) { $('backupInfo').textContent = 'Restauration impossible : ' + error.message; }
  event.target.value = '';
 };
 return { makeBackup, restoreBackup, historyToCsv };
}
