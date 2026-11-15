import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDailyEnergyClimateContext } from '../js/modules/energy-climate.js';

const HOUR=3600000;
const day=Date.UTC(2026,0,1);
const row=(hours,debit=125,extra={})=>({t:day+hours*HOUR,debit,st:20,sh:60,te:10,he:80,...extra});

test('apparie une journée lorsque énergie estimée et climat ont une couverture suffisante',()=>{
  const result=summarizeDailyEnergyClimateContext([
    row(0),row(1),row(2),row(3),row(4)
  ],{minFanHours:3,minClimateSamples:3,minDays:1});
  assert.equal(result.status,'available');
  assert.equal(result.matchedDayCount,1);
  const item=result.matchedDays[0];
  assert.equal(item.fanHours,4);
  assert.equal(item.climateSampleCount,5);
  assert.equal(item.estimatedKwh,0.04);
  assert.equal(item.averagePowerW,10);
  assert.ok(Number.isFinite(item.medianIndoorAbsHumidity));
  assert.ok(Number.isFinite(item.medianIncomingAbsHumidity));
});

test('ne retient pas une journée si la couverture du ventilateur est insuffisante',()=>{
  const result=summarizeDailyEnergyClimateContext([row(0),row(1),row(2)],{
    minFanHours:3,minClimateSamples:3,minDays:1
  });
  assert.equal(result.status,'insufficient-data');
  assert.equal(result.matchedDayCount,0);
});

test('exclut les trous longs et les débits hors plage sans les compter comme zéro',()=>{
  const result=summarizeDailyEnergyClimateContext([
    row(0),row(1),row(5),row(6,400),row(7,400)
  ],{minFanHours:1,minClimateSamples:3,minDays:1});
  assert.equal(result.matchedDays.length,1);
  assert.equal(result.days[0].fanHours,1);
  assert.equal(result.days[0].estimatedKwh,0.01);
});

test('conserve le contexte intérieur si les mesures entrantes sont absentes',()=>{
  const result=summarizeDailyEnergyClimateContext([
    row(0,125,{te:null,he:null}),row(1,125,{te:null,he:null}),
    row(2,125,{te:null,he:null}),row(3,125,{te:null,he:null})
  ],{minFanHours:3,minClimateSamples:3,minDays:1});
  const item=result.matchedDays[0];
  assert.equal(item.medianIncomingAbsHumidity,null);
  assert.equal(item.medianDeltaAbsHumidity,null);
  assert.ok(Number.isFinite(item.medianIndoorAbsHumidity));
});

test('ne transforme pas les données manquantes en énergie ou humidité nulles',()=>{
  const result=summarizeDailyEnergyClimateContext([
    {t:day,st:20,sh:60},{t:day+HOUR,st:20,sh:60}
  ],{minFanHours:0,minClimateSamples:3,minDays:1});
  assert.equal(result.matchedDayCount,0);
  assert.equal(result.days[0].estimatedKwh,null);
});

test('écarte un horodatage énergie-climat contradictoire au lieu de garder la dernière ligne',()=>{
  const history=[
    row(0),row(1),row(2),row(3),row(4),
    row(2,125,{sh:95})
  ];
  const result=summarizeDailyEnergyClimateContext(history,{
    maxGapHours:1,minFanHours:1,minClimateSamples:3,minDays:1
  });
  assert.equal(result.status,'available');
  assert.equal(result.duplicateTimestampCount,1);
  assert.equal(result.conflictingTimestampCount,1);
  assert.equal(result.days[0].climateSampleCount,4);
  assert.equal(result.days[0].fanHours,2);
  assert.equal(result.days[0].estimatedKwh,0.02);
});

test('ignore les métadonnées annexes lors du contrôle des doublons énergie-climat',()=>{
  const history=[row(0),row(1),row(2),row(3),row(4)];
  const duplicate={...history[2],vmiModeRaw:1,rawPayload:'ancienne trame'};
  const enriched={...history[2],vmiModeRaw:2,rawPayload:'trame différente'};
  const result=summarizeDailyEnergyClimateContext(
    [...history,duplicate,enriched],
    {maxGapHours:1,minFanHours:3,minClimateSamples:3,minDays:1}
  );
  assert.equal(result.status,'available');
  assert.equal(result.duplicateTimestampCount,1);
  assert.equal(result.conflictingTimestampCount,0);
  assert.equal(result.days[0].climateSampleCount,5);
  assert.equal(result.days[0].fanHours,4);
});

test('rejette les paramètres énergie-climat invalides',()=>{
  const history=[row(0),row(1),row(2),row(3)];
  for(const options of [
    {maxGapHours:0},
    {maxGapHours:Infinity},
    {maxGapHours:NaN},
    {minFanHours:-1},
    {minFanHours:Infinity},
    {minClimateSamples:0},
    {minClimateSamples:1.5},
    {minClimateSamples:Number.MAX_SAFE_INTEGER+1},
    {minDays:-1},
    {minDays:1.5},
    {minDays:Number.MAX_SAFE_INTEGER+1}
  ]){
    assert.throws(
      ()=>summarizeDailyEnergyClimateContext(history,options),
      RangeError
    );
  }
});

test('accepte une couverture énergétique nulle et zéro jour requis',()=>{
  const result=summarizeDailyEnergyClimateContext([row(0)],{
    minFanHours:0,minClimateSamples:1,minDays:0
  });
  assert.equal(result.status,'available');
  assert.equal(result.matchedDayCount,0);
});
