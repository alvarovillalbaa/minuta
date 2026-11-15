# Consumer notebook iteration

Date: 2026-11-14. Base: `7afa041218b5d9dde83175379be9f14b8eb00197`.
Owner: [GEN-3659](https://app.notion.com/p/418a1ee8bd0680c99343ea23eb42d0dd),
read in full. Source changes are local, uncommitted and unpublished.

## Request and implementation

The request replaces the B2B feel with a personal product, informed by Granola,
Bluedot, Notion AI Notetaker and Plaud. Their actual official product pages were
read, alongside Voicenotes; links and applied observations are in the
[product contract](../../../specs/product.md). This is original interface work,
with no copied competitor assets or implied feature parity.

| Requested outcome | Local implementation |
| --- | --- |
| Consumer entry | Personal notebook home, paper illustration, warm typography/colour, writing/listening choices and no SaaS sidebar |
| Return to notes | Actual saved conversation cards, literal previews, date, accent-insensitive title search and clear empty/no-match states |
| Simple working space | One open conversation, readable notes, reviewed summary named Lo que me llevo, explicit audio controls and mobile stacking |
| Preserve existing use | Home/resume retain unsaved/invalid edits and proposals; new/open/import retain replacement guard; persistence and inference modules unchanged |
| Honest product behaviour | No capture on home entry; explicit model-download consent; save-only durability; literal rule-based extracts; separate notes/audio downloads |

Library refresh has a generation guard so a slow earlier read cannot replace a
newer result. Failed reads expose raw metadata recovery while retaining any
previously readable cards. No record/schema/database migration was introduced.

## Checks actually run

- `npm run check`: six existing module syntax checks passed.
- `npm test`: **42/42 passed** under Node **26.8.2**. C01–C25 and E01–E08 run
  unchanged. Nine new controlled callback cases P01–P09 cover empty entry,
  no implicit capture/worker, home/resume, invalid raw edits, replacement refusal,
  accent search, literal untrusted previews, out-of-order reads/recovery, saved
  open/confirmed delete, capture states/denial, failed save and stale proposals.
- Standard-library HTML parser: balanced element nesting, **84 unique IDs**,
  **22 label/panel references resolved**. This is a static wiring check.
- `git diff --check`: passed.

The new checks execute the actual UI module with controlled DOM, storage,
recorder and worker callbacks. They do **not** execute a browser, IndexedDB,
physical audio capture or model inference. The successful core/extract checks
do not replace the preserved scientific/qualification results.

One initial edit command was rejected because a patch attempted delete/add of
the same CSS path in one operation; no change applied. It was corrected using
two scoped patches. No acceptance threshold or historical case was changed.

## Remaining evidence

The storage reserve already failed during this portfolio work, so no dependencies,
build, browser or model files were installed/downloaded. No deployment, commit,
branch or PR was created. The public release still serves the earlier edition.

Visual acceptance remains pending at desktop, 390 px and 320 px, including
actual keyboard/focus/taps, long titles, confirmations, dialogs, capture, audio
playback, quota/conflict/recovery and fresh reload persistence. A versioned
protocol for the changed home/editor flow and an exact-source asset comparison
are needed before claiming a new qualified release. Frozen v1/v2/v3 protocols,
negative results and earlier production manifests remain intact. No claim of
general transcription accuracy, real microphone/tab capture or cross-browser
compatibility follows from this source iteration.
