'use strict';
const petTextReveal=(()=>{
  const active=new Map();let serial=0,frame=null,style=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const remove=name=>{CSS.highlights.delete(name);active.delete(name);};
  function paint(now){
    frame=null;const rules=[];
    for(const [name,item] of active){
      const t=Math.min(1,Math.max(0,(now-item.at)/420));
      if(t===1||!item.element.isConnected||reduced.matches){remove(name);continue;}
      const alpha=Math.round((0.08+0.92*t)*100);
      rules.push('::highlight('+name+'){color:color-mix(in srgb,'+item.color+' '+alpha+'%,transparent)}');
    }
    const css=rules.join('\n');if(style&&style.textContent!==css)style.textContent=css;
    if(active.size)frame=requestAnimationFrame(paint);
  }
  return (element,start,end)=>{
    if(!CSS.highlights||typeof Highlight==='undefined'||reduced.matches||start===end)return;
    // Highlight ranges only affect paint: text nodes, selection and layout stay intact.
    const range=document.createRange(),walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let offset=0,node,begun=false;
    while((node=walker.nextNode())){
      const next=offset+node.length;
      if(!begun&&start<=next){range.setStart(node,start-offset);begun=true;}
      if(end<=next){range.setEnd(node,end-offset);break;}
      offset=next;
    }
    if(!begun||!node)return;
    if(!style){style=document.createElement('style');style.id='pet-stream-effects';document.head.append(style);}
    if(start===0)for(const [name,item] of active)if(item.element===element)remove(name);
    if(active.size>=48)remove(active.keys().next().value);
    const name='pet-stream-'+(++serial);
    active.set(name,{element,at:performance.now(),color:getComputedStyle(element).color});
    CSS.highlights.set(name,new Highlight(range));
    cancelAnimationFrame(frame);paint(performance.now());
  };
})();
window.PetBubbleText={
  set(element,value,{reveal=false}={}){
    const source=String(value??'');
    if(element._petBubbleSource===source&&element.textContent===source)return;
    const previous=element._petBubbleSource||'';
    element._petBubbleSource=source;
    const content=document.createDocumentFragment();
    let fenced=false;
    const lines=source.split('\n');
    lines.forEach((line,index)=>{
      if(index)content.append(document.createTextNode('\n'));
      const fence=/^\s*(```|~~~)/.test(line);
      if(fence||fenced||line.includes('`')){
        content.append(document.createTextNode(line));if(fence)fenced=!fenced;return;
      }
      // Correct the glyph only at conversational Chinese endings; preserve the actual text.
      const marks=/(?<=[\u3400-\u9fff\u3001\u3002\uff01\uff1f\uff09])[~\uff5e\u301c]+(?=[\s!！?？。…，、；;：:]|$)/gu;
      let offset=0;
      for(const match of line.matchAll(marks)){
        content.append(document.createTextNode(line.slice(offset,match.index)));
        const span=document.createElement('span');span.className='tone-mark';span.textContent=match[0];content.append(span);offset=match.index+match[0].length;
      }
      content.append(document.createTextNode(line.slice(offset)));
    });
    // Append to existing text nodes so copying a streamed prefix keeps its selection.
    const incoming=[...content.childNodes];
    incoming.forEach((node,index)=>{
      const old=element.childNodes[index];
      if(old?.nodeType===node.nodeType&&(node.nodeType===3||old.className===node.className)){
        if(old.textContent===node.textContent)return;
        if(node.nodeType===3&&node.data.startsWith(old.data))old.appendData(node.data.slice(old.length));
        else if(node.nodeType===3)old.data=node.data;
        else old.textContent=node.textContent;
      }else if(old)old.replaceWith(node);else element.append(node);
    });
    while(element.childNodes.length>incoming.length)element.lastChild.remove();
    if(reveal)petTextReveal(element,source.startsWith(previous)?previous.length:0,source.length);
  }
};
