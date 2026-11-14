import { LIMITS, validateMeeting } from './core.mjs';
export const DB_NAME = 'minuta-local-v1';

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('No queda espacio en este navegador. Conserva el borrador y descarga las notas y el audio.');
  if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return new Error('El navegador no permite guardar aquí. Puedes descargar las notas y el audio.');
  return error instanceof Error ? error : new Error('No se ha podido guardar. El borrador sigue abierto.');
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    let request, blocked = false;
    try { request = indexedDB.open(DB_NAME, 1); } catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => { request.result.createObjectStore('meetings', { keyPath: 'id' }); request.result.createObjectStore('audio'); };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => { blocked = true; reject(new Error('Otra pestaña bloquea la biblioteca. Ciérrala y vuelve a intentar guardar.')); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
  });
}
export async function listMeetings() {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('meetings', 'readonly'), request = tx.objectStore('meetings').getAll(); let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { try { resolve(result.map(validateMeeting).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); } catch { reject(new Error('La biblioteca contiene una entrada que no se puede leer. No se ha reemplazado ningún dato.')); } };
    tx.onerror = tx.onabort = () => reject(storageError(tx.error));
  }); } finally { db.close(); }
}
export async function loadMeeting(id) {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['meetings', 'audio'], 'readonly'), record = tx.objectStore('meetings').get(id), media = tx.objectStore('audio').get(id); let result, audio;
    record.onsuccess = () => { result = record.result; }; media.onsuccess = () => { audio = media.result ?? null; };
    tx.oncomplete = () => { try { if (!result) throw new Error('Esta conversación ya no está en la biblioteca.'); if (audio !== null && (!(audio instanceof Blob) || audio.size > LIMITS.audioBytes)) throw new Error('El audio guardado no se puede leer.'); resolve({ meeting: validateMeeting(result), audio }); } catch (error) { reject(error); } };
    tx.onerror = tx.onabort = () => reject(storageError(tx.error));
  }); } finally { db.close(); }
}
export async function saveMeeting(input, audio, expectedRevision) {
  const meeting = validateMeeting(input);
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw new Error('Falta la revisión de la conversación.');
  if (audio !== null && (!(audio instanceof Blob) || audio.size > LIMITS.audioBytes)) throw new Error('El audio supera el límite permitido.');
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['meetings', 'audio'], 'readwrite'), records = tx.objectStore('meetings'); let failure, saved;
    const fail = text => { failure = new Error(text); tx.abort(); };
    const request = records.get(meeting.id);
    request.onsuccess = () => {
      const existing = request.result;
      try { if (existing) validateMeeting(existing); } catch { fail('La versión guardada no se puede leer. No se ha reemplazado.'); return; }
      if (expectedRevision === null ? existing !== undefined : existing?.revision !== expectedRevision) { fail('Esta conversación cambió en otra pestaña. Tu borrador sigue abierto; guárdalo como una copia.'); return; }
      const put = () => {
        saved = validateMeeting({ ...meeting, revision: (expectedRevision ?? 0) + 1, updatedAt: new Date().toISOString() });
        records.put(saved); if (audio) tx.objectStore('audio').put(audio, saved.id); else tx.objectStore('audio').delete(saved.id);
      };
      if (existing) put();
      else { const count = records.count(); count.onsuccess = () => { if (count.result >= LIMITS.meetings) fail('La biblioteca tiene 50 conversaciones. Exporta y elimina alguna antes de guardar otra.'); else put(); }; }
    };
    tx.oncomplete = () => resolve(saved);
    tx.onabort = tx.onerror = () => reject(failure || storageError(tx.error));
  }); } finally { db.close(); }
}
export async function deleteMeeting(id, expectedRevision) {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['meetings', 'audio'], 'readwrite'), store = tx.objectStore('meetings'), request = store.get(id); let failure;
    request.onsuccess = () => {
      try { const existing = validateMeeting(request.result); if (existing.revision !== expectedRevision) throw new Error('La conversación cambió. Actualiza la biblioteca antes de eliminarla.'); store.delete(id); tx.objectStore('audio').delete(id); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(failure || storageError(tx.error));
  }); } finally { db.close(); }
}
export async function rawRecords() {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('meetings', 'readonly'), request = tx.objectStore('meetings').getAll(); let rows; request.onsuccess = () => { rows = request.result; }; tx.oncomplete = () => resolve(JSON.stringify({ schema: 'minuta.raw-records', version: 1, includesAudio: false, records: rows }, null, 2)); tx.onerror = tx.onabort = () => reject(storageError(tx.error)); }); } finally { db.close(); }
}
