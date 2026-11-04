import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { uploadFile, filemoonCanRetry } from '../src/providers.mjs';

const config={filemoonToken:'fake-local-test-token'};
async function withServer(handler,execute){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moviehub-fm-reliable-'));
 const filePath=path.join(dir,'licensed-test.mp4');
 await fs.writeFile(filePath,Buffer.alloc(1100,42));
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/upload`;
 try {return await execute({filePath,url});}
 finally {await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
}
const body=async req=>{const pieces=[];for await(const chunk of req)pieces.push(chunk);return Buffer.concat(pieces).toString('latin1');};
const respond=(res,data,status=200,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(data));};
const final={success:true,data:{id:'real-file-id',urls:{page:'https://filemoon.org/real-file-id/file'}}};
const options=({filePath,url,signal=new AbortController().signal})=>({filePath,url,signal,size:1100,provider:'filemoon',config,onProgress:()=>{},filemoonChunkBytes:600,filemoonRetryBaseMs:5});

test('FileMoon 503 retries only the failed chunk, preserving UUID and index',async()=>{
 let hits=0;const bodies=[];
 await withServer(async(req,res)=>{
  bodies.push(await body(req));hits++;
  if(hits===1)return respond(res,{success:false,error:{message:'backend unavailable'}},503);
  return respond(res,hits===2?{success:true,message:'chunk received'}:final);
 },async ({filePath,url})=>{
  const got=await uploadFile(options({filePath,url}));
  assert.equal(got.id,'real-file-id');assert.equal(hits,3);
  assert.match(bodies[0],/name="dzchunkindex"\r\n\r\n0/);
  assert.match(bodies[1],/name="dzchunkindex"\r\n\r\n0/);
  assert.match(bodies[2],/name="dzchunkindex"\r\n\r\n1/);
  const uuid=bodies.map(x=>x.match(/name="dzuuid"\r\n\r\n([^\r]+)/)?.[1]);
  assert.ok(uuid[0]);assert.equal(new Set(uuid).size,1);
 });
});
test('FileMoon 429 retries without restarting accepted chunks',async()=>{
 let hits=0;
 await withServer(async(req,res)=>{
  await body(req);hits++;
  if(hits===1)return respond(res,{success:false,error:{code:'RATE_LIMITED',message:'Wait'}},429,{'retry-after':'0'});
  return respond(res,hits===2?{success:true}:final);
 },async({filePath,url})=>{
  const got=await uploadFile(options({filePath,url}));
  assert.equal(got.id,'real-file-id');assert.equal(hits,3);
 });
});
test('FileMoon does not replay 403 authentication or permission failures',async()=>{
 let hits=0;
 await withServer(async(req,res)=>{await body(req);hits++;return respond(res,{success:false,error:{code:'TOKEN_ABILITY_DENIED',message:'files:write missing'}},403);},async({filePath,url})=>{
  await assert.rejects(uploadFile(options({filePath,url})),/chunk 1\/2.*HTTP 403.*TOKEN_ABILITY_DENIED/);
  assert.equal(hits,1);
 });
});
test('FileMoon repeated 502 stops after three attempts and never falsely completes',async()=>{
 let hits=0;
 await withServer(async(req,res)=>{await body(req);hits++;return respond(res,{success:false,error:{code:'UPSTREAM',message:'try later'}},502);},async({filePath,url})=>{
  await assert.rejects(uploadFile(options({filePath,url})),/chunk 1\/2, attempt 3\/3.*HTTP 502/);
  assert.equal(hits,3);
 });
});
test('FileMoon aborts are never retried',async()=>{
 const controller=new AbortController();controller.abort(new Error('watchdog timer reached'));
 assert.equal(filemoonCanRetry(new Error('fetch failed'),controller.signal),false);
 let hits=0;
 await withServer(async(req,res)=>{hits++;await body(req);respond(res,final);},async({filePath,url})=>{
  await assert.rejects(uploadFile(options({filePath,url,signal:controller.signal})),/watchdog timer reached/);
  assert.equal(hits,0);
 });
});
test('FileMoon plain text 503 still retains HTTP status for bounded retry',async()=>{
 let hits=0;
 await withServer(async(req,res)=>{
  await body(req);hits++;
  if(hits===1){res.writeHead(503,{'content-type':'text/plain'});res.end('temporarily unavailable');return;}
  respond(res,hits===2?{success:true}:final);
 },async({filePath,url})=>{
  const got=await uploadFile(options({filePath,url}));
  assert.equal(got.id,'real-file-id');assert.equal(hits,3);
 });
});
