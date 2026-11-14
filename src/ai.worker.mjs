import { pipeline, env } from '@huggingface/transformers';
import { MODELS, MODEL_CACHE, PROMPT_VERSION, generationMessages, chunkText, LIMITS } from './core.mjs';
import { decodeWav } from './wav.mjs';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.useFSCache = false;
env.backends.onnx.wasm.wasmPaths = '/wasm/';
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let activeKind, engine, busy = false;

async function load(kind, id) {
  if (engine && activeKind === kind) return engine;
  if (engine) { await engine.dispose(); engine = null; }
  if (globalThis.caches) { env.useCustomCache = true; env.customCache = await caches.open(MODEL_CACHE); }
  const model = MODELS[kind];
  engine = await pipeline(kind === 'voice' ? 'automatic-speech-recognition' : 'text-generation', model.id, {
    revision: model.revision, dtype: model.dtype, device: 'wasm',
    progress_callback: progress => postMessage({ type: 'progress', id, stage: 'loading', percent: Number.isFinite(progress.progress) ? progress.progress : null }),
  });
  activeKind = kind; return engine;
}
function generatedText(output) {
  const value = output[0]?.generated_text;
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.filter(m => m.role === 'assistant').at(-1)?.content : null;
  if (typeof text !== 'string' || !text.trim() || text.length > LIMITS.summary) throw new Error('EMPTY_GENERATION');
  return text.trim();
}
async function generate(model, messages, id, stages, phase, index) {
  postMessage({ type: 'progress', id, stage: phase, index });
  const tokens = model.tokenizer.apply_chat_template(messages, { tokenize: true, add_generation_prompt: true, return_tensor: false });
  const tokenCount = Array.isArray(tokens) ? tokens.flat().length : tokens?.dims?.at(-1);
  if (!Number.isFinite(tokenCount) || tokenCount > 4096) throw new Error('CONTEXT_LIMIT');
  const text = generatedText(await model(messages, { max_new_tokens: 256, do_sample: false, repetition_penalty: 1.05, return_full_text: false }));
  stages.push({ phase, index, inputTokens: tokenCount, output: text }); return text;
}
self.onmessage = async event => {
  const { id, kind, blob, meeting } = event.data;
  if (busy || !['voice', 'notes'].includes(kind)) { postMessage({ type: 'error', id, code: 'BUSY' }); return; }
  busy = true;
  try {
    const model = await load(kind, id);
    if (kind === 'voice') {
      const { samples, seconds } = decodeWav(await blob.arrayBuffer());
      let energy = 0; for (const sample of samples) energy += sample * sample;
      if (Math.sqrt(energy / samples.length) < 0.0005) throw new Error('SILENT_AUDIO');
      postMessage({ type: 'progress', id, stage: 'transcribing' });
      const result = await model(samples, { language: meeting.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
      if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > LIMITS.transcript) throw new Error('TRANSCRIPT_LIMIT');
      postMessage({ type: 'result', id, text: result.text.trim(), meta: { model: MODELS.voice, seconds, samples: samples.length, sampleRate: 16000 } });
    } else {
      const full = `PERSONAL NOTES:\n${meeting.notes}\n\nTRANSCRIPT:\n${meeting.transcript}`;
      if (!meeting.notes.trim() && !meeting.transcript.trim()) throw new Error('EMPTY_SOURCE');
      const chunks = chunkText(full), stages = []; let coverage = 0, fragments = [];
      if (chunks.length === 1) {
        const text = await generate(model, generationMessages(meeting.language, meeting.notes, meeting.transcript), id, stages, 'drafting', 1);
        postMessage({ type: 'result', id, text, meta: { model: MODELS.notes, prompt: PROMPT_VERSION, sourceCharacters: full.length, coveredCharacters: full.length, sourceChunks: 1, stages } });
      } else {
        for (const [index, chunk] of chunks.entries()) { fragments.push(await generate(model, generationMessages(meeting.language, '', chunk, 'extract'), id, stages, 'extracting', index + 1)); coverage += chunk.length; }
        let combined = fragments.join('\n\n'), reductions = 0;
        while (combined.length > 7000) {
          if (++reductions > 4) throw new Error('CONTEXT_LIMIT');
          const next = []; for (const [index, chunk] of chunkText(combined).entries()) next.push(await generate(model, generationMessages(meeting.language, '', chunk, 'extract'), id, stages, 'combining', index + 1));
          const reduced = next.join('\n\n'); if (reduced.length >= combined.length) throw new Error('CONTEXT_LIMIT'); combined = reduced;
        }
        const text = await generate(model, generationMessages(meeting.language, '', combined, 'merge'), id, stages, 'drafting', 1);
        postMessage({ type: 'result', id, text, meta: { model: MODELS.notes, prompt: PROMPT_VERSION, sourceCharacters: full.length, coveredCharacters: coverage, sourceChunks: chunks.length, stages } });
      }
    }
  } catch (error) { postMessage({ type: 'error', id, code: ['SILENT_AUDIO', 'CONTEXT_LIMIT', 'EMPTY_SOURCE', 'TRANSCRIPT_LIMIT', 'EMPTY_GENERATION'].includes(error.message) ? error.message : 'LOCAL_AI_FAILED', detail: `${error.name}: ${String(error.message).slice(0, 300)}` }); }
  finally { busy = false; }
};
