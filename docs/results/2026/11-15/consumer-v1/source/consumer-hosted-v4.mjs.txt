// Anonymous hosted consumer acceptance; authored T2 notes, no recording/model inference.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=process.env.MINUTA_OUTPUT,origin='https://minuta-liard.vercel.app';
assert.match(process.env.MINUTA_RELEASE_SHA,/^[a-f0-9]{40}$/);
const manifest=JSON.parse(await readFile(process.env.MINUTA_EXPECTED_MANIFEST,'utf8'));
const config=JSON.parse(await readFile('vercel.json','utf8'));
const expectedHeaders=Object.fromEntries(config.headers[0].headers.map(h=>[h.key.toLowerCase(),h.value]));
const report={tier:'T2',source:process.env.GITHUB_SHA,release:process.env.MINUTA_RELEASE_SHA,url:origin,node:process.version,resources:[],requests:[],errors:[],unexpected:[],cases:[],passed:false};
const contexts=[];let browserServer,browser,native;
const fixture=await readFile('tests/fixtures/speech-v2/english.wav');assert.equal(fixture.length,246774);assert.equal(createHash('sha256').update(fixture).digest('hex'),'696c4221d5c4edffd3691a86d5049af3d21140e0fe33466451469e64560b5314');
await mkdir(path.join(out,'downloads'),{recursive:true});
try{
 let total=0;
 for(const item of manifest){
  const name=item.path==='index.html'?'/':'/'+item.path;
  const response=await fetch(origin+name,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,name);
  let bytes=0;const digest=createHash('sha256');
  for await(const chunk of response.body){bytes+=chunk.length;total+=chunk.length;assert.ok(bytes<=32*1024*1024&&total<=80*1024*1024,'Hosted body budget');digest.update(chunk);}
  const sha256=digest.digest('hex'),headers=Object.fromEntries(Object.keys(expectedHeaders).map(key=>[key,response.headers.get(key)]));
  report.resources.push({path:name,status:response.status,bytes,sha256,expected:item.sha256,headers});
  assert.equal(bytes,item.bytes,name+' byte count');assert.equal(sha256,item.sha256,name+' body digest');
  for(const[key,value]of Object.entries(expectedHeaders))assert.equal(headers[key],value,name+' '+key);
 }
 assert.equal(report.resources.length,12);
 const {chromium}=await import(process.env.MINUTA_PLAYWRIGHT);
 browserServer=await chromium.launchServer({headless:true,channel:'chromium',args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('tests/fixtures/speech-v2/english.wav')]});native=browserServer.process();browser=await chromium.connect(browserServer.wsEndpoint());report.browser=browser.version();report.browserChannel='chromium';report.browserExecutable=path.basename(native.spawnfile);
 const ctx=await browser.newContext({viewport:{width:320,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});contexts.push(ctx);
 await ctx.grantPermissions([],{origin});
 await ctx.addInitScript(()=>{
  window.__minutaHosted={mediaCalls:0,tracks:[],mediaErrors:[],workerEvents:[],workers:0};
  if(navigator.mediaDevices?.getUserMedia){
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async(...args)=>{
    __minutaHosted.mediaCalls++;
    try{const stream=await original(...args);__minutaHosted.tracks.push(...stream.getTracks());return stream;}
    catch(error){__minutaHosted.mediaErrors.push({name:error.name,message:error.message,stack:error.stack,constraints:args});throw error;}
   };
  }
  const NativeWorker=window.Worker;
  window.Worker=new Proxy(NativeWorker,{construct(target,args){const instance=Reflect.construct(target,args);__minutaHosted.workers++;instance.addEventListener('message',e=>{if(['result','error'].includes(e.data?.type))__minutaHosted.workerEvents.push(e.data);});return instance;}});
 });
 ctx.on('page',page=>{page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('websocket',s=>report.unexpected.push('WebSocket '+s.url()));});
 ctx.on('requestfailed',r=>{if(/^https?:/.test(r.url()))report.errors.push(r.method()+' '+r.url()+' '+r.failure()?.errorText);});
 const allowed=new Set(['/',...manifest.map(f=>'/'+f.path)]);
 await ctx.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.protocol==='blob:'&&u.origin===origin){await route.continue();return;}
  report.requests.push({method:r.method(),url:u.origin+u.pathname,hasQuery:Boolean(u.search),bodyBytes:r.postDataBuffer()?.length||0});
  if(!['GET','HEAD'].includes(r.method())||u.origin!==origin||u.search||!allowed.has(u.pathname)||r.postDataBuffer()?.length){report.unexpected.push(r.method()+' '+u.origin+u.pathname);await route.abort();return;}
  await route.continue();
 });
 const p=await ctx.newPage();const initial=await p.goto(origin,{waitUntil:'networkidle'});assert.equal(initial.status(),200);
 await p.locator('#home-screen').waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('#refresh-library').disabled);
 assert.equal(await p.locator('.meeting-item').count(),0);
 assert.deepEqual(await p.evaluate(()=>({mediaCalls:__minutaHosted.mediaCalls,workers:__minutaHosted.workers})),{mediaCalls:0,workers:0});
 assert.ok(await p.evaluate(()=>innerWidth===320&&document.documentElement.scrollWidth<=320));
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.waitForTimeout(200);await p.screenshot({path:path.join(out,'hosted-home.png'),fullPage:true});
 await p.locator('#start-writing').tap();
 assert.equal(await p.locator('#notes').getAttribute('placeholder'),'¿De qué vamos a hablar?\n\nAnota nombres, preguntas, acuerdos…');
 const title='Entrega pública de Minuta T2',a='Nora revisará la propuesta el lunes.',b='El precio sigue sin decidir.',notes=a+' '+b;
 await p.locator('#meeting-title').fill(title);await p.locator('#notes').fill(notes);
 assert.equal(await p.evaluate(()=>__minutaHosted.mediaCalls),0);
 await p.locator('#generate-notes').tap();await p.locator('#proposal-dialog').waitFor({state:'visible'});
 const event=await p.evaluate(()=>__minutaHosted.workerEvents.at(-1));assert.equal(event.type,'result');assert.equal(event.meta.method,'source-extract-v1');
 for(const unit of event.meta.units)assert.equal(unit.text,notes.slice(unit.start,unit.end));assert.ok(event.text.includes(a)&&event.text.includes(b));
 report.excerpt={method:event.meta.method,selectedCount:event.meta.selectedCount,totalUnits:event.meta.totalUnits,units:event.meta.units};
 await p.locator('#apply-proposal').tap();await p.locator('#save-meeting').tap();
 await p.waitForFunction(()=>document.querySelector('#save-state').textContent==='Guardado en este navegador'&&document.querySelector('#status').textContent.includes('Conversación guardada'));
 await p.locator('#back-home').tap();await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>document.querySelectorAll('.meeting-item').length===1);
 await p.locator('.meeting-open').filter({has:p.getByText(title,{exact:true})}).tap();
 await p.locator('#editor-screen').waitFor({state:'visible'});
 assert.equal(await p.locator('#notes').inputValue(),notes);await p.locator('#tab-summary').tap();
 const summary=await p.locator('#summary').inputValue();assert.equal(summary,event.text);
 await p.locator('#open-downloads').tap();const waiting=p.waitForEvent('download');await p.locator('#export-json').tap();const download=await waiting;assert.equal(await download.failure(),null);
 const target=path.join(out,'downloads/hosted-current-notes.json');await download.saveAs(target);
 const exported=JSON.parse(await readFile(target,'utf8'));assert.equal(exported.includesAudio,false);assert.equal(exported.meeting.notes,notes);assert.equal(exported.meeting.summary,summary);
 await p.getByRole('button',{name:'Cerrar descargas',exact:true}).tap();
 report.permissionBefore=await p.evaluate(async()=>({state:(await navigator.permissions.query({name:'microphone'})).state,calls:__minutaHosted.mediaCalls}));
 assert.deepEqual(report.permissionBefore,{state:'denied',calls:0});
 await p.locator('#record').tap();
 await p.waitForFunction(()=>__minutaHosted.mediaCalls===1&&__minutaHosted.mediaErrors.length===1&&!document.querySelector('#record').hidden&&document.querySelector('#stop-record').hidden);
 report.deniedCapture=await p.evaluate(()=>({calls:__minutaHosted.mediaCalls,errors:__minutaHosted.mediaErrors,tracks:__minutaHosted.tracks.map(t=>({kind:t.kind,state:t.readyState})),status:document.querySelector('#status').textContent}));
 assert.equal(report.deniedCapture.calls,1);assert.equal(report.deniedCapture.errors[0].name,'NotAllowedError');assert.deepEqual(report.deniedCapture.tracks,[]);
 assert.equal(await p.locator('#notes').inputValue(),notes);assert.equal(await p.locator('#back-home').isDisabled(),false);
 assert.ok(await p.evaluate(()=>innerWidth===320&&document.documentElement.scrollWidth<=320));
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.waitForTimeout(200);await p.screenshot({path:path.join(out,'hosted-editor.png'),fullPage:true});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);assert.ok(report.requests.length>=7);
 report.cases.push({id:'H01',status:'passed',description:'Twelve exact anonymous public bodies/headers and real320px consumer write/excerpt/review/save/reload/download plus observed native denied microphone call'});
 report.passed=true;
}catch(error){report.error=error.stack;
 if(browser){
  const diagnostic=await browser.newContext({viewport:{width:1360,height:920}});contexts.push(diagnostic);
  try{
   await diagnostic.grantPermissions([],{origin});const d=await diagnostic.newPage();await d.goto(origin,{waitUntil:'networkidle'});
   report.desktopDiagnostic=await d.evaluate(async()=>{const state=(await navigator.permissions.query({name:'microphone'})).state;try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const tracks=stream.getTracks().map(t=>({kind:t.kind,state:t.readyState}));stream.getTracks().forEach(t=>t.stop());return{state,unexpectedStream:true,tracks};}catch(e){return{state,error:{name:e.name,message:e.message,stack:e.stack}};}});
  }catch(e){report.desktopDiagnostic={diagnosticError:String(e)};}
 }
 throw error;
}
finally{
 const failures=[];for(const ctx of contexts){try{await ctx.close();}catch(e){failures.push(String(e));}}
 if(browser){try{await browser.close();}catch(e){failures.push(String(e));}}
 if(browserServer){try{await browserServer.close();}catch(e){failures.push(String(e));}}
 let absent=!native;if(native){try{process.kill(native.pid,0);}catch(e){absent=e.code==='ESRCH';}}
 report.cleanup={contextsClosed:failures.length===0,nativePid:native?.pid??null,nativeExitCode:native?.exitCode??null,nativeAbsent:absent,failures};
 report.passed=report.passed&&absent&&native?.exitCode===0&&failures.length===0;
 await writeFile(path.join(out,'consumer-hosted.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.passed)process.exitCode=1;
}
