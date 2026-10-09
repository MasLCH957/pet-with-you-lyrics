const assert=require('node:assert/strict');

module.exports=async function(pet){
  const {ipcMain}=require('electron');
  const original=pet.setIgnoreMouseEvents;
  let changes=0;
  pet.setIgnoreMouseEvents=function(...args){changes++;return original.apply(this,args);};
  try{
    const event={sender:pet.webContents};
    ipcMain.emit('pet:set-interactive',event,true);
    changes=0;
    for(let i=0;i<1000;i++)ipcMain.emit('pet:set-interactive',event,true);
    assert.equal(changes,0,'unchanged input state must not call the native window API');
    ipcMain.emit('pet:set-interactive',event,false);
    for(let i=0;i<1000;i++)ipcMain.emit('pet:set-interactive',event,false);
    assert.equal(changes,1,'a real transition is applied exactly once');
  }finally{pet.setIgnoreMouseEvents=original;}

  const measured=await pet.webContents.executeJavaScript(`(()=>{
    const s=sprites[0];s.stopMove();s.stopThrow();s.closeMenu();
    const bubble=s.bubble,classes=bubble.className,getRect=bubble.getBoundingClientRect;
    let reads=0;
    bubble.getBoundingClientRect=function(){reads++;return getRect.call(this);};
    try{
      bubble.classList.remove('is-on','can-copy');
      for(let i=0;i<1000;i++)s.onMouseMove({clientX:0,clientY:0});
      const hidden=reads;
      bubble.classList.add('is-on','can-copy');
      s.onMouseMove({clientX:0,clientY:0});
      return {hidden,visible:reads-hidden};
    }finally{bubble.getBoundingClientRect=getRect;bubble.className=classes;}
  })()`);
  assert.deepEqual(measured,{hidden:0,visible:1},'hidden bubbles skip layout reads; visible selectable bubbles retain hit testing');
};
