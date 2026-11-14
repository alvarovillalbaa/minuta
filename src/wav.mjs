import { LIMITS } from './core.mjs';
const text = (view, offset, count) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, count));

export function decodeWav(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44 || buffer.byteLength > LIMITS.audioBytes) throw new Error('Elige un WAV de hasta 128 MB.');
  const view = new DataView(buffer);
  if (text(view, 0, 4) !== 'RIFF' || text(view, 8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== buffer.byteLength) throw new Error('El archivo no es un WAV completo.');
  let format, data, offset = 12;
  for (; offset + 8 <= buffer.byteLength;) {
    const name = text(view, offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8, end = start + size;
    if (end > buffer.byteLength || end < start) throw new Error('El WAV contiene un bloque incompleto.');
    if (name === 'fmt ') {
      if (format || size < 16) throw new Error('El formato WAV no es válido.');
      let encoding = view.getUint16(start, true);
      if (encoding === 0xfffe && size >= 40 && view.getUint16(start + 16, true) >= 22 && text(view, start + 28, 12) === '\0\0\x10\0\x80\0\0\xaa\0\x38\x9b\x71') encoding = view.getUint32(start + 24, true);
      format = { encoding, channels: view.getUint16(start + 2, true), rate: view.getUint32(start + 4, true), byteRate: view.getUint32(start + 8, true), align: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
    }
    if (name === 'data') { if (data) throw new Error('El WAV contiene audio duplicado.'); data = { start, size }; }
    offset = end + (size & 1);
    if (offset > buffer.byteLength) throw new Error('El WAV tiene una alineación incompleta.');
  }
  if (offset !== buffer.byteLength) throw new Error('El WAV tiene un bloque final incompleto.');
  if (!format || !data || format.encoding !== 1 || format.bits !== 16 || ![1, 2].includes(format.channels) || format.rate < 8000 || format.rate > 96000 || format.align !== format.channels * 2 || format.byteRate !== format.rate * format.align || data.size % format.align) throw new Error('Usa WAV PCM de 16 bits, mono o estéreo, entre 8 y 96 kHz.');
  const frames = data.size / format.align, seconds = frames / format.rate;
  if (seconds < 0.2 || seconds > LIMITS.seconds) throw new Error('El audio debe durar entre 0,2 segundos y 60 minutos.');
  const count = Math.floor(seconds * 16000), samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const position = i * format.rate / 16000, a = Math.min(frames - 1, Math.floor(position)), b = Math.min(frames - 1, a + 1), mix = position - a;
    let va = 0, vb = 0;
    for (let channel = 0; channel < format.channels; channel++) { va += view.getInt16(data.start + a * format.align + channel * 2, true); vb += view.getInt16(data.start + b * format.align + channel * 2, true); }
    samples[i] = (va * (1 - mix) + vb * mix) / (32768 * format.channels);
  }
  return { samples, seconds, sourceRate: format.rate, channels: format.channels, frames };
}

export function encodeWav(samples, rate = 16000) {
  if (!(samples instanceof Float32Array) || !Number.isInteger(rate) || rate < 8000 || rate > 96000 || samples.length / rate > LIMITS.seconds || samples.byteLength / 2 + 44 > LIMITS.audioBytes) throw new Error('La grabación supera el límite de audio.');
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const put = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  put(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); put(8, 'WAVE'); put(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { if (!Number.isFinite(samples[i])) throw new Error('La grabación contiene una muestra no válida.'); const value = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
  return buffer;
}
