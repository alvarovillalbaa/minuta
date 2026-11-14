import { pipeline, env } from '@huggingface/transformers';
import { MODELS, MODEL_CACHE, LIMITS, validateMeeting } from './core.mjs';
import { decodeWav } from './wav.mjs';
import { extractNotes } from './extract.mjs';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.useFSCache = false;
env.backends.onnx.wasm.wasmPaths = '/wasm/';
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let engine, busy = false;

async function load(id) {
  if (engine) return engine;
  if (globalThis.caches) { env.useCustomCache = true; env.customCache = await caches.open(MODEL_CACHE); }
  engine = await pipeline('automatic-speech-recognition', MODELS.voice.id, {
    revision: MODELS.voice.revision, dtype: MODELS.voice.dtype, device: 'wasm',
    progress_callback: progress => postMessage({ type: 'progress', id, stage: 'loading', percent: Number.isFinite(progress.progress) ? progress.progress : null }),
  });
  return engine;
}
self.onmessage = async event => {
  const { id, kind, blob } = event.data;
  if (busy || !['voice', 'notes'].includes(kind)) { postMessage({ type: 'error', id, code: 'BUSY' }); return; }
  busy = true;
  try {
    const meeting = validateMeeting(event.data.meeting);
    if (kind === 'notes') {
      const result = extractNotes(meeting);
      postMessage({ type: 'result', id, text: result.text, meta: result.meta });
      return;
    }
    const model = await load(id);
    const { samples, seconds } = decodeWav(await blob.arrayBuffer());
    let energy = 0; for (const sample of samples) energy += sample * sample;
    if (Math.sqrt(energy / samples.length) < 0.0005) throw new Error('SILENT_AUDIO');
    postMessage({ type: 'progress', id, stage: 'transcribing' });
    const result = await model(samples, { language: meeting.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > LIMITS.transcript) throw new Error('TRANSCRIPT_LIMIT');
    postMessage({ type: 'result', id, text: result.text.trim(), meta: { model: MODELS.voice, seconds, samples: samples.length, sampleRate: 16000 } });
  } catch (error) { postMessage({ type: 'error', id, code: ['SILENT_AUDIO', 'EMPTY_SOURCE', 'TRANSCRIPT_LIMIT', 'EXCERPT_LIMIT'].includes(error.message) ? error.message : 'LOCAL_AI_FAILED', detail: `${error.name}: ${String(error.message).slice(0, 300)}` }); }
  finally { busy = false; }
};
