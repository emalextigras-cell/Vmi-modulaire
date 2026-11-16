/** Construction des conseils explicables de l'assistant VMI. */
import { fmt, signed, percent, recommendation } from './assistant-format.js';

export function buildVmiRecommendations({ daily, periods, robustSpeedPair, diagnosis, level, quality, targetRH, seasonal, readyPairs }) {
const recommendations = [];
const humidityTrend = Number.isFinite(daily.changeAbsoluteHumidity)
  ? daily.changeAbsoluteHumidity < -0.3 ? 'improving'
    : daily.changeAbsoluteHumidity > 0.3 ? 'worsening' : 'stable'
  : 'insufficient';
const humidityText = humidityTrend === 'improving'
  ? 'L’humidité absolue intérieure baisse entre les deux dernières journées exploitables.'
  : humidityTrend === 'worsening'
    ? 'L’humidité absolue intérieure augmente entre les deux dernières journées exploitables.'
    : humidityTrend === 'stable'
      ? 'L’humidité absolue intérieure est globalement stable entre les deux dernières journées exploitables.'
      : 'Pas assez de journées exploitables pour juger l’évolution de l’humidité intérieure.';
const speedText = robustSpeedPair
  ? Math.abs(robustSpeedPair.difference) <= 0.3
    ? 'Les niveaux ' + robustSpeedPair.key + ' donnent des résultats proches sur les créneaux comparés.'
    : robustSpeedPair.difference < 0
      ? 'Le niveau ' + robustSpeedPair.key.split('/')[1] + ' présente une humidité absolue intérieure plus basse que le niveau ' + robustSpeedPair.key.split('/')[0] + ' sur les créneaux comparés.'
      : 'Le niveau ' + robustSpeedPair.key.split('/')[0] + ' présente une humidité absolue intérieure plus basse que le niveau ' + robustSpeedPair.key.split('/')[1] + ' sur les créneaux comparés.'
  : 'Pas encore assez de recul pour départager les vitesses : il faut au moins cinq jours communs sur deux créneaux horaires.';
const simpleObservedDuration = periods.observedDurationMs;
const simpleDryShare = simpleObservedDuration ? periods.dryDurationMs / simpleObservedDuration : null;
const simpleHumidShare = simpleObservedDuration ? periods.humidDurationMs / simpleObservedDuration : null;
const outdoorText = Number.isFinite(periods.medianDelta)
  ? periods.medianDelta > 1 && simpleDryShare >= 0.6
    ? 'L’air entrant a souvent été plus sec que l’air intérieur : les conditions étaient plutôt favorables à l’assèchement.'
    : periods.medianDelta < -1 && simpleHumidShare >= 0.6
      ? 'L’air entrant a souvent été plus humide que l’air intérieur : la ventilation ne pouvait pas forcément assécher l’air.'
      : 'Les conditions hygrométriques extérieures ont été variables ou proches de l’intérieur.'
  : 'Les mesures extérieures sont insuffisantes pour expliquer les variations.';
recommendations.push(recommendation(
  'information',
  'Bilan simple de la période',
  humidityText + ' ' + speedText + ' ' + outdoorText,
  'Ce bilan décrit les relevés disponibles. Il ne prouve pas que la vitesse est la cause d’une évolution : météo, occupation et apports d’humidité peuvent aussi intervenir.'
));
if (diagnosis.status !== 'analysis-available' || level === 'faible') {
  recommendations.push(recommendation(
    'prioritaire', 'Consolider l’historique',
    'Garde un réglage stable plusieurs jours et laisse l’application accumuler des relevés avant de tirer une conclusion.',
    'La couverture ou le nombre de journées valides ne permet pas encore un diagnostic robuste.'
  ));
}
if (quality.affectedRecords) {
  recommendations.push(recommendation(
    'à vérifier', 'Contrôler les valeurs hors limites',
    'Repère les dates et les sondes concernées dans « Fiabilité des données ». Compare-les aux conditions réelles ; ne conclus à un défaut que si les écarts se répètent.',
    quality.affectedRecords + ' relevé(s) contiennent au moins une valeur hors des limites de plausibilité. Les pics isolés plausibles restent signalés dans les détails, sans déclencher à eux seuls une alerte.'
  ));
}
const recentRH = daily.latest?.medianRH;
if (Number.isFinite(recentRH)) {
  if (recentRH > targetRH + 5) {
    recommendations.push(recommendation(
      'à examiner', 'Chercher d’abord les apports d’humidité',
      'Avant d’augmenter une vitesse, vérifie les sources de vapeur d’eau (douches, cuisson, séchage), les entrées et sorties d’air et l’état du filtre.',
      'La médiane des derniers relevés valides du salon est de ' + fmt(recentRH) +
        ' % HR, au-dessus de l’objectif configuré de ' + targetRH + ' %.'
    ));
  } else if (recentRH < targetRH - 5) {
    recommendations.push(recommendation(
      'information', 'Éviter une hausse de vitesse sans autre motif',
      'L’humidité récente est sous l’objectif configuré. Ne modifie pas la vitesse uniquement pour faire baisser l’humidité.',
      'La médiane récente est de ' + fmt(recentRH) + ' % HR pour un objectif de ' + targetRH + ' %.'
    ));
  }
}
const observedDuration = periods.observedDurationMs;
const dryShare = observedDuration ? periods.dryDurationMs / observedDuration : null;
const humidShare = observedDuration ? periods.humidDurationMs / observedDuration : null;
if (Number.isFinite(periods.medianDelta) && periods.medianDelta < -1 && humidShare >= 0.6) {
  recommendations.push(recommendation(
    'à examiner', 'Tenir compte de l’humidité de l’air entrant',
    'Quand l’air extérieur entrant est plus humide en valeur absolue, augmenter la ventilation ne garantit pas un assèchement. Surveille l’évolution intérieure et les conditions météo.',
    'L’air entrant a été plus humide pendant ' + percent(humidShare * 100) +
      ' des durées observées ; écart médian salon − air entrant : ' +
      signed(periods.medianDelta, 'g/m³') + '.'
  ));
} else if (Number.isFinite(periods.medianDelta) && periods.medianDelta > 1 && dryShare >= 0.6) {
  recommendations.push(recommendation(
    'favorable', 'Profiter du potentiel d’assèchement mesuré',
    'Les conditions hygrométriques sont souvent favorables au renouvellement asséchant. Vérifie néanmoins la température, le confort et l’évolution réelle de l’humidité avant tout changement.',
    'L’air entrant a été plus sec pendant ' + percent(dryShare * 100) +
      ' des durées observées ; cela décrit un potentiel, pas un résultat garanti.'
  ));
}
const currentSeason = seasonal.seasons.find(item => item.season === seasonal.currentSeason);
if (currentSeason?.enough && currentSeason.opportunityDayCount > 0) {
  recommendations.push(recommendation(
    'opportunité', 'Examiner la surventilation manuelle',
    seasonal.currentSeason === 'été'
      ? 'Lors des nuits où l’extérieur est plus frais, vérifie les températures et l’humidité absolue puis active la surventilation manuellement si le confort le permet.'
      : seasonal.currentSeason === 'hiver'
        ? 'Lors des journées où l’extérieur est plus chaud, vérifie les températures et l’humidité absolue puis active la surventilation manuellement si cela reste confortable.'
        : 'Compare les conditions mesurées avant toute activation manuelle.',
    currentSeason.opportunityDayCount + ' jour(s) avec un écart thermique d’au moins deux degrés ont été repérés dans les données saisonnières.'
  ));
}
if (readyPairs.length) {
  const examples = readyPairs.slice(0, 2).map(item =>
    item.label + ' (niveaux ' + item.speeds.join('/') + ', ' +
    item.sharedDayCount + ' jours communs, écart HA ' +
    signed(item.medianDeltaHADifference, 'g/m³') + ')'
  );
  recommendations.push(recommendation(
    'méthode', 'Examiner les comparaisons de vitesses disponibles',
    'Une comparaison horaire répond aux critères de dates communes et d’effectifs. Consulte les résultats détaillés avant de modifier un réglage ; ils ne désignent pas une vitesse optimale.',
    examples.join(' ; ') + '. Les différences de météo, d’occupation et d’apports d’humidité ne sont pas neutralisées.'
  ));
}

if (!recommendations.length) {
  recommendations.push(recommendation(
    'information', 'Poursuivre la surveillance',
    'Aucun point ne demande actuellement une intervention particulière selon les règles de l’assistant. Continue à observer l’évolution avant de modifier les réglages.',
    'Les seuils de conseil ne déclenchent pas d’alerte prioritaire sur la période analysée ; cela ne constitue pas une certification du fonctionnement de la VMI.'
  ));
}


  return recommendations;
}
