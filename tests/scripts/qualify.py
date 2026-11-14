"""Owned remote scratch; complete subprocess streams; no local heavy work."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import uuid

repo = Path(__file__).resolve().parents[2]
output = Path(os.environ["MINUTA_OUTPUT"])
output.mkdir(exist_ok=False)
scratch = Path(tempfile.mkdtemp(prefix="minuta-qualification-"))
nonce = uuid.uuid4().hex
(scratch / "owner").write_text(nonce)
identity = scratch.stat().st_ino
work = scratch / "source"
work.mkdir()
(scratch / "tmp").mkdir()
env = dict(os.environ, npm_config_cache=str(scratch / "npm-cache"),
           PLAYWRIGHT_BROWSERS_PATH=str(scratch / "browsers"), TMPDIR=str(scratch / "tmp"))
receipt = {"mode": os.environ["MINUTA_MODE"], "commands": [], "passed": False, "cleanup": False}
deadline = time.monotonic() + 17 * 60

def vector():
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=repo).split(b"\0")
    return [{"path": os.fsdecode(name), "bytes": (repo / os.fsdecode(name)).stat().st_size,
             "sha256": hashlib.sha256((repo / os.fsdecode(name)).read_bytes()).hexdigest()}
            for name in names if name]

before = vector()
(output / "source-before.json").write_text(json.dumps(before, indent=2))
(output / "source.json").write_text(json.dumps({"sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()}))
for item in before:
    destination = work / item["path"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / item["path"], destination)

def execute(name, args, timeout, cwd=None):
    remaining = int(deadline - time.monotonic() - 30)
    if remaining < 1:
        raise RuntimeError("Owned qualification deadline reached before " + name)
    timeout = min(timeout, remaining)
    started = time.monotonic()
    process = subprocess.Popen(args, cwd=cwd or work, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=10)
    (output / f"{name}.stdout.txt").write_bytes(stdout)
    (output / f"{name}.stderr.txt").write_bytes(stderr)
    absent = False
    for _ in range(100):
        try:
            os.killpg(process.pid, 0)
            time.sleep(0.1)
        except ProcessLookupError:
            absent = True
            break
    row = {"name": name, "argv": args, "exit": process.returncode, "timedOut": timed_out, "timeoutSeconds": timeout,
           "leaderReaped": process.poll() is not None, "groupAbsent": absent,
           "seconds": time.monotonic() - started, "stdoutBytes": len(stdout), "stderrBytes": len(stderr),
           "stdoutSha256": hashlib.sha256(stdout).hexdigest(), "stderrSha256": hashlib.sha256(stderr).hexdigest()}
    receipt["commands"].append(row)
    print(json.dumps(row), flush=True)
    if process.returncode or timed_out or not absent:
        raise RuntimeError(f"{name} did not complete successfully")

def record_build():
    manifest = [{"path": p.relative_to(work / "dist").as_posix(), "bytes": p.stat().st_size,
                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in sorted((work / "dist").rglob("*")) if p.is_file()]
    (output / "build-manifest.json").write_text(json.dumps(manifest, indent=2))

try:
    execute("versions", ["node", "--version"], 10)
    execute("npm-version", ["npm", "--version"], 10)
    if receipt["mode"] == "build":
        execute("dependencies", ["npm", "ci" if (work / "package-lock.json").exists() else "install", "--ignore-scripts", "--no-audit", "--no-fund"], 300)
        shutil.copyfile(work / "package-lock.json", output / "package-lock.json")
        execute("build", ["npm", "run", "build"], 300)
        record_build()
    elif receipt["mode"] == "browser":
        execute("dependencies", ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 300)
        execute("build", ["npm", "run", "build"], 300)
        record_build()
        shutil.copyfile(work / "package-lock.json", output / "package-lock.json")
        env["MINUTA_EXPECTED_MANIFEST"] = str(output / "build-manifest.json")
        tools = scratch / "tools"
        tools.mkdir()
        shutil.copyfile(work / "tests/fixtures/tools/package.json", tools / "package.json")
        locked = (work / "tests/fixtures/tools/package-lock.json").exists()
        if locked:
            shutil.copyfile(work / "tests/fixtures/tools/package-lock.json", tools / "package-lock.json")
        execute("tools", ["npm", "ci" if locked else "install", "--ignore-scripts", "--no-audit", "--no-fund"], 180, cwd=tools)
        shutil.copyfile(tools / "package-lock.json", output / "tools-lock.json")
        execute("chromium", ["node", str(tools / "node_modules/playwright/cli.js"), "install", "chromium"], 180)
        env["MINUTA_PLAYWRIGHT"] = str(tools / "node_modules/playwright/index.mjs")
        execute("speech", ["python3", "tests/scripts/speech.py"], 90)
        execute("browser", ["node", "tests/e2e/notebook.mjs"], 840)
        result = json.loads((output / "browser-result.json").read_text())
        if not result["passed"]:
            raise RuntimeError("Browser/model qualification not accepted")
    else:
        raise RuntimeError("Unknown qualification mode")
    receipt["passed"] = True
except Exception as error:
    receipt["error"] = repr(error)
finally:
    after = vector()
    (output / "source-after.json").write_text(json.dumps(after, indent=2))
    receipt["sourceUnchanged"] = before == after
    receipt["scratchBytes"] = sum(p.stat().st_size for p in scratch.rglob("*") if p.is_file() and not p.is_symlink())
    if scratch.stat().st_ino == identity and (scratch / "owner").read_text() == nonce and all(row["groupAbsent"] for row in receipt["commands"]):
        shutil.rmtree(scratch)
        receipt["cleanup"] = not scratch.exists()
    receipt["passed"] = receipt["passed"] and receipt["sourceUnchanged"] and receipt["cleanup"]
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
if not receipt["passed"]:
    raise SystemExit(1)
