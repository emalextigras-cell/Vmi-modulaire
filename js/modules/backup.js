/** Fonctions pures de création et de restauration des sauvegardes. */
import { mergeRecordFields } from './history.js';
import { isValidEnergyReading } from './energy-meter.js';

export function createBackupSnapshot({ hist, live, meta, energyReadings, exportedAt = new Date().toISOString() }) {
  const snapshot = {
    app: 'vmi-purevent', version: 1, exportedAt,
    hist: Array.isArray(hist) ? hist : [], live: Array.isArray(live) ? live : [],
    meta: meta && typeof meta === 'object' ? meta : {}
  };
  // Champ facultatif pour conserver la compatibilité avec les sauvegardes v13 antérieures.
  if (Array.isArray(energyReadings)) {
    snapshot.energyReadings = energyReadings.filter(isValidEnergyReading);
  }
  return snapshot;
}

/** Fusionne une sauvegarde sans effacer les champs déjà connus à timestamp égal. */
export function mergeBackupData({
  backup, currentHist = [], currentLive = [], currentMeta = {},
  currentEnergyReadings = [], minValid, maxLive = 10000
}) {
  if (!backup || backup.app !== 'vmi-purevent' || !Array.isArray(backup.hist)) {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }
  const history = new Map(currentHist.filter(r => r && Number.isFinite(r.t)).map(r => [r.t, r]));
  let addedHistory = 0, enrichedHistory = 0;
  for (const record of backup.hist) {
    if (!record || !Number.isFinite(record.t) || record.t < minValid) continue;
    if (!history.has(record.t)) { history.set(record.t, record); addedHistory++; }
    else {
      const previous = history.get(record.t), merged = mergeRecordFields(previous, record);
      if (Object.keys(merged).some(key => merged[key] !== previous[key])) enrichedHistory++;
      history.set(record.t, merged);
    }
  }
  const hist = [...history.values()].sort((a,b) => a.t-b.t);
  let live = [...currentLive], addedLive = 0;
  if (Array.isArray(backup.live)) {
    const byTime = new Map(live.filter(r => r && Number.isFinite(r.t)).map(r => [r.t,r]));
    for (const record of backup.live) {
      if (!record || !Number.isFinite(record.t)) continue;
      if (!byTime.has(record.t)) { byTime.set(record.t,record); addedLive++; }
      else byTime.set(record.t,mergeRecordFields(byTime.get(record.t),record));
    }
    live=[...byTime.values()].sort((a,b)=>a.t-b.t);
    if(live.length>maxLive) live=live.slice(-maxLive);
  }
  const meta={...(currentMeta||{})};
  if(backup.meta&&backup.meta.lastSync&&(!meta.lastSync||backup.meta.lastSync>meta.lastSync)) meta.lastSync=backup.meta.lastSync;

  let energyReadings = Array.isArray(currentEnergyReadings)
    ? currentEnergyReadings.filter(isValidEnergyReading) : [];
  let addedEnergyReadings = 0;
  if (Array.isArray(backup.energyReadings)) {
    const byId = new Map(energyReadings.map(reading => [reading.id, reading]));
    for (const reading of backup.energyReadings.filter(isValidEnergyReading)) {
      if (!byId.has(reading.id)) {
        byId.set(reading.id, reading);
        addedEnergyReadings++;
      }
    }
    energyReadings = [...byId.values()].sort((a,b) => a.t-b.t);
  }
  return { hist, live, meta, energyReadings, addedHistory, enrichedHistory, addedLive, addedEnergyReadings };
}
