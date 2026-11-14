import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { decodeWav } from '../../src/wav.mjs';
import { notesBackup, emptyMeeting } from '../../src/core.mjs';

const { chromium } = await import(process.env.MINUTA_PLAYWRIGHT);
const out = process.env.MINUTA_OUTPUT, base = process.env.MINUTA_URL;
assert.match(base, /^https:\/\/[^/]+\.vercel\.app\/?$/);
assert.match(process.env.MINUTA_DEPLOYMENT_SHA, /^[a-f0-9]{40}$/);
assert.ok(process.env.MINUTA_EXPECTED_MANIFEST, 'Use the current locked scratch build manifest');
const origin = new URL(base).origin, fixture = JSON.parse(await readFile('tests/fixtures/speech-v2.json', 'utf8'));
const modelManifest = JSON.parse(await readFile('docs/qualification/models-v3.json', 'utf8'));
await mkdir(join(out, 'downloads'));
await mkdir(join(out, 'http'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const result = { passed: false, deployment: { url: base, sha: process.env.MINUTA_DEPLOYMENT_SHA }, cases: [], models: [], requests: [], errors: [], console: [], publicBodies: [], teardown: {} };
const requests = [], bodies = new Map(), contexts = [], pendingResponses = [];
const selected = new Set((process.env.MINUTA_CASES || 'E31,E32,E33,B01,B02,B03').split(','));
assert.ok([...selected].every(name => ['E31', 'E32', 'E33', 'B01', 'B02', 'B03'].includes(name)));
result.selected = [...selected];
let browser, modelPage;
function recordNetwork(context) {
  context.on('request', request => {
    const u = new URL(request.url());
    if (!['http:', 'https:'].includes(u.protocol)) return;
    const body = request.postDataBuffer();
    requests.push({ url: u.origin + u.pathname, method: request.method(), bodyBytes: body?.length || 0 });
  });
  context.on('response', response => {
    const u = new URL(response.url());
    if (u.origin !== origin || bodies.has(u.pathname) || response.status() !== 200) return;
    bodies.set(u.pathname, null);
    pendingResponses.push((async () => {
      try {
        const bytes = await response.body(), type = response.headers()['content-type'] || '';
        const row = { path: u.pathname, status: response.status(), type, bytes: bytes.length, sha256: sha(bytes) };
        if (/text|javascript|json|svg/.test(type)) {
          const name = sha(Buffer.from(u.pathname)).slice(0, 16) + '.body.gz';
          await writeFile(join(out, 'http', name), gzipSync(bytes, { mtime: 0 })); row.body = name;
        }
        bodies.set(u.pathname, row);
      } catch (error) { bodies.set(u.pathname, { path: u.pathname, error: String(error) }); }
    })());
  });
}
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 920 }, acceptDownloads: true, ...options });
  contexts.push(ctx); recordNetwork(ctx);
  ctx.on('page', page => { page.on('pageerror', error => result.errors.push(String(error))); page.on('console', entry => { if (entry.type() === 'error') result.console.push(entry.text()); }); page.on('dialog', dialog => void dialog.dismiss()); });
  return ctx;
}
async function open(ctx) { const page = await ctx.newPage(); await page.goto(base, { waitUntil: 'networkidle' }); await page.locator('#notes').waitFor(); return page; }
async function exportFile(page, id, name) {
  const wait = page.waitForEvent('download'); await page.locator(id).click(); const file = await wait;
  const path = join(out, 'downloads', name); await file.saveAs(path); assert.equal(await file.failure(), null);
  return readFile(path);
}
async function exportedNotes(page, name) {
  await page.locator('#open-downloads').click(); const bytes = await exportFile(page, '#export-json', name);
  await page.locator('#downloads-dialog .close-dialog').click(); return JSON.parse(bytes);
}
async function save(page) { await page.locator('#save-meeting').click(); await page.waitForFunction(() => document.querySelector('#save-state').textContent === 'Guardado en este navegador' && document.querySelector('#status').textContent.includes('Conversación guardada')); }
async function fresh(page) {
  await page.locator('#new-meeting').click(); if (await page.locator('#replace-dialog').isVisible()) await page.locator('#replace-current').click();
  await page.locator('#meeting-title').fill('Nueva conversación');
}
async function records(page) { return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open('minuta-local-v1', 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('meetings', 'readonly'), rows = tx.objectStore('meetings').getAll(); tx.oncomplete = () => { resolve(rows.result); db.close(); }; tx.onabort = () => reject(tx.error); }; })); }
async function openSaved(page, title) { await page.locator('.meeting-open').filter({ has: page.getByText(title, { exact: true }) }).click(); if (await page.locator('#replace-dialog').isVisible()) await page.locator('#replace-current').click(); await assert.doesNotReject(() => page.waitForFunction(title => document.querySelector('#meeting-title').value === title, title)); }
async function run(name, action) {
  if (!name.startsWith('Exact ') && !selected.has(name.split(' ')[0])) return;
  const row = { name, passed: false, started: new Date().toISOString() }; result.cases.push(row); console.log(`START ${name}`);
  try { Object.assign(row, await action()); row.passed = true; } catch (error) {
    row.error = String(error.stack || error);
    row.ui = [];
    for (const ctx of contexts) for (const page of ctx.pages()) {
      try { row.ui.push(await page.evaluate(() => ({ url: location.origin + location.pathname, status: document.querySelector('#status')?.textContent, diagnostic: document.querySelector('#ai-detail')?.textContent, recording: !document.querySelector('#stop-record')?.hidden }))); await page.screenshot({ path: join(out, `failure-${result.cases.length}-${row.ui.length}.png`), fullPage: true }); } catch {}
    }
    throw error;
  }
  finally { row.finished = new Date().toISOString(); await writeFile(join(out, 'browser-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(row)); }
}
const words = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
function wer(reference, actual) { const a = words(reference), b = words(actual); let prior = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prior[j] + 1, prior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prior = next; } return prior[b.length] / a.length; }
async function proposal(page, button, edit = null) {
  const count = await page.evaluate(() => window.__minutaProbe.events.length);
  await page.locator(button).click();
  if (await page.locator('#consent-dialog').isVisible()) await page.locator('#confirm-consent').click();
  if (edit) await edit();
  await page.waitForFunction(count => window.__minutaProbe.events.length > count, count, { timeout: 240000 });
  const event = await page.evaluate(() => window.__minutaProbe.events.at(-1));
  result.models.push(event); assert.equal(event.type, 'result', JSON.stringify(event));
  await page.locator('#proposal-dialog').waitFor({ timeout: 10000 }); return event;
}
async function modelDigests(page) {
  return page.evaluate(async () => {
    const cache = await caches.open('minuta-models-v1'), rows = [];
    for (const request of await cache.keys()) {
      const u = new URL(request.url); if (!u.pathname.endsWith('.onnx')) continue;
      const response = await cache.match(request), bytes = await response.arrayBuffer(), digest = await crypto.subtle.digest('SHA-256', bytes);
      rows.push({ url: u.origin + u.pathname, bytes: bytes.byteLength, sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') });
    }
    return rows;
  });
}
function verifyModelDigests(actual) {
  for (const row of actual) {
    const model = modelManifest.models.find(m => row.url.includes(`/${m.id}/resolve/${m.revision}/`)); assert.ok(model, row.url);
    const expected = model.files.find(file => row.url.endsWith(`/${file.path}`)); assert.ok(expected, row.url);
    assert.equal(row.bytes, expected.bytes); assert.equal(row.sha256, expected.sha256);
  }
}

try {
  browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(out, 'english.wav')}`] });
  result.browser = browser.version(); result.node = process.version;
  const ctx = await context({ permissions: ['microphone'] });
  await ctx.addInitScript(() => {
    window.__minutaProbe = { events: [], tracks: [], contexts: [] };
    const WorkerBase = window.Worker;
    window.Worker = class extends WorkerBase { constructor(...args) { super(...args); this.addEventListener('message', event => { if (event.data?.type === 'result' || event.data?.type === 'error') window.__minutaProbe.events.push(event.data); }); } };
    const ContextBase = window.AudioContext;
    window.AudioContext = class extends ContextBase { constructor(...args) { super(...args); window.__minutaProbe.contexts.push(this); } };
    if (navigator.mediaDevices?.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await original(...args); window.__minutaProbe.tracks.push(...stream.getTracks()); return stream; };
    }
  });
  const page = await open(ctx); modelPage = page;
  await run('Exact anonymous production assets', async () => {
    const manifest = JSON.parse(await readFile(process.env.MINUTA_EXPECTED_MANIFEST, 'utf8'));
    for (const expected of manifest) {
      const path = expected.path === 'index.html' ? '/' : `/${expected.path}`;
      const response = await ctx.request.get(origin + path), bytes = await response.body();
      assert.equal(response.status(), 200, path); assert.equal(bytes.length, expected.bytes, path); assert.equal(sha(bytes), expected.sha256, path);
      const type = response.headers()['content-type'] || '';
      const row = { path, status: response.status(), type, bytes: bytes.length, sha256: sha(bytes), explicitAnonymousAssetCheck: true };
      if (/text|javascript|json|svg/.test(type)) { const name = sha(Buffer.from(path)).slice(0, 16) + '.body.gz'; await writeFile(join(out, 'http', name), gzipSync(bytes, { mtime: 0 })); row.body = name; }
      bodies.set(path, row); await response.dispose();
    }
    return { files: manifest.length, bytes: manifest.reduce((sum, row) => sum + row.bytes, 0) };
  });
  result.priorAcceptedCapture = { run: 43579983642, source: '5fd573137b238d360f11ebef68defd7769c380a0', replayed: false };
  result.priorAcceptedTranscriptions = { run: 43580715419, englishWer: 0.125, spanishWer: 3 / 22, qualityScope: 'two synthetic v2 fixtures only' };
  async function importAccepted(language) {
    await page.locator('#open-downloads').click();
    await page.locator('#notes-file').setInputFiles(`tests/fixtures/speech-v2/${language}-accepted-transcript.json`);
    if (await page.locator('#replace-dialog').isVisible()) await page.locator('#replace-current').click();
    await page.waitForFunction(title => document.querySelector('#meeting-title').value === title, `Speech ${language}`);
    return JSON.parse(await readFile(`tests/fixtures/speech-v2/${language}-accepted-transcript.json`, 'utf8')).meeting;
  }
  function verifyQuotes(event, source) {
    assert.equal(event.meta.method, 'source-extract-v1');
    assert.ok(event.meta.units.length > 0);
    for (const unit of event.meta.units) assert.equal(unit.text, source[unit.source].slice(unit.start, unit.end));
    assert.equal(event.meta.selectedCount + event.meta.omittedCount, event.meta.totalUnits);
  }
  await run('E31 actual English excerpt with stale and invalid edits', async () => {
    const input = await importAccepted('english'), event = await proposal(page, '#generate-notes'); verifyQuotes(event, input);
    assert.ok(/Nora/i.test(event.text) && /Monday/i.test(event.text));
    assert.equal(await page.locator('#consent-dialog').isVisible(), false);
    await page.locator('#proposal-dialog .close-dialog').click();
    await page.locator('#notes').fill('Newer notes: do not overwrite this edit.'); await page.locator('#meeting-title').fill('');
    await page.locator('#review-proposal').click();
    assert.equal(await page.locator('#apply-proposal').isDisabled(), true);
    assert.equal(await page.locator('#meeting-title').inputValue(), '');
    await exportFile(page, '#download-proposal', 'english-source-excerpt.txt');
    await page.screenshot({ path: join(out, 'stale-proposal.png'), fullPage: true });
    await page.locator('#copy-proposal').click(); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Copia guardada'));
    const copy = (await records(page)).find(r => r.title === 'Speech english — extracto'); assert.equal(copy.notes, input.notes); assert.equal(copy.transcript, input.transcript); assert.equal(copy.summary, event.text);
    assert.equal(await page.locator('#notes').inputValue(), 'Newer notes: do not overwrite this edit.');
    await page.locator('#discard-proposal').click(); await page.locator('#meeting-title').fill('Speech english'); await save(page);
    return { exactSourceQuotes: true, staleApplyDisabled: true, invalidTitleRetained: true, capturedCopyPreserved: true, meta: event.meta };
  });
  await run('E32 actual Spanish excerpt reviewed apply and exports', async () => {
    const input = await importAccepted('spanish'), event = await proposal(page, '#generate-notes'); verifyQuotes(event, input);
    assert.ok(/Clara/i.test(event.text) && /martes/i.test(event.text));
    await page.locator('#apply-proposal').click(); await save(page);
    const exported = await exportedNotes(page, 'spanish-reviewed.json'); assert.equal(exported.meeting.summary, event.text);
    await page.locator('#open-downloads').click(); await exportFile(page, '#export-markdown', 'spanish-reviewed.md'); await page.locator('#downloads-dialog .close-dialog').click();
    await page.screenshot({ path: join(out, 'reviewed-notes.png'), fullPage: true });
    assert.equal(requests.some(r => new URL(r.url).origin !== origin), false, 'Excerpts require no model/network download');
    return { exactSourceQuotes: true, reviewedApply: true, noModelDownload: true, meta: event.meta };
  });
  await run('E33 changed worker ASR transport regression', async () => {
    await fresh(page); const input = fixture.cases[0]; await page.locator('#meeting-title').fill('ASR worker regression'); await page.locator('#language').selectOption('english');
    await page.locator('#audio-file').setInputFiles(join(out, 'english.wav')); await page.locator('#status').filter({ hasText: 'Audio abierto' }).waitFor();
    const event = await proposal(page, '#transcribe'), rate = wer(input.text, event.text); assert.ok(rate <= 0.35, `WER ${rate}`);
    await writeFile(join(out, 'worker-regression-transcript.txt'), event.text);
    await page.locator('#apply-proposal').click(); await save(page); const exported = await exportedNotes(page, 'worker-regression.json'); assert.equal(exported.meeting.transcript, event.text);
    const actual = await modelDigests(page); assert.equal(actual.length, 2); verifyModelDigests(actual); result.modelBodies = actual;
    return { wer: rate, existingFixture: true, heldOut: false, model: event.meta.model, actual };
  });
  const isolated = await context(), notebook = await open(isolated);
  await run('B01 notebook persistence imports conflicts deletion', async () => {
    const title = 'Authored <literal> notebook';
    await notebook.locator('#meeting-title').fill(title); await notebook.locator('#notes').fill('Literal <script>window.bad=1</script> & 🙂'); await save(notebook);
    const initial = await exportedNotes(notebook, 'notebook-initial.json'); assert.equal(initial.includesAudio, false);
    await notebook.reload({ waitUntil: 'networkidle' }); await openSaved(notebook, title);
    assert.equal(await notebook.locator('#notes').inputValue(), initial.meeting.notes); assert.equal(await notebook.evaluate(() => window.bad), undefined);
    await notebook.locator('#notes').fill('Keep current draft.'); await notebook.locator('#open-downloads').click(); await notebook.locator('#notes-file').setInputFiles(join(out, 'downloads/notebook-initial.json'));
    await notebook.locator('#replace-dialog').waitFor(); await notebook.locator('#keep-current').click(); await notebook.locator('#downloads-dialog .close-dialog').click(); assert.equal(await notebook.locator('#notes').inputValue(), 'Keep current draft.');
    await notebook.locator('#open-downloads').click(); await notebook.locator('#notes-file').setInputFiles(join(out, 'downloads/notebook-initial.json')); await notebook.locator('#replace-current').click();
    await notebook.locator('#meeting-title').fill('Imported notebook'); await save(notebook); const imported = await exportedNotes(notebook, 'notebook-imported.json'); assert.notEqual(imported.meeting.id, initial.meeting.id);
    // Two pages open the same original revision, then one commits first.
    await openSaved(notebook, title);
    const other = await open(isolated); await openSaved(other, title);
    await notebook.locator('#notes').fill('First writer wins this revision.'); await save(notebook);
    await other.locator('#notes').fill('Stale draft must survive.'); await other.locator('#save-meeting').click(); await other.locator('#status').filter({ hasText: 'cambió en otra pestaña' }).waitFor();
    assert.equal(await other.locator('#notes').inputValue(), 'Stale draft must survive.');
    assert.equal((await records(notebook)).find(r => r.id === initial.meeting.id).notes, 'First writer wins this revision.');
    await other.locator('#meeting-title').fill('Stale copy'); await other.locator('#save-copy').click(); await other.locator('#status').filter({ hasText: 'Copia guardada' }).waitFor();
    assert.equal((await records(other)).find(r => r.title === 'Stale copy').notes, 'Stale draft must survive.');
    const remove = notebook.locator('.meeting-item').filter({ has: notebook.getByText(title, { exact: true }) }).locator('.meeting-delete');
    await remove.click(); assert.ok((await records(notebook)).some(r => r.id === initial.meeting.id)); await remove.click(); await notebook.locator('#status').filter({ hasText: 'eliminada' }).waitFor();
    assert.equal((await records(notebook)).some(r => r.id === initial.meeting.id), false); assert.equal(await notebook.locator('#notes').inputValue(), 'First writer wins this revision.');
    const afterDelete = await exportedNotes(notebook, 'deleted-open-copy.json'); assert.notEqual(afterDelete.meeting.id, initial.meeting.id);
    await notebook.screenshot({ path: join(out, 'desktop-notebook.png'), fullPage: true });
    return { initialId: initial.meeting.id, importedId: imported.meeting.id, literalText: true, canceledImportPreserved: true, revisionConflictPreserved: true, twoStepDelete: true, openDraftRetained: true };
  });
  await run('B02 narrow layout and keyboard editor', async () => {
    const narrow = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await open(narrow);
    for (const width of [390, 320]) { await p.setViewportSize({ width, height: 844 }); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await p.locator('#notes').tap(); await p.locator('#notes').fill(`Narrow ${width}`); await p.locator('#open-downloads').tap(); await p.locator('#downloads-dialog .close-dialog').tap(); await p.screenshot({ path: join(out, `narrow-${width}.png`), fullPage: true }); }
    await p.locator('#tab-notes').focus(); await p.keyboard.press('ArrowRight'); assert.equal(await p.locator('#tab-summary').getAttribute('aria-selected'), 'true'); return { widths: [390, 320], touchContext: true, keyboardTabs: true };
  });
  await run('B03 malformed import corrupt records and simulated quota', async () => {
    const p = await open(await context()); await p.locator('#meeting-title').fill('Recovery fixture'); await p.locator('#notes').fill('Preserve this working copy.'); await save(p);
    const initial = await exportedNotes(p, 'recovery-initial.json');
    await p.locator('#audio-file').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken') }); await p.locator('#status').filter({ hasText: 'anterior se conserva' }).waitFor();
    await p.locator('#open-downloads').click(); await p.locator('#notes-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') }); await p.locator('#download-status').filter({ hasText: 'no ha cambiado' }).waitFor(); await p.locator('#downloads-dialog .close-dialog').click();
    await p.evaluate(() => { window.__originalTransaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (stores, mode, ...rest) { if (mode === 'readwrite') throw new DOMException('Authored quota fixture', 'QuotaExceededError'); return window.__originalTransaction.call(this, stores, mode, ...rest); }; });
    await p.locator('#notes').fill('Newer draft survives a rejected write.'); await p.locator('#save-meeting').click(); await p.locator('#status').filter({ hasText: 'borrador sigue abierto' }).waitFor(); assert.equal(await p.locator('#notes').inputValue(), 'Newer draft survives a rejected write.');
    await p.evaluate(() => { IDBDatabase.prototype.transaction = window.__originalTransaction; });
    await p.evaluate(id => new Promise((resolve, reject) => { const request = indexedDB.open('minuta-local-v1', 1); request.onsuccess = () => { const db = request.result, tx = db.transaction('meetings', 'readwrite'), store = tx.objectStore('meetings'), get = store.get(id); get.onsuccess = () => store.put({ ...get.result, authoredCorruption: true }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }), initial.meeting.id);
    await p.locator('#save-meeting').click(); await p.locator('#status').filter({ hasText: 'No se ha reemplazado' }).waitFor(); await p.locator('#refresh-library').click(); await p.locator('#recover-records').waitFor(); const raw = JSON.parse(await exportFile(p, '#recover-records', 'recovery-raw.json')); assert.equal(raw.records[0].authoredCorruption, true); assert.equal(raw.records[0].notes, initial.meeting.notes);
    return { rejectedWav: true, rejectedJson: true, simulatedQuotaPreservedDraft: true, corruptRecordUnchanged: true, rawMetadataExport: true };
  });
  result.passed = result.cases.every(c => c.passed) && result.cases.filter(c => selected.has(c.name.split(' ')[0])).length === selected.size;
} catch (error) { result.failure = String(error.stack || error); console.error(error); }
finally {
  if (modelPage && !result.modelBodies) {
    try { if (await modelPage.locator('#cancel-job').isVisible()) await modelPage.locator('#cancel-job').click(); result.modelBodies = await modelDigests(modelPage); verifyModelDigests(result.modelBodies); }
    catch (error) { result.modelHashError = String(error); result.passed = false; }
  }
  await Promise.allSettled(pendingResponses);
  result.publicBodies = [...bodies.values()].filter(Boolean);
  result.requests = requests;
  const uploads = requests.filter(r => !['GET', 'HEAD'].includes(r.method) || r.bodyBytes);
  result.noUploadRequests = uploads.length === 0;
  const unexpectedModelRevisions = requests.filter(r => r.url.includes('huggingface.co/') && r.url.includes('/resolve/') && !modelManifest.models.some(m => r.url.includes(`/${m.id}/resolve/${m.revision}/`)));
  result.pinnedModelRequests = unexpectedModelRevisions.length === 0;
  if (uploads.length || result.errors.length || unexpectedModelRevisions.length) result.passed = false;
  for (const ctx of contexts) { try { await ctx.close(); } catch (error) { result.teardown.contextError = String(error); } }
  if (browser) { await browser.close(); result.teardown.browserDisconnected = !browser.isConnected(); }
  result.teardown.contextsClosed = contexts.length;
  result.passed = result.passed && result.teardown.browserDisconnected && !result.teardown.contextError;
  await writeFile(join(out, 'browser-result.json'), JSON.stringify(result, null, 2));
}
if (!result.passed) process.exitCode = 1;
