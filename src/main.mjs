import './styles.css';
import { emptyMeeting, validateMeeting, clone, inputStamp, notesBackup, parseNotesBackup, markdown, LIMITS, MODEL_CACHE } from './core.mjs';
import { decodeWav } from './wav.mjs';
import { Recorder } from './recorder.mjs';
import { listMeetings, loadMeeting, saveMeeting, deleteMeeting, rawRecords } from './storage.mjs';

const $ = id => document.getElementById(id);
let meeting = emptyMeeting(), audio = null, audioUrl = null, audioVersion = 0, savedRevision = null, savedStamp = null;
let currentTab = 'notes', captureBusy = false, captureFinishing = false, saving = false, generation = 0, worker = null, job = null, proposal = null, consent = false, pendingConsent = null, pendingReplace = null;
const dialogs = ['consent-dialog', 'proposal-dialog', 'downloads-dialog', 'about-dialog', 'replace-dialog'].map($);
const stamp = () => inputStamp(meeting, audioVersion);
const dirty = () => stamp() !== savedStamp;
function message(text, error = false, target = $('status')) { target.textContent = text; target.classList.toggle('error', error); }
function show(dialog) { if (!dialog.open) dialog.showModal(); }
function download(blob, filename) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); } }
function filename(extension) { return `minuta-${meeting.id}.${extension}`; }
function readFields() {
  meeting = validateMeeting({ ...meeting, title: $('meeting-title').value, notes: $('notes').value, transcript: $('transcript').value, summary: $('summary').value, language: $('language').value });
}
function refresh() {
  $('save-state').textContent = dirty() ? 'Borrador sin guardar' : 'Guardado en este navegador';
  $('character-count').textContent = `${meeting[currentTab].length.toLocaleString('es-ES')} caracteres`;
  $('review-proposal').hidden = !proposal; $('audio-ready').hidden = !audio;
  $('transcribe').disabled = !audio || Boolean(job) || captureBusy || Boolean(proposal);
  $('generate-notes').disabled = Boolean(job) || captureBusy || Boolean(proposal) || !(meeting.notes.trim() || meeting.transcript.trim());
  $('record').disabled = Boolean(job) || captureBusy; $('record-kind').disabled = captureBusy;
  $('new-meeting').disabled = captureBusy; $('audio-file').disabled = captureBusy; $('notes-file').disabled = captureBusy;
  $('save-meeting').disabled = captureBusy || saving; $('save-copy').disabled = captureBusy || saving;
  $('export-audio').disabled = !audio || captureBusy;
}
function renderFields() {
  for (const key of ['notes', 'transcript', 'summary']) $(key).value = meeting[key];
  $('meeting-title').value = meeting.title; $('language').value = meeting.language;
  $('meeting-date').textContent = new Date(meeting.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  refresh();
}
function tab(name, focus = false) {
  currentTab = name;
  for (const key of ['notes', 'summary', 'transcript']) { const selected = name === key; $(`tab-${key}`).setAttribute('aria-selected', String(selected)); $(`tab-${key}`).tabIndex = selected ? 0 : -1; $(`panel-${key}`).hidden = !selected; }
  refresh(); if (focus) $(`tab-${name}`).focus();
}
for (const name of ['notes', 'summary', 'transcript']) {
  $(`tab-${name}`).addEventListener('click', () => tab(name));
  $(`tab-${name}`).addEventListener('keydown', event => { const all = ['notes', 'summary', 'transcript']; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (all.indexOf(name) + (event.key === 'ArrowRight' ? 1 : 2)) % 3; tab(all[next], true); } });
}
for (const id of ['meeting-title', 'notes', 'transcript', 'summary', 'language']) $(id).addEventListener(id === 'language' ? 'change' : 'input', () => { try { readFields(); message(''); refresh(); } catch (error) { message(error.message, true); } });
for (const dialog of dialogs) {
  dialog.querySelector('.close-dialog')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
}
function cancelJob(text = '') {
  worker?.terminate(); worker = null; job = null; $('job-panel').hidden = true; $('ai-detail').textContent = ''; refresh(); if (text) message(text);
}
function setAudio(blob, description = '') {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audio = blob; audioVersion += 1; audioUrl = blob ? URL.createObjectURL(blob) : null;
  $('audio-player').pause(); if (audioUrl) $('audio-player').src = audioUrl; else $('audio-player').removeAttribute('src');
  $('audio-description').textContent = description; refresh();
}
async function replaceDocument(next, media, revision) {
  generation += 1; cancelJob(); proposal = null;
  meeting = validateMeeting(next); savedRevision = revision; setAudio(media, media ? `${(media.size / 1024 / 1024).toFixed(1)} MB · guardado localmente` : '');
  savedStamp = revision === null ? null : stamp(); currentTab = 'notes'; tab('notes'); renderFields(); $('downloads-dialog').close();
  message('Conversación abierta.');
}
function requestReplace(action) {
  if (captureBusy) { message('Termina la grabación antes de abrir otra conversación.', true); return; }
  try { readFields(); } catch (error) { message(error.message, true); return; }
  if ((dirty() && (meeting.notes || meeting.transcript || meeting.summary || audio || meeting.title !== 'Nueva conversación')) || proposal) { pendingReplace = action; show($('replace-dialog')); }
  else void action();
}
$('keep-current').addEventListener('click', () => { pendingReplace = null; $('replace-dialog').close(); });
$('replace-current').addEventListener('click', () => { const action = pendingReplace; pendingReplace = null; $('replace-dialog').close(); if (action) void action(); });
$('new-meeting').addEventListener('click', () => requestReplace(() => replaceDocument(emptyMeeting(), null, null)));

