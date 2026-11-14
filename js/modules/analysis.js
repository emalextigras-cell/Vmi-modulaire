/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { absoluteHumidity } from './psychrometry.js';
import { isPlausibleHumidity, isPlausibleTemperature } from './data-quality.js';

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
}

/**
 * Compare uniquement les niveaux manuels 1/2/3 déjà identifiés dans les relevés.
 * Les valeurs brutes importées de VMI+ ne sont pas assimilées à ces niveaux.
 */
export function analyzeSpeedLevels(data, minSamples = 10, targetRH = 50) {
  const rows = data.filter(r =>
    Number.isFinite(r.vit) && r.vit >= 1 && r.vit <= 3 &&
    Number.isFinite(r.sh) && isPlausibleHumidity(r.sh) && Number.isFinite(r.st) && isPlausibleTemperature(r.st)
  );
  const groups = [1,2,3].map(v => {
    const samples = rows.filter(r => r.vit === v);
    return {
      v,
      n: samples.length,
      rh: median(samples.map(r => r.sh)),
      ha: median(samples.map(r => absoluteHumidity(r.st, r.sh))),
      delta: median(samples.map(r => {
        const inside = absoluteHumidity(r.st, r.sh);
        const incoming = absoluteHumidity(r.te, r.he);
        return inside != null && incoming != null ? inside - incoming : null;
      }))
    };
  });
  const sufficient = groups.filter(g => g.n >= minSamples);
  let status = 'no-speed-data';
  let bestSpeed = null;
  if (rows.length) {
    status = sufficient.length ? 'no-level-meets-target' : 'insufficient';
    const eligible = sufficient
      .filter(g => g.rh != null && g.rh <= targetRH)
      .sort((x,y) => x.v-y.v);
    if (eligible.length) {
      status = 'best-found';
      bestSpeed = eligible[0].v;
    }
  }
  return { groups, status, bestSpeed, minSamples, targetRH, sampleCount: rows.length };
}

/**
 * Analyse la différence d'humidité absolue salon - air entrant dans le temps.
 * Les durées sont estimées entre deux mesures successives par interpolation
 * du delta. Les intervalles supérieurs à maxGapHours ne sont jamais extrapolés.
 */
export function analyzeHygrometricPeriods(data, { threshold = 1, maxGapHours = 2 } = {}) {
  const rows = (Array.isArray(data) ? data : [])
    .filter(r => Number.isFinite(r?.t) &&
      Number.isFinite(r.st) && isPlausibleTemperature(r.st) &&
      Number.isFinite(r.sh) && isPlausibleHumidity(r.sh) &&
      Number.isFinite(r.te) && isPlausibleTemperature(r.te) &&
      Number.isFinite(r.he) && isPlausibleHumidity(r.he))
    .map(r => ({
      t: r.t,
      delta: absoluteHumidity(r.st, r.sh) - absoluteHumidity(r.te, r.he)
    }))
    .filter(r => Number.isFinite(r.delta))
    .sort((a, b) => a.t - b.t);

  const result = {
    sampleCount: rows.length,
    intervalCount: 0,
    gapCount: 0,
    medianDelta: median(rows.map(r => r.delta)),
    threshold,
    maxGapHours,
    observedDurationMs: 0,
    dryDurationMs: 0,
    humidDurationMs: 0,
    neutralDurationMs: 0,
    longestDryMs: 0,
    longestHumidMs: 0
  };
  if (rows.length < 2) return result;

  const maxGapMs = maxGapHours * 60 * 60 * 1000;
  let streak = null;
  const closeStreak = () => {
    if (!streak) return;
    if (streak.category === 'dry') result.longestDryMs = Math.max(result.longestDryMs, streak.duration);
    if (streak.category === 'humid') result.longestHumidMs = Math.max(result.longestHumidMs, streak.duration);
    streak = null;
  };

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1], current = rows[i];
    const duration = current.t - previous.t;
    if (!(duration > 0)) continue;
    if (duration > maxGapMs) {
      result.gapCount++;
      closeStreak();
      continue;
    }

    const delta = (previous.delta + current.delta) / 2;
    const category = delta > threshold ? 'dry' : delta < -threshold ? 'humid' : 'neutral';
    result.intervalCount++;
    result.observedDurationMs += duration;
    if (category === 'dry') result.dryDurationMs += duration;
    else if (category === 'humid') result.humidDurationMs += duration;
    else result.neutralDurationMs += duration;

    if (streak && streak.category === category && streak.end === previous.t) {
      streak.duration += duration;
      streak.end = current.t;
    } else {
      closeStreak();
      streak = { category, duration, end: current.t };
    }
  }
  closeStreak();
  return result;
}
