"""Exact-source consumer UI qualification in owned remote scratch only."""
from pathlib import Path
import hashlib,json,os,secrets,shutil,signal,subprocess,time,urllib.request,gzip,zipfile
repo=Path.cwd().resolve()
runner=Path(os.environ["RUNNER_TEMP"]).resolve()
job=os.environ["GITHUB_RUN_ID"]+"-"+os.environ["GITHUB_RUN_ATTEMPT"]
owned=runner/("minuta-consumer-"+job)
out=Path(os.environ["MINUTA_OUTPUT"]).resolve()
assert out.parent==runner and out.name=="minuta-consumer-proof-"+job
assert not owned.exists() and not out.exists(),"Preserve pre-existing runner paths"
owned.mkdir();out.mkdir()
owner={"job":job,"nonce":secrets.token_hex(16),"pid":os.getpid()}
(owned/"owner.json").write_text(json.dumps(owner))
(out/"owner.json").write_text(json.dumps(owner))
inode=owned.stat().st_ino
work=owned/"source";work.mkdir()
(owned/"tmp").mkdir()
env=dict(os.environ)
env["TMPDIR"]=str(owned/"tmp")
env.update(npm_config_cache=str(owned/"npm-cache"),PLAYWRIGHT_BROWSERS_PATH=str(owned/"browsers"),MINUTA_URL="https://minuta-liard.vercel.app",MINUTA_OUTPUT=str(out),MINUTA_EXPECTED_MANIFEST=str(out/"build-manifest.json"))
env["MINUTA_PLAYWRIGHT"]=str(owned/"tools/node_modules/playwright/index.mjs")
deadline=time.monotonic()+5*60
receipt={"source":os.environ["GITHUB_SHA"],"commands":[],"passed":False}
server=None
server_streams=[]
def record():
    (out/"runner.json").write_text(json.dumps(receipt,indent=2)+"\n")
