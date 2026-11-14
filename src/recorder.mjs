import { LIMITS } from './core.mjs';
import { encodeWav } from './wav.mjs';

export class Recorder {
  constructor(onTick, onEnded) { this.onTick = onTick; this.onEnded = onEnded; this.generation = 0; this.stream = null; this.context = null; this.parts = []; this.frames = 0; this.starting = false; }
  async start(kind) {
    if (this.starting || this.stream) throw new Error('Ya hay una grabación abierta.');
    if (!navigator.mediaDevices || !window.AudioWorkletNode) throw new Error('Este navegador no permite grabar aquí. Puedes abrir un archivo WAV.');
    const generation = ++this.generation; this.starting = true;
    let stream, context;
    try {
      stream = kind === 'tab' ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, systemAudio: 'include' }) : await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
      if (!stream.getAudioTracks().length) throw new Error('La fuente no comparte audio. Elige una pestaña con «Compartir audio», o usa el micrófono.');
      if (kind === 'tab') {
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        microphone.getTracks().forEach(track => stream.addTrack(track));
        if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
      }
      context = new AudioContext({ sampleRate: 16000 });
      await context.audioWorklet.addModule(new URL('./capture.worklet.mjs', import.meta.url));
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); await context.close(); return false; }
      const node = new AudioWorkletNode(context, 'minuta-capture'), sources = [], gains = [];
      for (const track of stream.getAudioTracks()) { const source = context.createMediaStreamSource(new MediaStream([track])), gain = context.createGain(); gain.gain.value = 1 / stream.getAudioTracks().length; source.connect(gain); gain.connect(node); sources.push(source); gains.push(gain); }
      const mute = context.createGain(); mute.gain.value = 0; node.connect(mute); mute.connect(context.destination);
      this.parts = []; this.frames = 0; this.stream = stream; this.context = context; this.node = node; this.sources = sources; this.gains = gains; this.mute = mute;
      node.port.onmessage = event => {
        if (generation !== this.generation || !this.stream) return;
        if (event.data?.flushed) { this.flushDone?.(); return; }
        const next = this.frames + event.data.length;
        if (next / context.sampleRate > LIMITS.seconds || next * 2 + 44 > LIMITS.audioBytes) { this.onEnded('La grabación ha alcanzado el límite de 60 minutos.'); return; }
        this.parts.push(event.data); this.frames = next;
      };
      stream.getTracks().forEach(track => { track.onended = () => { if (generation === this.generation && this.stream) this.onEnded('La fuente de audio dejó de compartir.'); }; });
      this.timer = setInterval(() => this.onTick(this.frames / context.sampleRate), 250);
      await context.resume(); return true;
    } catch (error) {
      const cancelled = generation !== this.generation;
      stream?.getTracks().forEach(t => t.stop()); if (context && context.state !== 'closed') await context.close().catch(() => {});
      if (this.stream === stream) await this.stop(false);
      if (cancelled) return false;
      if (error?.name === 'NotAllowedError') throw new Error('No se ha permitido capturar audio. No ha empezado ninguna grabación.');
      throw error;
    } finally { if (generation === this.generation) this.starting = false; }
  }
  async stop(keep = true) {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.finish(keep);
    try { return await this.stopPromise; } finally { this.stopPromise = null; }
  }
  async finish(keep) {
    if (keep && this.node && this.context?.state === 'running') await new Promise(resolve => { const timer = setTimeout(resolve, 2000); this.flushDone = () => { clearTimeout(timer); resolve(); }; this.node.port.postMessage('flush'); });
    this.flushDone = null;
    this.generation += 1; this.starting = false; clearInterval(this.timer);
    const context = this.context, parts = this.parts, frames = this.frames;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    if (this.node) { this.node.port.onmessage = null; this.node.disconnect(); this.node.port.close(); }
    this.sources?.forEach(source => source.disconnect()); this.gains?.forEach(gain => gain.disconnect()); this.mute?.disconnect(); this.stream = null; this.context = null; this.node = null; this.sources = []; this.gains = []; this.mute = null; this.parts = []; this.frames = 0;
    if (context && context.state !== 'closed') await context.close();
    if (!keep || !context || frames < context.sampleRate * 0.2) return null;
    const samples = new Float32Array(frames); let offset = 0; for (const part of parts) { samples.set(part, offset); offset += part.length; }
    return new Blob([encodeWav(samples, context.sampleRate)], { type: 'audio/wav' });
  }
}
