import test from 'node:test';
import assert from 'node:assert/strict';
import { getColumnMapping, recFrom } from '../js/modules/dataio.js';
import { summarizeEnergyReadiness, summarizeOperatingReference, analyzeSpeedLevels, analyzeSpeedTimeContext } from '../js/modules/analysis.js';

test('recFrom conserve les champs énergétiques VMI+ sous forme brute', () => {
  const headers = [
    'Date','Cons Res','Cons HydroR','Cons TMax','Kmoteur','Jmoteur',
    'Kreseau','Jreseau','Pression Moteur','Debit','Cons Dp',
    'Tachy (rpm)','PWM (1/1000)','Offset Press','% fonct','% fonct.1','Dcint'
  ];
  const values = [
    '10/11/2026 16:45:35','4','0','25','4225','47',
    '1268','99','11,2','121','112','1376','348','0','2','0','0'
  ];
  const record = recFrom(values, null, getColumnMapping(headers));
  assert.ok(record);
  assert.equal(record.consResRaw, 4);
  assert.equal(record.consHydroRRaw, 0);
  assert.equal(record.consTmaxRaw, 25);
  assert.equal(record.kmoteurRaw, 4225);
  assert.equal(record.jmoteurRaw, 47);
  assert.equal(record.kreseauRaw, 1268);
  assert.equal(record.jreseauRaw, 99);
  assert.equal(record.motorPressureRaw, 11.2);
  assert.equal(record.debit, 121);
  assert.equal(record.consDpRaw, 112);
  assert.equal(record.rpm, 1376);
  assert.equal(record.vmiPwmRaw, 348);
  assert.equal(record.offsetPressureRaw, 0);
  assert.equal(record.operatingPctRaw, 2);
  assert.equal(record.operatingPct2Raw, 0);
  assert.equal(record.dcintRaw, 0);
});

test('inventorie les champs énergétiques sans attribuer de watts ou kWh', () => {
  const result = summarizeEnergyReadiness([{
    rpm: 1376, debit: 121, consResRaw: 4, consHydroRRaw: 0,
    consTmaxRaw: 25, kmoteurRaw: 4225, jmoteurRaw: 47,
    kreseauRaw: 1268, jreseauRaw: 99, motorPressureRaw: 11.2,
    consDpRaw: 112, vmiPwmRaw: 348
  }]);
  assert.equal(result.total, 1);
  assert.equal(result.hasVerifiedElectricalEnergy, false);
  assert.match(result.message, /watts ou kWh/);
  for (const key of ['consResRaw','consHydroRRaw','consTmaxRaw','kmoteurRaw','jmoteurRaw','kreseauRaw','jreseauRaw','motorPressureRaw','consDpRaw','vmiPwmRaw']) {
    const field = result.fields.find(item => item.key === key);
    assert.ok(field, 'champ manquant: ' + key);
    assert.equal(field.count, 1);
    assert.equal(field.verified, false);
  }
  assert.equal(result.fields.find(item => item.key === 'debit').verified, true);
  assert.equal(result.fields.find(item => item.key === 'rpm').verified, true);
});

test('distingue les deux colonnes VMI+ portant le même en-tête % fonct', () => {
  const headers = ['Date', '% fonct', 'Colonne intermédiaire', '% fonct'];
  const values = ['10/11/2026 16:45:35', '7', 'sans objet', '3'];
  const mapping = getColumnMapping(headers);
  const record = recFrom(values, null, mapping);
  assert.ok(record);
  assert.equal(record.operatingPctRaw, 7);
  assert.equal(record.operatingPct2Raw, 3);
});

test('distingue les valeurs nulles des valeurs absentes dans l’inventaire', () => {
  const result = summarizeEnergyReadiness([
    { rpm: 0, debit: 121, consResRaw: 0 },
    { rpm: 1300, debit: null, consResRaw: null }
  ]);
  const rpm = result.fields.find(field => field.key === 'rpm');
  const debit = result.fields.find(field => field.key === 'debit');
  const resistance = result.fields.find(field => field.key === 'consResRaw');
  assert.equal(rpm.zeroCount, 1);
  assert.equal(rpm.missingCount, 0);
  assert.equal(debit.zeroCount, 0);
  assert.equal(debit.missingCount, 1);
  assert.equal(resistance.zeroCount, 1);
  assert.equal(resistance.missingCount, 1);
});


