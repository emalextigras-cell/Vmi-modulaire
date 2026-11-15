/** Fonctions pures de nettoyage et de conservation de l'historique local. */
import { MIN_VALID } from './date-utils.js';

/**
 * La date brute rk fait foi : certains anciens relevés ont reçu une date t
 * artificielle lors d'une correction d'horloge. Les années brutes antérieures
 * à 2025 ne doivent jamais entrer dans l'historique exploité.
 */
export function isRawDateEligible(record, minValid = MIN_VALID) {
  if (!record || !Number.isFinite(record.t)) return false;
  if (typeof record.rk === 'string' && record.rk.trim()) {
    const match = record.rk.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s/);
    if (match) return Number(match[3]) >= 2025;
  }
  // Sans date brute, conserver les anciens horodatages non corrigés :
  // fixClock doit encore pouvoir les recaler à partir du compteur de jours.
  // En revanche, une date déjà corrigée sans origine vérifiable est écartée.
  if (record.fixed === true) return false;
  return true;
}

export function filterRawDateHistory(records, minValid = MIN_VALID) {
  return (Array.isArray(records) ? records : []).filter(record => isRawDateEligible(record, minValid));
}
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
 * Complète un relevé existant avec les valeurs non nulles d'une nouvelle source.
 * Les champs déjà renseignés sont conservés si la nouvelle source ne les fournit pas.
 */
export function mergeRecordFields(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value != null) merged[key] = value;
  }
  return merged;
}

/** Fusionne les imports par horodatage sans perdre les champs déjà renseignés. */
export function mergeImportedHistory(currentRecords, importedRecords) {
  const byTimestamp = new Map((Array.isArray(currentRecords) ? currentRecords : [])
    .filter(record => isRawDateEligible(record))
    .map(record => [record.t, record]));
  (Array.isArray(importedRecords) ? importedRecords : [])
    .filter(record => isRawDateEligible(record))
    .forEach(record => byTimestamp.set(record.t, mergeRecordFields(byTimestamp.get(record.t), record)));
  return [...byTimestamp.values()].sort((a, b) => a.t - b.t);
}
