import { absoluteHumidity } from './psychrometry.js';

/**
 * Estimation indicative de l'énergie électrique du ventilateur PUREVENT.
 * Les puissances proviennent des points de mesure constructeur TÜV SÜD.
 * La méthode interpole selon le débit, sans extrapoler hors de 50–350 m³/h.
 * La pression réelle de l'installation n'étant pas mesurée, ce résultat n'est
 * ni une mesure électrique ni une garantie de la puissance réellement absorbée.
 */
export const PUREVENT_FAN_POWER_POINTS = Object.freeze([
  Object.freeze({ flow: 50, powerW: 4 }),
  Object.freeze({ flow: 125, powerW: 10 }),
  Object.freeze({ flow: 200, powerW: 25 }),
  Object.freeze({ flow: 245, powerW: 39 }),
  Object.freeze({ flow: 350, powerW: 99 })
]);

export function estimateFanPowerFromFlow(flow) {
  if (!Number.isFinite(flow)) return null;
  const points = PUREVENT_FAN_POWER_POINTS;
  if (flow < points[0].flow || flow > points[points.length - 1].flow) return null;
  for (let index = 1; index < points.length; index++) {
    const upper = points[index];
    if (flow > upper.flow) continue;
    const lower = points[index - 1];
    const ratio = (flow - lower.flow) / (upper.flow - lower.flow);
    return lower.powerW + ratio * (upper.powerW - lower.powerW);
  }
  return points[points.length - 1].powerW;
}

/**
 * Intègre une puissance estimée entre relevés successifs.
 * Les intervalles > maxGapHours et les débits hors domaine constructeur
 * sont exclus, sans interpolation à travers les trous.
 */
export function summarizeFanEnergyEstimate(history, { maxGapHours = 2 } = {}) {
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => Number.isFinite(row?.t))
    .sort((a, b) => a.t - b.t);
  const unique = [];
  for (const row of rows) {
    if (unique.length && unique[unique.length - 1].t === row.t) unique[unique.length - 1] = row;
    else unique.push(row);
  }
  const sampleCount = unique.length;
  const firstAt = sampleCount ? unique[0].t : null;
  const lastAt = sampleCount ? unique[sampleCount - 1].t : null;
  const observedHours = sampleCount > 1 ? (lastAt - firstAt) / 3600000 : 0;
  const maxGapMs = maxGapHours * 3600000;
  let energyWh = 0, coveredMs = 0, acceptedIntervalCount = 0;
  let longGapCount = 0, invalidFlowIntervalCount = 0;
  for (let index = 1; index < unique.length; index++) {
    const a = unique[index - 1], b = unique[index];
    const elapsedMs = b.t - a.t;
    if (!(elapsedMs > 0)) continue;
    if (elapsedMs > maxGapMs) { longGapCount++; continue; }
    const powerA = estimateFanPowerFromFlow(a.debit);
    const powerB = estimateFanPowerFromFlow(b.debit);
    if (powerA == null || powerB == null) { invalidFlowIntervalCount++; continue; }
    energyWh += ((powerA + powerB) / 2) * (elapsedMs / 3600000);
    coveredMs += elapsedMs;
    acceptedIntervalCount++;
  }
  const coveredHours = coveredMs / 3600000;
  const coveragePercent = observedHours > 0 ? coveredHours / observedHours * 100 : 0;
  return {
    status: acceptedIntervalCount ? 'estimated' : 'insufficient-data',
    sampleCount, firstAt, lastAt, observedHours, coveredHours, coveragePercent,
    acceptedIntervalCount, longGapCount, invalidFlowIntervalCount,
    estimatedWh: acceptedIntervalCount ? energyWh : null,
    estimatedKwh: acceptedIntervalCount ? energyWh / 1000 : null,
    averagePowerW: coveredHours > 0 ? energyWh / coveredHours : null,
    maxGapHours,
    limits: [
      'Estimation du ventilateur uniquement, par interpolation linéaire des points de puissance constructeur en fonction du débit exporté.',
      'Les mesures constructeur sont associées à des pressions données ; la pression réelle de cette installation n’est pas mesurée ici.',
      'Les intervalles de plus de ' + maxGapHours + ' h et les débits hors plage 50–350 m³/h sont exclus, sans extrapolation.',
      'Le préchauffage n’est pas estimé : aucun état ni temps de fonctionnement exploitable n’est confirmé dans les champs CSV disponibles.',
      'La consommation totale de la VMI ne peut donc pas être calculée à partir de ces seules données.'
    ]
  };
}

