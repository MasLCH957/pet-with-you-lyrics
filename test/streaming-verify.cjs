const assert=require('node:assert/strict');
module.exports=async({pet,settings,service})=>{
  const result=await pet.webContents.executeJavaScript(`(async()=>{
    const s=sprites[0];s.closeReply();s.workOn=false;s.workState=null;s.workNative=null;s.errorNotice='';s.explicitQuota=false;s.bubbleOn=false;s.manualPlaying=false;s.deferredWork=null;s.pet.workStatusEnabled=false;
    window.petPreferences.whisperStreaming=true;
    const original=window.fetch;let controller;
    window.fetch=(url,...rest)=>String(url).includes('/whisper/trigger')?Promise.resolve(new Response(new ReadableStream({start(c){controller=c;}}),{headers:{'content-type':'application/x-ndjson'}})):original(url,...rest);
    try{
      const generating=s.showWhisperFromMenu();await new Promise(r=>setTimeout(r,0));
      controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'text',text:'正文已经开始'})+'\\n'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const early=s.bubble.querySelector('.reply-content').textContent==='正文已经开始'&&!s.whisperOn&&!!s.whisperRequest;
      const card=s.bubble.querySelector('.reply-card'),line=card.querySelector('.reply-content'),button=card.querySelector('.reply-close'),node=line.firstChild;
      const range=document.createRange();range.setStart(node,0);range.setEnd(node,2);getSelection().removeAllRanges();getSelection().addRange(range);
      controller.enqueue(new TextEncoder().encode(['正文已经开始，','正文已经开始，继续','正文已经开始，继续增长'].map(text=>JSON.stringify({type:'text',text})+'\\n').join('')));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const stable=card===s.bubble.querySelector('.reply-card')&&button===s.bubble.querySelector('.reply-close')&&node===line.firstChild&&getSelection().toString()==='正文'&&line.textContent==='正文已经开始，继续增长';
      getSelection().removeAllRanges();
      s.bubble.querySelector('.reply-close').click();
      controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'text',text:'关闭后不可复活'})+'\\n'+JSON.stringify({type:'done',ok:true,text:'最终回复'})+'\\n'));controller.close();await generating;
      return {early,stable,closed:!s.whisperOn&&!s.bubble.classList.contains('is-on')};
    }finally{window.fetch=original;}
  })()`);
  assert.deepEqual(result,{early:true,stable:true,closed:true});
  const chat=await pet.webContents.executeJavaScript(`(async()=>{
    const original=window.fetch;let controller,streaming=false,reply=null;
    window.fetch=(url,...rest)=>String(url).includes('/chat?')?(streaming=String(url).includes('stream=1'),Promise.resolve(new Response(new ReadableStream({start(c){controller=c;}}),{headers:{'content-type':'application/x-ndjson'}}))):original(url,...rest);
    let dialog;
    try{
      dialog=PetShared.mountChatDialog({petId:'fixture',baseUrl:'http://127.0.0.1/chat',x:innerWidth-100,y:innerHeight-80,onReply:text=>reply=text});
      const input=dialog.el.querySelector('textarea');input.value='你好';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      await new Promise(r=>setTimeout(r,0));controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'text',text:'正文提前到达'})+'\\n'));await new Promise(r=>setTimeout(r,0));
      const early=dialog.el.querySelector('.dsh-pet-chat-progress').textContent==='正文提前到达'&&reply===null;
      const rect=dialog.el.getBoundingClientRect(),inside=rect.right<=innerWidth&&rect.bottom<=innerHeight;
      controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'done',ok:true,reply:'完整正文'})+'\\n'));controller.close();await new Promise(r=>setTimeout(r,0));
      return {early,inside,streaming,complete:reply==='完整正文'&&!dialog.el.isConnected};
    }finally{dialog?.close();window.fetch=original;}
  })()`);
  assert.deepEqual(chat,{early:true,inside:true,streaming:true,complete:true});
  const synced=await settings.webContents.executeJavaScript(`(async()=>{
    const input=document.querySelector('#apiAutoWhisperPets input');input.checked=true;input.onchange();
    const toggle=document.querySelector('#autoWhisperPets input').checked;
    const interval=document.querySelector('#apiWhisperInterval');interval.value='180';interval.oninput();
    const probability=document.querySelector('#apiWhisperProbability');probability.value='0';probability.oninput();
    const values=document.querySelector('#interval').value==='180'&&document.querySelector('#autoWhisperProbability').value==='0';
    await document.querySelector('#saveApiAutoWhisper').onclick();return {toggle,values};
  })()`);
  assert.deepEqual(synced,{toggle:true,values:true});
  const config=await(await fetch(service.base+'/config')).json();assert.equal(config.main.eventsRefreshSec.whisper,180);assert.equal(config.main.pets[0].whisperEnabled,true);
  await settings.webContents.executeJavaScript(`(async()=>{const input=document.querySelector('#apiAutoWhisperPets input');input.checked=false;input.onchange();await document.querySelector('#saveApiAutoWhisper').onclick();})()`);
  await new Promise(r=>setTimeout(r,900));
};
