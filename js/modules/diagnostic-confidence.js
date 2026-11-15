/** Présentation explicable de la robustesse des données du diagnostic. */
export function formatDiagnosisConfidence(result, formatNumber = value =>
  Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
) {
  const basis = result?.confidenceBasis || {};
  const number = value => formatNumber(Number.isFinite(value) ? value : 0);
  const coverage = Number.isFinite(basis.observedCoveragePercent)
    ? number(basis.observedCoveragePercent) + ' %'
    : 'indisponible';
  const accepted = Number.isFinite(basis.acceptedSampleShare)
    ? number(basis.acceptedSampleShare * 100) + ' %'
    : 'indisponible';
  const minimumDailySamples = Number.isFinite(basis.minimumDailySamples)
    ? basis.minimumDailySamples
    : 3;
  const daysWithEnoughSamples = Number.isFinite(basis.daysWithAtLeastThreeSamples)
    ? basis.daysWithAtLeastThreeSamples
    : 0;
  return 'Robustesse des données : ' + (result?.coverageLevel || 'indéterminée') +
    ' · ' + (Number.isFinite(result?.sampleCount) ? result.sampleCount : 0) + ' relevés valides' +
    ' · ' + (Number.isFinite(result?.dayCount) ? result.dayCount : 0) + ' jour(s)' +
    ' · ' + daysWithEnoughSamples + ' jour(s) avec au moins ' + minimumDailySamples + ' relevé(s)' +
    ' · ' + number(Number.isFinite(result?.observedHours) ? result.observedHours : 0) + ' h exploitables' +
    ' · couverture temporelle ' + coverage +
    ' · ' + accepted + ' des lignes retenues' +
    '. Ce niveau évalue la qualité de l’historique, pas l’état physique de la VMI.';
}
