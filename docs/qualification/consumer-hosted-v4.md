# Consumer hosted delivery v4: full Chromium headless

15 November 2026. V3 source2f1f90d9f1558103dda1403e947b83199283b61e /
run43689338534 preserves the same failed native exception-name assertion.
The pinned fake-audio file did not change it: mobile and separate fresh desktop
both returned actual NotSupportedError while reporting permission denied.
V1/v2/v3 failures remain immutable, including original method constraints,
T2 JSON exports, screenshots, command streams and normal teardown.

The documented Playwright default headless executable is a separate shell;
channel:'chromium' selects the full Chromium browser's new headless mode:
https://playwright.dev/docs/browsers#chromium-new-headless-mode .
Chromium's default media-permission delegate can return NOT_SUPPORTED:
https://chromium.googlesource.com/chromium/src/+/d4e9db65b49d82cd1f3d380ee1946aa51dbc9fcf/content/public/browser/web_contents_delegate.cc .
This suggests an execution-surface limit, not a demonstrated application defect;
it is an inference to test, not an established cause.

V4 changes only launchServer channel to chromium and records the actual native
executable basename/channel. Full Chromium is already included by the locked
installer. Keep permission denied, no fake UI acceptance, the existing pinned
fake-device/file setup and the unchanged real NotAllowedError assertion. No
API stub, changed threshold, app source or recording is introduced. H01 must
complete the full actual12-body mobile write/worker/review/save/reload/export/
permission recovery flow under this explicitly recorded browser surface.
If it fails, preserve that native result and diagnostic; no auto-pass.

All v1-v3 network/source/privacy/teardown/retirement requirements and total
1200second cap remain. Actual prior job time is 202seconds. No app build,
model download or closed source/scientific-case replay is needed.
