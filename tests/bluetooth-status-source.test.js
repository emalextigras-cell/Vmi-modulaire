import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les états Boost et Vacances restent décodés après la vitesse brute', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const valid = 'cur.vit=a[34]+1; // code brut VMI : ne jamais le traiter comme niveau manuel\n  cur.boost=a[44];cur.hol=a[43];cur.rpm=null;';
  const broken = 'cur.vit=a[34]+1; // code brut VMI : ne jamais le traiter comme niveau manuel\\n   cur.boost=a[44];cur.hol=a[43];cur.rpm=null;';
  assert.ok(source.includes(valid), 'les affectations d’état doivent être sur la ligne suivante');
  assert.ok(!source.includes(broken), 'une séquence \\n littérale ne doit pas neutraliser les affectations');
});
