// A dedicated, key-protected Chromium worker. No DB credentials or live log mounts.
const http=require('node:http');
const {timingSafeEqual}=require('node:crypto');
const {ExportService}=require('../dist/export.service.js');
const key=process.env.PDF_RENDER_KEY||'';
if(key.length<32)throw new Error('PDF_RENDER_KEY must contain at least 32 characters');
if(process.env.PDF_RENDER_URL)throw new Error('Renderer must not recursively proxy PDF requests');
const service=new ExportService({}, {}, {});
let active=0;
http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200).end('ok');return;}
  const supplied=req.headers['x-render-key'];
  if(req.method!=='POST'||req.url!=='/render'){res.writeHead(404).end();return;}
  if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(key)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(key))){res.writeHead(401).end();return;}
  if(active>=2){res.writeHead(503).end('Renderer busy');return;}
  active++;
  try {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(typeof body.htmlContent!=='string'||(body.reportTitle!==undefined&&typeof body.reportTitle!=='string')){res.writeHead(400).end();return;}
    const bytes=await service.generatePdfFromHtml(body.htmlContent,String(body.reportTitle||'').slice(0,256));
    if(bytes.length>10*1024*1024){res.writeHead(413).end();return;}
    res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':bytes.length}).end(bytes);
  }catch(error){console.error('PDF render failed:',error.message);if(!res.headersSent)res.writeHead(error.status||500);res.end('PDF render failed');}
  finally{active--;}
}).listen(8200,'0.0.0.0');
