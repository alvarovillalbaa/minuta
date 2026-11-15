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
env.update(npm_config_cache=str(owned/"npm-cache"),PLAYWRIGHT_BROWSERS_PATH=str(owned/"browsers"),MINUTA_URL="http://127.0.0.1:4173",MINUTA_OUTPUT=str(out),MINUTA_EXPECTED_MANIFEST=str(out/"build-manifest.json"),MINUTA_DIST=str(work/"dist"))
env["MINUTA_CASES"]="N07,N08"
env["MINUTA_PLAYWRIGHT"]=str(owned/"tools/node_modules/playwright/index.mjs")
deadline=time.monotonic()+15*60
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
    names={"package.json","package-lock.json","vite.config.mjs","vercel.json","index.html","scripts/prepare-assets.mjs","tests/e2e/consumer-v1.mjs","tests/scripts/serve-consumer-v1.mjs","tests/unit/notebook-ui.test.mjs","tests/fixtures/tools/package.json","tests/fixtures/tools/package-lock.json","tests/fixtures/production-manifest.json","tests/fixtures/speech-v2/english.wav","tests/fixtures/speech-v2/english-accepted-transcript.json"}
    for pattern in ("src/*","licenses/*"):
        names.update(p.relative_to(repo).as_posix() for p in repo.glob(pattern) if p.is_file())
    names.add("public/icon.svg")
    for name in sorted(names):
        source=repo/name;assert source.is_file() and not source.is_symlink(),name
        target=work/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    (out/"declared-inputs.json").write_text(json.dumps([row for row in before if row["path"] in names],indent=2)+"\n")
    run("node-version",["node","--version"])
    run("syntax",["npm","run","check"])
    callbacks=json.loads((repo/"tests/fixtures/consumer-callbacks-accepted-v2.json").read_text())
    assert (out/"01-node-version.stdout.txt").read_text().strip()==callbacks["node"]=="v24.22.2"
    assert callbacks["tests"]==callbacks["pass"]==9 and callbacks["fail"]==callbacks["skipped"]==0
    assert hashlib.sha256((repo/callbacks["originalTap"]).read_bytes()).hexdigest()==callbacks["stdoutSha256"]
    for item in callbacks["inputs"]:
        source=work/item["path"]
        assert source.stat().st_size==item["bytes"] and hashlib.sha256(source.read_bytes()).hexdigest()==item["sha256"],"Changed callback input refuses carry: "+item["path"]
    (out/"carried-callbacks.json").write_text(json.dumps(callbacks,indent=2)+"\n")
    run("dependencies",["npm","ci","--ignore-scripts","--no-audit","--no-fund"],300)
    assert (work/"package-lock.json").read_bytes()==(repo/"package-lock.json").read_bytes(),"App lock changed"
    shutil.copyfile(work/"package-lock.json",out/"app-lock.json")
    run("build",["npm","run","build"],300)
    manifest=[{"path":p.relative_to(work/"dist").as_posix(),"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((work/"dist").rglob("*")) if p.is_file()]
    assert 1<=len(manifest)<=32 and sum(row["bytes"] for row in manifest)<80*1024*1024
    (out/"build-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    native_carry=json.loads((repo/"tests/fixtures/consumer-native-accepted-v1.json").read_text())
    old_public={item["path"]:item for item in native_carry["publicBuild"]}
    new_public={item["path"]:item for item in manifest}
    assert set(old_public)==set(new_public),"Changed asset set refuses native carry"
    for name,item in old_public.items():
        if name!="index.html":assert new_public[name]==item,"Changed non-HTML application body refuses native carry: "+name
    html=(work/"dist/index.html").read_bytes()
    assert html.count(b"&#10;&#10;")==1,"Placeholder repair not unique"
    restored=html.replace(b"&#10;&#10;",b"\\n\\n",1)
    assert len(restored)==old_public["index.html"]["bytes"] and hashlib.sha256(restored).hexdigest()==old_public["index.html"]["sha256"],"Any other HTML change refuses native carry"
    original_native=repo/native_carry["nativeReportPath"]
    assert hashlib.sha256(original_native.read_bytes()).hexdigest()==native_carry["nativeReportSha256"]
    native_report=json.loads(original_native.read_text())
    assert native_report["node"]==native_carry["node"]=="v24.22.2" and native_report["browser"]==native_carry["browser"]=="141.0.7390.37"
    assert [row["id"] for row in native_report["cases"] if row["status"]=="passed" and row["id"] in native_carry["passedCases"]]==native_carry["passedCases"]==["N02","N03"]
    assert native_report["cleanup"]["nativeAbsent"] and native_report["cleanup"]["nativeExitCode"]==0
    (out/"carried-native.json").write_text(json.dumps(native_carry,indent=2)+"\n")
    current_carry=json.loads((repo/"tests/fixtures/consumer-native-accepted-v2.json").read_text())
    assert current_carry["publicBuild"]==manifest,"Changed current public build refuses carry"
    current_report_file=repo/current_carry["nativeReportPath"]
    assert hashlib.sha256(current_report_file.read_bytes()).hexdigest()==current_carry["nativeReportSha256"]
    current_report=json.loads(current_report_file.read_text())
    assert current_report["node"]==current_carry["node"]=="v24.22.2" and current_report["browser"]==current_carry["browser"]=="141.0.7390.37"
    assert [row["id"] for row in current_report["cases"] if row["status"]=="passed"]==current_carry["passedCases"]==["N01","N04","N05","N06a","N06b"]
    assert current_report["cleanup"]["nativeAbsent"] and current_report["cleanup"]["nativeExitCode"]==0
    (out/"carried-native-current.json").write_text(json.dumps(current_carry,indent=2)+"\n")
    original=repo/"docs/results/2026/11-14/browser-43581904253/original.zip"
    assert hashlib.sha256(original.read_bytes()).hexdigest()=="8867eb45b928716daf53ccc7181dc05dc1dd2e0fd01e38e25159ee3cdc0aa9f7"
    with zipfile.ZipFile(original) as archive:
        accepted=json.loads(archive.read("browser-result.json"))
        assert accepted["passed"] and accepted==json.loads((original.parent/"browser-result.json").read_text())
        assert json.loads(archive.read("source.json"))["sha"]=="a32f2839bfd30891bbd02f02a948b7de85a70fb0"
        body=gzip.decompress(archive.read("http/5199cc0dea4e6b08.body.gz"))
        assert len(body)==892780 and hashlib.sha256(body).hexdigest()=="b6404660c9ef6949b239fdb52ea9044dde02bddd86d0068f5c01635a407ad986"
        prior=json.loads(archive.read("build-manifest.json"))
        source_before=json.loads(archive.read("source-before.json"))
        runtime_names={"src/ai.worker.mjs","src/core.mjs","src/wav.mjs","src/extract.mjs","src/recorder.mjs","src/capture.worklet.mjs","src/storage.mjs","package.json","package-lock.json","vite.config.mjs","scripts/prepare-assets.mjs"}
        bound=[item for item in source_before if item["path"] in runtime_names]
        assert len(bound)==len(runtime_names)
        for item in bound:
            current=repo/item["path"]
            assert current.stat().st_size==item["bytes"] and hashlib.sha256(current.read_bytes()).hexdigest()==item["sha256"],"Changed accepted runtime source: "+item["path"]
    carried=[]
    for old in prior:
        name=old["path"]
        if name.startswith(("assets/ai.worker-","assets/capture.worklet-","wasm/")) or name.endswith(".wasm"):
            actual=next((row for row in manifest if row["path"]==name),None)
            assert actual==old,"Changed frozen worker/runtime artifact: "+name
            carried.append(old)
    assert len(carried)==7
    (out/"carried-runtime.json").write_text(json.dumps({"originalRelease":"a32f2839bfd30891bbd02f02a948b7de85a70fb0","replayedASR":False,"archiveSha256":"8867eb45b928716daf53ccc7181dc05dc1dd2e0fd01e38e25159ee3cdc0aa9f7","actualWorkerBodySha256":"b6404660c9ef6949b239fdb52ea9044dde02bddd86d0068f5c01635a407ad986","sourceInputsBound":bound,"files":carried},indent=2)+"\n")
    tools=owned/"tools";tools.mkdir()
    for file in ("package.json","package-lock.json"):shutil.copyfile(repo/"tests/fixtures/tools"/file,tools/file)
    run("browser-tools",["npm","ci","--ignore-scripts","--omit=optional","--no-audit","--no-fund"],180,cwd=tools)
    assert (tools/"package-lock.json").read_bytes()==(repo/"tests/fixtures/tools/package-lock.json").read_bytes(),"Tool lock changed"
    shutil.copyfile(tools/"package-lock.json",out/"tools-lock.json")
    run("chromium",["node",str(tools/"node_modules/playwright/cli.js"),"install","chromium"],300)
    for name in ("server.stdout.txt","server.stderr.txt"):server_streams.append((out/name).open("xb"))
    server=subprocess.Popen(["node","tests/scripts/serve-consumer-v1.mjs"],cwd=work,env=env,stdout=server_streams[0],stderr=server_streams[1],start_new_session=True)
    receipt["serverPid"]=server.pid
    ready=False
    for attempt in range(100):
        assert server.poll() is None,"Preview exited"
        try:
            with urllib.request.urlopen("http://127.0.0.1:4173",timeout=1) as response:ready=response.status==200
        except OSError:pass
        if ready:break
        time.sleep(.1)
    assert ready,"Owned preview unavailable"
    run("consumer-browser",["node","tests/e2e/consumer-v1.mjs"],420)
    result=json.loads((out/"consumer-browser.json").read_text())
    expected=set((env.get("MINUTA_CASES") or "N01,N02,N03,N04,N05,N06a,N06b,N07,N08").split(","))
    assert result["passed"] and {row["id"] for row in result["cases"]}==expected
    assert result["cleanup"]["nativeAbsent"] and result["cleanup"]["nativeExitCode"]==0
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
    receipt["passed"]=bool(receipt["passed"] and receipt.get("sourceStable") and receipt.get("gitClean") and receipt.get("serverGroupAbsent") and receipt.get("serverExit")==0 and not receipt.get("serverForced") and not lingering and receipt["ownedProcessesAbsent"] and receipt["ownedScratchRemoved"])
    record();print(json.dumps({key:value for key,value in receipt.items() if key!="commands"}))
raise SystemExit(0 if receipt["passed"] else 1)
