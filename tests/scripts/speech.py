"""Render only the predeclared, authored speech; no owner/user audio."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import wave

output = Path(os.environ["MINUTA_OUTPUT"])
catalog = subprocess.check_output(["/usr/bin/say", "-v", "?"]).decode()
(output / "voice-catalog.txt").write_text(catalog)
fixtures = json.loads(Path("tests/fixtures/speech.json").read_text())
manifest = {"cohort": fixtures["cohort"], "voices": [], "completedBeforeInference": True}
for case in fixtures["cases"]:
    candidates = [match.group(1).strip() for line in catalog.splitlines()
                  if (match := re.match(r"^(.*?)\s+" + re.escape(case["voiceLocale"]) + r"\s+#", line))]
    if not candidates:
        raise RuntimeError("No installed voice for " + case["voiceLocale"])
    voice = candidates[0]
    aiff = output / (case["id"] + ".aiff")
    wav = output / (case["id"] + ".wav")
    subprocess.run(["/usr/bin/say", "-v", voice, "-r", "165", "-o", str(aiff), case["text"]], check=True)
    subprocess.run(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(aiff), str(wav)], check=True)
    aiff.unlink()
    with wave.open(str(wav)) as audio:
        row = {"id": case["id"], "voice": voice, "locale": case["voiceLocale"],
               "bytes": wav.stat().st_size, "sha256": hashlib.sha256(wav.read_bytes()).hexdigest(),
               "sampleRate": audio.getframerate(), "channels": audio.getnchannels(),
               "sampleWidth": audio.getsampwidth(), "frames": audio.getnframes(),
               "seconds": audio.getnframes() / audio.getframerate()}
    assert row["sampleRate"] == 16000 and row["channels"] == 1 and row["sampleWidth"] == 2
    manifest["voices"].append(row)
(output / "speech-manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest))
