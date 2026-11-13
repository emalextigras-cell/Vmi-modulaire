/** Analyses statistiques communes (sans effet sur les commandes VMI). */
import { absoluteHumidity } from './psychrometry.js';

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
    Number.isFinite(r.sh) && Number.isFinite(r.st)
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
