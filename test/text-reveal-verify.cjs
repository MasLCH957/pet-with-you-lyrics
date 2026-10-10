const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {app,BrowserWindow}=require('electron');
const data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'pet-text-reveal-'));
app.setPath('userData',data);
app.on('quit',()=>{try{fs.rmSync(data,{recursive:true,force:true});}catch{}});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:700,height:440,webPreferences:{backgroundThrottling:false}});
  try{
    await win.loadURL('about:blank');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../runtime/bubble-text.js'),'utf8')+';void 0;');
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const originalNow=performance.now,originalFrame=requestAnimationFrame,originalCancel=cancelAnimationFrame;
      let clock=100,repaint;
      performance.now=()=>clock;window.requestAnimationFrame=callback=>(repaint=callback,1);window.cancelAnimationFrame=()=>{};
      try{
      const line=document.createElement('p');line.style.cssText='font:24px serif;color:rgb(40,73,87);width:500px';document.body.append(line);
      PetBubbleText.set(line,'今天也要好好休息',{reveal:true});
      const text=line.firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,2);getSelection().addRange(range);
      const first=[...CSS.highlights.keys()].filter(k=>k.startsWith('pet-stream-'));
      const painted=first.length===1&&getComputedStyle(line,'::highlight('+first[0]+')').color!==getComputedStyle(line).color;
      const initialRule=document.querySelector('#pet-stream-effects').textContent;
      const startsFaint=/ (?:8|9|10)%,transparent/.test(initialRule);
      clock=320;repaint(clock);
      const gradual=CSS.highlights.has(first[0]);
      PetBubbleText.set(line,'今天也要好好休息，喝杯茶吧~',{reveal:true});
      const effects=[...CSS.highlights.entries()].filter(([k])=>k.startsWith('pet-stream-'));
      const suffix=[...effects.at(-1)[1]][0].toString()==='，喝杯茶吧~';
      const stable=line.firstChild===text&&getSelection().toString()==='今天'&&line.querySelector('.tone-mark').textContent==='~';
      const before=line.getBoundingClientRect().toJSON();
      clock=800;repaint(clock);
      const after=line.getBoundingClientRect().toJSON();
      const finished=![...CSS.highlights.keys()].some(k=>k.startsWith('pet-stream-'));
      return {painted,startsFaint,gradual,suffix,stable,finished,sameLayout:JSON.stringify(before)===JSON.stringify(after),exact:line.textContent==='今天也要好好休息，喝杯茶吧~'};
      }finally{performance.now=originalNow;window.requestAnimationFrame=originalFrame;window.cancelAnimationFrame=originalCancel;}
    })()`);
    for(const [name,value] of Object.entries(result))assert.equal(value,true,name);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await win.webContents.executeJavaScript(`(()=>{PetBubbleText.set(document.querySelector('p'),'减少动态效果时直接显示',{reveal:true});return ![...CSS.highlights.keys()].some(k=>k.startsWith('pet-stream-'));})()`),true);
    win.webContents.debugger.detach();
    console.log('PASS: text fades in without delayed content, selection loss or layout movement; reduced motion is respected.');
    app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
