import { absoluteHumidity } from './psychrometry.js';

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

/**
 * Regroupe les intervalles mesurés par mois civil.
 * Un intervalle qui traverse deux mois n'est jamais réparti artificiellement :
 * il est comptabilisé à part et exclu des totaux mensuels.
 */
export function summarizeMonthlyEnergyReadings(readings) {
  const summary = summarizeEnergyReadings(readings);
  return summary.meters.map(meter => {
    const months = new Map();
    let crossMonthIntervalCount = 0;
    let crossMonthKwh = 0;
    for (const interval of meter.intervals) {
      if (interval.status !== 'measured') continue;
      const from = new Date(interval.from);
      const to = new Date(interval.to);
      const fromKey = String(from.getFullYear()) + '-' + String(from.getMonth() + 1).padStart(2, '0');
      const toKey = String(to.getFullYear()) + '-' + String(to.getMonth() + 1).padStart(2, '0');
      if (fromKey !== toKey) {
        crossMonthIntervalCount++;
        crossMonthKwh += interval.deltaKwh;
        continue;
      }
      if (!months.has(fromKey)) {
        months.set(fromKey, {
          month: fromKey, energyKwh: 0, intervalCount: 0,
          firstAt: interval.from, lastAt: interval.to
        });
      }
      const month = months.get(fromKey);
      month.energyKwh += interval.deltaKwh;
      month.intervalCount++;
      month.firstAt = Math.min(month.firstAt, interval.from);
      month.lastAt = Math.max(month.lastAt, interval.to);
    }
    return {
      meterType: meter.meterType,
      label: meter.label,
      months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      crossMonthIntervalCount,
      crossMonthKwh
    };
  }).filter(meter => meter.months.length || meter.crossMonthIntervalCount);
}


/**
 * Met en regard chaque intervalle électrique mesuré avec les observations
 * hygrométriques et thermiques qui le recouvrent réellement.
 *
 * Les segments d'historique sont intégrés par interpolation linéaire seulement
 * entre deux relevés espacés d'au plus maxGapHours. Aucun prolongement avant
 * le premier relevé, après le dernier, ni comblement des grands trous.
 */
const assertValidEnergyClimateOptions = (maxGapHours, minCoveredHours, minCoveragePercent) => {
  const maxGapMs = maxGapHours * 3600000;
  if (!Number.isFinite(maxGapHours) || maxGapHours <= 0 ||
      !Number.isFinite(maxGapMs) || maxGapMs <= 0) {
    throw new RangeError('maxGapHours doit être un nombre fini strictement positif exploitable en millisecondes.');
  }
  if (!Number.isFinite(minCoveredHours) || minCoveredHours < 0) {
    throw new RangeError('minCoveredHours doit être un nombre fini positif ou nul.');
  }
  if (!Number.isFinite(minCoveragePercent) || minCoveragePercent < 0 || minCoveragePercent > 100) {
    throw new RangeError('minCoveragePercent doit être un pourcentage fini compris entre 0 et 100.');
  }
};

/**
 * Met en regard chaque intervalle électrique mesuré avec les observations
 * hygrométriques et thermiques qui le recouvrent réellement.
 *
 * Les segments d'historique sont intégrés par interpolation linéaire seulement
 * entre deux relevés espacés d'au plus maxGapHours. Aucun prolongement avant
 * le premier relevé, après le dernier, ni comblement des grands trous.
 */
