const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {codexIssue,Diagnostics}=require('../diagnostics.cjs');
const {CodexClient}=require('../codex-client.cjs');

test('Codex diagnostics classify structured failures and discard upstream private text',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pet-codex-errors-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const logs=new Diagnostics(dir);
  const cases=[
    [{codexErrorInfo:'unauthorized'},'gpt-authentication'],
    [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:403}}},'gpt-permission'],
    [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:429}}},'rate-limit'],
    [{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:503}}},'upstream'],
    [{codexErrorInfo:'badRequest'},'gpt-request'],
    [{codexErrorInfo:{responseStreamDisconnected:{httpStatusCode:null}}},'gpt-stream'],
    [{code:-32602},'gpt-protocol'],
    [{message:'The model fixture is not supported with this account'},'gpt-model'],
    [{message:'unexpected status 401 Unauthorized'},'gpt-authentication'],
    [{message:'error sending request for url https://secret.invalid'},'network'],
    [{codexErrorInfo:'sandboxError'},'gpt-sandbox'],
    [{codexErrorInfo:'contextWindowExceeded'},'gpt-context'],
    [{codexErrorInfo:'private-unknown-type'},'gpt-failed']
  ];
  for(const [raw,code] of cases){
    raw.message=(raw.message||'')+' private-key private-prompt https://secret.invalid';
    const e=codexIssue(raw,'turn/completed');assert.equal(e.code,code);
    logs.record('whisper-gpt',e,'gpt-failed');
  }
  const exported=new Diagnostics(dir).exportText();
  assert.doesNotMatch(exported,/private-key|private-prompt|secret\.invalid|private-unknown-type/);
  const entries=JSON.parse(exported).errors;
  assert.ok(entries.some(e=>e.stage==='turn/completed'&&e.status===429&&e.gptKind==='httpConnectionFailed'));
  assert.ok(entries.some(e=>e.rpcCode===-32602));
});

function chatFixture(t){
  const c=new CodexClient('.');c.start=async()=>{};
  let started;const ready=new Promise(resolve=>started=resolve);
  const calls=[];
  c.request=async(method,params)=>{calls.push({method,params});if(method==='thread/start')return {thread:{id:'mine'}};if(method==='turn/start'){started();return {turn:{id:'turn'}};}return {};};
  t.after(()=>c.close());
  return {c,ready,calls,emit:(method,params={})=>c.emit('notification',{method,params:{threadId:'mine',turnId:'turn',...params}})};
}

test('failed turn preserves upstream category and stage without generic error loss',async t=>{
  const {c,ready,emit}=chatFixture(t);
  const result=c.chat('fixture');const checked=assert.rejects(result,e=>e.code==='gpt-authentication'&&e.stage==='turn/completed'&&e.gptKind==='unauthorized');
  await ready;emit('turn/completed',{turn:{id:'turn',status:'failed',error:{message:'private-token',codexErrorInfo:'unauthorized'}}});
  await checked;assert.equal(c.listenerCount('notification'),0);
});

test('terminal error notification survives a completion without details',async t=>{
  const {c,ready,emit}=chatFixture(t);
  const result=c.chat('fixture');const checked=assert.rejects(result,e=>e.code==='gpt-stream'&&e.stage==='turn/completed');
  await ready;emit('error',{willRetry:false,error:{message:'private',codexErrorInfo:{responseStreamDisconnected:{httpStatusCode:null}}}});
  emit('turn/completed',{turn:{id:'turn',status:'failed'}});await checked;
});

test('provisional retry failures and unrelated turns do not fail a successful response',async t=>{
  const {c,ready,emit,calls}=chatFixture(t);const result=c.chat('fixture');await ready;await Promise.resolve();
  emit('error',{willRetry:true,error:{codexErrorInfo:'serverOverloaded'}});
  emit('turn/completed',{turn:{id:'another',status:'failed'}});
  emit('item/agentMessage/delta',{itemId:'a',delta:'成功'});
  emit('turn/completed',{turn:{id:'turn',status:'completed'}});
  assert.equal(await result,'成功');assert.equal(calls.filter(x=>x.method==='turn/start').length,1);
  assert.equal(c.listenerCount('notification'),0);
});

test('empty completion and blocked tools have actionable diagnoses',async t=>{
  for(const blocked of [false,true]){
    const {c,ready,emit}=chatFixture(t);const result=c.chat('fixture');
    const checked=assert.rejects(result,e=>e.code===(blocked?'gpt-tools':'empty-reply'));
    await ready;if(blocked)emit('pet/tool-rejected');
    emit('turn/completed',{turn:{id:'turn',status:'completed'}});await checked;
  }
});

test('invalid turn response does not leave a pending promise or event listeners',async t=>{
  const {c}=chatFixture(t);c.request=async method=>method==='thread/start'?{thread:{id:'mine'}}:{};
  await assert.rejects(c.chat('fixture'),e=>e.code==='gpt-protocol'&&e.stage==='turn/start');
  assert.equal(c.listenerCount('notification'),0);
});

