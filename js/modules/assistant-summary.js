/**
 * Assistant VMI local : synthèse pédagogique des analyses existantes.
 * Ce module ne pilote pas la VMI et ne remplace aucun calcul métier :
 * il réutilise les résultats des modules d'analyse déjà présents.
 */
import {
  buildHygrometricDiagnosis,
  analyzeHygrometricPeriods,
  summarizeDailyTrends,
  analyzeHourlyPatterns,
  detectRapidChanges,
  analyzeSpeedLevels,
  analyzeSpeedTimeContext,
  summarizeEnergyReadiness,
  summarizeOperatingReference,
  summarizeRawVmiMode,
  summarizeRawVmiSpeed,
  summarizeTemperatureLimit
} from './analysis.js';
import { summarizeDataQuality } from './data-quality.js';
import { analyzeSeasonalVentilation } from './seasonal-advice.js';
import {
  summarizeFanEnergyEstimate,
  summarizeFanEnergyByManualMode
} from './energy-estimate.js';
import { summarizeDailyEnergyClimateContext } from './energy-climate.js';
import { summarizeWeeklyDiagnostic } from './weekly-diagnostic.js';
import {
  summarizeEnergyReadings,
  summarizeMonthlyEnergyReadings,
  summarizeEnergyClimateContext
} from './energy-meter.js';
import { formatDiagnosisConfidence } from './diagnostic-confidence.js';

const fmt = (value, digits = 1) => Number.isFinite(value)
  ? Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits })
  : 'non disponible';
const signed = (value, unit, digits = 1) => Number.isFinite(value)
  ? (value > 0 ? '+' : '') + fmt(value, digits) + ' ' + unit
  : 'non disponible';
const dateLabel = timestamp => Number.isFinite(timestamp)
  ? new Date(timestamp).toLocaleDateString('fr-FR')
  : 'date inconnue';
const percent = value => Number.isFinite(value) ? fmt(value, 1) + ' %' : 'non disponible';
const duration = hours => {
  if (!Number.isFinite(hours)) return 'non disponible';
  if (hours < 1) return fmt(hours * 60, 0) + ' min';
  return fmt(hours) + ' h';
};
const section = (id, title, status, summary, details = []) => ({
  id, title, status, summary, details
});
const recommendation = (priority, title, text, reason) => ({
  priority, title, text, reason
});

/**
 * Produit une synthèse pour débutant à partir du même historique que les
 * panneaux d'analyse. Les résultats restent descriptifs et explicables.
 */
