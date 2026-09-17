import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SECRET = 'local-private-auth-fixture-secret-only';
const SERVICE_TOKEN = 'local-private-service-token-only';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const initialization = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'private-auth-fixture', version: '1' },
} };
function jwt(sub, { issuer = 'fixture-mcp-issuer', exp = Math.floor(Date.now()/1000)+60, secret = SECRET, extra = {}, alg = 'HS256' } = {}) {
  const parts = [Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub, iss: issuer, exp, ...extra })).toString('base64url')];
  return [...parts,createHmac('sha256',secret).update(parts.join('.')).digest('base64url')].join('.');
}
async function listen(server) {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, { mode = 'simple', identityClaim = 'sub' } = {}) {
  const credentials = new Map(), contacts = [];
  const provider = createServer((req,res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /,'');
    contacts.push(token);
    const user = credentials.get(token);
    res.writeHead(user ? 200 : 401,{'content-type':'application/json'});
    res.end(JSON.stringify(user ? (typeof user==='object'?user:{ id:user,sub:user,email:user+'@fixture.invalid' }) : { error:'invalid_token' }));
  });
  const providerBase = await listen(provider);
  const reservation = createServer(); const base = await listen(reservation);
  await new Promise(resolve=>reservation.close(resolve));
  const output = { text:'' };
  const observer = `import { StreamableHTTPServerTransport } from ${JSON.stringify(import.meta.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js'))};
    const original = StreamableHTTPServerTransport.prototype.handleRequest;
    StreamableHTTPServerTransport.prototype.handleRequest = function(req,res,body) {
      if (body?.method === 'tools/call') console.log('AUTH_FIXTURE_OBSERVATION '+JSON.stringify({identity:req.authenticatedIdentity,arguments:body.params?.arguments,issuer:req.headers['x-user-issuer'],sub:req.headers['x-user-sub']}));
      return original.call(this,req,res,body);
    };`;
  const observerUrl = 'data:text/javascript;base64,'+Buffer.from(observer).toString('base64');
  const child = spawn(process.execPath,['--import',observerUrl,'http-server-oauth.mjs'],{
    cwd:ROOT,stdio:['ignore','pipe','pipe'],env:{
      PATH:process.env.PATH,NODE_ENV:'test',TOKEN_AI_MCP_PORT:new URL(base).port,
      TOKEN_AI_MCP_TOKEN:mode==='unconfigured'?'':SERVICE_TOKEN,TOKEN_AI_MCP_TOOLSETS:'general',
      TOKEN_AI_MCP_PUBLIC_URL:base,DEXTER_API_BASE_URL:providerBase,API_BASE_URL:providerBase,
      TOKEN_AI_MCP_OAUTH:['simple','unconfigured'].includes(mode)?'false':'true',MCP_JWT_SECRET:SECRET,
      MCP_SESSION_METRICS_INTERVAL_MS:'0',MCP_SESSION_REAPER_INTERVAL_MS:'0',MCP_AUTH_AUDIT:'0',
      ...(mode==='oidc'?{
        TOKEN_AI_OIDC_ISSUER:providerBase,TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT:providerBase+'/authorize',
        TOKEN_AI_OIDC_TOKEN_ENDPOINT:providerBase+'/token',TOKEN_AI_OIDC_USERINFO:providerBase+'/userinfo',
        TOKEN_AI_OIDC_IDENTITY_CLAIM:identityClaim,
      }:{SUPABASE_URL:providerBase,SUPABASE_ANON_KEY:'local-fixture-anon-key'}),
    },
  });
  child.stdout.on('data',b=>output.text+=b);child.stderr.on('data',b=>output.text+=b);
  t.after(async()=>{
    if(child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await Promise.race([ended,sleep(1500)]);if(child.exitCode===null)child.kill('SIGKILL');}
    provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));
  });
  for(let n=0;n<150;n++){
    assert.equal(child.exitCode,null,output.text);
    try{if((await fetch(base+'/health')).ok)break;}catch{}
    if(n===149)assert.fail(output.text);await sleep(20);
  }
  async function request({token,session,method='POST',body={jsonrpc:'2.0',id:2,method:'tools/list',params:{}},headers={},path='/mcp'}={}){
    const response=await fetch(base+path,{method,headers:{accept:'application/json, text/event-stream',
      'content-type':'application/json','mcp-protocol-version':'2025-11-25',
      ...(token?{authorization:'Bearer '+token}:{}),...(session?{'mcp-session-id':session}:{}),...headers},
      ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3000)});
    return response;
  }
  async function initialize(token,headers={}){
    const response=await request({token,headers,body:initialization});
    assert.equal(response.status,200,await response.clone().text());
    const session=response.headers.get('mcp-session-id');assert.ok(session);await response.body.cancel();
    const notification=await request({token,session,body:{jsonrpc:'2.0',method:'notifications/initialized',params:{}}});
    await notification.body?.cancel();
    return session;
  }
  async function refuse(token,session,{method='POST',headers={},path='/mcp'}={}){
    const response=await request({token,session,method,headers,path,body:{jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'search',arguments:{query:'must not execute'}}}});
    await response.body?.cancel();assert.equal(response.status,401);
  }
  return {base,request,initialize,refuse,output,credentials,contacts};
}

