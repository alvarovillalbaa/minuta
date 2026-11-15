# Minuta

A quiet, Spanish-first meeting notebook. Record explicitly, take rough notes,
transcribe audio on your computer and review source-quoted notes before keeping them.

The local consumer iteration opens on **Mi cuaderno**, with separate writing
and audio entry points, searchable conversation cards and a resumable working
draft. Opening a page never starts recording. The editor has no SaaS sidebar;
**Lo que me llevo** holds the user's reviewed summary. See the
[iteration receipt](docs/results/2026/11-14/consumer-redesign.md) for actual checks
and limits. The [consumer qualification](docs/results/2026/11-15/consumer-v1/result.md)
records the exact native source boundaries and actual anonymous production
flow, including save/reopen/export and native permission-denial recovery.

[Open Minuta](https://minuta-liard.vercel.app) · [Consumer evidence](docs/results/2026/11-15/consumer-v1/result.md) · [Original release](docs/results/2026/11-14/release.md)

Minuta has no account, meeting bot or application backend. Notes and recordings
stay in this browser's IndexedDB when you choose **Guardar**. Export notes as
Markdown or JSON, and download the recording separately as WAV. Browser storage
can be cleared or evicted: download important conversations.

The first transcription asks permission to download roughly100 MB of public
model/runtime files. Pinned Whisper-base runs in a browser worker using CPU
WebAssembly. No conversation is sent to a model service. A desktop computer
with available memory is recommended; transcription can omit or invent words.
Review it, especially names, dates and negations.

Notes are deterministic literal excerpts grouped by rules, with source IDs and
explicit selection counts. They need no text model or model download. Grouping
can be wrong and excerpts can omit context; the full source stays editable.
The earlier free-form Qwen rewriter was removed after a retained quality failure.

## Use

1. Open a page from **Mi cuaderno** to write or listen. Write a title and rough
   notes; select Spanish or English. Return home without discarding the working
   copy; **Retomar** reopens it. Only **Guardar** persists it across page loads.
2. Record your microphone, explicitly share tab audio plus microphone, or open
   a PCM 16-bit WAV (mono/stereo, 8–96 kHz, at most 128 MB / 60 minutes).
3. Transcribe and review the proposed text. Apply it explicitly.
4. Prepare literal excerpts, review their grouping and save locally.
5. Download notes and audio. JSON imports create a new working copy.

A proposal belongs to its starting input. Editing that conversation while the
proposal is pending disables applying it. Download it or save a separate
copy instead. Two tabs cannot silently overwrite a newer saved revision.

Microphone/tab capture depends on browser and OS support. Sharing a tab requests
a video track because browsers require it; Minuta neither reads nor stores video
frames. Only audio is captured. Tell other participants before recording.

## Development

Node >=22.12; `npm ci --ignore-scripts`, `npm run check`, `npm test`,
`npm run build`. The build copies the locked ONNX WebAssembly runtime and
license notices into the static output. Vercel serves `dist/`. No environment
variable, Supabase project or paid service is needed.

See [product contract](docs/specs/product.md) and the
[original failed protocol](docs/qualification/v1.md) and
[v2 model result](docs/qualification/v2.md), followed by the
[current excerpt contract](docs/qualification/v3.md) and
[actual results](docs/results/2026/11-14/release.md). Authored synthetic speech is a functional
fixture, not evidence of accuracy on real meetings.

Original application code: MIT. Runtime dependencies retain their own licenses.
Model files are downloaded directly by the browser, not redistributed in this
repository. Pinned models and source references are in the qualification manifest.
