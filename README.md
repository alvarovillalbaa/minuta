# Minuta

A quiet, Spanish-first meeting notebook. Record explicitly, take rough notes,
transcribe audio on your computer and review an AI draft before keeping it.

Minuta has no account, meeting bot or application backend. Notes and recordings
stay in this browser's IndexedDB when you choose **Guardar**. Export notes as
Markdown or JSON, and download the recording separately as WAV. Browser storage
can be cleared or evicted: download important conversations.

The first AI use asks permission to download roughly 600 MB of public model
files from Hugging Face. Actual transcription and draft generation run inside
a browser worker using CPU WebAssembly. No conversation is sent to a model
service. A desktop computer with available memory is recommended. The models
are small and can mishear names or invent details; all output needs review.

## Use

1. Write a title and rough notes; select Spanish or English.
2. Record your microphone, explicitly share tab audio plus microphone, or open
   a PCM 16-bit WAV (mono/stereo, 8–96 kHz, at most 128 MB / 60 minutes).
3. Transcribe and review the proposed text. Apply it explicitly.
4. Prepare a notes draft, review decisions/actions and save locally.
5. Download notes and audio. JSON imports create a new working copy.

A proposal belongs to its starting input. Editing that conversation while the
model runs disables applying the old proposal. Download it or save a separate
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
[frozen qualification protocol](docs/qualification/v1.md). Qualification results
will be linked here when observed. Authored synthetic speech is a functional
fixture, not evidence of accuracy on real meetings.

Original application code: MIT. Runtime dependencies retain their own licenses.
Model files are downloaded directly by the browser, not redistributed in this
repository. Pinned models and source references are in the qualification manifest.
