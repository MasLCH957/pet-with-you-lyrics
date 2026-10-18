(function(root){
  function nearestArea(areas,cx,cy){
    let best=-1,distance=Infinity;
    for(let i=0;i<areas.length;i++){
      const a=areas[i];
      const dx=cx<a.x?a.x-cx:cx>a.x+a.width?cx-(a.x+a.width):0;
      const dy=cy<a.y?a.y-cy:cy>a.y+a.height?cy-(a.y+a.height):0;
      const d=dx*dx+dy*dy;
      if(d<distance){distance=d;best=i;}
    }
    return best;
  }
  function snapToScreenEdge({x,y,width,height,areas,sideAllow=0,tolerance=1}){
    if(!Array.isArray(areas)||areas.length===0)return {x,y,snapped:false,edges:[],areaIndex:-1};
    const cx=x+width/2,cy=y+height/2;
    let areaIndex=areas.findIndex(a=>cx>=a.x&&cx<=a.x+a.width&&cy>=a.y&&cy<=a.y+a.height);
    if(areaIndex<0)areaIndex=nearestArea(areas,cx,cy);
    const a=areas[areaIndex];
    const minX=a.x-sideAllow;
    const maxX=Math.max(minX,a.x+a.width-width+sideAllow);
    const minY=a.y;
    const maxY=Math.max(minY,a.y+a.height-height);
    const edges=[];
    let nextX=x,nextY=y;
    if(x<=minX+tolerance){nextX=minX;edges.push('left');}
    else if(x>=maxX-tolerance){nextX=maxX;edges.push('right');}
    if(y<=minY+tolerance){nextY=minY;edges.push('top');}
    else if(y>=maxY-tolerance){nextY=maxY;edges.push('bottom');}
    return {x:nextX,y:nextY,snapped:edges.length>0,edges,areaIndex};
  }
  function clampRect({x,y,width,height,bounds,margin=4}){
    if(!bounds)return {dx:0,dy:0,clamped:false};
    const dx=Math.max(bounds.x+margin-x,Math.min(0,bounds.x+bounds.width-margin-(x+width)));
    const dy=Math.max(bounds.y+margin-y,Math.min(0,bounds.y+bounds.height-margin-(y+height)));
    return {dx,dy,clamped:dx!==0||dy!==0};
  }
  function snapPosition({x,y,width,height,canvasHeight,targets,attachment,threshold=36,gap=3}){
    const cx=x+width/2;
    const valid=targets.filter(t=>Number.isFinite(t.y)&&cx>=t.x&&cx<=t.x+t.width&&t.y-canvasHeight-gap>=t.top);
    const kept=valid.find(t=>t.id===attachment);
    const near=valid.filter(t=>Math.min(Math.abs(y+height-t.y),Math.abs(y+canvasHeight+gap-t.y))<=threshold)
      .sort((a,b)=>a.y-b.y);
    const t=kept||near[0];
    return t?{x,y:t.y-canvasHeight-gap,attachment:t.id}:{x,y,attachment:null};
  }
  if(typeof module==='object')module.exports={snapPosition,snapToScreenEdge,clampRect};else root.PetSnap={snapPosition,snapToScreenEdge,clampRect};
})(typeof window==='object'?window:globalThis);
