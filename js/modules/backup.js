/** Fonctions pures de création et de restauration des sauvegardes. */
export function createBackupSnapshot({ hist, live, meta, exportedAt = new Date().toISOString() }) {
  return {
    app: 'vmi-purevent',
    version: 1,
    exportedAt,
    hist: Array.isArray(hist) ? hist : [],
    live: Array.isArray(live) ? live : [],
    meta: meta && typeof meta === 'object' ? meta : {}
  };
}

/**
 * Fusionne une sauvegarde sans remplacer les relevés déjà présents.
 * Les règles de filtrage et les limites sont identiques à la v13.
 */
export function mergeBackupData({ backup, currentHist = [], currentLive = [], currentMeta = {}, minValid, maxLive = 10000 }) {
  if (!backup || backup.app !== 'vmi-purevent' || !Array.isArray(backup.hist)) {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }

  const history = new Map(currentHist.map(record => [record.t, record]));
  let addedHistory = 0;
  for (const record of backup.hist) {
    if (record && Number.isFinite(record.t) && record.t >= minValid && !history.has(record.t)) {
      history.set(record.t, record);
      addedHistory++;
    }
  }
  const hist = [...history.values()].sort((a, b) => a.t - b.t);

  const live = [...currentLive];
  const seenLive = new Set(live.map(record => record.t));
  let addedLive = 0;
  if (Array.isArray(backup.live)) {
    for (const record of backup.live) {
      if (record && Number.isFinite(record.t) && !seenLive.has(record.t)) {
        live.push(record);
        seenLive.add(record.t);
        addedLive++;
      }
    }
  }
  live.sort((a, b) => a.t - b.t);
  if (live.length > maxLive) live.splice(0, live.length - maxLive);

  const meta = { ...(currentMeta || {}) };
  if (backup.meta && backup.meta.lastSync &&
      (!meta.lastSync || backup.meta.lastSync > meta.lastSync)) {
    meta.lastSync = backup.meta.lastSync;
  }

  return { hist, live, meta, addedHistory, addedLive };
}
