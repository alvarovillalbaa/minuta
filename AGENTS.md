# Minuta

Last updated: 2026-11-14

- Owner source: personal Notion portfolio's Open Granola heading; its tweet is
  unreadable. Product details here are delegated judgment, informed by the
  actual Granola reference, not a quoted owner specification. Publish personal
  GitHub and static Vercel. No account/backend/paid provider is required.
- Read README.md, docs/specs/product.md and the frozen qualification protocol.
  Preserve user work; use apply_patch. Application data never goes to an API.
- Runtime transcription is real Transformers.js/ONNX in an owned Web Worker,
  using pinned Whisper-base. Notes use deterministic exact-source excerpts;
  no text model, generated prose, generated code or tool call. Disclose this
  clearly. Historical failed Qwen protocols are immutable and are not active.
  Treat every proposal as reviewable; never auto-apply it.
- Keep source input snapshots, meeting IDs and generations separate. A stale
  result may be exported or saved as a new copy; it cannot overwrite new edits.
- IndexedDB save/delete uses a single transaction with expected-revision checks.
  Never replace malformed or newer data. A failed save keeps the working copy.
  Notes JSON and audio WAV exports are separate and clearly described.
- Recording starts only on explicit user action/native permission. Stop all
  tracks/context/worklet on stop/error/pagehide. Tab capture reads no video
  frames and retains no video; microphone and tab capture are distinct modes.
- Standing all-work approval covers source, dependencies, focused authored
  checks, bounded free temporary CI, actual local-model fixture inference and
  static deployment. No model-service API bill, paid enrollment or real meeting
  recording is authorized for checks. Fixtures are authored T2 speech only.
- Storage Guard forbids local dependency/model/browser/build work below reserve.
  Keep original failures and actual model outputs; never tune frozen acceptance
  after seeing results. Tiny fixture success is not general meeting quality.
- Do not commit weights, caches, credentials, private recordings or local-only
  paths. Keep package/tool locks and generated output separate; retire QA CI.
- Use focused syntax/core checks and git diff --check. Persist actual source,
  model/body hashes, native downloads, screenshots and owned teardown in docs/.