function medianEstimate(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Ventile l'estimation entre niveaux manuels confirmés (1/2/3).
 * Un intervalle n'est attribué à un mode que si ses deux extrémités
 * portent le même vmiModeRaw. Les changements de mode sont ignorés.
 * La puissance moyenne affichée est la médiane des moyennes journalières,
 * pour éviter qu'une journée très échantillonnée pèse davantage.
 */
export function summarizeFanEnergyByManualMode(history, { maxGapHours = 2, minDays = 2 } = {}) {
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => Number.isFinite(row?.t))
    .sort((a, b) => a.t - b.t);
  const unique = [];
  for (const row of rows) {
    if (unique.length && unique[unique.length - 1].t === row.t) unique[unique.length - 1] = row;
    else unique.push(row);
  }
  const groups = [1, 2, 3].map(mode => ({
    mode, energyWh: 0, coveredMs: 0, candidateMs: 0,
    intervalCount: 0, longGapCount: 0, invalidFlowIntervalCount: 0,
    climate: Object.fromEntries(['indoorTemp','outdoorTemp','incomingTemp','indoorAbsHumidity','incomingAbsHumidity','deltaAbsHumidity'].map(key => [key, { sum: 0, hours: 0 }])),
    daily: new Map()
  }));
  const byMode = new Map(groups.map(group => [group.mode, group]));
  const maxGapMs = maxGapHours * 3600000;
  let transitionIntervalCount = 0;
  for (let index = 1; index < unique.length; index++) {
    const a = unique[index - 1], b = unique[index];
    const elapsedMs = b.t - a.t;
    if (!(elapsedMs > 0)) continue;
    const mode = a.vmiModeRaw;
    if (![1, 2, 3].includes(mode) || b.vmiModeRaw !== mode) {
      if ([1, 2, 3].includes(mode) || [1, 2, 3].includes(b.vmiModeRaw)) transitionIntervalCount++;
      continue;
    }
    const group = byMode.get(mode);
    group.candidateMs += elapsedMs;
    if (elapsedMs > maxGapMs) { group.longGapCount++; continue; }
    const powerA = estimateFanPowerFromFlow(a.debit);
    const powerB = estimateFanPowerFromFlow(b.debit);
    if (powerA == null || powerB == null) { group.invalidFlowIntervalCount++; continue; }
    const hours = elapsedMs / 3600000;
    const wh = ((powerA + powerB) / 2) * hours;
    group.energyWh += wh;
    group.coveredMs += elapsedMs;
    group.intervalCount++;
    const climateValues = row => {
      const temp = value => Number.isFinite(value) && value >= -30 && value <= 60;
      const rh = value => Number.isFinite(value) && value >= 0 && value <= 100;
      const indoorAbsHumidity = temp(row.st) && rh(row.sh) ? absoluteHumidity(row.st, row.sh) : null;
      const incomingAbsHumidity = temp(row.te) && rh(row.he) ? absoluteHumidity(row.te, row.he) : null;
      return {
        indoorTemp: temp(row.st) ? row.st : null,
        outdoorTemp: temp(row.tExt) ? row.tExt : null,
        incomingTemp: temp(row.te) ? row.te : null,
        indoorAbsHumidity,
        incomingAbsHumidity,
        deltaAbsHumidity: indoorAbsHumidity != null && incomingAbsHumidity != null ? indoorAbsHumidity - incomingAbsHumidity : null
      };
    };
    const climateA = climateValues(a), climateB = climateValues(b);
    for (const key of Object.keys(group.climate)) {
      if (Number.isFinite(climateA[key]) && Number.isFinite(climateB[key])) {
        group.climate[key].sum += ((climateA[key] + climateB[key]) / 2) * hours;
        group.climate[key].hours += hours;
      }
    }
    const midpoint = new Date(a.t + elapsedMs / 2);
    const dayKey = [midpoint.getFullYear(), String(midpoint.getMonth() + 1).padStart(2, '0'), String(midpoint.getDate()).padStart(2, '0')].join('-');
    const daily = group.daily.get(dayKey) || { wh: 0, hours: 0 };
    daily.wh += wh;
    daily.hours += hours;
    group.daily.set(dayKey, daily);
  }
  const results = groups.map(group => {
    const coveredHours = group.coveredMs / 3600000;
    const candidateHours = group.candidateMs / 3600000;
    const dailyPowers = [...group.daily.values()].filter(day => day.hours > 0).map(day => day.wh / day.hours);
    const dayCount = dailyPowers.length;
    return {
      mode: group.mode,
      status: group.intervalCount ? (dayCount >= minDays ? 'comparable' : 'insufficient-days') : 'insufficient-data',
      estimatedKwh: group.intervalCount ? group.energyWh / 1000 : null,
      coveredHours, candidateHours,
      coveragePercent: candidateHours > 0 ? coveredHours / candidateHours * 100 : 0,
      weightedAveragePowerW: coveredHours > 0 ? group.energyWh / coveredHours : null,
      medianDailyAveragePowerW: medianEstimate(dailyPowers),
      climate: Object.fromEntries(Object.entries(group.climate).map(([key, item]) => [key, item.hours > 0 ? item.sum / item.hours : null])),
      climateCoverageHours: Object.fromEntries(Object.entries(group.climate).map(([key, item]) => [key, item.hours])),
      dayCount, intervalCount: group.intervalCount,
      longGapCount: group.longGapCount,
      invalidFlowIntervalCount: group.invalidFlowIntervalCount
    };
  });
  return {
    groups: results,
    hasManualModeData: unique.some(row => [1, 2, 3].includes(row.vmiModeRaw)),
    transitionIntervalCount,
    maxGapHours, minDays,
    limits: [
      'Seuls les niveaux manuels 1, 2 et 3 du champ Mode sont utilisés ; les codes bruts VMI+ ne sont jamais substitués.',
      'Les intervalles qui traversent un changement de mode, dépassent ' + maxGapHours + ' h ou ont un débit hors plage constructeur sont exclus.',
      'La puissance moyenne par mode est la médiane des moyennes journalières ; elle reste descriptive et non causale.',
      'L’estimation concerne uniquement le ventilateur, pas le préchauffage ni la consommation totale de la VMI.'
    ]
  };
}
