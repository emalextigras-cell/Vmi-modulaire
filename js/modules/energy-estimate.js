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
