const test=require('node:test'),assert=require('node:assert/strict');
const {codexEnvironment}=require('../codex-network.cjs');

test('Windows system proxy is passed only to the child and bypasses local addresses',async()=>{
  const env={PATH:'fixture',no_proxy:'private.internal'};
  const result=await codexEnvironment({env,platform:'win32',readProxy:async()=>({enabled:true,server:'127.0.0.1:7890',bypass:'<local>;*.example.test;10.*;192.168.*'})});
  assert.equal(result.proxyMode,'system');assert.equal(result.env.HTTPS_PROXY,'http://127.0.0.1:7890');
  assert.equal(result.env.HTTP_PROXY,result.env.HTTPS_PROXY);
  assert.match(result.env.NO_PROXY,/private.internal,localhost,127.0.0.1,::1,.example.test,10.0.0.0\/8,192.168.0.0\/16/);
  assert.equal(result.env.no_proxy,undefined);assert.deepEqual(env,{PATH:'fixture',no_proxy:'private.internal'});
});

test('explicit proxies win and scheme-specific system proxies stay separate',async()=>{
  for(const key of ['http_proxy','HTTPS_PROXY','ALL_PROXY']){
    const env={[key]:'http://fixture:8000'};
    const result=await codexEnvironment({env,platform:'win32',readProxy:async()=>{throw new Error('must not be read');}});
    assert.equal(result.proxyMode,'environment');assert.deepEqual(result.env,env);
  }
  const result=await codexEnvironment({env:{},platform:'win32',readProxy:async()=>({enabled:true,server:'http=127.0.0.1:80;https=127.0.0.1:81'})});
  assert.equal(result.env.HTTP_PROXY,'http://127.0.0.1');assert.equal(result.env.HTTPS_PROXY,'http://127.0.0.1:81');
});

test('disabled, PAC and invalid system proxies are not guessed or copied as URLs',async()=>{
  const authenticated=new URL('https://localhost:9');authenticated.username='fixture';authenticated.password='private-fixture';
  for(const [settings,mode] of [[{enabled:false,server:'localhost:9'},'direct'],[{enabled:true,server:'localhost:9',pac:'https://private.invalid/proxy.pac'},'pac'],[{enabled:true,server:authenticated.href},'unavailable'],[null,'unavailable']]){
    const result=await codexEnvironment({env:{},platform:'win32',readProxy:async()=>settings});
    assert.equal(result.proxyMode,mode);assert.deepEqual(result.env,{});
    assert.doesNotMatch(JSON.stringify(result),/private/);
  }
});
