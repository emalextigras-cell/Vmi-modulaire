/** Correction des dates d'historique lorsque l'horloge interne de la VMI est erronée. */
import { DAY, MIN_VALID } from './date-utils.js';

const dayNumber = timestamp => {
  const d = new Date(timestamp);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

const modeOf = values => {
  const counts = new Map();
  let best, bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
};

/**
 * Corrige en place les relevés antérieurs à MIN_VALID à partir du compteur
 * « jours de fonctionnement ». Retourne { fixed, kept }, comme la v13.
 * Les règles de regroupement et le seuil horaire sont volontairement conservés.
 */
export function fixClock(records, history = [], minValid = MIN_VALID) {
  const known = history.concat(records).filter(record =>
    record.t >= minValid &&
    Number.isFinite(record.d) &&
    new Date(record.t).getHours() >= 10
  );
  const epochOffset = modeOf(known.map(record => dayNumber(record.t) - record.d));
  const bad = records.filter(record => record.t < minValid).sort((a, b) => a.t - b.t);
  let fixed = 0;

  if (epochOffset !== undefined && bad.length) {
    const episodes = [];
    let current = [];
    for (const record of bad) {
      if (current.length && record.t - current[current.length - 1].t > 3 * DAY) {
        episodes.push(current);
        current = [];
      }
      current.push(record);
    }
    if (current.length) episodes.push(current);

    for (const episode of episodes) {
      const offset = modeOf(episode
        .filter(record => Number.isFinite(record.d) && new Date(record.t).getHours() >= 10)
        .map(record => epochOffset + record.d - dayNumber(record.t)));
      if (offset === undefined) continue;

      for (const record of episode) {
        const date = new Date(record.t);
        record.t = new Date(
          date.getFullYear(), date.getMonth(), date.getDate() + offset,
          date.getHours(), date.getMinutes(), date.getSeconds()
        ).getTime();
        record.fixed = true;
        fixed++;
      }
    }
  }

  return { fixed, kept: records.filter(record => record.t >= minValid) };
}
