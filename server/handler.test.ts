import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import handler,{ensureRole} from './handler';
import {demoEvents} from '../src/operations';
test('role authorization rejects observer writes and operator administration',()=>{
  assert.throws(()=>ensureRole('observer',['admin','operator']));
  assert.throws(()=>ensureRole('operator',['admin']));
  ensureRole('operator',['operator','admin']);
});
test('HTTP API: configuration, sessions, CSRF, validation, forbidden writes, optimistic concurrency, no fake AI',async()=>{
  const originalFetch=globalThis.fetch;const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_ANON_KEY,oldAi=process.env.AI_ENABLED;
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;delete process.env.AI_ENABLED;
  const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  let role='observer',calls:string[]=[];
  const request=(route:string,method='GET',body?:unknown,session=false,origin=base)=>originalFetch(`${base}/api/index?route=${route}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:'qorgau_session=test-token'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    assert.equal((await (await request('health')).json()).configured,false);
    assert.equal((await request('events')).status,401);
    assert.equal((await request('login','POST',{email:'a',password:'b'},false,'https://evil.invalid')).status,403);
    assert.equal((await request('login','POST',{email:'a',password:'b'})).status,503);
    process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_ANON_KEY='test-anon';
    globalThis.fetch=(async(input,init)=>{
      const url=String(input);if(!url.startsWith('https://database.invalid'))throw new Error('Unexpected external request');
      calls.push(url);
      if(url.includes('/auth/v1/user'))return Response.json({id:'12345678-1234-1234-1234-123456789abc',email:'test@example.invalid'});
      if(url.includes('/profiles?'))return Response.json([{id:'12345678-1234-1234-1234-123456789abc',role,display_name:'Test'}]);
      if(url.includes('/events')&&init?.method==='PATCH')return Response.json([]);
      if(url.includes('/events')&&init?.method==='POST')return Response.json([{id:'created',...JSON.parse(String(init.body))}]);
      if(url.includes('/events'))return Response.json([]);
      throw new Error(`Unexpected path ${url}`);
    }) as typeof fetch;
    assert.equal((await request('events','POST',demoEvents[0],true)).status,403);
    assert.equal((await request('events','GET',undefined,true)).status,200);
    role='operator';assert.equal((await request('users','GET',undefined,true)).status,403);
    assert.equal((await request('events','POST',{...demoEvents[0],latitude:100},true)).status,400);
    assert.equal((await request('events','POST',demoEvents[0],true)).status,201);
    assert.equal((await request('events','PATCH',{...demoEvents[0],id:'12345678-1234-1234-1234-123456789abc'},true)).status,409);
    assert.equal((await request('ai','POST',{question:'Сводка'},true)).status,503);
    assert.ok(calls.every(url=>url.startsWith('https://database.invalid')));
  }finally{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries({SUPABASE_URL:oldUrl,SUPABASE_ANON_KEY:oldKey,AI_ENABLED:oldAi})){if(value===undefined)delete process.env[key];else process.env[key]=value;}await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