test('construit une référence descriptive séparée par mode VMI+ sans convertir les champs bruts', () => {
  const day = 24 * 60 * 60 * 1000;
  const rows = [
    { t: 1, vmiModeRaw: 1, vmiSpeedRaw: 4, debit: 120, rpm: 1300, vmiPwmRaw: 300, motorPressureRaw: 10, consDpRaw: 100 },
    { t: 1 + day, vmiModeRaw: 1, vmiSpeedRaw: 5, debit: 124, rpm: 1320, vmiPwmRaw: 310, motorPressureRaw: 11, consDpRaw: 110 },
    { t: 2, vmiModeRaw: 2, vmiSpeedRaw: 4, debit: 150, rpm: 1600, vmiPwmRaw: 400, motorPressureRaw: 18, consDpRaw: 180 },
    { t: 2 + day, vmiModeRaw: 2, vmiSpeedRaw: 5, debit: 152, rpm: 1620, vmiPwmRaw: 410, motorPressureRaw: 19, consDpRaw: 190 }
  ];
  const result = summarizeOperatingReference(rows, { minSamples: 2 });
  assert.equal(result.status, 'reference-available');
  assert.deepEqual(result.groups.map(group => group.mode), [1, 2]);
  assert.equal(result.groups[0].fields.find(field => field.key === 'debit').median, 122);
  assert.equal(result.groups[1].fields.find(field => field.key === 'debit').median, 151);
  assert.equal(result.groups[0].fields.find(field => field.key === 'vmiPwmRaw').verified, false);
  assert.equal(result.groups[0].fields.find(field => field.key === 'motorPressureRaw').unit, 'unité à confirmer');
  assert.equal(result.groups[0].sampleCount, 2);
});

test('ne confond pas le code Vitesse brut avec le champ Mode', () => {
  const result = summarizeOperatingReference([
    { vmiSpeedRaw: 3, debit: 120, rpm: 1300 },
    { vmiSpeedRaw: 5, debit: 150, rpm: 1600 }
  ]);
  assert.equal(result.status, 'no-mode-data');
  assert.deepEqual(result.groups, []);
});


test('ignore les codes Vitesse bruts : seuls les niveaux manuels explicitement annotés sont comparés', () => {
  const rawOnly = [
    { t: Date.UTC(2026, 10, 10, 10), vit: 1, vmiSpeedRaw: 1, st: 19, sh: 60 },
    { t: Date.UTC(2026, 10, 10, 10, 5), vit: 2, vmiSpeedRaw: 2, st: 19, sh: 58 },
    { t: Date.UTC(2026, 10, 10, 10, 10), vit: 3, vmiSpeedRaw: 3, st: 19, sh: 56 }
  ];
  assert.equal(analyzeSpeedLevels(rawOnly).status, 'no-speed-data');
  assert.deepEqual(analyzeSpeedTimeContext(rawOnly).comparableBuckets, []);
});

test('compare les niveaux manuels uniquement dans la même tranche et sur les mêmes jours', () => {
  const rows = [];
  for (const day of [10, 11]) {
    for (const vmiModeRaw of [1, 2]) {
      for (let sample = 0; sample < (day === 10 ? 3 : 2); sample++) {
        rows.push({
          t: Date.UTC(2026, 10, day, 10, sample * 5),
          vmiModeRaw,
          vit: vmiModeRaw + 1,
          vmiSpeedRaw: 5,
          st: 19,
          sh: 60 - vmiModeRaw,
          te: 12,
          he: 80,
          rpm: 1300 + vmiModeRaw * 100
        });
      }
    }
  }
  const result = analyzeSpeedTimeContext(rows, { minSamples: 5, minDays: 2 });
  assert.deepEqual(result.comparableBuckets, [1]);
  const comparable = result.groups.filter(group => group.bucket === 1 && group.ready);
  assert.deepEqual(comparable.map(group => group.speed), [1, 2]);
  assert.ok(comparable.every(group => group.sampleCount === 5 && group.dayCount === 2 && group.sharedDays === 2));
});

test('refuse la comparaison horaire lorsque les niveaux ne sont pas présents les mêmes jours', () => {
  const rows = [];
  for (const [day, vmiModeRaw] of [[10, 1], [11, 1], [12, 2], [13, 2]]) {
    for (let sample = 0; sample < 3; sample++) {
      rows.push({
        t: Date.UTC(2026, 10, day, 10, sample * 5),
        vmiModeRaw, st: 19, sh: 60, te: 12, he: 80
      });
    }
  }
  const result = analyzeSpeedTimeContext(rows, { minSamples: 5, minDays: 2 });
  assert.deepEqual(result.comparableBuckets, []);
  assert.ok(result.groups.filter(group => group.bucket === 1).every(group => !group.ready));
});


test('conserve Mode séparément de Vitesse dans un export VMI+', () => {
  const headers = ['Date', 'Mode', 'Vitesse', 'Debit'];
  const values = ['10/11/2026 16:45:35', '2', '5', '151'];
  const record = recFrom(values, null, getColumnMapping(headers));
  assert.ok(record);
  assert.equal(record.vmiModeRaw, 2);
  assert.equal(record.vmiSpeedRaw, 5);
  assert.equal(record.vit, null);
});
