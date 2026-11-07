import {createServer} from 'node:http';
import {createLicensedService} from './lib/licensed-events.mjs';

const service=createLicensedService();
const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));return;}
  if(req.method!=='POST'||req.url!=='/v0/events'){res.writeHead(404);res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const result=await service.handleEvent({headers:req.headers,body:Buffer.concat(chunks).toString('utf8')});
  res.writeHead(result.status,{'content-type':'application/json'});res.end(JSON.stringify(result.body));
});
server.listen(Number(process.env.PORT||8799),'127.0.0.1',()=>console.log('licensed service listening'));
