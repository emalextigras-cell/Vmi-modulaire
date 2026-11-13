/** Contrôle de plausibilité des capteurs. Les données sources ne sont jamais modifiées. */
export const isPlausibleHumidity = value =>
  !Number.isFinite(value) || (value >= 0 && value <= 100);

export const isPlausibleTemperature = value =>
  !Number.isFinite(value) || (value >= -30 && value <= 60);

const FIELDS = [
  { key: 'sh', label: 'Humidité salon', type: 'humidity' },
  { key: 'h1', label: 'Humidité sonde résistances', type: 'humidity' },
  { key: 'he', label: 'Humidité air entrant', type: 'humidity' },
  { key: 'st', label: 'Température salon', type: 'temperature' },
  { key: 't1', label: 'Température sonde résistances', type: 'temperature' },
  { key: 'te', label: 'Température air entrant', type: 'temperature' }
];

export function summarizeDataQuality(records) {
  const rows = Array.isArray(records) ? records : [];
  const fields = FIELDS.map(field => {
    const invalid = rows.filter(row => Number.isFinite(row?.[field.key]) &&
      !(field.type === 'humidity'
        ? isPlausibleHumidity(row[field.key])
        : isPlausibleTemperature(row[field.key])));
    return { ...field, count: invalid.length };
  }).filter(field => field.count > 0);
  const affected = new Set();
  for (const field of FIELDS) {
    rows.forEach((row, index) => {
      const value = row?.[field.key];
      if (!Number.isFinite(value)) return;
      const valid = field.type === 'humidity'
        ? isPlausibleHumidity(value)
        : isPlausibleTemperature(value);
      if (!valid) affected.add(index);
    });
  }
  return {
    total: rows.length,
    affectedRecords: affected.size,
    fields,
    hasAnomalies: affected.size > 0
  };
}
