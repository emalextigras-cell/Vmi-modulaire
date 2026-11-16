import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

test('les ressources locales déclarées dans index.html existent', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(value => !value.startsWith('#') && !/^(?:[a-z]+:|\/\/)/i.test(value));

  for (const ref of refs) {
    const path = resolve(root, ref.split(/[?#]/, 1)[0]);
    await access(path, constants.R_OK);
  }
});

test('les identifiants HTML sont uniques et les ancres internes existent', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], 'Un même id HTML ne doit apparaître qu’une fois');

  const idSet = new Set(ids);
  const anchors = [...html.matchAll(/href=["']#([^"']+)["']/g)].map(match => match[1]);
  const missing = anchors.filter(anchor => !idSet.has(anchor));
  assert.deepEqual([...new Set(missing)], [], 'Chaque ancre doit cibler un id existant');
});

test('toutes les ressources du cache initial du service worker existent', async () => {
  const source = await readFile(resolve(root, 'sw.js'), 'utf8');
  const match = source.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(match, 'La liste APP_SHELL doit être présente dans sw.js');

  const entries = [...match[1].matchAll(/["']\.\/([^"']*)["']/g)]
    .map(item => item[1] || 'index.html');

  assert.ok(entries.length > 0, 'Le cache initial doit contenir des ressources');
  for (const entry of entries) {
    await access(resolve(root, entry), constants.R_OK);
  }
});

test('les imports JavaScript locaux existent et sont présents dans le cache hors ligne', async () => {
  const { readdir } = await import('node:fs/promises');
  const { dirname, relative, sep } = await import('node:path');

  async function collectJavaScript(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) found.push(...await collectJavaScript(path));
      else if (entry.isFile() && entry.name.endsWith('.js')) found.push(path);
    }
    return found;
  }

  const files = [resolve(root, 'js/app.js'), ...await collectJavaScript(resolve(root, 'js/modules'))];
  const sw = await readFile(resolve(root, 'sw.js'), 'utf8');
  const shellMatch = sw.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(shellMatch, 'La liste APP_SHELL doit être présente dans sw.js');
  const cached = new Set([...shellMatch[1].matchAll(/["']\.\/([^"']*)["']/g)]
    .map(match => match[1] || 'index.html'));

  const missing = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+)["']/g)]
      .map(match => match[1]);

    for (const specifier of imports) {
      const target = resolve(dirname(file), specifier);
      try {
        await access(target, constants.R_OK);
      } catch {
        missing.push(relative(root, file) + ' -> ' + specifier + ' (fichier absent)');
        continue;
      }

      const cachePath = relative(root, target).split(sep).join('/');
      if (!cached.has(cachePath)) {
        missing.push(relative(root, file) + ' -> ' + specifier + ' (absent du cache hors ligne)');
      }
    }
  }

  assert.deepEqual(missing, [], 'Chaque dépendance JavaScript locale doit exister et être mise en cache');
});
