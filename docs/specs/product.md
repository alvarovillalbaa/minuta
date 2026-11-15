# Product contract — 2026-11-14

The owner's personal portfolio contains an **Open Granola** heading. Its embedded
tweet could not be read. Feature choices below are delegated execution judgment,
informed by [Granola's official product](https://www.granola.ai/) (rough personal
notes plus meeting audio), not a quoted specification or a claim of parity.
Minuta uses an original name and original interface/assets.

The owner's subsequent [GEN-3659 request](https://app.notion.com/p/418a1ee8bd0680c99343ea23eb42d0dd),
inspected in full, explicitly requests a consumer-oriented Minuta, with Granola,
Bluedot, Notion AI Notetaker and Plaud as inspiration. The local iteration now
starts at a personal notebook rather than a sidebar/editor workspace. Original
warm paper styling, conversation cards, plain-language writing/audio choices
and readable text are implementation choices; no competitor assets are reused.

## Consumer notebook

- Home contains only actual saved conversations, with title-only accent-folded
  search, source-text previews, and distinct empty, no-match, loading and recovery
  states. No example conversations are inserted into storage.
- Writing and listening entry buttons open the editor; neither requests a
  microphone, starts a worker nor saves data. Recording remains a separate action.
- Home/editor navigation preserves the current working copy, including invalid
  raw edits and pending proposals. A visible resume action identifies unsaved
  work. A new conversation, saved conversation or import keeps the replacement
  guard. Returning home does not make an unsaved draft durable.
- Capture/processing prevents navigation away from its controls. Permission,
  recording, finishing and audio-ready states are explicit. On narrow layouts,
  capture is above the notes; writing entry focuses the notes directly.
- The reviewed summary is called **Lo que me llevo**. Extracts remain labelled
  as quotes grouped by rules, distinct from transcription and human writing.
  Model-download consent, raw recovery and separate notes/audio exports remain.
- The [consumer qualification](../results/2026/11-15/consumer-v1/result.md)
  records native home/draft/library/capture/worker/mobile/storage outcomes on
  their exact sources. Older inference evidence is carried only after archive,
  source and compiled-body identity checks. Actual hosted delivery is separate.

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

Consumer interaction references inspected on 14 November 2026:

- [Granola](https://www.granola.ai/): personal notes alongside conversation audio.
- [Bluedot](https://www.bluedothq.com/): visible capture-to-transcript/notes flow.
- [Notion AI Meeting Notes](https://www.notion.com/product/ai-meeting-notes):
  revisiting notes with their related context.
- [Plaud](https://www.plaud.ai/): deliberate everyday voice capture.
- [Voicenotes](https://voicenotes.com/): an accessible voice-notebook entry.

These are product references, not claims of accuracy, market ranking or feature
parity. Minuta does not inherit their cloud, calendar, hardware or integration
capabilities. The implemented voice/excerpt boundaries below remain authoritative.

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