async function refreshLibrary() {
  $('meeting-list').replaceChildren(); $('recover-records').hidden = true; message('', false, $('library-message'));
  try {
    const records = await listMeetings();
    if (!records.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'Tus conversaciones guardadas aparecerán aquí.'; $('meeting-list').append(empty); }
    for (const record of records) {
      const item = document.createElement('div'); item.className = 'meeting-item';
      const open = document.createElement('button'); open.className = 'meeting-open'; open.setAttribute('aria-current', record.id === meeting.id ? 'true' : 'false');
      const title = document.createElement('strong'); title.textContent = record.title; const date = document.createElement('span'); date.textContent = new Date(record.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); open.append(title, date);
      open.addEventListener('click', () => requestReplace(async () => { try { const loaded = await loadMeeting(record.id); await replaceDocument(loaded.meeting, loaded.audio, loaded.meeting.revision); } catch (error) { message(error.message, true); } }));
      const remove = document.createElement('button'); remove.className = 'meeting-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', `Eliminar ${record.title}`); let confirmed = false;
      remove.addEventListener('click', async () => { if (!confirmed) { confirmed = true; remove.textContent = '¿Eliminar?'; remove.setAttribute('aria-label', `Confirmar eliminar ${record.title}`); return; } remove.disabled = true; try { await deleteMeeting(record.id, record.revision); if (meeting.id === record.id) { savedRevision = null; savedStamp = null; meeting = { ...meeting, id: crypto.randomUUID(), revision: 0 }; refresh(); } await refreshLibrary(); message('Copia guardada eliminada. El borrador abierto se conserva.'); } catch (error) { message(error.message, true); remove.disabled = false; } });
      item.append(open, remove); $('meeting-list').append(item);
    }
  } catch (error) { $('recover-records').hidden = false; message(error.message, true, $('library-message')); }
}
$('refresh-library').addEventListener('click', refreshLibrary);
$('recover-records').addEventListener('click', async () => { try { download(new Blob([await rawRecords()], { type: 'application/json' }), 'minuta-registros-originales-sin-audio.json'); } catch (error) { message(error.message, true); } });
async function save(copy = false) {
  if (captureBusy || saving) return;
  saving = true;
  try {
    readFields(); let snapshot = clone(meeting); const capturedAudio = audio, snapshotStamp = stamp(), originalId = meeting.id;
    if (copy) { const now = new Date().toISOString(); snapshot = { ...snapshot, id: crypto.randomUUID(), revision: 0, createdAt: now, updatedAt: now }; }
    $('save-meeting').disabled = true; $('save-copy').disabled = true;
    const saved = await saveMeeting(snapshot, capturedAudio, copy ? null : savedRevision);
    if (!copy && meeting.id === originalId) { meeting.revision = saved.revision; meeting.updatedAt = saved.updatedAt; savedRevision = saved.revision; savedStamp = snapshotStamp; }
    await refreshLibrary(); message(copy ? 'Copia guardada. Tu borrador abierto no cambia.' : 'Conversación guardada en este navegador.');
  } catch (error) { message(`${error.message} El borrador sigue abierto.`, true); }
  finally { saving = false; refresh(); }
}
$('save-meeting').addEventListener('click', () => void save()); $('save-copy').addEventListener('click', () => void save(true));

