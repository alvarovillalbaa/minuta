# Consumer notebook qualification v2 — evidence-source correction

15 November 2026. Consumer-v1 and its original failed packet remain unchanged.
Its first CI run43684550449 at c1f8325fc33b3f0e6cbbe605101e1623e5c3d949
passed the nine Node24 consumer callback cases and built the current edition,
then stopped before any browser case. The carry gate incorrectly used the
historical tests/fixtures/production-manifest.json rather than the actual
accepted v3 build. The historical fixture is preserved.

The authoritative accepted archive is
docs/results/2026/11-14/browser-43581904253/original.zip, SHA-256
8867eb45b928716daf53ccc7181dc05dc1dd2e0fd01e38e25159ee3cdc0aa9f7.
Its source.json identifies a32f2839bfd30891bbd02f02a948b7de85a70fb0; its actual
browser-result.json passed and matches the separately retained JSON. The
archived HTTP gzip member http/5199cc0dea4e6b08.body.gz decodes to 892,780 bytes,
SHA-256 b6404660c9ef6949b239fdb52ea9044dde02bddd86d0068f5c01635a407ad986.
That actual accepted worker, worklet and all five WASM/runtime artifacts match
all seven fresh current build bodies exactly. The earlier claim of a changed
worker relative to the accepted release was caused by the wrong reference.

The corrected runner verifies the original ZIP digest, actual accepted source/
result, compressed worker-body digest, old runtime source inputs and all seven
current build bodies before carrying the original ASR/excerpt evidence. It
byte-binds the unchanged nine callback inputs, original TAP and Node24.22.2
instead of replaying them. It does not alter the historical manifest or any
frozen v1/v2/v3 protocol, fixture, model, score, threshold or failed result.

The nine N01-N08 cases, including separate N06a/N06b, retain consumer-v1's exact
native scope and assertions. No browser case was accepted in attempt1, so all
nine remain pending. A draft idea for a new ASR regression was not published or
executed: actual artifact identity proves it is unnecessary. No new ASR/model
download is authorized by inference from this correction or requested by this
packet; original scientific results keep their exact older source and limits.

All finite static/no-upload, native capture, original output, source/build/lock,
20-minute total CI budget, owned teardown, actual hosted comparison and
temporary-ref/workflow retirement gates remain. This corrects the evidence
selection rather than lowering an acceptance gate.
