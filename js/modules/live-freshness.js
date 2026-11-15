/** Présentation de la fraîcheur des flux reçus en direct, sans interpréter leur contenu. */
function ageLabel(timestamp, now, staleAfterMs) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "non reçues";
  const ageMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(ageMs / 1000);
  const age = seconds < 60
    ? `il y a ${seconds} s`
    : `il y a ${Math.floor(seconds / 60)} min`;
  return ageMs > staleAfterMs ? `anciennes (${age})` : `à jour (${age})`;
}

export function buildLiveFreshnessText(lastSeen = {}, now = Date.now(), staleAfterMs = 90000) {
  return [
    `Salon : ${ageLabel(lastSeen.salon, now, staleAfterMs)}`,
    `sondes : ${ageLabel(lastSeen.probes, now, staleAfterMs)}`,
    `état VMI : ${ageLabel(lastSeen.state, now, staleAfterMs)}`
  ].join(" · ") + ".";
}