test('simple-token sessions require credentials on every MCP method and preserve SDK reconnect', {timeout:20000}, async t=>{
  const f=await fixture(t);
  await f.refuse(undefined,undefined);
  const transport=new StreamableHTTPClientTransport(new URL(f.base+'/mcp'),{requestInit:{headers:{authorization:'Bearer '+SERVICE_TOKEN}}});
  const client=new Client({name:'private-auth-sdk',version:'1'});await client.connect(transport);
  const session=transport.sessionId;assert.ok(session);assert.ok((await client.listTools()).tools.some(x=>x.name==='search'));
  await client.close();
  for(const method of ['POST','GET','DELETE']){
    await f.refuse(undefined,session,{method});await f.refuse('wrong-service-token',session,{method});
  }
  await f.refuse(undefined,session,{path:'/'});await f.refuse(undefined,session,{path:'/mcp/'});
  const resumed=await f.request({token:SERVICE_TOKEN,session});assert.equal(resumed.status,200);await resumed.body.cancel();
  const stream=await f.request({token:SERVICE_TOKEN,session,method:'GET'});assert.equal(stream.status,200);await stream.body.cancel();
  const terminated=await f.request({token:SERVICE_TOKEN,session,method:'DELETE'});assert.equal(terminated.status,405);await terminated.body.cancel();
  assert.doesNotMatch(f.output.text,/AUTH_FIXTURE_OBSERVATION|method=tools\/call/);
});

test('OAuth sessions pin verified identity, reject failed credentials, and accept same-principal refresh', {timeout:20000}, async t=>{
  const f=await fixture(t,{mode:'supabase'});
  const alice=jwt('alice'),bob=jwt('bob');
  const session=await f.initialize(alice,{'x-user-sub':'bob','x-user-issuer':'untrusted-issuer','x-user-email':'forged@example.invalid'});
  for(const token of [undefined,'invalid-token',jwt('alice',{secret:'wrong'}),jwt('alice',{exp:1}),jwt('alice',{exp:'invalid'}),jwt('alice',{alg:'none'}),jwt('alice',{extra:{nbf:Math.floor(Date.now()/1000)+60}}),bob,jwt('alice',{issuer:'other-issuer'}),SERVICE_TOKEN]){
    for(const method of ['POST','GET','DELETE'])await f.refuse(token,session,{method});
  }
  for(const authorization of ['Basic invalid','Bearer invalid-token','']){
    await f.refuse(undefined,session,{headers:{authorization,'x-authorization':'Bearer '+alice,'x-user-token':alice}});
  }
  const refreshed=jwt('alice',{extra:{jti:'refreshed'}});
  for(const headers of [{authorization:'Bearer '+refreshed},{'x-authorization':'Bearer '+refreshed},{'x-user-token':refreshed}]){
    const response=await f.request({session,headers});assert.equal(response.status,200);await response.body.cancel();
  }
  const client=new Client({name:'private-oauth-sdk',version:'1'});
  let currentToken=alice;
  const authProvider={tokens:async()=>({access_token:currentToken,token_type:'Bearer'})};
  const transport=new StreamableHTTPClientTransport(new URL(f.base+'/mcp'),{authProvider});
  await client.connect(transport);const sdkSession=transport.sessionId;
  assert.ok((await client.listTools()).tools.some(x=>x.name==='search'));
  currentToken=refreshed;assert.ok((await client.listTools()).tools.length>0);
  await client.close();
  const reconnected=new StreamableHTTPClientTransport(new URL(f.base+'/mcp'),{authProvider,sessionId:sdkSession});
  await client.connect(reconnected);assert.ok((await client.listTools()).tools.length>0);
  assert.equal(reconnected.sessionId,sdkSession);await client.close();
  const stillAlice=await f.request({token:alice,session});assert.equal(stillAlice.status,200);await stillAlice.body.cancel();
  assert.doesNotMatch(f.output.text,/AUTH_FIXTURE_OBSERVATION|method=tools\/call/);
  assert.doesNotMatch(f.output.text,/issuer=untrusted-issuer|sub=bob/);
  f.credentials.set('supabase-provider-alice','alice');
  const providerSession=await f.initialize('supabase-provider-alice');
  await f.refuse(alice,providerSession);
  f.credentials.set('supabase-provider-renewed','alice');
  const providerRefresh=await f.request({session:providerSession,token:'supabase-provider-renewed'});
  assert.equal(providerRefresh.status,200);await providerRefresh.body.cancel();
});

