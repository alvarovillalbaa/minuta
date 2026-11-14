# Minuta first release

[Live notebook](https://minuta-liard.vercel.app) ·
[source](https://github.com/alvarovillalbaa/minuta) ·
[current contract](../../../qualification/v3.md)

Explicit recording/WAV import, local Whisper-base transcription, editable rough
notes and source-quoted excerpts, reviewed/stale proposals, revision-checked
IndexedDB and separate Markdown/notes-JSON/audio-WAV exports are implemented.
No account, application server, Supabase capacity or paid model API is needed.
The owner's Open Granola heading supplied intent; its embedded tweet remained
unreadable. Details are delegated product judgment, not claimed feature parity.

## Accepted boundaries

[Run43581904253](https://github.com/alvarovillalbaa/minuta/actions/runs/43581904253),
job132408226384, passed at source
`a32f2839bfd30891bbd02f02a948b7de85a70fb0`, public production
`dpl_F4Pa6xB3Zj8uvPYdVoVvXF4Yg8Cb`. Its fresh locked scratch build matched all12
anonymous public files,55,347,390bytes. The [original archive](browser-43581904253/original.zip)
and [actual result](browser-43581904253/browser-result.json) retain full details.

| Case | Actual outcome |
| --- | --- |
| E31 | Real excerpt worker, all five English quote ranges exact; changed notes/invalid raw title preserved, Apply disabled, captured-input copy saved separately and native text download. |
| E32 | Five exact Spanish quote ranges, explicit apply/save, actual JSON/Markdown. No remote request/model download while preparing either excerpt. |
| E33 | Changed voice-worker dispatch regression: actual frozen English WAV through Whisper-base, WER0.125; reviewed apply/native JSON, both actual ONNX bodies match pinned size/SHA. Existing fixture, not a new quality cohort. |
| B01 | Save/library/reload, literal markup inert, fresh import identity, import cancellation, requested two-page revision conflict, stale-copy preservation, two-step fixture deletion retaining open draft. |
| B02 |390/320px horizontal fit, actual touch taps/editor/download dialogs and keyboard tab selection in mobile-emulated Chromium. |
| B03 | Malformed WAV/JSON preserve current data; corrupt original refused and recovered as raw metadata. Injected quota rejection preserves draft; this is a simulated error path. |

Five current screenshots were actually inspected:
[desktop](browser-43581904253/desktop-notebook.png),
[reviewed excerpts](browser-43581904253/reviewed-notes.png),
[stale proposal](browser-43581904253/stale-proposal.png),
[390px](browser-43581904253/narrow-390.png),
[320px](browser-43581904253/narrow-320.png).
Actual excerpts preserve price/budget uncertainty and source wording, including
ASR errors. Grouping can be wrong; this is not abstractive summarization.

Earlier B04 passed once at5fd5731/run43579983642: native fake microphone from
authored speech through the real AudioWorklet, valid81,196-byte WAV,2.536seconds,
RMS0.16175, observed track ended/context closed. [Audio](browser-43579983642/captured-microphone.wav)
and original failed-overall packet are retained. Recording was not replayed.

V2 M21/M22 passed at341acbf/run43580715419: frozen Samantha English WER0.125 and
Mónica Spanish WER0.13636. English loses Ben; Spanish has grammatical errors.
These are two synthetic functional fixtures, no real-meeting accuracy claim.
Both Whisper ONNX bodies (23,200,850 and53,707,539bytes) match the fixed
[manifest](../../../qualification/models-v3.json), verified again for E33.
No model binaries were retained or downloaded locally.

Local checks: C01–C24 passed once, then C25 and only C09/C10 after the JSON-size
repair. Eight new excerpt cases initially7/8; the original accented-word failure
is retained. Accent folding for classification fixed it; only E01/E02/E03
repeated, all3 passed. Quotes remain unmodified. These are33 distinct unit
identities across focused invocations, not a single33-case green run. Syntax
and whitespace checks passed; no local dependency/build/browser/model work.

## Preserved failures and limits

- First build43578230691 failed because the locked ONNX npm package omitted its
  LICENSE. Exact upstream commit MIT notice added; lock and failure retained.
- Browser43578881295 was cancelled with zero steps: unsupported macOS14-arm64.
  No process/model/cleanup proof is claimed from that cancelled control.
- Browser43579346484 verified11 assets, then failed recording. The observer
  wrapped unavailable mediaDevices on about:blank; Vite inlined the worklet as a
  data URL. Probe guard and self-hosted module fixed; content policy unchanged.
- Tiny-model M01 failed the original Albert speech, WER1.0. Base on the same
  audio still failed retrospectively, WER0.81818. Neither threshold was lowered;
  the new voice/model cohort does not establish causal or general improvement.
- Qwen M23 invented a completed review/sent draft and omitted Nora/Monday.
  Original text/screenshot remain negative; its512MB actual body digest was not
  captured. Free-form text generation was removed from the current product.
  E31/E32 are explicitly deterministic literal excerpts, not a passing Qwen test.

[Data audit](data-audit-v3.json) independently verifies all10 original archives,
100 complete outer streams,35 decoded gzip HTTP bodies,12 native downloads,
all source guards and nonce/inode-owned scratch cleanup. Accepted run: eight
leaders reaped/groups absent, four private contexts closed, browser disconnected,
1,164,649,967 scratch bytes removed. GET/HEAD-only/no-upload and fixed model
revision observations passed; no Qwen request occurred in the accepted release.
No uncaught page or console error was observed in that run. This does not prove
whole-machine network confinement or absence of every detached system process.

Playwright1.56.1/Chromium141.0.7390.37, macOS15 runner, Node24.22.2; actual
application/tool locks remained byte-exact. All17 application build inputs remain
unchanged from the accepted source while publishing these results. Final release
deployment metadata is separate from the above execution identity.

Temporary workflow418159141 was disabled after zero active/queued runs; its source
is removed and the inert [recipe](../../../../tests/fixtures/qualification.workflow.yml)
retained. No permanent CI or QA branch was added. Native source is published
through normal, non-force Git operations in this new isolated repository.

Physical microphone/tab/system audio, real/private meetings, long or noisy
recordings, Safari/Firefox/physical devices, broad accessibility/performance,
all storage eviction/quota/concurrency schedules, calendar/bot/diarization and
general ASR/grouping accuracy remain unverified. Download important notes/audio;
browser-local storage can be cleared or evicted. Storage Guard0.2/34GiB blocked
all local heavy work. This release is portfolio progress; the portfolio remains
ACTIVE/unfinished with its four non-priority exclusions unchanged.
