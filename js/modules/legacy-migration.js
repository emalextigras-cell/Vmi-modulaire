/** Migration des lignes historiques stockées par les anciennes versions. */

/**
 * Les anciennes versions stockaient une heure murale comme si elle était UTC.
 * Reproduit la conversion historique de la v13 pour ne pas décaler les données.
 */
export const wallUtcToLocal = timestamp => {
  const date = new Date(timestamp);
  return new Date(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
  ).getTime();
};

/** Convertit une ligne historique positionnelle de l'ancienne base VMI_DB. */
export const fromOldRow = row => ({
  t: wallUtcToLocal(row[0]),
  st: row[1],
  sh: row[2],
  t1: row[3],
  h1: row[4],
  te: row[5],
  he: row[6],
  rpm: row[7],
  fil: row[8],
  vit: null,
  manualLevel: null,
  boost: null,
  hol: null
});
