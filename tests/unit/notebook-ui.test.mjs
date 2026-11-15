import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../../src/core.mjs';
import { decodeWav } from '../../src/wav.mjs';

// Controlled UI callbacks: these checks do not provide browser, layout,
// IndexedDB, microphone, permission or model-inference evidence.
const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../../src/main.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replaceAll('import.meta.url', "'https://minuta.test/src/main.mjs'");
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

async function notebook(options = {}) {
  const calls = { starts: [], stops: [], saves: [], deletes: [], workers: 0 };
  const rows = new Map((options.records || []).map(record => [record.id, structuredClone(record)]));
  let focused, list = options.list || (async () => [...rows.values()]);
  class Element {
    constructor(tag, attrs = '') {
      this.tagName = tag; this.children = []; this.handlers = new Map(); this.attributes = new Map();
      for (const match of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) this.attributes.set(match[1], match[2]);
      this.value = this.attributes.get('value') || ''; this.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs); this.disabled = false; this.open = false;
      this.classes = new Set((this.attributes.get('class') || '').split(' ').filter(Boolean));
      this.classList = { add: value => this.classes.add(value), toggle: (value, force) => force ? this.classes.add(value) : this.classes.delete(value), contains: value => this.classes.has(value) };
      this.textContent = '';
    }
    set className(value) { this.classes = new Set(value.split(' ').filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() {}
    pause() {}
    focus() { focused = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    querySelector() { return null; }
    closest() { return audioPanel; }
    addEventListener(type, callback) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(callback); }
    async send(type, detail = {}) { if (type === 'click' && this.disabled) return; for (const callback of this.handlers.get(type) || []) await callback({ target: this, preventDefault() {}, ...detail }); await settle(); }
    click() { return this.send('click'); }
  }
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    assert.ok(!elements.has(match[3]), `Duplicate HTML ID ${match[3]}`);
    elements.set(match[3], new Element(match[1], match[2]));
  }
  const audioPanel = new Element('aside');
  const get = id => { assert.ok(elements.has(id), `Missing HTML ID ${id}`); return elements.get(id); };
  const document = { getElementById: get, createElement: tag => new Element(tag), body: new Element('body') };
  const window = { addEventListener() {}, scrollTo() {} };
  class Recorder {
    async start(kind) { calls.starts.push(kind); return options.start ? options.start(kind) : true; }
    async stop(keep) { calls.stops.push(keep); return options.stop ? options.stop(keep) : null; }
  }
  const context = vm.createContext({
    ...core, decodeWav, document, window, Recorder, crypto, Blob, setTimeout,
    URL: class extends URL { static createObjectURL() { return 'blob:controlled-audio'; } static revokeObjectURL() {} },
    Worker: class { constructor() { calls.workers++; calls.worker = this; } postMessage(payload) { calls.request = payload; } terminate() {} },
    listMeetings: () => list(),
    loadMeeting: async id => { const meeting = rows.get(id); if (!meeting) throw new Error('Ya no está guardada.'); return { meeting, audio: null }; },
    saveMeeting: async (meeting, audio, revision) => {
      calls.saves.push({ meeting: structuredClone(meeting), audio, revision });
      if (options.saveError) throw new Error(options.saveError);
      const saved = { ...meeting, revision: (revision ?? 0) + 1 }; rows.set(saved.id, saved); return saved;
    },
    deleteMeeting: async (id, revision) => { calls.deletes.push({ id, revision }); rows.delete(id); },
    rawRecords: async () => '{}',
  });
  vm.runInContext(source, context, { filename: 'minuta-ui-controlled.mjs' }); await settle();
  return { get, calls, rows, audioPanel, focus: () => focused, setList: callback => { list = callback; },
    click: id => get(id).click(), input: async (id, value) => { get(id).value = value; await get(id).send('input'); } };
}
const record = (id, title, notes = '') => ({ ...core.emptyMeeting(id, '2026-11-14T00:00:00.000Z'), title, notes, revision: 1 });

