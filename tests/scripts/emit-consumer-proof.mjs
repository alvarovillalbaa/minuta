import {readdir,readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root=process.env.MINUTA_OUTPUT;
if(!root)throw Error('Owned consumer proof root required');
const roots=new Set(['owner.json','runner.json','source-before.json','source-after.json','declared-inputs.json','app-lock.json','tools-lock.json','build-manifest.json','carried-runtime.json','carried-native.json','carried-callbacks.json','consumer-browser.json','server.stdout.txt','server.stderr.txt']);
const downloads=new Set(['n02-original.json','n02-original.md','n02-imported.json','n02-deleted-open-copy.json','n03-native-capture.wav','n04-opened-audio.wav','n04-notes-without-audio.json','n05-stale-proposal.txt','n08-original-records.json']);
let names;try{names=await readdir(root,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;names=[];}
let total=0;
for(const name of names.sort()){
 const full=path.join(root,name),stat=await lstat(full);if(stat.isDirectory()){if(name!=='downloads')throw Error('Unexpected proof directory');continue;}
 const allowed=roots.has(name)||/^[0-9]{2}-[a-z-]+\.(stdout|stderr)\.txt$/.test(name)||/^(home-(empty|saved|390|320)|editor-(writing|390|320)|capture-ready|stale-consumer-proposal|failure-N[0-9]{2}[ab]?-[0-9]+)\.png$/.test(name)||(name.startsWith('downloads/')&&downloads.has(name.slice(10)));
 if(!allowed||!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024||(total+=stat.size)>12*1024*1024)throw Error('Unexpected or excessive consumer proof '+name);
 const bytes=await readFile(full),codec=name.endsWith('.png')?'base64':'gzip-base64',packed=codec==='base64'?bytes:gzipSync(bytes,{level:9,mtime:0}),encoded=packed.toString('base64');
 console.log('MINUTA_CONSUMER_FILE '+JSON.stringify({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),codec,chunks:Math.ceil(encoded.length/3000)}));
 for(let offset=0;offset<encoded.length;offset+=3000)console.log('MINUTA_CONSUMER_CHUNK '+JSON.stringify({name,index:offset/3000,data:encoded.slice(offset,offset+3000)}));
}
