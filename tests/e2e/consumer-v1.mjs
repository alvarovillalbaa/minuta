// Consumer UI v1: native Chromium and authored T2 notes/audio, no model inference.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeWav} from '../../src/wav.mjs';
const {chromium}=await import(process.env.MINUTA_PLAYWRIGHT);
const out=process.env.MINUTA_OUTPUT,base=process.env.MINUTA_URL;
assert.equal(base,'http://127.0.0.1:4173');
const manifest=JSON.parse(await readFile(process.env.MINUTA_EXPECTED_MANIFEST,'utf8'));
const allowed=new Set(['/',...manifest.map(f=>'/'+f.path)]);
const selected=new Set((process.env.MINUTA_CASES||'N01,N02,N03,N04,N05,N06a,N06b,N07,N08').split(','));
assert.ok([...selected].every(id=>['N01','N02','N03','N04','N05','N06a','N06b','N07','N08'].includes(id)));
await mkdir(path.join(out,'downloads'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={tier:'T2',source:process.env.GITHUB_SHA,node:process.version,selected:[...selected],cases:[],boundaries:[],passed:false};
const contexts=[],states=[];
const browserServer=await chromium.launchServer({headless:true,args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('tests/fixtures/speech-v2/english.wav')]});
const nativeProcess=browserServer.process(),browser=await chromium.connect(browserServer.wsEndpoint());
report.browser=browser.version();
async function context(options={}){
 const ctx=await browser.newContext({viewport:{width:1360,height:920},acceptDownloads:true,...options});
 const state={ctx,requests:[],errors:[],unexpected:[]};contexts.push(ctx);states.push(state);
 await ctx.addInitScript(()=>{
  const probe=window.__minutaConsumer={mediaCalls:0,displayCalls:0,workers:0,events:[],tracks:[],contexts:[]};
  if(navigator.mediaDevices?.getUserMedia){
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async(...args)=>{probe.mediaCalls++;const stream=await original(...args);probe.tracks.push(...stream.getTracks());return stream;};
  }
  if(navigator.mediaDevices?.getDisplayMedia){
   const original=navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getDisplayMedia=async(...args)=>{probe.displayCalls++;const stream=await original(...args);probe.tracks.push(...stream.getTracks());return stream;};
  }
  const NativeAudio=window.AudioContext;
  if(NativeAudio)window.AudioContext=new Proxy(NativeAudio,{construct(target,args){const result=Reflect.construct(target,args);probe.contexts.push(result);return result;}});
  const NativeWorker=window.Worker;
  window.Worker=new Proxy(NativeWorker,{construct(target,args){const instance=Reflect.construct(target,args);probe.workers++;instance.addEventListener('message',event=>{if(['result','error'].includes(event.data?.type))probe.events.push(event.data);});return instance;}});
 });
 ctx.on('page',page=>{
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>state.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')state.errors.push(m.text());});
  page.on('websocket',s=>state.unexpected.push('WebSocket '+s.url()));
 });
 ctx.on('requestfailed',r=>{if(/^https?:/.test(r.url()))state.errors.push(r.method()+' '+r.url()+' '+r.failure()?.errorText);});
 await ctx.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.protocol==='blob:'&&u.origin===base){await route.continue();return;}
  state.requests.push({method:r.method(),url:r.url(),bodyBytes:r.postDataBuffer()?.length||0});
  if(!['GET','HEAD'].includes(r.method())||u.origin!==base||u.search||!allowed.has(u.pathname)||r.postDataBuffer()?.length){state.unexpected.push(r.method()+' '+r.url());await route.abort();return;}
  await route.continue();
 });
 const page=await ctx.newPage();state.page=page;return state;
}
async function open(state){
 const response=await state.page.goto(base,{waitUntil:'networkidle'});assert.equal(response.status(),200);
 await state.page.locator('#home-screen').waitFor({state:'visible'});
 await state.page.waitForFunction(()=>!document.querySelector('#refresh-library').disabled);
}
async function writing(page){await page.locator('#start-writing').click();await page.locator('#editor-screen').waitFor({state:'visible'});}
async function save(page){await page.locator('#save-meeting').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Guardado en este navegador'&&document.querySelector('#status').textContent.includes('Conversación guardada'));}
async function home(page){await page.locator('#back-home').click();await page.locator('#home-screen').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#refresh-library').disabled);}
async function download(page,id,name){
 const wait=page.waitForEvent('download');await page.locator(id).click();const file=await wait;
 assert.equal(await file.failure(),null);const target=path.join(out,'downloads',name);await file.saveAs(target);return readFile(target);
}
async function backup(page,name){await page.locator('#open-downloads').click();const bytes=await download(page,'#export-json',name);await page.locator('#downloads-dialog .close-dialog').click();return JSON.parse(bytes);}
async function chooser(page,label,file){const wait=page.waitForEvent('filechooser');await page.locator(label).click();await(await wait).setFiles(file);}
async function records(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('minuta-local-v1',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('meetings','readonly'),rows=tx.objectStore('meetings').getAll();tx.oncomplete=()=>{resolve(rows.result);db.close();};tx.onabort=()=>reject(tx.error);};}));}
async function saved(page,title){
 if(await page.locator('#editor-screen').isVisible())await home(page);
 await page.locator('#library-search').fill('');
 await page.locator('.meeting-open').filter({has:page.getByText(title,{exact:true})}).click();
 if(await page.locator('#replace-dialog').isVisible())await page.locator('#replace-current').click();
 await page.waitForFunction(title=>document.querySelector('#meeting-title').value===title,title);
}
async function probe(page){return page.evaluate(()=>({mediaCalls:__minutaConsumer.mediaCalls,displayCalls:__minutaConsumer.displayCalls,workers:__minutaConsumer.workers,tracks:__minutaConsumer.tracks.map(t=>({kind:t.kind,state:t.readyState})),contexts:__minutaConsumer.contexts.map(c=>c.state)}));}
async function fit(page,dialog=null){
 const width=page.viewportSize().width,height=page.viewportSize().height;
 const metrics=await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
 assert.ok(metrics.innerWidth<=width+1&&metrics.scrollWidth<=width+1,JSON.stringify(metrics));
 if(dialog){const r=await page.locator(dialog).boundingBox();assert.ok(r&&r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,dialog+' outside viewport '+JSON.stringify(r));}
 return metrics;
}
async function shot(page,name){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForTimeout(200);await page.screenshot({path:path.join(out,name),fullPage:true});
}
async function boundary(state){assert.deepEqual(state.errors,[]);assert.deepEqual(state.unexpected,[]);assert.ok(state.requests.length>=3);report.boundaries.push({requests:state.requests,errors:state.errors,unexpected:state.unexpected});}
async function run(id,description,action){
 if(!selected.has(id))return;
 const row={id,description,status:'running'};report.cases.push(row);
 try{await action(row);row.status='passed';}
 catch(error){row.status='failed';row.error=error.stack;row.observed=[];
  for(const state of states)for(const page of state.ctx.pages()){try{row.observed.push({url:page.url(),state:await page.evaluate(()=>({home:!document.querySelector('#home-screen')?.hidden,editor:!document.querySelector('#editor-screen')?.hidden,status:document.querySelector('#status')?.textContent,library:document.querySelector('#library-message')?.textContent})),errors:state.errors,unexpected:state.unexpected});await shot(page,'failure-'+id+'-'+row.observed.length+'.png');}catch{}}
  throw error;
 }finally{await writeFile(path.join(out,'consumer-browser.json'),JSON.stringify(report,null,2)+'\n');}
}
try{
 await run('N01','Native consumer home, invalid draft continuity, literal search/save and fresh reload',async row=>{
  const s=await context(),p=s.page;await open(s);
  assert.equal(await p.locator('.meeting-item').count(),0);assert.match(await p.locator('.library-empty').innerText(),/próxima conversación/);
  assert.deepEqual(await probe(p),{mediaCalls:0,displayCalls:0,workers:0,tracks:[],contexts:[]});await shot(p,'home-empty.png');
  await writing(p);assert.equal(await p.locator('#notes').evaluate(e=>document.activeElement===e),true);
  assert.equal(await p.locator('#notes').getAttribute('placeholder'),'¿De qué vamos a hablar?\n\nAnota nombres, preguntas, acuerdos…');await shot(p,'editor-writing.png');
  const title='Café <literal> de la semana',notes='Nora revisará la propuesta el lunes. <img src="https://invalid.example/private" onerror="window.injected=true"> Ben mantiene el presupuesto pendiente.';
  await p.locator('#meeting-title').fill(title);await p.locator('#notes').fill(notes);await home(p);
  assert.equal(await p.locator('#draft-title').innerText(),title);await p.locator('#start-listening').click();await p.locator('#replace-dialog').waitFor();await p.locator('#keep-current').click();
  await p.locator('#resume-draft').click();assert.equal(await p.locator('#notes').inputValue(),notes);
  await p.locator('#meeting-title').fill('');await home(p);await p.locator('#resume-draft').click();assert.equal(await p.locator('#meeting-title').inputValue(),'');assert.equal(await p.locator('#notes').inputValue(),notes);
  await p.locator('#meeting-title').fill(title);await save(p);await home(p);assert.equal(await p.locator('.meeting-item').count(),1);
  await p.locator('#library-search').fill('cafe');assert.equal(await p.locator('.meeting-item').count(),1);assert.equal(await p.evaluate(()=>window.injected),undefined);
  await p.locator('#library-search').fill('sin coincidencias');assert.equal(await p.locator('.meeting-item').count(),0);assert.match(await p.locator('.library-empty').innerText(),/No encontramos/);
  await p.locator('#library-search').fill('');await shot(p,'home-saved.png');await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>document.querySelectorAll('.meeting-item').length===1);await saved(p,title);assert.equal(await p.locator('#notes').inputValue(),notes);
  assert.equal((await probe(p)).mediaCalls,0);assert.equal((await probe(p)).workers,0);row.stored=(await records(p)).map(r=>({id:r.id,revision:r.revision,title:r.title}));await boundary(s);await s.ctx.close();
 });
 await run('N02','Current saved cards, actual backup/import, two-tab conflicts/copy and two-step delete',async row=>{
  const s=await context(),p=s.page;await open(s);await writing(p);const title='Revisión compartida T2';await p.locator('#meeting-title').fill(title);await p.locator('#notes').fill('Original guardado.');await save(p);
  const initial=await backup(p,'n02-original.json');assert.equal(initial.includesAudio,false);
  await p.locator('#open-downloads').click();const markdown=await download(p,'#export-markdown','n02-original.md');assert.ok(markdown.toString().includes(title)&&markdown.toString().includes('Original guardado.'));await p.locator('#downloads-dialog .close-dialog').click();
  await p.locator('#notes').fill('Conservar este borrador.');await p.locator('#open-downloads').click();await chooser(p,'label[for="notes-file"]',path.join(out,'downloads/n02-original.json'));await p.locator('#replace-dialog').waitFor();await p.locator('#keep-current').click();await p.locator('#downloads-dialog .close-dialog').click();assert.equal(await p.locator('#notes').inputValue(),'Conservar este borrador.');
  await p.locator('#open-downloads').click();await chooser(p,'label[for="notes-file"]',path.join(out,'downloads/n02-original.json'));await p.locator('#replace-current').click();await p.locator('#meeting-title').fill('Importada T2');await save(p);const imported=await backup(p,'n02-imported.json');assert.notEqual(imported.meeting.id,initial.meeting.id);
  await saved(p,title);const other=await s.ctx.newPage();await other.goto(base,{waitUntil:'networkidle'});await other.waitForFunction(()=>!document.querySelector('#refresh-library').disabled);await saved(other,title);
  await p.locator('#notes').fill('Primera revisión confirmada.');await save(p);await other.locator('#notes').fill('Borrador de la segunda pestaña.');await other.locator('#save-meeting').click();await other.locator('#status').filter({hasText:'cambió en otra pestaña'}).waitFor();
  assert.equal(await other.locator('#notes').inputValue(),'Borrador de la segunda pestaña.');assert.equal((await records(p)).find(r=>r.id===initial.meeting.id).notes,'Primera revisión confirmada.');
  await other.locator('#meeting-title').fill('Copia del conflicto T2');await other.locator('#save-copy').click();await other.locator('#status').filter({hasText:'Copia guardada'}).waitFor();
  await home(p);const remove=p.locator('.meeting-item').filter({has:p.getByText(title,{exact:true})}).locator('.meeting-delete');await remove.click();assert.ok((await records(p)).some(r=>r.id===initial.meeting.id));await remove.click();await p.locator('#status').filter({hasText:'eliminada'}).waitFor();assert.ok(!(await records(p)).some(r=>r.id===initial.meeting.id));
  await p.locator('#resume-draft').click();assert.equal(await p.locator('#notes').inputValue(),'Primera revisión confirmada.');const copy=await backup(p,'n02-deleted-open-copy.json');assert.notEqual(copy.meeting.id,initial.meeting.id);row.ids={initial:initial.meeting.id,imported:imported.meeting.id,openAfterDelete:copy.meeting.id};await boundary(s);await s.ctx.close();
 });
 await run('N03','Current home/listen native fake-microphone worklet, busy states and normal capture teardown',async row=>{
  const s=await context();await s.ctx.grantPermissions(['microphone'],{origin:base});const p=s.page;await open(s);await p.locator('#start-listening').click();assert.equal((await probe(p)).mediaCalls,0);
  await p.locator('#record').click();await p.locator('#capture-state').filter({hasText:'Grabando'}).waitFor();assert.equal(await p.locator('#back-home').isDisabled(),true);assert.equal(await p.locator('#save-meeting').isDisabled(),true);
  await p.waitForFunction(()=>document.querySelector('#record-time').textContent>='00:02',{},{timeout:10000});await p.locator('#stop-record').click();await p.locator('#capture-state').filter({hasText:'listo para escuchar'}).waitFor();
  assert.equal(await p.locator('#back-home').isDisabled(),false);assert.equal(await p.locator('#record').isVisible(),true);
  await p.locator('#open-downloads').click();const bytes=await download(p,'#export-audio','n03-native-capture.wav');await p.locator('#downloads-dialog .close-dialog').click();const audio=decodeWav(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const samples=audio.samples||audio.audio||audio.data;assert.ok(samples&&samples.length>16000,'Captured samples unavailable');const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length);assert.ok(rms>0.001,'Native fake capture is silent');
  row.capture={bytes:bytes.length,sha256:sha(bytes),seconds:audio.seconds,rms};row.native=await probe(p);assert.equal(row.native.mediaCalls,1);assert.ok(row.native.tracks.length>0&&row.native.tracks.every(t=>t.state==='ended'));assert.ok(row.native.contexts.length>0&&row.native.contexts.every(x=>x==='closed'));assert.equal(row.native.workers,0);await shot(p,'capture-ready.png');await boundary(s);await s.ctx.close();
 });
 await run('N04','Native WAV chooser/playback, separate byte-exact audio export and refused/cancelled input',async row=>{
  const s=await context(),p=s.page;await open(s);await writing(p);await p.locator('#notes').fill('Notas que no se envían.');const source='tests/fixtures/speech-v2/english.wav',expected=await readFile(source);
  await chooser(p,'label[for="audio-file"]',source);await p.locator('#status').filter({hasText:'Audio abierto'}).waitFor();await p.locator('#audio-player').click({position:{x:25,y:27}});await p.waitForFunction(()=>document.querySelector('#audio-player').currentTime>0.2);
  row.playback=await p.locator('#audio-player').evaluate(e=>({currentTime:e.currentTime,duration:e.duration,paused:e.paused}));assert.ok(row.playback.currentTime>0);await p.locator('#audio-player').click({position:{x:25,y:27}});
  await p.locator('#transcribe').click();await p.locator('#consent-dialog').waitFor();await p.locator('#cancel-consent').click();assert.equal((await probe(p)).workers,0);
  await chooser(p,'label[for="audio-file"]',{name:'invalid.wav',mimeType:'audio/wav',buffer:Buffer.from('invalid')});await p.locator('#status').filter({hasText:'anterior se conserva'}).waitFor();
  await p.locator('#open-downloads').click();const exported=await download(p,'#export-audio','n04-opened-audio.wav');assert.equal(sha(exported),sha(expected));assert.equal(exported.length,expected.length);
  const notes=JSON.parse((await download(p,'#export-json','n04-notes-without-audio.json')).toString());assert.equal(notes.includesAudio,false);await p.locator('#downloads-dialog .close-dialog').click();assert.equal(await p.locator('#notes').inputValue(),'Notas que no se envían.');row.audio={bytes:exported.length,sha256:sha(exported)};await boundary(s);await s.ctx.close();
 });
 await run('N05','Real excerpt worker survives new home/resume with invalid stale edits and captured-input copy',async row=>{
  const s=await context(),p=s.page;await open(s);const file='tests/fixtures/speech-v2/english-accepted-transcript.json',input=JSON.parse(await readFile(file,'utf8')).meeting;
  await p.locator('#open-downloads').click();await chooser(p,'label[for="notes-file"]',file);await p.waitForFunction(()=>!document.querySelector('#editor-screen').hidden);
  await p.locator('#generate-notes').click();await p.locator('#proposal-dialog').waitFor({timeout:30000});
  const event=await p.evaluate(()=>__minutaConsumer.events.at(-1));assert.equal(event.type,'result');assert.equal(event.meta.method,'source-extract-v1');assert.ok(event.meta.units.length>0);
  for(const unit of event.meta.units)assert.equal(unit.text,input[unit.source].slice(unit.start,unit.end));assert.equal(event.meta.selectedCount+event.meta.omittedCount,event.meta.totalUnits);
  assert.match(event.text,/Nora/);assert.match(event.text,/Monday/);await p.locator('#proposal-dialog .close-dialog').click();
  await p.locator('#notes').fill('Edición posterior que debe conservarse.');await p.locator('#meeting-title').fill('');await home(p);assert.equal(await p.locator('#resume-draft').isVisible(),true);await p.locator('#resume-draft').click();assert.equal(await p.locator('#meeting-title').inputValue(),'');await p.locator('#review-proposal').click();assert.equal(await p.locator('#apply-proposal').isDisabled(),true);
  const text=await download(p,'#download-proposal','n05-stale-proposal.txt');assert.equal(text.toString(),event.text);await p.locator('#copy-proposal').click();await p.locator('#status').filter({hasText:'Copia guardada'}).waitFor();
  const copy=(await records(p)).find(r=>r.title===input.title+' — extracto');assert.equal(copy.notes,input.notes);assert.equal(copy.transcript,input.transcript);assert.equal(copy.summary,event.text);
  assert.equal(await p.locator('#notes').inputValue(),'Edición posterior que debe conservarse.');await shot(p,'stale-consumer-proposal.png');row.worker={method:event.meta.method,units:event.meta.units,selectedCount:event.meta.selectedCount,totalUnits:event.meta.totalUnits};await boundary(s);await s.ctx.close();
 });
 for(const width of [390,320])await run(width===390?'N06a':'N06b','Native '+width+'px home/editor/dialog taps and keyboard with long title',async row=>{
  const s=await context({viewport:{width,height:844},isMobile:true,hasTouch:true}),p=s.page;await open(s);row.home=await fit(p);await shot(p,'home-'+width+'.png');await p.locator('#start-writing').tap();await p.locator('#meeting-title').fill('Conversación con un título deliberadamente largo para comprobar el cuaderno móvil y los controles sin recortar el contenido');await p.locator('#notes').fill('Notas nuevas para un cuaderno pequeño.');row.editor=await fit(p);
  await p.locator('#tab-notes').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#tab-summary').getAttribute('aria-selected'),'true');await p.locator('#summary').fill('Lo que quiero recordar.');await p.locator('#tab-notes').tap();
  await p.locator('#open-downloads').tap();row.downloads=await fit(p,'#downloads-dialog');await p.getByRole('button',{name:'Cerrar descargas',exact:true}).tap();
  await p.locator('#open-about').tap();row.about=await fit(p,'#about-dialog');await p.keyboard.press('Escape');
  await p.locator('#new-meeting').tap();await p.locator('#replace-dialog').waitFor();row.replacement=await fit(p,'#replace-dialog');await p.locator('#keep-current').tap();assert.equal(await p.locator('#notes').inputValue(),'Notas nuevas para un cuaderno pequeño.');await shot(p,'editor-'+width+'.png');await boundary(s);await s.ctx.close();
 });
 await run('N07','Actual browser-denied microphone leaves current consumer notes and controls usable',async row=>{
  const s=await context(),p=s.page;await s.ctx.grantPermissions([],{origin:base});await open(s);await writing(p);await p.locator('#notes').fill('Conservar cuando no hay permiso.');row.permission=await p.evaluate(async()=>({state:(await navigator.permissions.query({name:'microphone'})).state}));assert.equal(row.permission.state,'denied');
  await p.locator('#record').click();await p.waitForFunction(()=>!document.querySelector('#record').hidden&&document.querySelector('#stop-record').hidden&&document.querySelector('#status').textContent.length>0);assert.equal(await p.locator('#notes').inputValue(),'Conservar cuando no hay permiso.');assert.equal(await p.locator('#back-home').isDisabled(),false);assert.equal((await probe(p)).tracks.length,0);await boundary(s);await s.ctx.close();
 });
 await run('N08','Authored write denial/corruption preserve working draft, cards and original metadata recovery',async row=>{
  const s=await context(),p=s.page;await open(s);await writing(p);await p.locator('#meeting-title').fill('Recuperación authored T2');await p.locator('#notes').fill('Copia original.');await save(p);const original=(await records(p))[0];
  await p.evaluate(()=>{const original=IDBDatabase.prototype.transaction;window.__restoreTransaction=()=>{IDBDatabase.prototype.transaction=original;};IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(mode==='readwrite')throw new DOMException('Authored consumer write denial','QuotaExceededError');return original.call(this,stores,mode,...rest);};});
  await p.locator('#notes').fill('Edición conservada tras el rechazo.');await p.locator('#save-meeting').click();await p.locator('#status').filter({hasText:'borrador sigue abierto'}).waitFor();assert.equal(await p.locator('#notes').inputValue(),'Edición conservada tras el rechazo.');assert.equal((await records(p))[0].notes,'Copia original.');await p.evaluate(()=>window.__restoreTransaction());
  await home(p);assert.equal(await p.locator('.meeting-item').count(),1);
  await p.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('minuta-local-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('meetings','readwrite'),store=tx.objectStore('meetings'),get=store.get(id);get.onsuccess=()=>store.put({...get.result,authoredCorruption:true});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}),original.id);
  await p.locator('#refresh-library').click();await p.locator('#recover-records').waitFor({state:'visible'});assert.equal(await p.locator('.meeting-item').count(),1);
  const raw=JSON.parse((await download(p,'#recover-records','n08-original-records.json')).toString());assert.equal(raw.includesAudio,false);assert.equal(raw.records[0].authoredCorruption,true);assert.equal(raw.records[0].notes,original.notes);await p.locator('#resume-draft').click();assert.equal(await p.locator('#notes').inputValue(),'Edición conservada tras el rechazo.');row.boundary='Explicitly injected write denial and corrupt own T2 record; not OS-quota/all-corruption proof';await boundary(s);await s.ctx.close();
 });
 report.passed=report.cases.length===selected.size&&report.cases.every(c=>c.status==='passed');
}finally{
 const failures=[];for(const ctx of contexts){try{await ctx.close();}catch(e){failures.push(String(e));}}
 try{await browser.close();}catch(e){failures.push(String(e));}try{await browserServer.close();}catch(e){failures.push(String(e));}
 let nativeAbsent=false;try{process.kill(nativeProcess.pid,0);}catch(e){nativeAbsent=e.code==='ESRCH';}
 report.cleanup={contextsClosed:failures.length===0,nativePid:nativeProcess.pid,nativeExitCode:nativeProcess.exitCode,nativeAbsent,failures};
 report.passed=report.passed&&nativeAbsent&&nativeProcess.exitCode===0&&failures.length===0;
 await writeFile(path.join(out,'consumer-browser.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.passed)process.exitCode=1;
}
