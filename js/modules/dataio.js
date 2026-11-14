/** Conversion des dates et des lignes d'export VMI+/tableur. */
import { DAY, pad, num } from './date-utils.js';

// Indices de secours du CSV VMI+ réel (en-tête sur la 4e ligne).
const FALLBACK_COLUMN = Object.freeze({
  date: 0, event: 1, volume: 2, mode: 3, consRes: 4, consHydroR: 5,
  consTmax: 7, durationDays: 11, systemState: 13, failure: 14,
  kmoteur: 15, jmoteur: 16, kreseau: 17, jreseau: 18, motorPressure: 19,
  filter: 20, filterIndexPct: 21, speed: 22, airflow: 23,
  consDp: 24, rpm: 25, pwm: 26, offsetPressure: 27, operatingPct: 28,
  operatingPct2: 29, dcint: 30, outdoorTemp: 39, probeTemp: 40,
  probeHumidity: 41, probeAbsHumidity: 42, incomingTemp: 43,
  incomingHumidity: 44, incomingAbsHumidity: 45, salonTemp: 117,
  salonHumidity: 118
});

export const isCsvFile = name => /\.csv$/i.test(String(name ?? ''));

const normalizeHeader = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

const HEADER_ALIASES = {
  date: ['date'],
  event: ['event', 'evenement'],
  volume: ['vol m3', 'volume m3'],
  mode: ['mode'],
  consRes: ['cons res'],
  consHydroR: ['cons hydror'],
  consTmax: ['cons tmax'],
  kmoteur: ['kmoteur'],
  jmoteur: ['jmoteur'],
  kreseau: ['kreseau'],
  jreseau: ['jreseau'],
  motorPressure: ['pression moteur'],
  offsetPressure: ['offset press'],
  operatingPct: ['% fonct'],
  operatingPct2: ['% fonct 1'],
  dcint: ['dcint'],
  durationDays: ['duree fonc j', 'duree fonctionnement j'],
  systemState: ['etat systeme'],
  failure: ['panne'],
  filter: ['etat filtre'],
  filterIndexPct: ['indice encr %', 'indice encrassement %'],
  speed: ['vitesse'],
  airflow: ['debit'],
  consDp: ['cons dp'],
  rpm: ['tachy rpm'],
  pwm: ['pwm 1 1000', 'pwm'],
  // Les colonnes des sondes sont libellées de façon générique et répétée
  // ("Temp", "Hum rel", "Hum abs") : on garde leurs indices de secours.
  outdoorTemp: ['tempext', 'temperature exterieure']
};

export function getColumnMapping(headerRow) {
  const headers = Array.isArray(headerRow) ? headerRow.map(normalizeHeader) : [];
  const mapping = { ...FALLBACK_COLUMN };
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = headers.findIndex(header => aliases.includes(header));
    if (index >= 0) mapping[key] = index;
  }
  // Certains exports VMI+ répètent exactement l'en-tête "% fonct".
  // Dans ce cas, distinguer les deux colonnes par leur occurrence réelle,
  // plutôt que de dépendre uniquement de leur position de secours historique.
  const firstOperatingPct = headers.indexOf('% fonct');
  if (firstOperatingPct >= 0) {
    mapping.operatingPct = firstOperatingPct;
    const secondOperatingPct = headers.indexOf('% fonct', firstOperatingPct + 1);
    if (secondOperatingPct >= 0 && !headers.includes('% fonct 1')) {
      mapping.operatingPct2 = secondOperatingPct;
    }
  }
  return mapping;
}

export function parseCell(value, spreadsheet = globalThis.XLSX) {
  if (typeof value === 'number' && value > 30000 && spreadsheet) {
    const c = spreadsheet.SSF.parse_date_code(value);
    if (!c) return null;
    const swap = c.d <= 12, year = c.y, month = swap ? c.d : c.m, day = swap ? c.m : c.d, second = Math.round(c.S);
    return { t: new Date(year, month-1, day, c.H, c.M, second).getTime(),
      rk: `${pad(day)}/${pad(month)}/${year} ${pad(c.H)}:${pad(c.M)}:${pad(second)}` };
  }
  if (typeof value === 'string') {
    // Format français strict : refuser les dates impossibles et les suffixes
    // parasites au lieu de laisser Date() normaliser silencieusement la valeur.
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const day=+m[1], month=+m[2], year=+m[3], hour=+m[4], minute=+m[5], second=+(m[6]||0);
    if(month<1||month>12||day<1||hour>23||minute>59||second>59) return null;
    const date=new Date(year,month-1,day,hour,minute,second);
    if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day) return null;
    return { t: date.getTime(),
      rk: `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}:${pad(second)}` };
  }
  return null;
}