test('provider validation cache expires with the JWT and does not claim immediate opaque-token revocation', {timeout:20000}, async t=>{
  const f=await fixture(t,{mode:'oidc'});
  const short=jwt('alice',{secret:'external-provider-fixture',exp:Math.floor(Date.now()/1000)+3});
  f.credentials.set(short,'alice');
  const session=await f.initialize(short);
  assert.equal(f.contacts.filter(x=>x===short).length,1);
  await sleep(3100);
  await f.refuse(short,session);
  const expired=jwt('alice',{secret:'external-provider-fixture',exp:1});f.credentials.set(expired,'alice');
  await f.refuse(expired,undefined);assert.ok(!f.contacts.includes(expired),'expired JWT is rejected before a fresh provider response can authorize it');
  const refreshed=jwt('alice',{secret:'external-provider-fixture',extra:{jti:'renewed'}});f.credentials.set(refreshed,'alice');
  const response=await f.request({token:refreshed,session});assert.equal(response.status,200);await response.body.cancel();
  const opaque='opaque-provider-token';f.credentials.set(opaque,'alice');
  const opaqueSession=await f.initialize(opaque);f.credentials.delete(opaque);
  const cached=await f.request({token:opaque,session:opaqueSession});assert.equal(cached.status,200);await cached.body.cancel();
  assert.equal(f.contacts.filter(x=>x===opaque).length,1,'existing five-minute opaque-token cache is not a live revocation lookup');
});


test('OIDC custom identity claim retains stable provider subject across email refresh', {timeout:20000}, async t=>{
  const f=await fixture(t,{mode:'oidc',identityClaim:'email'});
  f.credentials.set('oidc-before',{sub:'stable-provider-subject',email:'before@fixture.invalid'});
  f.credentials.set('oidc-after',{sub:'stable-provider-subject',email:'after@fixture.invalid'});
  const session=await f.initialize('oidc-before');
  const response=await f.request({session,token:'oidc-after',headers:{'x-user-sub':'forged-sub','x-user-issuer':'forged-issuer'},
    body:{jsonrpc:'2.0',id:99,method:'tools/call',params:{name:'unregistered_local_fixture',arguments:{__sub:'forged-argument',__issuer:'forged-argument'}}}});
  assert.equal(response.status,200);await response.body.cancel();
  const observations=f.output.text.split('\n').filter(x=>x.startsWith('AUTH_FIXTURE_OBSERVATION ')).map(x=>JSON.parse(x.slice('AUTH_FIXTURE_OBSERVATION '.length)));
  assert.equal(observations.length,1);
  const observed=observations[0];
  assert.equal(observed.identity.sub,'stable-provider-subject');
  assert.equal(observed.sub,'stable-provider-subject');
  assert.equal(observed.arguments.__sub,'stable-provider-subject');
  assert.equal(observed.arguments.__issuer,observed.identity.issuer);
  assert.equal(observed.arguments.__email,'after@fixture.invalid');
  assert.notEqual(observed.identity.issuer,'forged-issuer');
  f.credentials.set('oidc-other',{sub:'other-provider-subject',email:'after@fixture.invalid'});
  await f.refuse('oidc-other',session);
});


test('private transport fails closed without authentication configuration while health stays public', {timeout:15000}, async t=>{
  const f=await fixture(t,{mode:'unconfigured'});
  assert.equal((await fetch(f.base+'/health')).status,200);
  for(const method of ['POST','GET','DELETE']){
    await f.refuse(undefined,undefined,{method});
    await f.refuse('unconfigured-token',undefined,{method});
  }
  assert.doesNotMatch(f.output.text,/AUTH_FIXTURE_OBSERVATION|method=tools\/call/);
});