export function summarizeEnergyClimateContext(readings, history, options = {}) {
  const {
    maxGapHours = 2,
    minCoveredHours = 3,
    minCoveragePercent = 50
  } = options ?? {};
  assertValidEnergyClimateOptions(maxGapHours, minCoveredHours, minCoveragePercent);
  const summary = summarizeEnergyReadings(readings);
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => Number.isFinite(row?.t))
    .sort((a, b) => a.t - b.t);
  const maxGapMs = maxGapHours * 3600000;

  const valuesFor = row => {
    const validTemp = value => Number.isFinite(value) && value >= -30 && value <= 60;
    const validRh = value => Number.isFinite(value) && value >= 0 && value <= 100;
    const indoorAbs = validTemp(row.st) && validRh(row.sh)
      ? absoluteHumidity(row.st, row.sh) : null;
    const incomingAbs = validTemp(row.te) && validRh(row.he)
      ? absoluteHumidity(row.te, row.he) : null;
    return {
      indoorTemp: validTemp(row.st) ? row.st : null,
      outdoorTemp: validTemp(row.tExt) ? row.tExt : null,
      indoorRH: validRh(row.sh) ? row.sh : null,
      incomingTemp: validTemp(row.te) ? row.te : null,
      incomingRH: validRh(row.he) ? row.he : null,
      indoorAbsHumidity: indoorAbs,
      incomingAbsHumidity: incomingAbs,
      deltaAbsHumidity: indoorAbs != null && incomingAbs != null
        ? indoorAbs - incomingAbs : null
    };
  };
  const metricKeys = [
    'indoorTemp', 'outdoorTemp', 'indoorRH', 'incomingTemp', 'incomingRH',
    'indoorAbsHumidity', 'incomingAbsHumidity', 'deltaAbsHumidity'
  ];
  const interpolate = (a, b, ratio) => a + (b - a) * ratio;

  const measureContext = interval => {
    const sums = Object.fromEntries(metricKeys.map(key => [key, 0]));
    const coverage = Object.fromEntries(metricKeys.map(key => [key, 0]));
    for (let index = 1; index < rows.length; index++) {
      const first = rows[index - 1], second = rows[index];
      const gap = second.t - first.t;
      if (!(gap > 0) || gap > maxGapMs) continue;
      const start = Math.max(interval.from, first.t);
      const end = Math.min(interval.to, second.t);
      if (!(end > start)) continue;
      const a = valuesFor(first), b = valuesFor(second);
      const startRatio = (start - first.t) / gap;
      const endRatio = (end - first.t) / gap;
      const duration = end - start;
      for (const key of metricKeys) {
        if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue;
        const atStart = interpolate(a[key], b[key], startRatio);
        const atEnd = interpolate(a[key], b[key], endRatio);
        sums[key] += ((atStart + atEnd) / 2) * duration;
        coverage[key] += duration;
      }
    }
    const means = Object.fromEntries(metricKeys.map(key => [
      key, coverage[key] > 0 ? sums[key] / coverage[key] : null
    ]));
    const durationMs = interval.to - interval.from;
    const climateCoverageMs = coverage.deltaAbsHumidity;
    const coverageHours = climateCoverageMs / 3600000;
    const coveragePercent = durationMs > 0 ? climateCoverageMs / durationMs * 100 : 0;
    return {
      ...means,
      coverageHours,
      coveragePercent,
      coveredMs: climateCoverageMs,
      ready: coverageHours >= minCoveredHours && coveragePercent >= minCoveragePercent,
      metricCoverageHours: Object.fromEntries(metricKeys.map(key => [
        key, coverage[key] / 3600000
      ]))
    };
  };

  const meters = summary.meters.map(meter => ({
    meterType: meter.meterType,
    label: meter.label,
    intervals: meter.intervals
      .filter(interval => interval.status === 'measured')
      .map(interval => ({
        ...interval,
        context: measureContext(interval)
      }))
  }));
  return {
    meters,
    historySampleCount: rows.length,
    maxGapHours,
    minCoveredHours,
    minCoveragePercent,
    matchedIntervalCount: meters.reduce((sum, meter) =>
      sum + meter.intervals.filter(interval => interval.context.ready).length, 0),
    measuredIntervalCount: meters.reduce((sum, meter) => sum + meter.intervals.length, 0),
    limits: [
      'La comparaison utilise uniquement les portions d’historique réellement comprises entre les deux index du compteur.',
      'Les trous de plus de ' + maxGapHours + ' h ne sont pas comblés et aucune donnée n’est extrapolée hors de la période observée.',
      'La couverture est calculée sur les mesures nécessaires à l’écart d’humidité absolue intérieur / air entrant.',
      'Une moyenne sur un intervalle ne décrit pas les variations instantanées et ne démontre pas de lien de causalité.',
      'Un compteur global décrit l’ensemble de la VMI ; il ne permet pas d’isoler ventilation et préchauffage.'
    ]
  };
}
