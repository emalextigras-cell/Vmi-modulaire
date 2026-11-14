import test from 'node:test';
import assert from 'node:assert/strict';
import { getColumnMapping, recFrom } from '../js/modules/dataio.js';
import { summarizeEnergyReadiness } from '../js/modules/analysis.js';

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