export function buildVmiAssistantSummary(data, options = {}) {
  const rows = Array.isArray(data) ? data : [];
  const targetRH = Number.isFinite(options.targetRH) && options.targetRH >= 0 && options.targetRH <= 100
    ? options.targetRH : 50;
  const minSamples = Number.isSafeInteger(options.minSamples) && options.minSamples > 0
    ? options.minSamples : 10;
  const meterReadings = Array.isArray(options.energyReadings) ? options.energyReadings : [];
  const meterHistory = Array.isArray(options.meterHistory) ? options.meterHistory : rows;

  if (!rows.length) {
    return {
      status: 'no-data',
      title: 'En attente de données historiques',
      overview: 'Je ne peux pas encore analyser le fonctionnement de la VMI : aucun relevé historique exploitable ne se trouve dans la période sélectionnée.',
      confidence: 'Aucune conclusion possible sans historique.',
      sections: [],
      recommendations: [
        recommendation('prioritaire', 'Charger un historique', 'Télécharge l’historique depuis la VMI ou importe un export VMI+ CSV.', 'Les graphiques et les diagnostics de cette application reposent sur les relevés historiques, pas uniquement sur la connexion Bluetooth en direct.')
      ],
      limits: [
        'Aucun réglage de la VMI n’est modifié.',
        'L’assistant ne déduit aucune panne et ne choisit aucune vitesse en l’absence de données.'
      ]
    };
  }

  // Calculs réutilisés : aucune nouvelle formule métier n'est introduite ici.
  const diagnosis = buildHygrometricDiagnosis(rows);
  const quality = summarizeDataQuality(rows);
  const periods = analyzeHygrometricPeriods(rows);
  const daily = summarizeDailyTrends(rows);
  const hourly = analyzeHourlyPatterns(rows, 3);
  const rapid = detectRapidChanges(rows);
  const speeds = analyzeSpeedLevels(rows, minSamples, targetRH);
  const speedTime = analyzeSpeedTimeContext(rows, { minSamples: 5, minDays: 2 });
  const seasonal = analyzeSeasonalVentilation(rows);
  const fan = summarizeFanEnergyEstimate(rows);
  const fanByMode = summarizeFanEnergyByManualMode(rows);
  const dailyEnergy = summarizeDailyEnergyClimateContext(rows);
  const weekly = summarizeWeeklyDiagnostic(rows);
  const readiness = summarizeEnergyReadiness(rows);
  const operating = summarizeOperatingReference(rows);
  const rawModes = summarizeRawVmiMode(rows);
  const rawSpeeds = summarizeRawVmiSpeed(rows);
  const temperatureLimit = summarizeTemperatureLimit(rows);
  const measuredEnergy = summarizeEnergyReadings(meterReadings);
  const measuredEnergyClimate = summarizeEnergyClimateContext(meterReadings, meterHistory);
  const monthlyMeasuredEnergy = summarizeMonthlyEnergyReadings(meterReadings);

  const accepted = diagnosis.sampleCount || 0;
  const level = diagnosis.coverageLevel || 'indéterminée';
  const confidence = formatDiagnosisConfidence(diagnosis, value => fmt(value));
  const latestTimestamp = rows.reduce((latest, row) =>
    Number.isFinite(row?.t) ? Math.max(latest, row.t) : latest, -Infinity);
  const firstTimestamp = rows.reduce((first, row) =>
    Number.isFinite(row?.t) ? Math.min(first, row.t) : first, Infinity);
  const periodText = Number.isFinite(firstTimestamp) && Number.isFinite(latestTimestamp)
    ? dateLabel(firstTimestamp) + ' au ' + dateLabel(latestTimestamp)
    : 'période non datée';

  const sections = [];

  const qualityDetails = [
    quality.completeHygrometricRecords + ' relevés sur ' + quality.total +
      ' contiennent les quatre mesures nécessaires (température et humidité du salon et de l’air entrant), soit ' +
      percent(quality.hygrometricCoveragePercent) + '.',
    quality.affectedRecords + ' relevé(s) contiennent au moins une valeur physiquement improbable ; ces valeurs restent dans l’historique mais sont écartées des calculs concernés.',
    quality.transientSpikes.count + ' pic(s) isolé(s) répondent aux critères de surveillance. Un pic est à vérifier, pas une preuve de panne.',
    ...quality.fieldCoverage.map(field => field.label + ' : ' + field.validCount + ' valeur(s) valide(s), ' + field.missingCount + ' manquante(s), ' + field.invalidCount + ' aberrante(s) (' + percent(field.coveragePercent) + ' de couverture).'),
    confidence
  ];
  if (diagnosis.excludedGapCount) {
    qualityDetails.push(diagnosis.excludedGapCount + ' interruption(s) de plus de ' +
      diagnosis.maxGapHours + ' h ont été exclues ; la plus longue atteint ' +
      fmt(diagnosis.largestExcludedGapHours) + ' h.');
  }
  sections.push(section(
    'quality', 'Fiabilité des données', level === 'faible' ? 'attention' : 'available',
    quality.total + ' relevés examinés sur la période ' + periodText + '. ' +
      quality.completeHygrometricRecords + ' disposent des quatre mesures hygrométriques nécessaires.',
    qualityDetails
  ));

  const hygroDetails = diagnosis.observations.map(item =>
    item.title + ' — ' + item.detail + ' Conseil : ' + item.recommendation
  );
  if (periods.medianDelta != null) {
    const total = periods.observedDurationMs;
    hygroDetails.push('Écart médian salon − air entrant : ' + signed(periods.medianDelta, 'g/m³') +
      '. Air entrant plus sec pendant ' + percent(total ? periods.dryDurationMs / total * 100 : null) +
      ' des durées observées, plus humide pendant ' +
      percent(total ? periods.humidDurationMs / total * 100 : null) +
      ' et proche pendant ' + percent(total ? periods.neutralDurationMs / total * 100 : null) + '.');
    hygroDetails.push('Durées calculées par interpolation entre deux relevés espacés de ' +
      periods.maxGapHours + ' h maximum ; elles ne représentent pas une mesure continue.');
  }
  if (daily.latest) {
    hygroDetails.push('Dernière journée suffisamment documentée (' + daily.latest.date +
      ') : médiane ' + fmt(daily.latest.medianRH) + ' % d’humidité relative et ' +
      fmt(daily.latest.medianAbsoluteHumidity) + ' g/m³ d’humidité absolue sur ' +
      daily.latest.sampleCount + ' relevés.');
  }
  if (daily.changeAbsoluteHumidity != null) {
    hygroDetails.push('Évolution entre les deux dernières journées suffisamment documentées : ' +
      signed(daily.changeAbsoluteHumidity, 'g/m³') + ' d’humidité absolue et ' +
      signed(daily.changeRH, 'points d’humidité relative') + '.');
  } else {
    hygroDetails.push('La tendance entre deux journées n’est pas calculable avec les effectifs actuels.');
  }
  sections.push(section(
    'hygrometry', 'Humidité et évolution intérieure',
    diagnosis.status === 'analysis-available' ? 'available' : 'limited',
    diagnosis.observations.length
      ? diagnosis.observations.map(item => item.title).join(' · ')
      : 'Aucun constat hygrométrique suffisamment étayé.',
    hygroDetails
  ));

  const hourlyDetails = hourly.buckets.map(bucket =>
    bucket.label + ' : ' + (bucket.medianRH == null
      ? 'effectif insuffisant (' + bucket.sampleCount + ' relevés)'
      : fmt(bucket.medianRH) + ' % HR ; écart salon − air entrant ' +
        signed(bucket.medianDelta, 'g/m³') + ' (' + bucket.sampleCount + ' relevés).')
  );
  const recentEvents = rapid.slice(-5).reverse();
  hourlyDetails.push(rapid.length
    ? rapid.length + ' variation(s) rapide(s) à examiner. Les cinq plus récentes : ' +
      recentEvents.map(event =>
        dateLabel(event.start) + ' : ' + signed(event.deltaRH, 'points HR') +
        ' et ' + signed(event.deltaAbsoluteHumidity, 'g/m³')
      ).join(' ; ') + '.'
    : 'Aucune variation rapide dépassant les seuils de surveillance n’a été détectée.');
  sections.push(section(
    'time', 'Variations selon l’heure et changements rapides',
    hourly.buckets.some(bucket => bucket.medianRH != null) ? 'available' : 'limited',
    'L’historique est réparti en quatre tranches de six heures ; les résultats ne sont affichés que lorsque le minimum de relevés est atteint.',
    hourlyDetails
  ));

  const speedDetails = speeds.groups.map(group =>
    'Niveau manuel ' + group.v + ' : ' + group.n + ' relevés sur ' + group.daysCovered +
    ' jour(s), HR médiane ' + (group.rh == null ? 'non disponible' : fmt(group.rh) + ' %') +
    ', écart HA médian ' + signed(group.delta, 'g/m³') +
    ', régime moteur médian ' + (group.rpm == null ? 'non disponible' : fmt(group.rpm) + ' tr/min') +
    '. Jours communs avec un autre niveau : ' + group.sharedDays + '.'
  );
  const readyPairs = speedTime.comparisons.filter(item => item.ready);
  speedDetails.push(readyPairs.length
    ? readyPairs.length + ' comparaison(s) horaire(s) valides entre niveaux manuels, sur mêmes tranches de six heures et mêmes dates. Exemple : ' +
      readyPairs.slice(0, 4).map(item =>
        item.label + ', niveaux ' + item.speeds.join('/') + ', ' +
        item.sharedDayCount + ' jour(s) commun(s), différence d’écart HA ' +
        signed(item.medianDeltaHADifference, 'g/m³')
      ).join(' ; ') + '.'
    : 'Aucune comparaison horaire entre vitesses ne satisfait les critères de dates communes et d’effectifs.');
  speedDetails.push('Ces comparaisons sont descriptives : elles ne désignent pas une vitesse optimale et ne neutralisent pas toutes les différences de météo, d’occupation ou d’apports d’humidité.');
  sections.push(section(
    'speeds', 'Vitesses manuelles 1, 2 et 3',
    readyPairs.length || speeds.comparableGroups ? 'available' : 'limited',
    speeds.status === 'no-speed-data'
      ? 'Aucune annotation de vitesse manuelle 1/2/3 n’est disponible.'
      : speeds.status === 'insufficient'
        ? 'Les effectifs sont encore insuffisants pour comparer les vitesses.'
        : 'Comparaison descriptive disponible pour ' + speeds.groups.filter(group => group.n >= minSamples).map(group => 'niveau ' + group.v).join(', ') + '.',
    speedDetails
  ));

  const modeDetails = rawModes.map(group => {
    if (group.medianDebit == null && group.referenceDebit != null) {
      return 'Mode ' + group.mode + ' : aucune médiane de débit mesurée ; repère distinct communiqué de ' +
        fmt(group.referenceDebit) + ' m³/h, soit ' + fmt(group.referenceRenewalRate, 2) +
        ' renouvellement théorique par heure pour 337 m³.';
    }
    return 'Mode ' + group.mode + ' : débit médian ' +
      (group.medianDebit == null ? 'non disponible' : fmt(group.medianDebit) + ' m³/h') +
      ' ; renouvellement théorique médian ' +
      (group.medianRenewalRate == null ? 'non disponible' : fmt(group.medianRenewalRate, 2) + ' vol/h') +
      ' ; ' + group.sampleCount + ' relevés.';
  });
  if (rawSpeeds.length) {
    modeDetails.push('Codes « Vitesse » bruts VMI+ distincts : ' + rawSpeeds.map(group =>
      group.code + ' (' + group.sampleCount + ' débit(s), médiane ' +
      (group.medianDebit == null ? 'non disponible' : fmt(group.medianDebit) + ' m³/h') + ')'
    ).join(' ; ') + '. Ils ne sont pas assimilés aux niveaux manuels 1/2/3.');
  } else {
    modeDetails.push('Aucun code « Vitesse » brut exploitable dans la période.');
  }
  const operatingModes = operating.groups.map(group => {
    const flow = group.fields.find(field => field.key === 'debit');
    const rpm = group.fields.find(field => field.key === 'rpm');
    return 'Mode ' + group.mode + ' : ' + group.sampleCount + ' relevés sur ' +
      group.dayCount + ' jour(s), débit médian ' +
      (flow?.median == null ? 'non disponible' : fmt(flow.median) + ' m³/h') +
      ', régime médian ' + (rpm?.median == null ? 'non disponible' : fmt(rpm.median) + ' tr/min') + '.';
  });
  modeDetails.push(...operatingModes);
  for (const group of operating.groups) {
    modeDetails.push('Détails des champs par mode ' + group.mode + ' : ' + group.fields.map(field =>
      field.label + ' — médiane ' + fmt(field.median) + ' ' + field.unit +
      ', plage ' + fmt(field.min) + ' à ' + fmt(field.max) + ' (' + field.count + ' valeurs).'
    ).join(' ; '));
  }
  modeDetails.push(...readiness.fields.map(field =>
    field.label + ' : ' + field.count + ' valeur(s), ' + field.missingCount +
    ' manquante(s), plage ' + fmt(field.min) + ' à ' + fmt(field.max) + ' ; ' + field.unit +
    (field.verified ? ' (signification/unité confirmée).' : ' (champ brut non interprété).')
  ));
  if (temperatureLimit.thresholds.length) {
    modeDetails.push('Consigne extérieure Cons TMax : ' + temperatureLimit.thresholds.map(item =>
      fmt(item.threshold) + ' °C (' + item.sampleCount + ' relevés, ' +
      item.aboveThresholdCount + ' au-dessus et ' + item.atOrBelowThresholdCount +
      ' au seuil ou en dessous). Les écarts observés ne prouvent pas que la consigne en est la cause.'
    ).join(' ; ') + '.');
    for (const item of temperatureLimit.thresholds) {
      for (const group of item.modes) {
        modeDetails.push('Cons TMax ' + fmt(item.threshold) + ' °C, mode manuel ' + group.mode +
          ' : ' + group.above.sampleCount + ' relevés au-dessus, ' + group.atOrBelow.sampleCount +
          ' au seuil ou en dessous ; ' + (group.comparable
            ? 'comparaison sur ' + group.sharedDayCount + ' jours communs : débit médian ' +
              fmt(group.pairedAbove.medianDebit) + ' m³/h au-dessus contre ' +
              fmt(group.pairedAtOrBelow.medianDebit) + ' m³/h au seuil ou en dessous, régime ' +
              fmt(group.pairedAbove.medianRPM) + ' contre ' + fmt(group.pairedAtOrBelow.medianRPM) + ' tr/min.'
            : 'comparaison appariée non disponible : effectif ou nombre de jours communs insuffisant.')
        );
      }
    }
  } else {
    modeDetails.push('Pas de comparaison exploitable entre Cons TMax et température extérieure.');
  }
  sections.push(section(
    'airflow', 'Débit, renouvellement d’air et fonctionnement',
    rawModes.some(group => group.medianDebit != null) ? 'available' : 'limited',
    'Le champ Debit est interprété en m³/h. Le renouvellement théorique est le débit divisé par le volume déclaré ; ce n’est pas une mesure de la répartition réelle de l’air dans les pièces.',
    modeDetails
  ));

  const seasonalDetails = [
    seasonal.advice,
    'Saison attribuée à partir de la date du dernier relevé : ' +
      (seasonal.currentSeason || 'indéterminée') + '.',
    ...seasonal.seasons.map(item =>
      item.season + ' : ' + item.sampleCount + ' relevés sur ' + item.dayCount +
      ' jour(s), écart extérieur − intérieur médian ' +
      signed(item.medianOutdoorMinusIndoor, '°C') +
      ', ' + item.opportunityDayCount + ' jour(s) avec conditions thermiques potentiellement favorables, écart hygrométrique médian ' +
      signed(item.medianHumidityDelta, 'g/m³') + '.'
    ),
    ...seasonal.seasons.map(item => item.season + ' — codes Saison CSV bruts : ' + (Object.entries(item.codeCounts).map(([code, count]) => code + ' (' + count + ')').join(', ') || 'aucun code renseigné') + '.'),
    'Les codes numériques Saison du CSV sont conservés comme valeurs brutes ; ils ne sont pas renommés été/hiver/intersaison.'
  ];
  sections.push(section(
    'seasonal', 'Saisons et surventilation',
    seasonal.status === 'available' ? 'available' : 'limited',
    seasonal.advice,
    seasonalDetails
  ));

  const energyDetails = [];
  if (fan.status === 'estimated') {
    energyDetails.push('Ventilateur uniquement : ' + fmt(fan.estimatedKwh, 3) +
      ' kWh estimés, puissance moyenne estimée ' + fmt(fan.averagePowerW) +
      ' W, sur ' + duration(fan.coveredHours) + ' intégrées (' +
      percent(fan.coveragePercent) + ' de la période observée).');
    energyDetails.push(fan.acceptedIntervalCount + ' intervalle(s) intégrés ; ' +
      fan.longGapCount + ' grand(s) trou(s) et ' + fan.invalidFlowIntervalCount +
      ' intervalle(s) avec débit hors plage constructeur exclus.');
  } else {
    energyDetails.push('Estimation du ventilateur indisponible : au moins deux débits compris entre 50 et 350 m³/h, espacés de deux heures maximum, sont nécessaires.');
  }
  energyDetails.push('Cette énergie est estimée depuis le débit et la courbe constructeur. Elle ne représente pas une mesure électrique ; le préchauffage et la consommation totale ne sont pas estimés.');
  energyDetails.push(...fanByMode.groups.map(group =>
    'Mode manuel ' + group.mode + ' : ' +
    (group.estimatedKwh == null ? 'estimation non disponible' : fmt(group.estimatedKwh, 3) + ' kWh estimés') +
    ', ' + fmt(group.coveredHours) + ' h intégrées, ' + group.dayCount +
    ' jour(s), couverture ' + percent(group.coveragePercent) + '.'
  ));
  energyDetails.push(dailyEnergy.status === 'available'
    ? dailyEnergy.matchedDayCount + ' jour(s) rapprochent au moins ' +
      dailyEnergy.minFanHours + ' h d’estimation ventilateur et ' +
      dailyEnergy.minClimateSamples + ' mesures hygrométriques. Ces valeurs concomitantes ne prouvent aucune causalité.'
    : 'Le rapprochement journalier énergie estimée / hygrométrie n’a pas encore le nombre de jours requis (' +
      dailyEnergy.matchedDayCount + ' jour(s) apparié(s)).');
  energyDetails.push(...dailyEnergy.matchedDays.slice(-5).map(day =>
    day.date + ' : ventilateur ' + fmt(day.estimatedKwh, 3) + ' kWh estimés sur ' +
    fmt(day.fanHours) + ' h ; humidité absolue intérieure ' + fmt(day.medianIndoorAbsHumidity) +
    ' g/m³, air entrant ' + fmt(day.medianIncomingAbsHumidity) + ' g/m³, écart ' +
    signed(day.medianDeltaAbsHumidity, 'g/m³') + '.'
  ));
  if (weekly.status === 'available') {
    energyDetails.push('Bilan des deux fenêtres de ' + weekly.windowDays +
      ' jours : humidité absolue intérieure ' +
      signed(weekly.comparison.indoorHA, 'g/m³') + ', air entrant ' +
      signed(weekly.comparison.incomingHA, 'g/m³') +
      ', écart intérieur − entrant ' + signed(weekly.comparison.deltaHA, 'g/m³') + '.');
    energyDetails.push(...weekly.periods.map(period =>
      (period.id === 'previous' ? 'Fenêtre précédente ' : 'Fenêtre récente ') +
      period.start + ' au ' + period.end + ' : ' + period.dayCount + ' jour(s), ' +
      fmt(period.medianIndoorHA) + ' g/m³ intérieur, ' + fmt(period.medianIncomingHA) +
      ' g/m³ air entrant, ' + fmt(period.medianRH) + ' % HR, ' +
      (period.estimatedFanKwh == null ? 'énergie ventilateur non estimable' : fmt(period.estimatedFanKwh, 3) + ' kWh ventilateur estimés sur ' + period.energyCoveredDays + ' jour(s)') + '.'
    ));
  } else {
    energyDetails.push('Le bilan comparatif des deux fenêtres de sept jours reste indisponible : chacune doit contenir au moins ' +
      weekly.minDaysPerWindow + ' journées suffisamment documentées.');
  }
  if (measuredEnergy.meters.length) {
    energyDetails.push('Compteurs externes : ' + measuredEnergy.meters.map(meter =>
      meter.label + ' — ' + meter.readingCount + ' index, ' +
      (meter.measuredIntervalCount
        ? meter.measuredIntervalCount + ' intervalle(s) mesuré(s), ' + fmt(meter.totalKwh, 3) + ' kWh cumulés sur les intervalles valides.'
        : 'aucun intervalle valide : consommation non calculable avec un seul index ou des index non exploitables.')
    ).join(' ; ') + '.');
    for (const meter of measuredEnergy.meters) {
      const latest = [...meter.intervals].reverse().find(interval => interval.status === 'measured');
      if (latest) energyDetails.push('Dernier intervalle mesuré — ' + meter.label + ' : ' +
        fmt(latest.deltaKwh, 3) + ' kWh sur ' + duration(latest.elapsedHours) +
        ', puissance moyenne ' + fmt(latest.averagePowerW) + ' W (' +
        dateLabel(latest.from) + ' au ' + dateLabel(latest.to) + ').');
      const monthly = monthlyMeasuredEnergy.find(item => item.meterType === meter.meterType);
      if (monthly?.months.length) {
        energyDetails.push('Bilans mensuels mesurés — ' + meter.label + ' : ' + monthly.months.map(month =>
          month.month + ' : ' + fmt(month.energyKwh, 3) + ' kWh sur ' + month.intervalCount + ' intervalle(s)'
        ).join(' ; ') + '. Les intervalles traversant un changement de mois ne sont pas répartis artificiellement.');
      }
      if (monthly?.crossMonthIntervalCount) energyDetails.push(monthly.crossMonthIntervalCount +
        ' intervalle(s) de ' + meter.label + ' traversent une limite de mois (' +
        fmt(monthly.crossMonthKwh, 3) + ' kWh) et restent exclus des totaux mensuels.');
    }
  } else {
    energyDetails.push('Aucun index électrique externe enregistré : aucune consommation mesurée en kWh n’est disponible.');
  }
  energyDetails.push(measuredEnergyClimate.matchedIntervalCount +
    ' intervalle(s) de compteur externe disposent d’un rapprochement climatique avec une couverture suffisante.');
  for (const meter of measuredEnergyClimate.meters) {
    energyDetails.push('Contexte climatique du compteur ' + meter.label + ' : ' +
      meter.intervals.filter(interval => interval.context.ready).length + ' intervalle(s) suffisamment couverts sur ' +
      meter.intervals.length + ' ; seuil de couverture ' + measuredEnergyClimate.minCoveredHours +
      ' h et ' + percent(measuredEnergyClimate.minCoveragePercent) + '.');
  }
  sections.push(section(
    'energy', 'Énergie et consommation',
    fan.status === 'estimated' || measuredEnergy.meters.length ? 'available' : 'limited',
    fan.status === 'estimated'
      ? 'Une estimation du ventilateur existe, mais elle ne remplace pas un compteur électrique.'
      : readiness.message,
    energyDetails
  ));

  const recommendations = [];
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

  const summaryFirst = diagnosis.observations[0];
  const overview = 'Sur ' + rows.length + ' relevés de la période ' + periodText +
    ', ' + accepted + ' sont retenus par le diagnostic hygrométrique. ' +
    (summaryFirst
      ? summaryFirst.title + ' : ' + summaryFirst.detail
      : 'Aucun constat principal ne peut être formulé.') +
    ' La robustesse de l’historique est ' + level + '.';

  return {
    status: diagnosis.status === 'analysis-available' ? 'available' : 'limited',
    title: diagnosis.status === 'analysis-available'
      ? 'Analyse de la VMI disponible'
      : 'Analyse partielle : données à consolider',
    overview,
    confidence,
    sampleCount: rows.length,
    acceptedSampleCount: accepted,
    period: periodText,
    targetRH,
    minSamples,
    sections,
    recommendations,
    limits: [
      'Cette fonction est un assistant expert local à règles explicables ; elle ne contacte aucun service d’IA et n’envoie aucune donnée hors du téléphone.',
      'Les conseils s’appuient sur les analyses déjà calculées par l’application ; ils ne constituent pas une mesure directe de l’efficacité de la VMI.',
      'Les modes 1/2/3 sont des niveaux manuels confirmés uniquement lorsque le champ Mode est présent. Le champ Vitesse VMI+ reste brut.',
      'Le débit Debit est exprimé en m³/h. Le renouvellement débit / volume est théorique et ne décrit pas la distribution de l’air dans chaque pièce.',
      'L’énergie issue de la courbe constructeur est une estimation du ventilateur seulement. Une consommation mesurée exige des index d’un compteur électrique externe.',
      'Les comparaisons ne prouvent pas de causalité et ne désignent aucune vitesse optimale.',
      'Aucun diagnostic de panne physique n’est posé. Une déconnexion Bluetooth, un pic isolé ou une valeur inhabituelle ne prouvent pas une panne.',
      'Aucune commande de vitesse, Boost, Vacances ou surventilation n’est envoyée automatiquement. Les réglages restent manuels.'
    ]
  };
}
