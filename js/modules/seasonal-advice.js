/** Analyse saisonnière et opportunités de surventilation.
 * La saison calendaire est dérivée de l'horodatage ; le code Saison VMI+ reste
 * conservé séparément tant que sa table de correspondance n'est pas prouvée.
 * Ce module conseille une action manuelle et n'envoie aucune commande BLE.
 */
import { median } from './analysis.js';
import { absoluteHumidity } from './psychrometry.js';
import { isPlausibleTemperature, isPlausibleHumidity } from './data-quality.js';

export function calendarSeason(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const month = new Date(timestamp).getMonth() + 1;
  if (month === 12 || month <= 2) return 'hiver';
  if (month >= 6 && month <= 8) return 'été';
  return 'intersaison';
}

const validTemperature = value => Number.isFinite(value) && isPlausibleTemperature(value);
const validHumidityPair = row =>
  validTemperature(row?.te) && Number.isFinite(row?.he) && isPlausibleHumidity(row.he) &&
  validTemperature(row?.st) && Number.isFinite(row?.sh) && isPlausibleHumidity(row.sh);

function localDay(timestamp) {
  const date = new Date(timestamp);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}

/**
 * Les médianes sont calculées par jour puis chaque jour a le même poids.
 * Une opportunité thermique est seulement un contexte favorable observé,
 * pas une preuve de refroidissement/réchauffement réel du logement.
 */
export function analyzeSeasonalVentilation(data, { minSamples = 6, minDays = 2, temperatureMargin = 2 } = {}) {
  const rows = (Array.isArray(data) ? data : []).filter(row =>
    Number.isFinite(row?.t) && validTemperature(row?.st) && validTemperature(row?.tExt)
  ).map(row => ({ ...row, calendarSeason: calendarSeason(row.t), day: localDay(row.t) }));

  const seasons = ['été', 'hiver', 'intersaison'].map(season => {
    const seasonalRows = rows.filter(row => row.calendarSeason === season);
    const days = new Map();
    for (const row of seasonalRows) {
      if (!days.has(row.day)) days.set(row.day, []);
      days.get(row.day).push(row);
    }
    const daily = [...days.entries()].map(([day, samples]) => {
      const hourRows = samples.filter(row => {
        const hour = new Date(row.t).getHours();
        return season === 'été'
          ? hour >= 22 || hour < 6
          : season === 'hiver' ? hour >= 10 && hour < 18 : true;
      });
      const thermal = hourRows.map(row => row.tExt - row.st).filter(Number.isFinite);
      const humidityDelta = samples.filter(validHumidityPair).map(row =>
        absoluteHumidity(row.st, row.sh) - absoluteHumidity(row.te, row.he)
      ).filter(Number.isFinite);
      const codes = [...new Set(samples.map(row => row.seasonRaw).filter(Number.isFinite))];
      return {
        day,
        sampleCount: samples.length,
        thermalSampleCount: thermal.length,
        medianOutdoorMinusIndoor: median(thermal),
        humidityDelta: median(humidityDelta),
        seasonCodes: codes
      };
    });
    const opportunityDays = daily.filter(day => day.medianOutdoorMinusIndoor != null &&
      (season === 'été'
        ? day.medianOutdoorMinusIndoor <= -temperatureMargin
        : season === 'hiver' ? day.medianOutdoorMinusIndoor >= temperatureMargin : false));
    const relevantSamples = daily.reduce((sum, day) => sum + day.thermalSampleCount, 0);
    const enough = relevantSamples >= minSamples && daily.filter(day => day.thermalSampleCount > 0).length >= minDays;
    const codeCounts = {};
    for (const row of seasonalRows) {
      if (Number.isFinite(row.seasonRaw)) codeCounts[row.seasonRaw] = (codeCounts[row.seasonRaw] || 0) + 1;
    }
    return {
      season, sampleCount: seasonalRows.length, dayCount: daily.length,
      thermalSampleCount: relevantSamples,
      medianOutdoorMinusIndoor: median(daily.map(day => day.medianOutdoorMinusIndoor)),
      medianHumidityDelta: median(daily.map(day => day.humidityDelta)),
      opportunityDayCount: opportunityDays.length,
      opportunityDays: opportunityDays.map(day => day.day),
      enough, codeCounts
    };
  });

  const latest = rows.length ? rows.reduce((a,b) => a.t > b.t ? a : b) : null;
  const currentSeason = latest?.calendarSeason ?? null;
  const current = seasons.find(item => item.season === currentSeason) ?? null;
  let advice;
  if (!latest) {
    advice = 'Températures intérieure et extérieure insuffisantes : aucune recommandation saisonnière fiable.';
  } else if (currentSeason === 'été') {
    advice = current?.enough && current.opportunityDayCount
      ? 'Des nuits où l’air extérieur était au moins ' + temperatureMargin + ' °C plus frais que le logement ont été observées. La surventilation nocturne peut être intéressante à ces moments ; vérifie la température extérieure et intérieure avant de l’activer manuellement.'
      : 'En été, ne déclenche la surventilation nocturne que lorsque l’air extérieur est nettement plus frais que le logement. Les relevés disponibles ne montrent pas encore assez de nuits favorables pour confirmer un créneau.';
  } else if (currentSeason === 'hiver') {
    advice = current?.enough && current.opportunityDayCount
      ? 'Des périodes diurnes où l’air extérieur était au moins ' + temperatureMargin + ' °C plus chaud que le logement ont été observées. La surventilation peut alors apporter de l’air plus chaud ; vérifie les températures avant activation manuelle.'
      : 'En hiver, la surventilation diurne n’est pertinente que si l’air extérieur est plus chaud que le logement. Les relevés disponibles ne montrent pas encore assez de périodes favorables pour confirmer un créneau.';
  } else {
    advice = 'En intersaison, évite une règle horaire fixe : compare les températures intérieure et extérieure et l’humidité absolue de l’air entrant avant de modifier la ventilation.';
  }

  return {
    status: rows.length ? 'available' : 'insufficient-data',
    currentSeason, latestAt: latest?.t ?? null, seasons, advice,
    minSamples, minDays, temperatureMargin,
    limits: [
      'Été, hiver et intersaison sont déterminés ici à partir du calendrier local (été : juin–août ; hiver : décembre–février ; intersaison : mars–mai et septembre–novembre).',
      'Le champ Saison numérique du CSV est conservé séparément ; ses codes ne sont pas renommés sans correspondance confirmée.',
      'Une température extérieure plus favorable indique une opportunité potentielle, pas un gain thermique mesuré. Le résultat ne tient pas compte de l’inertie, de l’ensoleillement, de l’occupation ni des pertes du bâtiment.',
      'Les conseils sont informatifs : aucun réglage, mode ou commande Bluetooth n’est activé automatiquement.'
    ]
  };
}
