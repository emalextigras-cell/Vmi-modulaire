import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les index électriques ne changent en mémoire qu’après validation IndexedDB', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const formStart = source.indexOf("$('energyMeterForm').addEventListener");
  const deleteStart = source.indexOf("$('energyMeterHistory').addEventListener");
  assert.ok(formStart >= 0 && deleteStart > formStart);
  const form = source.slice(formStart, deleteStart);
  const remove = source.slice(deleteStart, source.indexOf("$('restoreFile').onchange", deleteStart));
  assert.match(form, /const nextReadings=upsertEnergyReading[\s\S]*?await dbSetMany\(\[\['energyReadings',nextReadings\]\]\);\s*energyReadings=nextReadings;/);
  assert.match(remove, /const nextReadings=energyReadings\.filter[\s\S]*?await dbSetMany\(\[\['energyReadings',nextReadings\]\]\);\s*energyReadings=nextReadings;/);
  assert.doesNotMatch(form, /await dbSet\('energyReadings'/);
  assert.doesNotMatch(remove, /await dbSet\('energyReadings'/);
});
