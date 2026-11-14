/** Conversion des dates et des lignes d'export VMI+/tableur. */
import { DAY, pad, num } from './date-utils.js';

// Indices de secours du CSV VMI+ réel (en-tête sur la 4e ligne).
const FALLBACK_COLUMN = Object.freeze({
  date: 0, event: 1, volume: 2, mode: 3, durationDays: 11, systemState: 13,
  failure: 14, filter: 20, filterIndexPct: 21, speed: 22, airflow: 23,
  consDp: 24, rpm: 25, pwm: 26, outdoorTemp: 39, probeTemp: 40,
  probeHumidity: 41, probeAbsHumidity: 42, incomingTemp: 43,
  incomingHumidity: 44, incomingAbsHumidity: 45, salonTemp: 117,
  salonHumidity: 118
});

const normalizeHeader = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

const HEADER_ALIASES = {
  date: ['date'],
  event: ['event', 'evenement'],
  volume: ['vol m3', 'volume m3'],
  mode: ['mode'],
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
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) return { t: new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0)).getTime(),
      rk: `${pad(+m[1])}/${pad(+m[2])}/${m[3]} ${pad(+m[4])}:${m[5]}:${pad(+(m[6]||0))}` };
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
  const source=String(text??'').replace(/^\\uFEFF/,'');
  if(!delimiter){
    const first=source.split(/\\r?\\n/,1)[0]||'';
    const count=char=>[...first].filter(c=>c===char).length;
    delimiter=count(';')>count(',')?';':',';
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
    else if(char==='\\n'||char==='\\r'){
      if(char==='\\r'&&source[i+1]==='\\n')i++;
      row.push(field);field='';rows.push(row);row=[];
    }else field+=char;
  }
  if(field!==''||row.length){row.push(field);rows.push(row)}
  return rows;
}
