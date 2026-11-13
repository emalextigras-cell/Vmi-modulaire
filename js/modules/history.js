/** Fonctions pures de nettoyage et de conservation de l'historique local. */
export function pruneHistory(records, maxRecords) {
  const valid = (Array.isArray(records) ? records : []).filter(record =>
    record && (record.st != null || record.sh != null || record.te != null ||
      record.he != null || record.rpm != null || record.t1 != null || record.h1 != null)
  );
  const limit = Number.isFinite(maxRecords) ? Math.max(0, Math.floor(maxRecords)) : valid.length;
  const removed = Math.max(0, valid.length - limit);
  return { records: removed ? valid.slice(removed) : valid, removed };
}