test('pet uses low effort without changing model and can follow the original effort',async t=>{
  for(const fast of [true,false]){
    const {c,ready,emit,calls}=chatFixture(t);const result=c.chat('fixture',{fast});await ready;
    const params=calls.find(x=>x.method==='turn/start').params;
    assert.equal(params.effort,fast?'low':undefined);assert.equal(params.model,undefined);
    emit('item/completed',{item:{type:'agentMessage',text:'好呀'}});
    emit('turn/completed',{turn:{id:'turn',status:'completed'}});await result;
  }
});

test('first-text timeout reports observed reasoning without retaining reasoning content',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const {c,ready,emit}=chatFixture(t);const result=c.chat('fixture');
  const checked=assert.rejects(result,e=>e.code==='gpt-first-text-timeout'&&e.stage==='turn/wait'&&e.progress==='reasoning'&&e.elapsedMs===55000&&!JSON.stringify(e).includes('private'));
  await ready;emit('item/reasoning/textDelta',{delta:'private-reasoning'});t.mock.timers.tick(55000);await checked;
  assert.equal(c.listenerCount('notification'),0);
});

test('active output can complete beyond the former fixed 55-second deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const {c,ready,emit}=chatFixture(t);const result=c.chat('fixture');await ready;
  t.mock.timers.tick(50000);emit('item/agentMessage/delta',{itemId:'a',delta:'你'});
  t.mock.timers.tick(10000);emit('item/agentMessage/delta',{itemId:'a',delta:'好'});
  emit('turn/completed',{turn:{id:'turn',status:'completed'}});assert.equal(await result,'你好');
});

test('a stalled reply ends and a retrying provider retains its concrete error at the deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  for(const reply of [false,true]){
    const {c,ready,emit}=chatFixture(t);const result=c.chat('fixture');
    const checked=assert.rejects(result,e=>reply?e.code==='gpt-generation-timeout'&&e.progress==='reply'&&e.firstTextMs===0:e.code==='gpt-stream'&&e.progress==='retrying'&&e.retryCount===1);
    await ready;
    if(reply)emit('item/agentMessage/delta',{itemId:'a',delta:'一半'});
    else emit('error',{willRetry:true,error:{codexErrorInfo:{responseStreamConnectionFailed:{httpStatusCode:null}}}});
    t.mock.timers.tick(reply?20000:55000);await checked;
  }
});

test('fast replies use only reasoning levels advertised for the selected model',async t=>{
  for(const supported of [['none','low'],['minimal','high'],['low','high'],['medium','high'],[]]){
    const {c,ready,emit,calls}=chatFixture(t),request=c.request;
    c.request=async(method,params)=>method==='model/list'?{data:[{model:'fixture',supportedReasoningEfforts:supported.map(reasoningEffort=>({reasoningEffort}))}]}:method==='thread/start'?{...(await request(method,params)),model:'fixture'}:request(method,params);
    const result=c.chat('fixture');await ready;
    assert.equal(calls.find(x=>x.method==='turn/start').params.effort,supported[0]||'low');
    const config=calls.find(x=>x.method==='thread/start').params.config;
    assert.equal(config['features.apps'],false);assert.equal(config['features.plugins'],false);assert.equal(config['project_doc_max_bytes'],0);
    emit('item/completed',{item:{type:'agentMessage',text:'好呀'}});emit('turn/completed',{turn:{id:'turn',status:'completed'}});await result;
    assert.ok(c.lastChatTiming.totalMs>=0);assert.equal(c.lastChatTiming.effort,supported[0]||'low');
  }
});

test('model catalog failure preserves low-effort fallback without replaying a paid call',async t=>{
  const {c,ready,emit,calls}=chatFixture(t),request=c.request;
  c.request=async(method,params)=>{if(method==='model/list')throw new Error('private');return request(method,params);};
  const result=c.chat('fixture');await ready;
  assert.equal(calls.find(x=>x.method==='turn/start').params.effort,'low');
  emit('item/completed',{item:{type:'agentMessage',text:'好呀'}});emit('turn/completed',{turn:{id:'turn',status:'completed'}});await result;
  assert.equal(calls.filter(x=>x.method==='turn/start').length,1);
});

test('latest request timing export allows only bounded metrics and fixed network/effort labels',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pet-timing-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const logs=new Diagnostics(dir);
  const raw={startupMs:400,threadMs:500,firstTextMs:17000,totalMs:18000,proxyMode:'system',effort:'none',url:'private-url',text:'private-text',key:'private-key'};
  const exported=logs.exportText({gptTiming:raw});
  assert.doesNotMatch(exported,/private-/);assert.equal(JSON.parse(exported).gptTiming.totalMs,18000);assert.equal(logs.summary().count,0);
  const invalid=JSON.parse(logs.exportText({gptTiming:{totalMs:-1,proxyMode:'private-url',effort:'private-model'}})).gptTiming;
  assert.deepEqual(invalid,{});
});