const recorder = new Recorder(seconds => { const minutes = Math.floor(seconds / 60), rest = Math.floor(seconds % 60); $('record-time').textContent = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`; }, text => { if (captureBusy) void finishCapture(text); });
async function finishCapture(text = '') {
  if (!captureBusy || captureFinishing) return; captureFinishing = true; $('stop-record').disabled = true;
  try { const blob = await recorder.stop(true); if (blob) { setAudio(blob, `${(blob.size / 1024 / 1024).toFixed(1)} MB · WAV capturado aquí`); message(text || 'Audio preparado. Puedes escucharlo, transcribirlo o descargarlo.'); } else message('La grabación era demasiado corta. No ha sustituido el audio anterior.', true); }
  catch (error) { message(error.message, true); }
  finally { captureBusy = false; captureFinishing = false; $('stop-record').disabled = false; $('stop-record').hidden = true; $('record').hidden = false; refresh(); }
}
$('record').addEventListener('click', async () => {
  if (captureBusy || job) return; captureBusy = true; $('record').hidden = true; $('stop-record').hidden = false; $('record-time').textContent = '00:00'; refresh();
  try { const started = await recorder.start($('record-kind').value === 'tab' ? 'tab' : 'microphone'); if (!started) { captureBusy = false; $('stop-record').hidden = true; $('record').hidden = false; refresh(); } else message('Grabando. Solo se conservará el audio cuando termines.'); }
  catch (error) { await recorder.stop(false); captureBusy = false; $('stop-record').hidden = true; $('record').hidden = false; refresh(); message(error.message, true); }
});
$('stop-record').addEventListener('click', () => void finishCapture());
$('audio-file').addEventListener('change', async event => {
  const file = event.target.files?.[0], epoch = ++generation; if (!file) return;
  try { if (file.size > LIMITS.audioBytes) throw new Error('El WAV supera los 128 MB.'); const decoded = decodeWav(await file.arrayBuffer()); if (epoch !== generation) return; cancelJob(); setAudio(file, `${Math.round(decoded.seconds)} segundos · ${(file.size / 1024 / 1024).toFixed(1)} MB`); message('Audio abierto. No se ha enviado a ningún servicio.'); }
  catch (error) { if (epoch === generation) message(`${error.message} El audio anterior se conserva.`, true); }
  finally { event.target.value = ''; }
});

function askAI(kind) {
  if (job || proposal || captureBusy) return;
  try { readFields(); if (kind === 'voice' && !audio) throw new Error('Graba o abre un WAV antes de transcribir.'); if (kind === 'notes' && !meeting.notes.trim() && !meeting.transcript.trim()) throw new Error('Escribe unas notas o añade una transcripción.'); }
  catch (error) { message(error.message, true); return; }
  if (!consent) { pendingConsent = kind; show($('consent-dialog')); } else startAI(kind);
}
$('transcribe').addEventListener('click', () => askAI('voice')); $('generate-notes').addEventListener('click', () => askAI('notes'));
$('cancel-consent').addEventListener('click', () => { pendingConsent = null; $('consent-dialog').close(); });
$('confirm-consent').addEventListener('click', () => { const kind = pendingConsent; pendingConsent = null; consent = true; $('consent-dialog').close(); if (kind) startAI(kind); });
function startAI(kind) {
  if (job || proposal || captureBusy) return;
  const snapshot = clone(meeting), snapshotAudio = audio, snapshotAudioVersion = audioVersion, snapshotStamp = stamp(), id = crypto.randomUUID();
  job = { id, kind, snapshot, snapshotAudio, snapshotAudioVersion, stamp: snapshotStamp }; $('job-panel').hidden = false; $('job-progress').removeAttribute('value'); $('job-status').textContent = 'Preparando el modelo local…'; $('ai-detail').textContent = ''; refresh();
  worker ||= new Worker(new URL('./ai.worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    if (!job || event.data.id !== job.id) return;
    const result = event.data;
    if (result.type === 'progress') {
      const labels = { loading: 'Preparando el modelo local', transcribing: 'Transcribiendo el audio', drafting: 'Preparando un borrador', extracting: 'Leyendo un fragmento', combining: 'Uniendo los fragmentos' };
      $('job-status').textContent = `${labels[result.stage] || 'Procesando'}${result.index ? ` · ${result.index}` : ''}…`;
      if (Number.isFinite(result.percent)) { $('job-progress').max = 100; $('job-progress').value = result.percent; } else $('job-progress').removeAttribute('value');
    } else if (result.type === 'result') {
      const captured = job; job = null; $('job-panel').hidden = true;
      proposal = { ...captured, text: result.text, meta: result.meta }; refresh(); message('Borrador preparado. Revísalo antes de aplicarlo.'); openProposal();
    } else if (result.type === 'error') {
      const messages = { SILENT_AUDIO: 'El audio es demasiado silencioso para transcribirlo.', CONTEXT_LIMIT: 'El texto es demasiado extenso para este modelo local. Conserva el original y prepara un fragmento más corto.', EMPTY_SOURCE: 'Añade notas o una transcripción antes de preparar el borrador.', TRANSCRIPT_LIMIT: 'La transcripción supera el límite de esta conversación.' };
      cancelJob(); message(`${messages[result.code] || 'No se ha podido completar la IA local. Comprueba la conexión para descargar los modelos o usa un ordenador con más memoria.'} Tu cuaderno no ha cambiado.`, true);
      $('ai-detail').textContent = `Código de diagnóstico: ${result.code}`;
    }
  };
  worker.onerror = () => { cancelJob(); message('El motor local no ha podido continuar. Tu audio y tus notas se conservan.', true); };
  worker.postMessage({ id, kind, meeting: snapshot, blob: snapshotAudio });
}
$('cancel-job').addEventListener('click', () => cancelJob('IA cancelada. El cuaderno y el audio siguen abiertos.'));
function openProposal() {
  if (!proposal) return;
  $('proposal-text').value = proposal.text;
  $('proposal-description').textContent = proposal.kind === 'voice' ? 'Transcripción propuesta. Comprueba nombres y palabras antes de copiarla a tu conversación.' : 'Notas propuestas a partir del texto que había al empezar. Revisa acuerdos, responsables y fechas.';
  const stale = meeting.id !== proposal.snapshot.id || stamp() !== proposal.stamp;
  $('apply-proposal').disabled = stale;
  $('proposal-state').textContent = stale ? 'La conversación cambió mientras trabajaba la IA. El borrador no puede sustituir tus cambios; puedes descargarlo o guardarlo como una copia.' : 'Solo se aplicará el texto que tú ves y revisas aquí.';
  show($('proposal-dialog'));
}
$('review-proposal').addEventListener('click', openProposal);
$('proposal-text').addEventListener('input', () => { if (proposal) proposal.text = $('proposal-text').value; });
$('apply-proposal').addEventListener('click', () => {
  if (!proposal || meeting.id !== proposal.snapshot.id || stamp() !== proposal.stamp) { openProposal(); return; }
  try { const field = proposal.kind === 'voice' ? 'transcript' : 'summary'; meeting = validateMeeting({ ...meeting, [field]: $('proposal-text').value }); proposal = null; $('proposal-dialog').close(); renderFields(); tab(field); message('Texto revisado aplicado. Guarda la conversación cuando quieras.'); } catch (error) { message(error.message, true); }
});
$('copy-proposal').addEventListener('click', async () => {
  if (!proposal) return;
  const captured = proposal, field = captured.kind === 'voice' ? 'transcript' : 'summary', now = new Date().toISOString();
  try { const next = validateMeeting({ ...captured.snapshot, id: crypto.randomUUID(), revision: 0, title: `${captured.snapshot.title.slice(0, 98)} — borrador IA`, createdAt: now, updatedAt: now, [field]: $('proposal-text').value }); await saveMeeting(next, captured.snapshotAudio, null); await refreshLibrary(); message('Copia guardada. El borrador abierto no cambia.'); } catch (error) { message(error.message, true); }
});
$('download-proposal').addEventListener('click', () => { if (proposal) download(new Blob([$('proposal-text').value], { type: 'text/plain;charset=utf-8' }), `minuta-borrador-${proposal.kind}.txt`); });
$('discard-proposal').addEventListener('click', () => { proposal = null; $('proposal-dialog').close(); refresh(); message('Borrador de IA descartado. Tus notas no cambian.'); });

$('open-downloads').addEventListener('click', () => { message('', false, $('download-status')); refresh(); show($('downloads-dialog')); });
$('export-markdown').addEventListener('click', () => { try { readFields(); download(new Blob([markdown(meeting)], { type: 'text/markdown;charset=utf-8' }), filename('md')); } catch (error) { message(error.message, true, $('download-status')); } });
$('export-json').addEventListener('click', () => { try { readFields(); download(new Blob([notesBackup(meeting)], { type: 'application/json' }), filename('json')); } catch (error) { message(error.message, true, $('download-status')); } });
$('export-audio').addEventListener('click', () => { if (audio && !captureBusy) download(audio, filename('wav')); });
$('notes-file').addEventListener('change', async event => {
  const file = event.target.files?.[0], epoch = ++generation; if (!file) return;
  try { if (file.size > LIMITS.backupBytes) throw new Error('La copia de notas supera los 512 KB.'); const next = parseNotesBackup(await file.text()); if (epoch === generation && $('downloads-dialog').open) requestReplace(() => replaceDocument(next, null, null)); }
  catch (error) { if (epoch === generation) message(`${error.message} Tu conversación no ha cambiado.`, true, $('download-status')); }
  finally { event.target.value = ''; }
});
$('open-about').addEventListener('click', () => show($('about-dialog')));
$('clear-model-cache').addEventListener('click', async () => { if (job) { message('Cancela la IA antes de liberar los modelos.', true, $('cache-status')); return; } cancelJob(); try { const removed = await caches.delete(MODEL_CACHE); message(removed ? 'Caché de modelos de Minuta eliminada. Las conversaciones se conservan.' : 'No había modelos de Minuta en esta caché.', false, $('cache-status')); } catch { message('El navegador no permite liberar esta caché desde aquí. Las conversaciones no cambian.', true, $('cache-status')); } });
window.addEventListener('beforeunload', event => { if (dirty() && (meeting.notes || meeting.transcript || meeting.summary || audio) || captureBusy || proposal) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { generation += 1; worker?.terminate(); void recorder.stop(false); if (audioUrl) URL.revokeObjectURL(audioUrl); });
renderFields(); void refreshLibrary();
