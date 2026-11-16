/** Analyses descriptives des modes et champs de fonctionnement VMI+. */
import { median } from './statistics.js';
import { isPlausibleTemperature } from './data-quality.js';

/** Inventaire des champs VMI+ disponibles ; aucune unité ni consommation n'est déduite. */
export function summarizeEnergyReadiness(data) {
  const rows=Array.isArray(data)?data:[];
  const fields=[
    {key:'rpm',label:'Régime moteur',unit:'tr/min (confirmé)',verified:true},
    {key:'debit',label:'Débit',unit:'m³/h',verified:true},
    {key:'vmiSpeedRaw',label:'Code vitesse VMI+',unit:'code brut',verified:false},
    {key:'vmiPwmRaw',label:'PWM VMI+',unit:'valeur brute (échelle à confirmer)',verified:false},
    {key:'consDpRaw',label:'Cons DP',unit:'signification et unité à confirmer',verified:false},
    {key:'consResRaw',label:'Cons Res',unit:'signification et unité à confirmer',verified:false},
    {key:'consHydroRRaw',label:'Cons HydroR',unit:'signification et unité à confirmer',verified:false},
    {key:'consTmaxRaw',label:'Seuil température extérieure (Cons TMax)',unit:'consigne en °C (sens confirmé)',verified:true},
    {key:'kmoteurRaw',label:'Kmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'jmoteurRaw',label:'Jmoteur',unit:'signification et unité à confirmer',verified:false},
    {key:'kreseauRaw',label:'Kreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'jreseauRaw',label:'Jreseau',unit:'signification et unité à confirmer',verified:false},
    {key:'motorPressureRaw',label:'Pression Moteur',unit:'unité à confirmer',verified:false},
    {key:'offsetPressureRaw',label:'Offset Press',unit:'valeur brute',verified:false},
    {key:'operatingPctRaw',label:'% fonct',unit:'échelle à confirmer',verified:false},
    {key:'operatingPct2Raw',label:'% fonct.1',unit:'échelle à confirmer',verified:false},
    {key:'dcintRaw',label:'Dcint',unit:'signification et unité à confirmer',verified:false}
  ].map(field=>{
    const values=rows.map(r=>r?.[field.key]).filter(Number.isFinite);
    return {...field,count:values.length,
      zeroCount:values.filter(value=>value===0).length,
      nonZeroCount:values.filter(value=>value!==0).length,
      missingCount:rows.length-values.length,
      min:values.length?Math.min(...values):null,
      max:values.length?Math.max(...values):null,
      distinct:[...new Set(values)].sort((a,b)=>a-b)};
  });
  return {
    total:rows.length,fields,
    hasVerifiedElectricalEnergy:false,
    message:'Aucune mesure électrique vérifiée en watts ou kWh n’est disponible : la consommation et le rendement énergétique ne peuvent pas encore être calculés.'
  };
}

/**
 * Analyse les relevés autour de la consigne de température extérieure Cons TMax.
 * Les comparaisons restent descriptives et sont séparées par mode manuel déclaré.
 */
export function summarizeTemperatureLimit(data, {
  minimumGroupSamples = 5, minimumGroupDays = 2
} = {}) {
  const rows = Array.isArray(data) ? data : [];
  const eligible = rows.filter(row =>
    Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
    Number.isFinite(row?.tExt) && isPlausibleTemperature(row.tExt)
  );
  const settings = new Map();
  const dayKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  for (const row of eligible) {
    const threshold = row.consTmaxRaw;
    if (!settings.has(threshold)) settings.set(threshold, []);
    settings.get(threshold).push(row);
  }
  const summarize = samples => {
    const timestamps = samples.map(row => row.t).filter(Number.isFinite);
    const outdoor = samples.map(row => row.tExt).filter(Number.isFinite);
    return {
      sampleCount: samples.length,
      dayCount: new Set(timestamps.map(dayKey)).size,
      medianOutdoorTemp: median(outdoor)
    };
  };
  const pairedDailySummary = (dailyMap, sharedDays) => {
    const daily = sharedDays.map(day => {
      const samples = dailyMap.get(day) || [];
      return {
        sampleCount: samples.length,
        debit: median(samples.map(row => row.debit).filter(value => Number.isFinite(value) && value >= 0)),
        rpm: median(samples.map(row => row.rpm).filter(value => Number.isFinite(value) && value > 0 && value < 10000))
      };
    });
    return {
      sampleCount: daily.reduce((sum, item) => sum + item.sampleCount, 0),
      dayCount: daily.length,
      medianDebit: median(daily.map(item => item.debit)),
      medianRPM: median(daily.map(item => item.rpm))
    };
  };
  const thresholds = [...settings.entries()].sort((a,b) => a[0]-b[0]).map(([threshold, samples]) => {
    const aboveRows = samples.filter(row => row.tExt > threshold);
    const atOrBelowRows = samples.filter(row => row.tExt <= threshold);
    const modes = [1,2,3].map(mode => {
      const aboveModeRows = aboveRows.filter(row => row.vmiModeRaw === mode);
      const belowModeRows = atOrBelowRows.filter(row => row.vmiModeRaw === mode);
      const aboveDays = new Map(), belowDays = new Map();
      for (const row of aboveModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!aboveDays.has(key)) aboveDays.set(key, []);
        aboveDays.get(key).push(row);
      }
      for (const row of belowModeRows) {
        if (!Number.isFinite(row.t)) continue;
        const key = dayKey(row.t);
        if (!belowDays.has(key)) belowDays.set(key, []);
        belowDays.get(key).push(row);
      }
      const sharedDays = [...aboveDays.keys()].filter(day => belowDays.has(day)).sort();
      const pairedAbove = pairedDailySummary(aboveDays, sharedDays);
      const pairedAtOrBelow = pairedDailySummary(belowDays, sharedDays);
      return {
        mode,
        above: summarize(aboveModeRows),
        atOrBelow: summarize(belowModeRows),
        sharedDayCount: sharedDays.length,
        pairedAbove,
        pairedAtOrBelow,
        comparable: sharedDays.length >= minimumGroupDays &&
          pairedAbove.sampleCount >= minimumGroupSamples &&
          pairedAtOrBelow.sampleCount >= minimumGroupSamples
      };
    }).filter(group => group.above.sampleCount || group.atOrBelow.sampleCount);
    return {
      threshold, sampleCount: samples.length,
      aboveThresholdCount: aboveRows.length,
      atOrBelowThresholdCount: atOrBelowRows.length,
      above: summarize(aboveRows),
      atOrBelow: summarize(atOrBelowRows),
      modes
    };
  });
  return {
    status: thresholds.length ? 'available' : 'no-comparable-data',
    minimumGroupSamples, minimumGroupDays,
    inputSampleCount: rows.length,
    eligibleSampleCount: eligible.length,
    missingOutdoorTemperatureCount: rows.filter(row =>
      Number.isFinite(row?.consTmaxRaw) && isPlausibleTemperature(row.consTmaxRaw) &&
      (!Number.isFinite(row?.tExt) || !isPlausibleTemperature(row.tExt))
    ).length,
    thresholds,
    limits: [
      'Cons TMax est interprété comme une consigne de température extérieure en °C, selon la confirmation de l’utilisateur.',
      'Un relevé au-dessus du seuil indique une condition où la réduction de ventilation peut s’appliquer ; il ne prouve pas à lui seul que la régulation a effectivement réduit le débit.',
      'Les médianes comparatives sont calculées par jour puis équilibrées sur les mêmes dates présentes au-dessus et au seuil ou en dessous, séparément par Mode manuel déclaré.',
      'La comparaison ne neutralise pas l’heure, la saison, les autres réglages ni les conditions d’installation.'
    ]
  };
}

/**
 * Référence descriptive du fonctionnement par mode VMI+.
 * Mode et code Vitesse brut restent distincts ; les unités non confirmées restent brutes.
 */
export function summarizeOperatingReference(data, { minSamples = 10 } = {}) {
  const rows = Array.isArray(data) ? data : [];
  const modes = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    if (!modes.has(row.vmiModeRaw)) modes.set(row.vmiModeRaw, []);
    modes.get(row.vmiModeRaw).push(row);
  }
  const metrics = [
    { key: 'debit', label: 'Débit', unit: 'm³/h', verified: true },
    { key: 'rpm', label: 'Régime moteur', unit: 'tr/min confirmé', verified: true },
    { key: 'vmiPwmRaw', label: 'PWM', unit: 'valeur brute', verified: false },
    { key: 'motorPressureRaw', label: 'Pression moteur', unit: 'unité à confirmer', verified: false },
    { key: 'consDpRaw', label: 'Cons DP', unit: 'sens et unité à confirmer', verified: false }
  ];
  const groups = [...modes.entries()].sort((a, b) => a[0] - b[0]).map(([mode, samples]) => {
    const fields = metrics.map(metric => {
      const values = samples.map(row => row?.[metric.key]).filter(Number.isFinite);
      const center = median(values);
      return {
        ...metric, count: values.length, median: center,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        medianAbsoluteDeviation: center == null ? null : median(values.map(value => Math.abs(value - center)))
      };
    });
    const timestamps = samples.map(row => row?.t).filter(Number.isFinite);
    const days = new Set(timestamps.map(timestamp => {
      const date = new Date(timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }));
    return {
      mode, sampleCount: samples.length, dayCount: days.size,
      firstAt: timestamps.length ? Math.min(...timestamps) : null,
      lastAt: timestamps.length ? Math.max(...timestamps) : null,
      ready: samples.length >= minSamples && days.size >= 2,
      fields
    };
  });
  return {
    status: groups.some(group => group.ready) ? 'reference-available' : groups.length ? 'provisional' : 'no-mode-data',
    minSamples, groups,
    limits: [
      'Référence descriptive calculée sur les données importées actuellement, séparément pour chaque mode VMI+.',
      'Le champ Mode est distinct du champ Vitesse brut ; aucun code brut n’est converti en niveau manuel.',
      'Les médianes et plages ne prouvent ni un fonctionnement normal, ni une panne, ni une cause.',
      'PWM, Pression moteur et Cons DP restent des valeurs brutes : aucune unité physique ni consommation n’est déduite.',
      'Une comparaison temporelle fiable nécessitera plusieurs exports couvrant des périodes distinctes et comparables.'
    ]
  };
}

export function summarizeRawVmiMode(data) {
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiModeRaw)) continue;
    const mode = row.vmiModeRaw;
    if (!groups.has(mode)) groups.set(mode, []);
    if (Number.isFinite(row.debit) && row.debit >= 0) {
      const volume = Number.isFinite(row.volumeRaw) && row.volumeRaw > 0 ? row.volumeRaw : null;
      groups.get(mode).push({ debit: row.debit, renewalRate: volume ? row.debit / volume : null });
    }
  }
  // Référence communiquée par l'utilisateur : mode 3 = 184 m³/h.
  // Elle reste distincte des débits Debit (m³/h) réellement présents dans l'historique.
  if (!groups.has(3)) groups.set(3, []);
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([mode, rows]) => ({
    mode, sampleCount: rows.length,
    medianDebit: median(rows.map(r=>r.debit)),
    minDebit: rows.length ? Math.min(...rows.map(r=>r.debit)) : null,
    maxDebit: rows.length ? Math.max(...rows.map(r=>r.debit)) : null,
    medianRenewalRate: median(rows.map(r=>r.renewalRate).filter(Number.isFinite)),
    referenceDebit: mode === 3 ? 184 : null,
    referenceRenewalRate: mode === 3 ? 184 / 337 : null
  }));
}

export function summarizeRawVmiSpeed(data) {
  const groups = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!Number.isFinite(row?.vmiSpeedRaw)) continue;
    const code = row.vmiSpeedRaw;
    if (!groups.has(code)) groups.set(code, []);
    if (Number.isFinite(row.debit)) groups.get(code).push(row.debit);
  }
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([code, values]) => ({
    code,
    sampleCount: values.length,
    medianDebit: median(values),
    minDebit: values.length ? Math.min(...values) : null,
    maxDebit: values.length ? Math.max(...values) : null
  }));
}
