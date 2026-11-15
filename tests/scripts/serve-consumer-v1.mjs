import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.MINUTA_DIST);
const manifest=JSON.parse(await readFile(process.env.MINUTA_EXPECTED_MANIFEST,'utf8'));
const files=new Map(manifest.map(file=>['/'+file.path,file.path]));files.set('/','index.html');
const config=JSON.parse(await readFile('vercel.json','utf8'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.search||!files.has(url.pathname)){res.writeHead(404);res.end();return;}
  const file=path.join(root,files.get(url.pathname));const info=await stat(file);
  const headers=Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
  res.writeHead(200,{...headers,'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':info.size});
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
 }catch(error){console.error(String(error));if(!res.headersSent)res.writeHead(500);res.end();}
});
server.keepAliveTimeout=1000;
server.listen(4173,'127.0.0.1',()=>console.log('Owned consumer preview http://127.0.0.1:4173'));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>process.exit(0));server.closeIdleConnections();});
