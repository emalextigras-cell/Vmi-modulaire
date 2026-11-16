/** Estimation de la durée de rétention de l'historique limité de la VMI. */
export function estimateHistoryRetention(records, {
  now = Date.now(),
  minValid = 0,
  dayMs = 24 * 60 * 60 * 1000,
  capacity = 800
} = {}) {
  const rows = records.filter(record => record.t >= minValid);
  if (!rows.length) return null;

  const newest = rows[rows.length - 1].t;
  const ageDays = (now - newest) / dayMs;
  const spanDays = Math.max(1, Math.min(14, (newest - rows[0].t) / dayMs));
  const recentCount = rows.filter(record => record.t >= newest - 14 * dayMs).length;
  const perDay = recentCount / spanDays;
  const capacityDays = perDay > 0
    ? Math.min(60, Math.max(7, capacity / perDay))
    : 28;

  return {
    newest,
    ageDays,
    spanDays,
    recentCount,
    recordsPerDay: perDay,
    capacityDays,
    daysRemaining: capacityDays - ageDays,
    deadline: newest + capacityDays * dayMs
  };
}
