# Minuta

Last updated: 2026-11-15

- Owner source: GEN-3659, Iterating All My Personal Projects, explicitly asks
  for a consumer redesign informed by Granola, Bluedot, Notion AI Notetaker and
  Plaud. This supersedes the earlier Open Granola heading's red-circle scope
  for this named project. Its old embedded tweet remains unread. No account,
  application backend or paid provider is required for Minuta.
- The consumer home and editor share one in-memory working copy. Returning home
  must not reset it; creating/opening another conversation uses the replacement
  guard. Home entry buttons do not capture audio. Library search is read-only;
  keep titles/previews as textContent and ignore superseded async library reads.
- The consumer qualification and exact source/carry/delivery boundaries are in
  docs/results/2026/11-15/consumer-v1/result.md. Native N01-N08 (N06a/N06b) are
  separate from callback and older scientific results. Do not replay closed
  cases unchanged. Preserve every failed packet and exact source identity.
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

- Mac persistence is blocked by full storage. The corrected placeholder and
  qualification helpers/results may be remote-only; inspect the current owning
  GitHub receipt before repeating local work. Preserve the dirty checkout.
