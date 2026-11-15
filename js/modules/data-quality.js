/** Contrôle de plausibilité des mesures, sans modifier les valeurs reçues de la VMI+. */

export const isPlausibleHumidity = value =>
  !Number.isFinite(value) || (value >= 0 && value <= 100);

export const isPlausibleTemperature = value =>
  !Number.isFinite(value) || (value >= -30 && value <= 60);


const TRANSIENT_SPIKE_FIELDS = [
  { key: 'st', label: 'Température salon', type: 'temperature', spike: 12, stable: 3 },
  { key: 'te', label: 'Température air entrant', type: 'temperature', spike: 12, stable: 3 },
  { key: 'tExt', label: 'Température extérieure VMI+', type: 'temperature', spike: 12, stable: 3 },
  { key: 't1', label: 'Température sonde résistances', type: 'temperature', spike: 12, stable: 3 },
  { key: 'sh', label: 'Humidité salon', type: 'humidity', spike: 30, stable: 8 },
  { key: 'he', label: 'Humidité air entrant', type: 'humidity', spike: 30, stable: 8 },
  { key: 'h1', label: 'Humidité sonde résistances', type: 'humidity', spike: 30, stable: 8 }
];

/**
 * Repère les pics isolés qui reviennent près du niveau initial.
 * Ce sont des événements à vérifier, jamais une preuve de panne de capteur.
 * Les deux intervalles voisins doivent être datés et <= 30 minutes.
 */
export function detectTransientSensorSpikes(records, { maxGapMinutes = 30 } = {}) {
  const rows = (Array.isArray(records) ? records : [])
    .filter(row => Number.isFinite(row?.t))
    .slice()
    .sort((a, b) => a.t - b.t);
  const maxGapMs = maxGapMinutes * 60 * 1000;
  const candidates = [];
  for (const field of TRANSIENT_SPIKE_FIELDS) {
    for (let index = 1; index < rows.length - 1; index++) {
      const before = rows[index - 1], current = rows[index], after = rows[index + 1];
      const a = before[field.key], b = current[field.key], c = after[field.key];
      if (![a, b, c].every(Number.isFinite)) continue;
      const plausible = field.type === 'humidity'
        ? [a, b, c].every(isPlausibleHumidity)
        : [a, b, c].every(isPlausibleTemperature);
      if (!plausible) continue;
      const gapBefore = current.t - before.t;
      const gapAfter = after.t - current.t;
      if (gapBefore <= 0 || gapAfter <= 0 || gapBefore > maxGapMs || gapAfter > maxGapMs) continue;
      const neighborsDifference = Math.abs(a - c);
      const spikeFromNeighbors = Math.min(Math.abs(b - a), Math.abs(b - c));
      const sameDirection = (b - a) * (b - c) > 0;
      if (!sameDirection || neighborsDifference > field.stable || spikeFromNeighbors < field.spike) continue;
      candidates.push({
        key: field.key, label: field.label, timestamp: current.t, value: b,
        previousValue: a, nextValue: c,
        unit: field.type === 'humidity' ? '%' : '°C',
        deviation: spikeFromNeighbors,
        gapBeforeMinutes: gapBefore / 60000, gapAfterMinutes: gapAfter / 60000
      });
    }
  }
  return {
    count: candidates.length, candidates, maxGapMinutes,
    thresholds: { temperatureSpike: 12, temperatureNeighborDifference: 3,
      humiditySpike: 30, humidityNeighborDifference: 8 }
  };
}

const FIELDS = [
  { key: 'sh', label: 'Humidité salon', type: 'humidity' },
  { key: 'h1', label: 'Humidité sonde résistances', type: 'humidity' },
  { key: 'he', label: 'Humidité air entrant', type: 'humidity' },
  { key: 'st', label: 'Température salon', type: 'temperature' },
  { key: 'tExt', label: 'Température extérieure VMI+', type: 'temperature' },
  { key: 't1', label: 'Température sonde résistances', type: 'temperature' },
  { key: 'te', label: 'Température air entrant', type: 'temperature' }
];

export function summarizeDataQuality(records) {
  const rows = Array.isArray(records) ? records : [];
  const fieldCoverage = FIELDS.map(field => {
    let present = 0, invalid = 0;
    for (const row of rows) {
      const value = row?.[field.key];
      if (!Number.isFinite(value)) continue;
      present++;
      const valid = field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value);
      if (!valid) invalid++;
    }
    const valid = present - invalid;
    return {
      ...field,
      presentCount: present,
      missingCount: rows.length - present,
      invalidCount: invalid,
      validCount: valid,
      coveragePercent: rows.length ? valid / rows.length * 100 : 0
    };
  });
  const fields = fieldCoverage
    .filter(field => field.invalidCount > 0)
    .map(field => ({ ...field, count: field.invalidCount }));
  const affected = new Set();
  rows.forEach((row, index) => {
    for (const field of FIELDS) {
      const value = row?.[field.key];
      if (!Number.isFinite(value)) continue;
      const valid = field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value);
      if (!valid) { affected.add(index); break; }
    }
  });
  const transientSpikes = detectTransientSensorSpikes(rows);
  const coreKeys = ['sh', 'st', 'he', 'te'];
  // La complétude mesure la présence des quatre valeurs numériques.
  // La plausibilité est suivie séparément dans invalidCount / affectedRecords.
  const completeHygrometricRecords = rows.filter(row =>
    coreKeys.every(key => Number.isFinite(row?.[key]))
  ).length;
  return {
    total: rows.length,
    affectedRecords: affected.size,
    invalidRecords: affected.size,
    fields,
    fieldCoverage,
    coreSensorKeys: coreKeys,
    completeHygrometricRecords,
    incompleteHygrometricRecords: rows.length - completeHygrometricRecords,
    hygrometricCoveragePercent: rows.length ? completeHygrometricRecords / rows.length * 100 : 0,
    hasAnomalies: affected.size > 0,
    transientSpikes
  };
}
