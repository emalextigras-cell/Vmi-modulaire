import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('les états Boost et Vacances restent décodés après la vitesse brute', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /cur\\.vit=a\\[34\\]\\+1;[^\\n]*\\n\\s*cur\\.boost=a\\[44\\];cur\\.hol=a\\[43\\];cur\\.rpm=null;/);
  assert.doesNotMatch(source, /cur\\.vit=a\\[34\\]\\+1;[^\\n]*\\\\n\\s*cur\\.boost=/);
});
