/* Consumer host example. All records are fabricated; engine loading belongs to the host. */
(function(){
  'use strict';
  const initial=document.body.dataset.mode,container=document.getElementById('viewer');
  const message=document.getElementById('message'),events=document.getElementById('events'),lines=[];
  function fixture(count,mode){
    const points=Array.from({length:count},(_,i)=>({id:`probe-${i}`,x:(i%25)*.4+Math.sin(i)*.06,
      y:Math.floor(i/25)*.4+Math.cos(i)*.06,...(mode==='3d'?{z:(i%7)*.3}:{}),label:`Probe ${i}`,
      metadata:{provenance:'Fabricated numeric example'}}));
    const relationships=points.slice(1).map((point,i)=>({id:`link-${i}`,source:points[i].id,target:point.id}));
    return {points,relationships};
  }
  let data=fixture(100,initial),viewer=HGSpatial.create(container,data);
  window.hgSpatialViewer=viewer;
  for(const type of ['datachange','selectionchange','focuschange','diagnostics','viewchange'])viewer.on(type,event=>{
    lines.unshift(`${event.revision} ${event.type} ${event.source}/${event.reason}`);
    lines.length=Math.min(lines.length,6);events.textContent=lines.join('\n');
  });
  const button=(name,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=name;
    b.addEventListener('click',async()=>{b.disabled=true;try{await fn();message.textContent='';}
      catch(error){message.textContent=error.code?`${error.code}: ${error.path}`:error.message;}finally{b.disabled=false;}});
    document.getElementById('actions').append(b);};
  button('Select first probe',()=>viewer.select({kind:'point',id:'probe-0'}));
  button('Select first relationship',()=>viewer.select({kind:'relationship',id:'link-0'}));
  button('Reveal first probe',()=>viewer.reveal({kind:'point',id:'probe-0'}));
  button('Update first probe',()=>{const p=viewer.getObject({kind:'point',id:'probe-0'});
    viewer.applyChanges({points:[{id:'probe-0',x:p.record.x+.1}]});});
  button('500 probes',()=>viewer.replaceData(fixture(500,viewer.getState().mode)));
  button('Reset 100 probes',()=>{data=fixture(100,viewer.getState().mode);viewer.replaceData(data);viewer.reset();});
  button('Large targets / reduced motion',()=>viewer.setOptions({accessibility:{targetSize:'large',reducedMotion:'always'}}));
  button('Switch mode (load other local engine)',async()=>{
    const mode=viewer.getState().mode==='2d'?'3d':'2d',key=mode==='2d'?'cytoscape':'BABYLON';
    if(!window[key])await new Promise((resolve,reject)=>{const script=document.createElement('script');
      script.src=mode==='2d'?'../vendor/cytoscape-3.34.3.min.js':'../vendor/babylon-9.27.1.js';
      script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Local renderer asset unavailable; current view retained.'));};
      document.head.append(script);});
    viewer.setOptions({view:{mode}});
  });
  window.addEventListener('pagehide',()=>viewer.destroy(),{once:true});
})();
