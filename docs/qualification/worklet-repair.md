# Retained first browser failure

Run43579346484/job132400519188 at c8aade654d08859295de48673ba4719daf73090d
verified all11 anonymous production files (55,346,708bytes). B04 then timed out
because the recording stop button had become hidden. M01–M04 and B01–B03 did
not execute; no model result or model weight download is evidenced.

Two concrete source defects were found. The probe tried to wrap getUserMedia
on an insecure about:blank document where mediaDevices is undefined, producing
the retained page error. The compiled recorder also calls addModule with an
inlined data URL, which conflicts with the application's script-src self policy.
The original status at the recording failure was not captured, so the latter
diagnosis is a source inference, not a preserved browser exception.

Guard the observer on documents without mediaDevices, await the actual recording
UI, capture failure status/screenshots, and set Vite assetsInlineLimit=0 so the
worklet is a separate self-hosted module. Keep the content policy unchanged.
Rebuild/redeploy and retry only the failed/unrun boundaries. The changed production
manifest needs a new HTTP comparison; the core suite will not be replayed.

The successful native speech setup used Albert/en_US and Eddy (Spanish (Spain)) /
es_ES. Its exact authored WAVs, catalog and manifest are frozen under
tests/fixtures/speech-v1 before any model inference. Subsequent runs verify and
reuse those bytes rather than rendering a new voice/sample. Model pins, prompt,
texts and acceptance thresholds are unchanged. The original failed archive,
complete streams, source guards and verified owned cleanup remain canonical.