def vector():
    paths=subprocess.check_output(["git","ls-files","-z"],cwd=repo).split(b"\0")
    rows=[]
    for raw in paths:
        if not raw:continue
        p=os.fsdecode(raw);f=repo/p
        assert not f.is_symlink() and f.is_file(),p
        rows.append({"path":p,"bytes":f.stat().st_size,"sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
    return rows
before=vector()
(out/"source-before.json").write_text(json.dumps(before,indent=2)+"\n")
def stop(child):
    forced=False
    if child.poll() is None:
        os.killpg(child.pid,signal.SIGTERM)
        try:child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            forced=True;os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=5)
    return forced
def run(label,args,seconds=120,cwd=work,required=True):
    number=len(receipt["commands"])+1
    stem=str(number).zfill(2)+"-"+label
    output=out/(stem+".stdout.txt");error=out/(stem+".stderr.txt")
    row={"label":label,"argv":args,"stdout":output.name,"stderr":error.name}
    receipt["commands"].append(row)
    started=time.monotonic();failure=None
    end=started+45 if label=="source-guard" else min(deadline,started+seconds)
    with output.open("xb") as stdout,error.open("xb") as stderr:
        child=subprocess.Popen(args,cwd=cwd,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
        while child.poll() is None:
            if time.monotonic()>end or output.stat().st_size+error.stat().st_size>8*1024*1024:
                failure="deadline/output budget";row["forced"]=stop(child);break
            time.sleep(.1)
        row["exit"]=child.wait()
        try:
            os.killpg(child.pid,0);row["orphanedGroup"]=True;os.killpg(child.pid,signal.SIGTERM);time.sleep(.2)
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            failure=failure or "owned command left descendants"
        except ProcessLookupError:row["orphanedGroup"]=False
    row.update(seconds=round(time.monotonic()-started,3),failure=failure,streamsComplete=failure is None,stdoutSha256=hashlib.sha256(output.read_bytes()).hexdigest(),stderrSha256=hashlib.sha256(error.read_bytes()).hexdigest())
    record()
    if required and (row["exit"] or failure):raise RuntimeError(label+" failed; preserve original streams")
def pids():
    result=[]
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():continue
        try:
            if item.stat().st_uid==os.getuid() and (item/"exe").resolve().is_relative_to(owned):result.append(int(item.name))
        except (OSError,RuntimeError):pass
    return result
try:
    run("node-version",["node","--version"],cwd=repo)
    expected=json.loads((repo/"docs/results/2026/11-15/consumer-v1/accepted-build-inputs.json").read_text())
    assert len(expected)==17
    for item in expected:
        current=repo/item["path"]
        assert current.is_file() and current.stat().st_size==item["bytes"] and hashlib.sha256(current.read_bytes()).hexdigest()==item["sha256"],"Changed qualified build source: "+item["path"]
    (out/"declared-inputs.json").write_text(json.dumps(expected,indent=2)+"\n")
    shutil.copyfile(repo/"docs/results/2026/11-15/consumer-v1/accepted-build-manifest.json",out/"build-manifest.json")
    tools=owned/"tools";tools.mkdir()
    for file in ("package.json","package-lock.json"):shutil.copyfile(repo/"tests/fixtures/tools"/file,tools/file)
    run("browser-tools",["npm","ci","--ignore-scripts","--omit=optional","--no-audit","--no-fund"],180,cwd=tools)
    assert (tools/"package-lock.json").read_bytes()==(repo/"tests/fixtures/tools/package-lock.json").read_bytes()
    shutil.copyfile(tools/"package-lock.json",out/"tools-lock.json")
    run("chromium",["node",str(tools/"node_modules/playwright/cli.js"),"install","chromium"],180,cwd=repo)
    receipt["noLocalServer"]=True
    run("hosted-browser",["node","tests/e2e/consumer-hosted-v1.mjs"],180,cwd=repo)
    result=json.loads((out/"consumer-hosted.json").read_text())
    assert result["passed"] and len(result["cases"])==1 and len(result["resources"])==12
    assert result["cleanup"]["nativeAbsent"] and result["cleanup"]["nativeExitCode"]==0
    assert result["deniedCapture"]["calls"]==1 and result["deniedCapture"]["errors"][0]["name"]=="NotAllowedError" and not result["deniedCapture"]["tracks"]
    receipt["passed"]=True
except Exception as error:
    receipt["error"]=type(error).__name__+": "+str(error)
finally:
    if server is not None:
        receipt["serverForced"]=stop(server);receipt["serverExit"]=server.returncode
        try:os.killpg(server.pid,0);receipt["serverGroupAbsent"]=False
        except ProcessLookupError:receipt["serverGroupAbsent"]=True
    for stream in server_streams:stream.close()
    try:
        after=vector();(out/"source-after.json").write_text(json.dumps(after,indent=2)+"\n");receipt["sourceStable"]=before==after
        receipt["gitClean"]=not subprocess.check_output(["git","status","--porcelain"],cwd=repo).strip()
    except Exception as error:receipt["guardError"]=str(error)
    lingering=pids();receipt["lingeringOwnedPids"]=lingering
    for pid in lingering:
        try:os.kill(pid,signal.SIGTERM)
        except ProcessLookupError:pass
    if lingering:time.sleep(1)
    for pid in pids():
        try:os.kill(pid,signal.SIGKILL)
        except ProcessLookupError:pass
    receipt["ownedProcessesAbsent"]=not pids()
    receipt["scratchBytes"]=sum(p.stat().st_size for p in owned.rglob("*") if p.is_file() and not p.is_symlink())
    if owned.stat().st_ino==inode and json.loads((owned/"owner.json").read_text())==owner and receipt["ownedProcessesAbsent"]:
        shutil.rmtree(owned)
    receipt["ownedScratchRemoved"]=not owned.exists()
    receipt["passed"]=bool(receipt["passed"] and receipt.get("sourceStable") and receipt.get("gitClean") and receipt.get("noLocalServer") and not lingering and receipt["ownedProcessesAbsent"] and receipt["ownedScratchRemoved"])
    record();print(json.dumps({key:value for key,value in receipt.items() if key!="commands"}))
raise SystemExit(0 if receipt["passed"] else 1)