test('P01 opens a real empty library; writing/listening entry never starts capture or a worker', async () => {
  const ui = await notebook();
  assert.equal(ui.get('home-screen').hidden, false); assert.equal(ui.get('editor-screen').hidden, true);
  assert.equal(ui.get('library-count').textContent, '0'); assert.equal(ui.get('meeting-list').children.length, 1);
  await ui.click('start-writing'); assert.equal(ui.get('editor-screen').hidden, false); assert.equal(ui.focus(), ui.get('notes'));
  await ui.click('back-home'); await ui.click('start-listening'); assert.equal(ui.focus(), ui.get('record'));
  assert.equal(ui.calls.starts.length, 0); assert.equal(ui.calls.workers, 0); assert.equal(ui.calls.saves.length, 0);
});
test('P02 going home and resuming preserve an unsaved draft; a new conversation still requires replacement', async () => {
  const ui = await notebook(); await ui.click('start-writing'); await ui.input('notes', 'Una idea que no quiero perder.');
  await ui.input('meeting-title', 'Mi clase'); await ui.click('back-home');
  assert.equal(ui.get('resume-draft').hidden, false); assert.equal(ui.get('draft-title').textContent, 'Mi clase');
  await ui.click('resume-draft'); assert.equal(ui.get('notes').value, 'Una idea que no quiero perder.');
  await ui.click('back-home'); await ui.click('start-listening');
  assert.equal(ui.get('replace-dialog').open, true); assert.equal(ui.get('notes').value, 'Una idea que no quiero perder.');
  await ui.click('keep-current'); assert.equal(ui.get('home-screen').hidden, false);
  await ui.click('start-writing'); await ui.click('replace-current');
  assert.equal(ui.get('notes').value, ''); assert.equal(ui.get('editor-screen').hidden, false); assert.equal(ui.calls.saves.length, 0);
});
test('P03 invalid raw edits survive home navigation, resumption and a rejected replacement', async () => {
  const ui = await notebook(); await ui.click('start-writing'); await ui.input('meeting-title', ''); await ui.input('notes', 'Conservar tal cual.');
  await ui.click('back-home'); assert.equal(ui.get('resume-draft').hidden, false);
  await ui.click('start-writing'); assert.equal(ui.get('home-screen').hidden, false); assert.equal(ui.get('replace-dialog').open, false);
  await ui.click('resume-draft'); assert.equal(ui.get('meeting-title').value, ''); assert.equal(ui.get('notes').value, 'Conservar tal cual.');
});
test('P04 library search folds accents, has an empty result, and renders untrusted text literally', async () => {
  const ui = await notebook({ records: [record('one', 'Café del sábado', '<img src=x onerror=alert(1)>'), record('two', 'Una clase')] });
  await ui.input('library-search', 'CAFE'); assert.equal(ui.get('library-count').textContent, '1 de 2');
  const card = ui.get('meeting-list').children[0].children[0];
  assert.equal(card.children[0].textContent, 'Café del sábado'); assert.equal(card.children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(card.children[1].children.length, 0);
  await ui.input('library-search', 'sin coincidencia'); assert.equal(ui.get('library-count').textContent, '0 de 2');
  assert.equal(ui.get('meeting-list').children[0].children[0].textContent, 'No encontramos ese título.');
  await ui.input('library-search', ''); assert.equal(ui.get('meeting-list').children.length, 2);
});
test('P05 an older library read cannot replace a newer refresh; failed reads expose recovery', async () => {
  const older = deferred(), ui = await notebook({ list: () => older.promise });
  ui.setList(async () => [record('latest', 'La lectura más reciente')]); await ui.click('go-home');
  older.resolve([record('old', 'Lectura antigua')]); await settle();
  assert.equal(ui.get('meeting-list').children[0].children[0].children[0].textContent, 'La lectura más reciente');
  ui.setList(async () => { throw new Error('La biblioteca contiene una entrada que no se puede leer.'); }); await ui.click('refresh-library');
  assert.equal(ui.get('recover-records').hidden, false); assert.match(ui.get('library-message').textContent, /no se puede leer/);
  assert.equal(ui.get('meeting-list').children[0].children[0].children[0].textContent, 'La lectura más reciente');
});
test('P06 opening a saved conversation uses the editor; delete is confirmed and preserves its working copy', async () => {
  const ui = await notebook({ records: [record('one', 'Mi conversación', 'Mis palabras')] });
  await ui.get('meeting-list').children[0].children[0].click();
  assert.equal(ui.get('editor-screen').hidden, false); assert.equal(ui.get('notes').value, 'Mis palabras');
  await ui.click('back-home'); const remove = ui.get('meeting-list').children[0].children[1];
  await remove.click(); assert.equal(ui.calls.deletes.length, 0); await remove.click();
  assert.equal(ui.calls.deletes.length, 1); assert.equal(ui.calls.deletes[0].revision, 1);
  await ui.click('resume-draft'); assert.equal(ui.get('notes').value, 'Mis palabras'); assert.equal(ui.get('save-state').textContent, 'Borrador sin guardar');
});
test('P07 permission and recording states keep navigation unavailable; denied capture preserves notes', async () => {
  const start = deferred(), ui = await notebook({ start: () => start.promise });
  await ui.click('start-listening'); await ui.input('notes', 'Sigo anotando.');
  const click = ui.click('record'); await settle(); assert.equal(ui.get('back-home').disabled, true);
  assert.equal(ui.get('capture-state').textContent, 'Esperando permiso para grabar…');
  start.resolve(true); await click; assert.match(ui.get('capture-state').textContent, /Grabando/);
  assert.equal(ui.audioPanel.classList.contains('is-recording'), true);
  await ui.click('go-home'); assert.equal(ui.get('editor-screen').hidden, false);
  await ui.click('stop-record'); assert.equal(ui.get('back-home').disabled, false); assert.equal(ui.audioPanel.classList.contains('is-recording'), false);
  assert.equal(ui.get('notes').value, 'Sigo anotando.');
  const denied = await notebook({ start: async () => { throw new Error('Permiso denegado'); } });
  await denied.click('start-listening'); await denied.input('notes', 'Mis apuntes'); await denied.click('record');
  assert.equal(denied.get('go-home').disabled, false); assert.equal(denied.get('notes').value, 'Mis apuntes'); assert.match(denied.get('status').textContent, /Permiso denegado/);
});
test('P08 failed save keeps a resumable working copy and never promises persistence', async () => {
  const ui = await notebook({ saveError: 'No queda espacio en este navegador.' }); await ui.click('start-writing');
  await ui.input('notes', 'No perder esta idea.'); await ui.click('save-meeting');
  assert.match(ui.get('status').textContent, /No queda espacio/); assert.equal(ui.get('save-state').textContent, 'Borrador sin guardar');
  await ui.click('back-home'); assert.equal(ui.get('resume-draft').hidden, false); await ui.click('resume-draft'); assert.equal(ui.get('notes').value, 'No perder esta idea.');
});
test('P09 a pending job stays visible; home navigation preserves its proposal and stale-apply protection', async () => {
  const ui = await notebook(); await ui.click('start-writing'); await ui.input('notes', 'Clara revisará las cifras.');
  await ui.click('generate-notes'); assert.equal(ui.calls.workers, 1); assert.equal(ui.get('go-home').disabled, true);
  await ui.click('back-home'); assert.equal(ui.get('editor-screen').hidden, false);
  ui.calls.worker.onmessage({ data: { id: ui.calls.request.id, type: 'result', text: 'Clara revisará las cifras.', meta: { selectedCount: 1, totalUnits: 1 } } });
  assert.equal(ui.get('proposal-dialog').open, true); assert.equal(ui.get('go-home').disabled, false);
  ui.get('proposal-dialog').close(); await ui.input('notes', 'Clara revisará las cifras el lunes.'); await ui.click('back-home');
  assert.equal(ui.get('resume-draft').hidden, false); assert.equal(ui.get('draft-label').textContent, 'Tienes un borrador por revisar');
  await ui.click('resume-draft'); await ui.click('review-proposal'); assert.equal(ui.get('apply-proposal').disabled, true);
  await ui.click('apply-proposal'); assert.equal(ui.get('notes').value, 'Clara revisará las cifras el lunes.'); assert.equal(ui.get('summary').value, '');
  await ui.click('copy-proposal'); assert.equal(ui.calls.saves.length, 1);
  assert.equal(ui.calls.saves[0].meeting.notes, 'Clara revisará las cifras.'); assert.equal(ui.calls.saves[0].meeting.summary, 'Clara revisará las cifras.');
  assert.equal(ui.get('notes').value, 'Clara revisará las cifras el lunes.');
});
