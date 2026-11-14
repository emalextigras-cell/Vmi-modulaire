/** Contrôle de plausibilité des mesures, sans modifier les valeurs reçues de la VMI+. */

export const isPlausibleHumidity = value =>
  !Number.isFinite(value) || (value >= 0 && value <= 100);

export const isPlausibleTemperature = value =>
  !Number.isFinite(value) || (value >= -30 && value <= 60);

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
  const coreKeys = ['sh', 'st', 'he', 'te'];
  const completeHygrometricRecords = rows.filter(row =>
    coreKeys.every(key => {
      const field = FIELDS.find(item => item.key === key);
      const value = row?.[key];
      return Number.isFinite(value) && (field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value));
    })
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
    hasAnomalies: affected.size > 0
  };
}
