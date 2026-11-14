# Product contract — 2026-11-14

The owner's personal portfolio contains an **Open Granola** heading. Its embedded
tweet could not be read. Feature choices below are delegated execution judgment,
informed by [Granola's official product](https://www.granola.ai/) (rough personal
notes plus meeting audio), not a quoted specification or a claim of parity.
Minuta uses an original name and original interface/assets.

The useful first scope is an account-free notebook for explicit recording,
editable notes/transcript, actual local transcription and reviewable literal
source excerpts. It deliberately needs no scarce Supabase capacity. No calendar, meeting
joiner, diarization, automatic upload, organization integration, API service or
store enrollment is part of this release.

## Data and lifecycle

- One conversation has an ID, integer revision, ISO dates, language, title and
  three bounded plain-text fields. Extra keys/newer formats are rejected.
- Saving/deleting compares the expected revision in one IndexedDB transaction
  covering both notes and audio. Conflicts, quota and corrupt records preserve
  the working copy and refuse destructive replacement.
- The library holds at most 50 conversations. Saving is explicit; a new draft
  is not a promise of persistence. Deleting a saved copy preserves its open draft.
- Markdown is text. Notes JSON excludes audio and imports with a fresh ID.
  WAV is downloaded separately. Raw metadata recovery is explicitly not an
  audio backup and cannot repair arbitrary database corruption.
- Every worker request captures the conversation/audio/input stamp. Output is a
  separate proposal. Apply requires the same inputs, including title, language
  and audio identity. A stale proposal can only be downloaded or saved separately.
- Cancellation terminates the owned worker. Stop/pagehide stops owned audio
  tracks and closes the context/worklet; no recording starts on page load.

## Inference boundary

Transformers.js 3.8.1 runs pinned Whisper base q8 in a
dedicated module worker. CPU WASM is self-hosted and single-threaded. No WebGPU,
remote inference, generated code execution, agent tools or secret is required.
Model downloads use Hugging Face's public resolve endpoints. This exposes a
normal download request to that provider; conversation text/audio is never put
in a network request. Cached weights can be removed separately from meetings.

Source excerpts use rules, no text model. Every quoted unit is an exact slice
with its original field/range/ID. At most18 units/24,000 characters are selected;
omission counts are explicit and the full source is never truncated. Classification
uses possible actions/decisions/pending headings and needs human review. It does
not guarantee that every fact is included or a category is semantically correct.
The free-form Qwen rewriter was removed after it invented completion and lost
owners/dates; its original failures remain preserved. Physical microphone/tab
audio and general meeting quality require separate evidence; synthetic fixtures
cannot establish them. The original Albert speech remains a known failure.

## Primary references inspected

- [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/en/pipelines)
- [Worker tutorial](https://huggingface.co/docs/transformers.js/v3.8.1/en/tutorials/vanilla-js)
- [Self-hosted WASM settings](https://huggingface.co/docs/transformers.js/v3.8.1/en/custom_usage)
- [Transformers.js v3.8.1 source](https://github.com/huggingface/transformers.js/tree/2ec882e739e4cb461f8d440d4d7394cbf5372429)
- [Whisper tiny conversion](https://huggingface.co/Xenova/whisper-tiny/tree/5332fcc35e32a33b86612b9a57a89be7906102b1)
- [Whisper base correction](https://huggingface.co/Xenova/whisper-base/tree/64da57285918e20ea79ea5c88eed7197933abaa8)
- [Qwen ONNX conversion](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/tree/22942cb7d7ba4cc81bb4673549ca4d4614469b5e)
- [Parent Qwen model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
- [Vite 8.3.8 release](https://github.com/vitejs/vite/releases/tag/v8.3.8)

Whisper's conversion and parent Qwen cards identify Apache 2.0; the ONNX Qwen
card does not itself provide a separate explicit license statement. Preserve
those source/license distinctions rather than inventing a new grant.
