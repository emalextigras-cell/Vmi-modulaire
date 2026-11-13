/** Fonctions pures de nettoyage et de conservation de l'historique local. */
export function pruneHistory(records, maxRecords) {
  const valid = (Array.isArray(records) ? records : []).filter(record =>
    record && (record.st != null || record.sh != null || record.tExt != null || record.te != null ||
      record.he != null || record.rpm != null || record.t1 != null || record.h1 != null ||
      record.debit != null || record.vmiSpeedRaw != null || record.vmiAbsP0 != null || record.vmiAbsP1 != null ||
      record.filterIndexPct != null || record.vmiPwmRaw != null || record.vmiModeRaw != null ||
      record.volumeRaw != null || record.consDpRaw != null || record.fil != null)
  );
  const limit = Number.isFinite(maxRecords) ? Math.max(0, Math.floor(maxRecords)) : valid.length;
  const removed = Math.max(0, valid.length - limit);
  return { records: removed ? valid.slice(removed) : valid, removed };
}

/**
 * Fusionne un import dans l'historique : à timestamp égal, la ligne importée
 * remplace l'ancienne, comme dans l'implémentation v13.
 */
export function mergeImportedHistory(currentRecords, importedRecords) {
  const byTimestamp = new Map((Array.isArray(currentRecords) ? currentRecords : [])
    .map(record => [record.t, record]));
  (Array.isArray(importedRecords) ? importedRecords : [])
    .forEach(record => byTimestamp.set(record.t, record));
  return [...byTimestamp.values()].sort((a, b) => a.t - b.t);
}
