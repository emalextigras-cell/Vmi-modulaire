/** Suivi des index kWh relevés sur des compteurs électriques externes. */
export const ENERGY_METER_TYPES = Object.freeze(['ventilation', 'preheating', 'total']);

export const ENERGY_METER_LABELS = Object.freeze({
  ventilation: 'Ventilation (compteur dédié)',
  preheating: 'Préchauffage (compteur dédié)',
  total: 'Total VMI (compteur global)'
});

export function isValidEnergyReading(reading) {
  return !!reading &&
    typeof reading.id === 'string' && reading.id.length > 0 &&
    ENERGY_METER_TYPES.includes(reading.meterType) &&
    Number.isFinite(reading.t) && reading.t > 0 &&
    Number.isFinite(reading.kwh) && reading.kwh >= 0 &&
    (reading.note == null || typeof reading.note === 'string');
}

/** Ajoute ou corrige un index pour le même compteur au même instant. */
export function upsertEnergyReading(readings, reading) {
  if (!isValidEnergyReading(reading)) {
    throw new TypeError('Relevé invalide : compteur, date et index kWh sont obligatoires.');
  }
  const current = Array.isArray(readings) ? readings.filter(isValidEnergyReading) : [];
  const next = current.filter(item => !(item.meterType === reading.meterType && item.t === reading.t));
  next.push({ ...reading, note: String(reading.note || '').trim().slice(0, 240) });
  return next.sort((a, b) => a.t - b.t || a.meterType.localeCompare(b.meterType));
}

/** Calcule uniquement les écarts entre deux index successifs d'un même compteur. */
export function summarizeEnergyReadings(readings) {
  const valid = (Array.isArray(readings) ? readings : []).filter(isValidEnergyReading);
  const meters = ENERGY_METER_TYPES.map(meterType => {
    const byTimestamp = new Map();
    for (const reading of valid.filter(item => item.meterType === meterType).sort((a, b) => a.t - b.t)) {
      // En cas de doublon issu d'une sauvegarde, le dernier relevé de la liste prévaut.
      byTimestamp.set(reading.t, reading);
    }
    const rows = [...byTimestamp.values()].sort((a, b) => a.t - b.t);
    const intervals = [];
    for (let index = 1; index < rows.length; index++) {
      const previous = rows[index - 1], current = rows[index];
      const elapsedHours = (current.t - previous.t) / 3600000;
      const deltaKwh = current.kwh - previous.kwh;
      if (!(elapsedHours > 0)) continue;
      if (deltaKwh < 0) {
        intervals.push({
          from: previous.t, to: current.t, elapsedHours,
          previousKwh: previous.kwh, currentKwh: current.kwh,
          deltaKwh: null, averagePowerW: null, status: 'counter-decreased'
        });
        continue;
      }
      intervals.push({
        from: previous.t, to: current.t, elapsedHours,
        previousKwh: previous.kwh, currentKwh: current.kwh,
        deltaKwh, averagePowerW: deltaKwh * 1000 / elapsedHours,
        status: 'measured'
      });
    }
    const measured = intervals.filter(interval => interval.status === 'measured');
    return {
      meterType, label: ENERGY_METER_LABELS[meterType],
      readingCount: rows.length,
      firstAt: rows.length ? rows[0].t : null,
      lastAt: rows.length ? rows[rows.length - 1].t : null,
      measuredIntervalCount: measured.length,
      totalKwh: measured.reduce((sum, interval) => sum + interval.deltaKwh, 0),
      intervals
    };
  }).filter(meter => meter.readingCount > 0);
  return {
    readingCount: valid.length,
    meters,
    limits: [
      'Les kWh et puissances moyennes proviennent uniquement des index saisis depuis un compteur électrique externe.',
      'La puissance moyenne est calculée entre deux relevés : ce n’est pas une mesure instantanée.',
      'Une baisse d’index est signalée comme une remise à zéro ou un changement de compteur ; aucun delta n’est calculé sur cet intervalle.',
      'Les compteurs ventilation, préchauffage et total restent séparés. Ne pas additionner un compteur global avec ses sous-compteurs.',
      'Un compteur global ne permet pas de séparer la ventilation du préchauffage.'
    ]
  };
}
