# Pre-inference review corrections

The first browser control, run43578881295/job132399115383, was cancelled before
any step or process started. Its provider annotation was: `The configuration
'macos-14-arm64-us-default' is not supported`. No speech, model, browser or
cleanup evidence exists from that run. Change the temporary job to macOS15;
retain its annotation. Frozen fixture text, model pins, prompts and thresholds
are unchanged; no Minuta inference has run yet.

Source review also found two bounded edge cases before inference: an invalid
title edit could leave the last valid input stamp unchanged, and JSON escaping
could make a valid maximum-size meeting exceed the importer budget. An edit
generation/invalid-field guard now makes every such proposal stale. JSON export
refuses an oversized copy with Markdown fallback and preserves the notebook.

New C25 checks the escaped JSON boundary once; repeat only C09/C10 for its codec
change. Existing C01–C24 results remain retained. M03 will additionally keep an
invalid title while the model works, then repair the title before saving its
separate proposal copy. It must not erase the raw invalid field. No scoring or
model-output tuning is introduced.