export function recFrom(row, spreadsheet = globalThis.XLSX, mapping = null) {
  const columns = mapping || FALLBACK_COLUMN;
  const parsed = parseCell(row[columns.date ?? 0], spreadsheet);
  if (!parsed) return null;
  const record = {
    t: parsed.t, rk: parsed.rk,
    eventRaw: num(row[columns.event]),
    volumeRaw: num(row[columns.volume]),
    vmiModeRaw: num(row[columns.mode]),
    consResRaw: num(row[columns.consRes]),
    consHydroRRaw: num(row[columns.consHydroR]),
    consTmaxRaw: num(row[columns.consTmax]),
    kmoteurRaw: num(row[columns.kmoteur]),
    jmoteurRaw: num(row[columns.jmoteur]),
    kreseauRaw: num(row[columns.kreseau]),
    jreseauRaw: num(row[columns.jreseau]),
    motorPressureRaw: num(row[columns.motorPressure]),
    offsetPressureRaw: num(row[columns.offsetPressure]),
    operatingPctRaw: num(row[columns.operatingPct]),
    operatingPct2Raw: num(row[columns.operatingPct2]),
    dcintRaw: num(row[columns.dcint]),
    d: num(row[columns.durationDays]),
    systemStateRaw: num(row[columns.systemState]),
    failureRaw: num(row[columns.failure]),
    st: num(row[columns.salonTemp]),
    tExt: num(row[columns.outdoorTemp]),
    sh: num(row[columns.salonHumidity]),
    t1: num(row[columns.probeTemp]),
    h1: num(row[columns.probeHumidity]),
    // Les valeurs Hum abs de VMI+ restent brutes : leur unité n'est pas confirmée.
    vmiAbsP0: num(row[columns.probeAbsHumidity]),
    te: num(row[columns.incomingTemp]),
    he: num(row[columns.incomingHumidity]),
    vmiAbsP1: num(row[columns.incomingAbsHumidity]),
    rpm: num(row[columns.rpm]),
    fil: num(row[columns.filter]),
    filterIndexPct: num(row[columns.filterIndexPct]),
    vmiSpeedRaw: num(row[columns.speed]),
    debit: num(row[columns.airflow]),
    consDpRaw: num(row[columns.consDp]),
    vmiPwmRaw: num(row[columns.pwm]),
    vit: null, boost: null, hol: null
  };
  return Object.keys(record).some(key => !['t','rk','vit','boost','hol'].includes(key) && record[key] != null) ? record : null;
}

export const dayNumber = timestamp => {
  const d = new Date(timestamp);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};


/** Parse un CSV délimité en respectant les champs entre guillemets et les guillemets doublés. */
export function parseCsvRows(text, delimiter = null) {
  const source=String(text??'').replace(/^\uFEFF/,'');
  if(!delimiter){
    // Les exports VMI+ comportent plusieurs lignes de métadonnées avant
    // l'en-tête (4e ligne). Détecter sur plusieurs lignes évite qu'une
    // première ligne descriptive fausse le choix du séparateur.
    const sample=source.split(/\r?\n/).filter(line=>line.trim()).slice(0,12);
    const countOutsideQuotes=(line,separator)=>{
      let count=0,quoted=false;
      for(let i=0;i<line.length;i++){
        const char=line[i];
        if(char==='"'&&quoted&&line[i+1]==='"'){i++;continue}
        if(char==='"'){quoted=!quoted;continue}
        if(!quoted&&char===separator)count++;
      }
      return count;
    };
    const score=separator=>{
      const counts=sample.map(line=>countOutsideQuotes(line,separator));
      return Math.max(0,...counts)*100+counts.reduce((sum,value)=>sum+value,0);
    };
    delimiter=score(';')>score(',')?';':',';
  }
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){field+='"';i++}
      else if(char==='"')quoted=false;
      else field+=char;
    }else if(char==='"'&&field==='')quoted=true;
    else if(char===delimiter){row.push(field);field=''}
    else if(char==='\n'||char==='\r'){
      if(char==='\r'&&source[i+1]==='\n')i++;
      row.push(field);field='';rows.push(row);row=[];
    }else field+=char;
  }
  if(field!==''||row.length){row.push(field);rows.push(row)}
  return rows;
}
