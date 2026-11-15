# Consumer notebook qualification v3 — desktop input and placeholder repair

15 November 2026. V1/V2 and all original results remain unchanged. Run43685546382
at8ef14e9ff26274070f7d4392566a91dce4b53039 passed N01, N02 and N03, then stopped
at N04 because the desktop test mistakenly used tap without a touch context.
No N04-N08 result is accepted. Replace only those two desktop audio actions with
native clicks; touch cases remain real touch contexts.

The original screenshots also expose a product defect: the notes placeholder
shows escaped backslash-n sequences literally. Replace that one HTML attribute
sequence with two numeric line-break entities. N01 adds an actual DOM placeholder
assertion and a stable writing-editor screenshot, and runs again on the repair.
Because HTML is a real input to the callback harness, all nine focused consumer
callbacks run on the changed HTML; no closed C/E core/model cohort is replayed.

N02 library/import/conflict/delete and N03 native fake-microphone results remain
on their actual prior source. Their carry requires all11 non-HTML public build
bodies to match exactly. Reversing only the single placeholder encoding in the
fresh built HTML must reproduce the old HTML size/SHA-256. Any other HTML/asset
change refuses that carry. Preserve old screenshots/audio/source and do not call
the retained capture a fresh recording on the new HTML.

Selected native scope: N01,N04,N05,N06a,N06b,N07,N08. The accepted N02/N03 report
digest/runtime, all build inputs, source snapshots and cleanup stay bound.
The corrected actual accepted v3 archive remains the authority for the seven
unchanged worker/worklet/WASM bodies. No ASR or model download is repeated.
All original nine consumer outcomes, native data/privacy/teardown,20-minute
total CI, actual hosted comparison and temporary-ref retirement remain required.
