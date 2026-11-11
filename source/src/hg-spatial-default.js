/* HG Spatial Data development entrypoint: accepted V1 HGSpatial contract candidate.
   Shares the Sprint 005 renderer with the private HGSpatialDefault compatibility surface. */
(function(global){
  'use strict';

  const CYTO_URL='https://cdn.jsdelivr.net/npm/cytoscape@3.34.3/dist/cytoscape.min.js';
  const BABYLON_URL='https://cdn.jsdelivr.net/npm/babylonjs@9.27.1/babylon.js';
  // Proposed development defaults (Sprint 005 production-default pass); not public options or accepted thresholds.
  const DEFAULTS={
    marginPx:10,marginPx3d:26,chromePx:44,maxAxisRatio:2.5,maxStretch:3,modelSize:1000,sceneSize:20,
    // 3D chooses levels as if slightly further away: nearer glyphs project larger and depth stacks them.
    clusterRadiusPx:30,levelHysteresis:.25,lodScale3d:.8,maxLevels:24,rootRadius:.5,
    pointPx:12,clusterMinPx:24,clusterMaxPx:46,hitPx:22,arrowPx:9,contextPx:5,contextMax:4000,
    labelPx:12,labelChars:24,labelArea:5200,metaRows:16,tickPx:10,
    minZoomRatio:.25,focusExitRatio:.5,animMs:260,restyleStep:.03,
    doubleTapMs:360,doubleTapPx:26,listLimit:60,orbitUndoMs:250,
    cameraAlpha:-Math.PI/2-.5,cameraBeta:Math.PI/2-.32,cameraFill:.96,fov:.8,
    // Default-camera candidates (yaw offset from -X, elevation) searched on each automatic fit; the default
    // angle wins unless another frames the data at least `angleGain` larger (narrow portrait stages).
    cameraYaws:[.5,.68,.86],cameraElevations:[.32,.46,.6],angleGain:1.1
  };
  // One restrained palette shared by both renderers and the legend. Originals are saturated teal, aggregates
  // indigo with a light halo, individual relationships mid-slate with darker arrowheads, bundles a lighter,
  // wider, translucent slate so they recede; selection is the only warm accent. Contrast: point 4.8:1 and
  // cluster 6.4:1 against the background; white count text on clusters 6.4:1; selection 4.6:1.
  const COLORS={
    point:'#0e7c86',cluster:'#3e5ba9',halo:'#c9d3ee',edge:'#8792a6',arrow:'#5d6b82',bundle:'#9aa7ba',
    selected:'#d6336c',incident:'#ec8fb0',context:'#c3c9d3',
    axis:'#aeb7c4',grid:'#edf0f4',tick:'#6b7485',axisName:'#3f4a5c',
    text:'#1f2937',muted:'#6b7485',background:'#fbfcfe',warning:'#9a4a06',warningBg:'#fff5e6'
  };
  // Accepted V1 option tree. Never exposed as mutable global defaults.
  const BUILTIN={
    view:{mode:'auto',missingZ:'zero',aspect:'adaptive'},
    axes:{visible:true,grid:true,...Object.fromEntries(['x','y','z'].map(k=>[k,{name:k,unit:'',format:'number',categories:[]}]))},
    labels:{points:'auto',relationships:'selected'},legend:{visible:true},
    controls:{visible:true,zoom:true,fit:true,reset:true,status:true},
    theme:{background:COLORS.background,text:COLORS.text,muted:COLORS.muted,selected:COLORS.selected,related:COLORS.incident,context:COLORS.context,axis:COLORS.axis,grid:COLORS.grid},
    points:{color:COLORS.point,size:12},relationships:{color:COLORS.edge,width:'auto',directionCues:true},
    clusters:{color:COLORS.cluster,size:'auto',counts:true},bundles:{color:COLORS.bundle,width:'auto',counts:true},
    lod:{density:'default',bundleBy:'endpoints'},interaction:{selection:true,focus:true,pan:true,zoom:true,orbit:true},
    inspection:{visible:true,metadata:true},accessibility:{label:'Spatial data view',reducedMotion:'system',targetSize:'default'}
  };
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const asId=value=>String(value);
  const unique=items=>Array.from(new Set(items.map(asId))).sort();
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const now=()=>(global.performance&&global.performance.now?global.performance.now():Date.now());
  const clusterPx=count=>clamp(16+6*Math.sqrt(count||1),DEFAULTS.clusterMinPx,DEFAULTS.clusterMaxPx);
  const bundlePx=count=>Math.min(6,2.2+1.1*Math.log2(count||1));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const normalizeVec=v=>{const n=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/n,v[1]/n,v[2]/n];};
  const keyOf=(kind,id)=>kind+':'+id;

  // Deterministic compact identity for aggregates: two FNV-1a variants over the sorted member IDs.
  function hashIds(ids){
    let a=0x811c9dc5,b=0x01000193^ids.length;
    for(const id of ids){
      for(let i=0;i<id.length;i++){const c=id.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x5bd1e995)>>>0;}
      a=Math.imul(a^0x1f,0x01000193)>>>0;b=Math.imul(b^0x1f,0x5bd1e995)>>>0;
    }
    return a.toString(36)+b.toString(36);
  }

  // Display helpers. Labels are consumer text; they are shortened for display only and never parsed for meaning.
  function formatNumber(value){
    if(!finite(value)) return String(value);
    if(Number.isInteger(value)) return String(value);
    const text=String(Number(value.toPrecision(10)));
    return text.length>12?value.toPrecision(6):text;
  }
  function compactNumber(value){
    const abs=Math.abs(value);
    for(const [div,suffix] of [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'k']]) if(abs>=div) return formatNumber(Number((value/div).toPrecision(3)))+suffix;
    return formatNumber(Number(value.toPrecision(4)));
  }
  function abbreviate(text,max){
    max=max||DEFAULTS.labelChars;
    text=String(text==null?'':text).replace(/\s+/g,' ').trim();
    if(text.length<=max) return text;
    if(/^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?$/i.test(text)){const n=Number(text.replace(/,/g,''));if(finite(n)){const c=compactNumber(n);if(c.length<=max) return c;}}
    // Dates, times, counters and IDs usually differ at the end, so keep the tail when it carries digits.
    const tail=text.slice(-Math.max(5,Math.floor(max/3)));
    if(/\d/.test(tail)){const head=max-1-tail.length;return text.slice(0,head).trimEnd()+'…'+tail.trimStart();}
    const cut=text.slice(0,max-1),space=cut.lastIndexOf(' ');
    return (space>max*.6?cut.slice(0,space):cut).trimEnd()+'…';
  }
  function niceStep(range,count){
    if(!(range>0)||!(count>0)) return 1;
    const raw=range/count,pow=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/pow;
    return (f<1.5?1:f<3?2:f<7?5:10)*pow;
  }
  function niceTicks(min,max,count){
    if(!finite(min)||!finite(max)||max<min) return [];
    if(max===min) return [min];
    const step=niceStep(max-min,count),out=[];
    for(let v=Math.ceil(min/step)*step,i=0;v<=max+step*1e-9&&i<200;v+=step,i++) out.push(Math.abs(v)<step*1e-9?0:v);
    const decimals=Math.max(0,-Math.floor(Math.log10(step)+1e-9));
    return out.map(v=>({value:v,text:decimals?v.toFixed(Math.min(decimals,8)):formatNumber(Math.round(v))}));
  }

  // Axis semantics are described by the consumer (a proposed development option, not a frozen schema):
  // {name, unit, format} per axis, where format is 'number' (default), 'day' (a day index), 'date' (epoch
  // milliseconds, shown in UTC) or 'time' (hours since midnight). Formats only change display text; the
  // coordinates themselves are never reinterpreted.
  const AXIS_FORMATS=['number','day','date','time','category'];
  const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_MS=864e5;
  const pad2=n=>String(n).padStart(2,'0');
  function normalizeAxes(input){
    const out={};
    for(const key of ['x','y','z']){
      const a=input&&typeof input==='object'&&input[key]&&typeof input[key]==='object'?input[key]:{};
      const format=AXIS_FORMATS.includes(a.format)?a.format:'number';
      const name=a.name!=null&&String(a.name).trim()?abbreviate(String(a.name),28):key;
      const unit=format==='number'&&a.unit!=null&&String(a.unit).trim()?abbreviate(String(a.unit),12):'';
      out[key]={key,name,unit,format,categories:Array.isArray(a.categories)?a.categories.slice():[],title:unit?`${name} (${unit})`:name};
    }
    return out;
  }
  function clockText(hours){
    const m=Math.round(hours*60),d=Math.floor(m/1440),r=m-d*1440;
    return `${d?`${d>0?'+':''}${d}d `:''}${pad2(Math.floor(r/60))}:${pad2(r%60)}`;
  }
  function dateText(ms,withTime,withYear){
    const d=new Date(ms);
    if(!finite(d.getTime())) return String(ms);
    let text=`${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    if(withYear) text+=` ${d.getUTCFullYear()}`;
    if(withTime) text+=` ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    return text;
  }
  // Full value text for the inspector.
  function axisValue(axis,v){
    if(!finite(v)) return 'missing';
    if(axis.format==='category') return Number.isInteger(v)&&axis.categories[v]!==undefined?axis.categories[v]:formatNumber(v);
    if(axis.format==='time') return clockText(v);
    if(axis.format==='day') return `Day ${formatNumber(v)}`;
    if(axis.format==='date'){const midnight=v%DAY_MS===0;return dateText(v,!midnight,true)+(midnight?'':' UTC');}
    return formatNumber(v)+(axis.unit?` ${axis.unit}`:'');
  }
  // Short value text for guide anchors (3D axis ends).
  function axisShort(axis,v){
    if(!finite(v)) return '';
    if(axis.format==='category') return Number.isInteger(v)&&axis.categories[v]!==undefined?axis.categories[v]:formatNumber(v);
    if(axis.format==='time') return clockText(v);
    if(axis.format==='day') return `Day ${formatNumber(Math.round(v*100)/100)}`;
    if(axis.format==='date') return dateText(v,v%DAY_MS!==0,false);
    return compactNumber(v)+(axis.unit?` ${axis.unit}`:'');
  }
  // Ticks for an axis: temporal formats step in clock/calendar units, numbers use nice decimal steps.
  function axisTicks(axis,min,max,count){
    if(!finite(min)||!finite(max)||max<min) return [];
    const fmt=axis&&axis.format||'number';
    if(fmt==='category') return (axis.categories||[]).map((text,value)=>({value,text})).filter(t=>t.value>=min&&t.value<=max);
    if(fmt==='time'||fmt==='date'||(fmt==='day'&&max-min>=count)){
      const unit=fmt==='date'?DAY_MS:1;
      const steps=fmt==='time'?[1/60,5/60,.25,.5,1,2,3,6,12,24]:fmt==='day'?[1,2,7,14,28,56,91,182,364]:[1/24,3/24,.25,.5,1,2,7,14,28,91,182,364];
      const raw=(max-min)/unit/Math.max(count,1),last=steps[steps.length-1];
      const step=(steps.find(s=>s>=raw)||last*Math.ceil(raw/last))*unit;
      const years=fmt==='date'&&new Date(min).getUTCFullYear()!==new Date(max).getUTCFullYear();
      const out=[];
      for(let v=Math.ceil(min/step-1e-9)*step,i=0;v<=max+step*1e-9&&i<200;v+=step,i++){
        let text;
        if(fmt==='time') text=clockText(v);
        else if(fmt==='day') text=`Day ${formatNumber(Math.round(v))}`;
        else text=step<DAY_MS&&v%DAY_MS!==0?clockText((v%DAY_MS+DAY_MS)%DAY_MS/36e5):dateText(v,false,years);
        out.push({value:v,text});
      }
      return out;
    }
    const ticks=niceTicks(min,max,count);
    return fmt==='day'?ticks.map(t=>({value:t.value,text:`Day ${t.text}`})):ticks;
  }

  function bounds(points){
    if(!points.length) return {minX:0,maxX:1,minY:0,maxY:1,minZ:0,maxZ:0,width:1,height:1,depth:0,cx:.5,cy:.5,cz:0};
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of points){
      const z=finite(p.z)?p.z:0;
      if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
    }
    return {minX,maxX,minY,maxY,minZ,maxZ,width:Math.max(maxX-minX,1),height:Math.max(maxY-minY,1),depth:Math.max(maxZ-minZ,0),cx:(minX+maxX)/2,cy:(minY+maxY)/2,cz:(minZ+maxZ)/2};
  }

  // Affine data->scene mapping. Each axis keeps order and proportional spacing; the largest axis spans
  // `size`, and a non-zero axis is never drawn shorter than 1/maxAxisRatio of it. Zero-extent axes stay flat.
  function frame(points,size,dims,equal){
    const b=bounds(points);
    const raw=points.length?[b.maxX-b.minX,b.maxY-b.minY,dims===3?b.maxZ-b.minZ:0]:[0,0,0];
    const largest=Math.max(...raw);
    const unit=largest>0?size/largest:1;
    const k=raw.map(e=>e>0&&!equal?unit*Math.max(e,largest/DEFAULTS.maxAxisRatio)/e:unit);
    const center=[b.cx,b.cy,dims===3?b.cz:0];
    return {k,center,size,dims,bounds:b,extent:raw.map((e,i)=>e*k[i]),adjusted:raw.some((e,i)=>e>0&&Math.abs(k[i]-unit)>1e-9*unit),
      apply:p=>[(p.x-center[0])*k[0],(p.y-center[1])*k[1],dims===3?((finite(p.z)?p.z:0)-center[2])*k[2]:0],
      invert:(axis,v)=>center[axis]+v/k[axis]};
  }

  // Uniform 2D scale that fits an extent inside a viewport with pixel margins; null for degenerate extents.
  function fitScale(extentW,extentH,viewW,viewH,margin){
    const m=typeof margin==='object'&&margin?margin:{top:margin,right:margin,bottom:margin,left:margin};
    const w=Math.max(viewW-m.left-m.right,1),h=Math.max(viewH-m.top-m.bottom,1);
    const s=Math.min(extentW>0?w/extentW:Infinity,extentH>0?h/extentH:Infinity);
    return Number.isFinite(s)?s:null;
  }

  // ArcRotate-style camera basis: position = target + r*(cos a sin b, cos b, sin a sin b).
  function cameraBasis(alpha,beta){
    const f=[-Math.cos(alpha)*Math.sin(beta),-Math.cos(beta),-Math.sin(alpha)*Math.sin(beta)];
    let r=cross([0,1,0],f);
    if(Math.hypot(r[0],r[1],r[2])<1e-6) r=[1,0,0];
    r=normalizeVec(r);
    return {f,r,u:cross(f,r)};
  }

  // Smallest camera distance that keeps every corner (relative to target) inside the vertical/horizontal FOV.
  function fitDistance(corners,alpha,beta,fov,aspect,fill,fillV){
    const {f,r,u}=cameraBasis(alpha,beta);
    const tv=Math.tan(fov/2)*(fillV==null?fill:fillV),th=Math.tan(fov/2)*aspect*fill;
    let d=0,reach=0;
    for(const c of corners){
      d=Math.max(d,Math.abs(dot(c,r))/th-dot(c,f),Math.abs(dot(c,u))/tv-dot(c,f));
      reach=Math.max(reach,Math.hypot(c[0],c[1],c[2]));
    }
    return Math.max(d,reach*1.1);
  }

  function boxCorners(half,center){
    const out=[],c=center||[0,0,0];
    for(const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]) out.push([c[0]+sx*half[0],c[1]+sy*half[1],c[2]+sz*half[2]]);
    return out;
  }

  // Greedy screen-space label placement with a spatial hash. Items: {id,x,y,r,text,priority,forced,anchor};
  // items without text are obstacles only. anchor:'center' labels (edge counts) are centred on their point.
  // Returns Map id -> {side,box}. Unplaced labels stay available through selection and the inspector lists.
  const SIDES=['right','top','bottom','left','top-right','bottom-right','top-left','bottom-left'];
  function planLabels(items,viewW,viewH,opts){
    if(typeof opts==='number') opts={fontPx:opts};
    opts=opts||{};
    const fontPx=opts.fontPx||DEFAULTS.labelPx,measure=opts.measure||(text=>text.length*fontPx*.58);
    const prev=opts.previous||new Map(),budget=opts.budget==null?Infinity:opts.budget;
    const cell=64,grid=new Map(),placed=new Map();
    const cellsOf=box=>{const out=[];for(let gx=Math.floor(box.x0/cell);gx<=Math.floor(box.x1/cell);gx++)for(let gy=Math.floor(box.y0/cell);gy<=Math.floor(box.y1/cell);gy++)out.push(gx+','+gy);return out;};
    const insert=box=>{for(const c of cellsOf(box)){if(!grid.has(c))grid.set(c,[]);grid.get(c).push(box);}};
    const hits=(a,b)=>a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1;
    const blocked=(box,ownId)=>cellsOf(box).some(c=>(grid.get(c)||[]).some(o=>o.owner!==ownId&&hits(o,box)));
    for(const o of opts.obstacles||[]) insert({...o,owner:null});
    for(const i of items) if(i.r>0) insert({x0:i.x-i.r,y0:i.y-i.r,x1:i.x+i.r,y1:i.y+i.r,owner:i.id});
    const order=items.filter(i=>i.text).sort((a,b)=>(b.forced?1:0)-(a.forced?1:0)||(b.priority||0)-(a.priority||0)||(prev.has(b.id)?1:0)-(prev.has(a.id)?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
    let used=0;
    for(const item of order){
      if(!item.forced&&used>=budget) break;
      const w=measure(item.text)+6,h=fontPx+4,g=3,r=item.r||0,d=r*.7+g;
      const origins={right:[item.x+r+g,item.y-h/2],left:[item.x-r-g-w,item.y-h/2],top:[item.x-w/2,item.y-r-g-h],bottom:[item.x-w/2,item.y+r+g],
        'top-right':[item.x+d,item.y-d-h],'bottom-right':[item.x+d,item.y+d],'top-left':[item.x-d-w,item.y-d-h],'bottom-left':[item.x-d-w,item.y+d],center:[item.x-w/2,item.y-h/2]};
      const sides=item.anchor==='center'?['center']:[prev.get(item.id),...SIDES].filter((s,i,a)=>s&&origins[s]&&a.indexOf(s)===i);
      let choice=null,fallback=null;
      for(const side of sides){
        const [x0,y0]=origins[side];
        const box={x0,y0,x1:x0+w,y1:y0+h,owner:item.id};
        if(x0<0||y0<0||box.x1>viewW||box.y1>viewH) continue;
        if(!fallback) fallback={side,box};
        if(!blocked(box,item.id)){choice={side,box};break;}
      }
      if(!choice&&item.forced){
        // A selected label is always shown, clamped inside the viewport even if it must overlap.
        const [x0,y0]=origins[sides[0]==='center'?'center':'top'];
        const cx=clamp(x0,0,Math.max(0,viewW-w)),cy=clamp(y0,0,Math.max(0,viewH-h));
        choice=fallback||{side:'top',box:{x0:cx,y0:cy,x1:cx+w,y1:cy+h,owner:item.id}};
      }
      if(choice){insert(choice.box);placed.set(item.id,choice);if(!item.forced)used++;}
    }
    return placed;
  }

  // Shared screen-space picker. Nodes {x,y,r}; edges {pts:[[x,y],...]}. Returns hits nearest first,
  // preferring nodes over edges, so every glyph has a touch target of at least 2*tolerance pixels.
  function segmentDistance(px,py,ax,ay,bx,by){
    const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
    const t=len?clamp(((px-ax)*dx+(py-ay)*dy)/len,0,1):0;
    return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
  }
  function pickAt(candidates,x,y,tolerance){
    tolerance=tolerance==null?DEFAULTS.hitPx:tolerance;
    // Edges accept a narrower band and rank behind any node within its own target, so taps near a
    // point never grab the line running through it.
    const hits=[];
    for(const c of candidates){
      if(c.pts){
        let d=Infinity;
        for(let i=1;i<c.pts.length;i++)d=Math.min(d,segmentDistance(x,y,c.pts[i-1][0],c.pts[i-1][1],c.pts[i][0],c.pts[i][1]));
        if(d<=tolerance*.6) hits.push({c,d:d+tolerance*.5});
      }else{
        const d=Math.max(0,Math.hypot(c.x-x,c.y-y)-(c.r||0));
        if(d<=tolerance) hits.push({c,d});
      }
    }
    hits.sort((a,b)=>a.d-b.d||(a.c.pts?1:0)-(b.c.pts?1:0)||(a.c.id<b.c.id?-1:1));
    return hits.map(h=>h.c);
  }
  // Nearest candidate roughly in a screen direction (keyboard spatial navigation).
  function nearestInDirection(candidates,from,dx,dy){
    let best=null,bestScore=Infinity;
    for(const c of candidates){
      if(c===from||c.pts) continue;
      const vx=c.x-from.x,vy=c.y-from.y,along=vx*dx+vy*dy;
      if(along<=1) continue;
      const across=Math.abs(vx*dy-vy*dx);
      if(across>along*1.8) continue;
      const score=along+across*2;
      if(score<bestScore){bestScore=score;best=c;}
    }
    return best;
  }

  // Consumer-supplied fields beyond the spatial ones, as display rows [key,text] for the inspector. One level of
  // nested plain objects is flattened ("owner.team"); functions and deeper structures are not shown.
  const POINT_KEYS=new Set(['id','x','y','z','label']),REL_KEYS=new Set(['id','source','target','label']);
  function displayValue(v){
    if(Array.isArray(v)) return v.filter(x=>x==null||typeof x!=='object').map(x=>displayValue(x)).join(', ');
    if(typeof v==='number') return formatNumber(v);
    if(Object.prototype.toString.call(v)==='[object Date]') return finite(v.getTime())?v.toISOString():'invalid date';
    return String(v);
  }
  function metaRows(source,reserved){
    const out=[];
    for(const key of Object.keys(source)){
      if(reserved.has(key)) continue;
      const v=source[key];
      if(v==null||typeof v==='function') continue;
      if(typeof v==='object'&&!Array.isArray(v)&&Object.prototype.toString.call(v)!=='[object Date]'){
        for(const sub of Object.keys(v)){const s=v[sub];if(s!=null&&typeof s!=='function'&&(typeof s!=='object'||Array.isArray(s)))out.push([`${key}.${sub}`,displayValue(s)]);}
      }else out.push([key,displayValue(v)]);
      if(out.length>=DEFAULTS.metaRows) break;
    }
    return out.slice(0,DEFAULTS.metaRows);
  }

  function normalize(input){
    const diagnostics=[];
    const meta={points:new Map(),relationships:new Map()};
    const rawPoints=Array.isArray(input&&input.points)?input.points:[];
    const rawRels=Array.isArray(input&&input.relationships)?input.relationships:[];
    if(input&&input.points!=null&&!Array.isArray(input.points)) diagnostics.push({kind:'invalid-input',id:'points',message:'points must be an array'});
    if(input&&input.relationships!=null&&!Array.isArray(input.relationships)) diagnostics.push({kind:'invalid-input',id:'relationships',message:'relationships must be an array'});
    const pointMap=new Map();
    for(const source of rawPoints){
      const id=source&&source.id!=null&&source.id!==''?asId(source.id):'';
      if(!id||!finite(source.x)||!finite(source.y)){
        diagnostics.push({kind:'invalid-point',id:id||'(missing)'});
        continue;
      }
      if(pointMap.has(id)){
        diagnostics.push({kind:'duplicate-point',id});
        continue;
      }
      pointMap.set(id,{...source,id,x:source.x,y:source.y,z:finite(source.z)?source.z:null,label:String(source.label!=null&&source.label!==''?source.label:id)});
      const rows=metaRows(source,POINT_KEYS);
      if(rows.length) meta.points.set(id,rows);
    }
    const relMap=new Map();
    for(const source of rawRels){
      const id=source&&source.id!=null&&source.id!==''?asId(source.id):'';
      if(!id||relMap.has(id)||source.source==null||source.target==null){
        diagnostics.push({kind:!id?'invalid-relationship':relMap.has(id)?'duplicate-relationship':'invalid-relationship',id:id||'(missing)'});
        continue;
      }
      const rel={...source,id,source:asId(source.source),target:asId(source.target),label:String(source.label!=null&&source.label!==''?source.label:id)};
      const rows=metaRows(source,REL_KEYS);
      if(rows.length) meta.relationships.set(id,rows);
      rel.status=pointMap.has(rel.source)&&pointMap.has(rel.target)?'drawable':'absent-endpoint';
      if(rel.status==='absent-endpoint') diagnostics.push({kind:'absent-endpoint',id,source:rel.source,target:rel.target});
      rel.selfLink=rel.source===rel.target;
      relMap.set(id,rel);
    }
    const points=[...pointMap.values()];
    const rels=[...relMap.values()];
    const hasAnyZ=points.some(p=>p.z!==null);
    const hasMissingZ=points.some(p=>p.z===null);
    if(hasAnyZ&&hasMissingZ) diagnostics.push({kind:'mixed-z',message:'Missing z values render on the z=0 plane in 3D for this proposed default.'});
    const incident=new Map();
    for(const rel of rels){
      for(const end of rel.selfLink?[rel.source]:[rel.source,rel.target]){if(!incident.has(end))incident.set(end,[]);incident.get(end).push(rel.id);}
    }
    return {points,relationships:rels,pointMap,relationshipMap:relMap,incident,meta,axes:normalizeAxes(input&&input.axes),bounds:bounds(points),diagnostics,z:{hasAnyZ,hasMissingZ,zeroCount:points.filter(p=>p.z===0).length}};
  }

  function defaultMode(data, requested){
    if(requested==='2d'||requested==='3d') return requested;
    return data.z.hasAnyZ&&!data.z.hasMissingZ?'3d':'2d';
  }

  // Hierarchical, deterministic, zoom-dependent point aggregation (greedy radius grouping in the framed,
  // aspect-adjusted space). Level L groups within radius rootRadius/2^L of the longest axis; each level is
  // built from the next finer one, so memberships nest and a cluster keeps its ID while its membership is
  // unchanged. The finest level only merges exactly co-located points. `detail` is the coarsest level that
  // equals the finest one.
  function buildHierarchy(points,fr){
    const dims=fr.dims===3?3:2,unit=fr.size||1;
    const coords=new Map(points.map(p=>{const c=fr.apply(p);return [p.id,[c[0]/unit,c[1]/unit,c[2]/unit]];}));
    const make=members=>{
      const pointIds=members.length===1?members[0].pointIds:[].concat(...members.map(m=>m.pointIds)).sort();
      let n=0,x=0,y=0,z=0,sx=0,sy=0,sz=0;
      for(const m of members){n+=m.count;x+=m.nx*m.count;y+=m.ny*m.count;z+=m.nz*m.count;sx+=m.sx;sy+=m.sy;sz+=m.sz;}
      return {id:'cluster:'+hashIds(pointIds)+(fr.publicIdentity?':'+JSON.stringify(pointIds):''),count:n,pointIds,nx:x/n,ny:y/n,nz:z/n,sx,sy,sz};
    };
    const byPosition=new Map();
    for(const p of [...points].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
      const c=coords.get(p.id),key=c[0]+','+c[1]+','+(dims===3?c[2]:0);
      if(!byPosition.has(key)) byPosition.set(key,[]);
      byPosition.get(key).push({id:p.id,count:1,pointIds:[p.id],nx:c[0],ny:c[1],nz:dims===3?c[2]:0,sx:p.x,sy:p.y,sz:finite(p.z)?p.z:0});
    }
    const finest=[...byPosition.values()].map(g=>g.length===1?g[0]:make(g));
    const levels=new Array(DEFAULTS.maxLevels+2);
    levels[DEFAULTS.maxLevels+1]=finest;
    let items=finest;
    // A pass whose radius is below the closest pair of distinct positions cannot merge anything, so it is skipped.
    const minGap=closestGap(finest);
    for(let L=DEFAULTS.maxLevels;L>=0;L--){
      const radius=DEFAULTS.rootRadius/Math.pow(2,L);
      if(items.length>1&&(items!==finest||radius>=minGap)) items=groupPass(items,radius,dims,make);
      levels[L]=items;
    }
    let detail=DEFAULTS.maxLevels+1;
    while(detail>0&&levels[detail-1].length===finest.length) detail--;
    return {levels,detail,finest:DEFAULTS.maxLevels+1,count:points.length,dims,maps:new Map()};
  }
  function closestGap(items){
    const order=items.slice().sort((p,q)=>p.nx-q.nx||p.ny-q.ny);
    let best=Infinity;
    for(let i=0;i<order.length;i++){
      const p=order[i];
      for(let j=i+1;j<order.length;j++){
        const q=order[j],dx=q.nx-p.nx;
        if(dx>=best) break;
        best=Math.min(best,Math.hypot(dx,q.ny-p.ny,q.nz-p.nz));
      }
    }
    return best;
  }
  function groupPass(items,radius,dims,make){
    const cell=radius,grid=new Map(),key=(a,b,c)=>a+','+b+','+c;
    const order=items.map((item,i)=>i).sort((a,b)=>items[b].count-items[a].count||(items[a].id<items[b].id?-1:1));
    items.forEach((m,i)=>{const k=key(Math.floor(m.nx/cell),Math.floor(m.ny/cell),dims===3?Math.floor(m.nz/cell):0);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
    const used=new Uint8Array(items.length),out=[],r2=radius*radius;
    let merged=false;
    for(const i of order){
      if(used[i]) continue;
      used[i]=1;
      const seed=items[i],members=[seed];
      const gx=Math.floor(seed.nx/cell),gy=Math.floor(seed.ny/cell),gz=dims===3?Math.floor(seed.nz/cell):0;
      for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(let c=dims===3?-1:0;c<=(dims===3?1:0);c++){
        for(const j of grid.get(key(gx+a,gy+b,gz+c))||[]){
          if(used[j]) continue;
          const o=items[j],dx=o.nx-seed.nx,dy=o.ny-seed.ny,dz=o.nz-seed.nz;
          if(dx*dx+dy*dy+dz*dz<=r2){used[j]=1;members.push(o);}
        }
      }
      if(members.length>1){merged=true;out.push(make(members.sort((p,q)=>p.id<q.id?-1:1)));}
      else out.push(seed);
    }
    return merged?out.sort((p,q)=>p.id<q.id?-1:1):items;
  }
  // Level for a zoom measured in screen pixels per framed unit, with hysteresis so slow pinches do not thrash.
  function chooseLevel(h,ppu,current){
    const x=Math.log2(Math.max(ppu,1e-9)*DEFAULTS.rootRadius/DEFAULTS.clusterRadiusPx);
    const ideal=clamp(Math.ceil(x),0,h.detail);
    if(current==null||current>h.detail) return ideal;
    const H=DEFAULTS.levelHysteresis;
    if(x>current+H||x<=current-1-H) return ideal;
    return clamp(current,0,h.detail);
  }
  // Pixels per framed unit at which `level` becomes the chosen level (with a margin past the hysteresis band).
  function ppuForLevel(level){return DEFAULTS.clusterRadiusPx*Math.pow(2,level-1+.5+DEFAULTS.levelHysteresis)/DEFAULTS.rootRadius;}

  function pointMapFor(h,L){
    if(!h.maps.has(L)){
      const map=new Map();
      for(const item of h.levels[L]) for(const id of item.pointIds) map.set(id,item.count===1?{kind:'point',id}:{kind:'cluster',id:item.id});
      h.maps.set(L,map);
    }
    return h.maps.get(L);
  }

  // Visible view for a hierarchy level: original points, clusters, individual relationships and bundles.
  // Relationships whose endpoints are both visible originals stay individual (parallels stay distinct);
  // any relationship touching an aggregate joins the bundle for that visible endpoint pair.
  function aggregate(data,h,L,focus,bundleBy){
    L=clamp(L==null?0:L,0,h.finest);
    const levelItems=h.levels[L],map=pointMapFor(h,L);
    const points=[],clusters=[];
    for(const item of levelItems){
      if(item.count===1) points.push(data.pointMap.get(item.pointIds[0]));
      else clusters.push({id:item.id,kind:'cluster',x:item.sx/item.count,y:item.sy/item.count,z:item.sz/item.count,count:item.count,pointIds:item.pointIds,label:String(item.count)});
    }
    // Inside a focus, every source relationship whose endpoints are both in scope is shown (never invented ones).
    const inScope=focus?new Set(focus.pointIds):null;
    const relationships=[],bundleMap=new Map();
    for(const rel of data.relationships){
      if(rel.status!=='drawable') continue;
      if(inScope&&!(inScope.has(rel.source)&&inScope.has(rel.target))) continue;
      const a=map.get(rel.source),b=map.get(rel.target);
      if(!a||!b) continue;
      if(a.kind==='point'&&b.kind==='point'){relationships.push(rel);continue;}
      const ka=keyOf(a.kind,a.id),kb=keyOf(b.kind,b.id);
      const direction=rel.direction||'forward',partition=direction==='forward'&&ka!==kb?(ka<kb?'forward':'backward'):direction;
      const key=JSON.stringify([...(ka<=kb?[ka,kb]:[kb,ka]),...(bundleBy==='direction-type'?[partition,rel.type===undefined?null:rel.type]:[])]);
      if(!bundleMap.has(key)) bundleMap.set(key,{ends:ka<=kb?[a,b]:[b,a],relationshipIds:[],forward:0,backward:0,both:0,none:0,internal:0});
      const entry=bundleMap.get(key);
      entry.relationshipIds.push(rel.id);
      if(ka===kb)entry.internal++;else if(direction==='both')entry.both++;else if(direction==='none')entry.none++;else if(ka<kb)entry.forward++;else entry.backward++;
    }
    const byKey=new Map([...points.map(p=>[keyOf('point',p.id),p]),...clusters.map(c=>[keyOf('cluster',c.id),c])]);
    const bundles=[...bundleMap.values()].map(entry=>{
      const ids=entry.relationshipIds.sort();
      const [a,b]=entry.ends.map(e=>byKey.get(keyOf(e.kind,e.id)));
      const pointIds=unique(ids.flatMap(id=>{const r=data.relationshipMap.get(id);return [r.source,r.target];}));
      return {id:'bundle:'+hashIds(ids)+(data.publicIdentity?':'+JSON.stringify(ids):''),kind:'bundle',source:entry.ends[0].id,target:entry.ends[1].id,sourceKind:entry.ends[0].kind,targetKind:entry.ends[1].kind,
        count:ids.length,relationshipIds:ids,pointIds,selfLink:entry.ends[0].kind===entry.ends[1].kind&&entry.ends[0].id===entry.ends[1].id,
        // Direction summary relative to source->target of the bundle: 'forward', 'backward', 'both' or null (internal).
        forward:entry.forward,backward:entry.backward,directionCounts:{forward:entry.forward,backward:entry.backward,both:entry.both,none:entry.none,internal:entry.internal},direction:entry.both||(entry.forward&&entry.backward)?'both':entry.forward?'forward':entry.backward?'backward':null,
        x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2,label:String(ids.length)};
    }).sort((a,b)=>a.id<b.id?-1:1);
    return makeView(data,{levelIndex:L,points,clusters,relationships,bundles,focus:focus||null});
  }

  function makeView(data, view){
    const visible=[...view.points,...view.clusters];
    const byKey=new Map([...view.points.map(p=>[keyOf('point',p.id),p]),...view.clusters.map(c=>[keyOf('cluster',c.id),c])]);
    const representsPoint=new Map();
    for(const point of view.points) representsPoint.set(point.id,{kind:'point',id:point.id});
    for(const cluster of view.clusters) for(const id of cluster.pointIds) representsPoint.set(id,{kind:'cluster',id:cluster.id});
    const representsRel=new Map();
    for(const rel of view.relationships) representsRel.set(rel.id,{kind:'relationship',id:rel.id});
    for(const bundle of view.bundles) for(const id of bundle.relationshipIds) representsRel.set(id,{kind:'bundle',id:bundle.id});
    return {...view,diagnostics:data.diagnostics,visiblePoints:visible,byKey,bundleMap:new Map(view.bundles.map(b=>[b.id,b])),representsPoint,representsRel};
  }

  function degreeMap(data){
    const degree=new Map();
    for(const rel of data.relationships){
      if(rel.status!=='drawable') continue;
      degree.set(rel.source,(degree.get(rel.source)||0)+1);
      if(!rel.selfLink) degree.set(rel.target,(degree.get(rel.target)||0)+1);
    }
    return degree;
  }

  const prefersReducedMotion=()=>!!(global.matchMedia&&global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let instanceCounter=0;

  class HGSpatialDefaultView {
    constructor(options){
      if(!options||!options.container) throw new TypeError('container is required');
      this.uid=++instanceCounter;
      this.config=options.config||copy(BUILTIN);
      this.publicBoundary=!!options.config;
      this.container=options.container;
      this.onEvent=typeof options.onEvent==='function'?options.onEvent:()=>{};
      this.history=[];
      this.focus=null;
      this.selection=null;
      this.levelIndex=null;
      this.lastTap=null;
      this.stats={};
      this.destroyed=false;
      this.mode=null;
      this.controls=makeChrome(this.container,this);
      this.setData(options,options.mode||'auto');
      this.adapter=createAdapter(this);
      this.render({camera:'fit'});
    }
    setData(input,requestedMode){
      const t0=now();
      // Axis descriptions persist across data replacement unless new ones are supplied.
      if(input&&input.axes!==undefined) this.axesInput=input.axes;
      this.data=normalize(input);
      this.data.publicIdentity=this.publicBoundary;
      this.data.axes=normalizeAxes(this.axesInput);
      this.dataVersion=(this.dataVersion||0)+1;
      this.degree=degreeMap(this.data);
      this.mode=defaultMode(this.data,requestedMode);
      this.rebuildModel();
      this.stats.modelMs=now()-t0;
    }
    rebuildModel(){
      this.frame=frame(this.data.points,1,this.mode==='3d'?3:2,this.config.view.aspect==='equal');
      // Hash prefix preserves baseline ordering; exact membership suffix prevents collision ambiguity.
      this.frame.publicIdentity=this.publicBoundary;
      this.hierarchy=buildHierarchy(this.data.points,this.frame);
      this.focusHierarchy=null;
      if(this.focus) this.focusHierarchy=buildHierarchy(this.focus.pointIds.map(id=>this.data.pointMap.get(id)).filter(Boolean),this.frame);
    }
    lodScale(){return this.adapter.lodScale*(this.config.lod.density==='coarser'?.5:this.config.lod.density==='finer'?2:1);}
    palette(){if(this.paletteConfig===this.config)return this.cachedPalette;this.paletteConfig=this.config;return this.cachedPalette={...COLORS,...this.config.theme,incident:this.config.theme.related,tick:this.config.theme.muted,axisName:this.config.theme.text===BUILTIN.theme.text?COLORS.axisName:this.config.theme.text,point:this.config.points.color,edge:this.config.relationships.color,cluster:this.config.clusters.color,bundle:this.config.bundles.color};}
    pointSize(p){return p&&p.style&&p.style.size||this.config.points.size;}
    clusterSize(c){return this.config.clusters.size==='auto'?clusterPx(c.count):this.config.clusters.size;}
    edgeWidth(r){return r&&r.style&&r.style.width|| (this.config.relationships.width==='auto'?1.4:this.config.relationships.width);}
    bundleWidth(b){return this.config.bundles.width==='auto'?bundlePx(b.count):this.config.bundles.width;}
    reducedMotion(){return this.config.accessibility.reducedMotion==='always'||prefersReducedMotion();}
    userAction(source,reason,fn){return this.publicAction?this.publicAction(source,reason,fn):fn();}
    scopeHierarchy(){return this.focus&&this.focusHierarchy?this.focusHierarchy:this.hierarchy;}
    scopePoints(){return this.focus?this.focus.pointIds.map(id=>this.data.pointMap.get(id)).filter(Boolean):this.data.points;}
    // camera: 'fit' | 'keep' | 'auto' (fit unless the user moved the camera) | {restore}
    render(opts){
      if(this.destroyed) return;
      const t0=now();
      opts=opts||{camera:'keep'};
      this.adapter.applyCamera(opts);
      this.levelIndex=chooseLevel(this.scopeHierarchy(),this.adapter.ppu()*this.lodScale(),opts.camera==='keep'?this.levelIndex:null);
      this.view=this.buildView(this.levelIndex);
      this.adapter.draw(this.view);
      this.adapter.highlight(this.visibleSelection(),this.incidentIds());
      this.updateChrome();
      this.adapter.requestFrame();
      this.stats.renderMs=now()-t0;
      this.emitView();
    }
    buildView(L){
      const view=aggregate(this.data,this.scopeHierarchy(),L,this.focus,this.config.lod.bundleBy);
      view.level=this.levelName(view);
      view.context=this.contextPoints();
      return view;
    }
    // Inside a focus, the rest of the data stays as faint, non-interactive context dots (a deterministic sample
    // when there are very many) so the focused members keep their place in the whole.
    contextPoints(){
      const f=this.focus;
      if(!f) return [];
      if(!f.context){
        const inside=new Set(f.pointIds),rest=this.data.points.filter(p=>!inside.has(p.id));
        const step=Math.max(1,Math.ceil(rest.length/DEFAULTS.contextMax));
        f.context=step===1?rest:rest.filter((p,i)=>i%step===0);
      }
      return f.context;
    }
    // Independent x/y scaling (up to maxStretch) is allowed in 2D only when the axes do not share one unit:
    // temporal axes, different units, or data whose axes were already rescaled. Commensurate spatial axes
    // (the default when nothing is described) keep their true aspect.
    stretchAllowed(){
      const a=this.data.axes;
      return this.config.view.aspect!=='equal'&&this.mode==='2d'&&(this.frame.adjusted||a.x.format!=='number'||a.y.format!=='number'||a.x.unit!==a.y.unit);
    }
    levelName(view){
      view=view||this.view;
      if(this.focus) return 'focus';
      if(!view||this.levelIndex>=this.hierarchy.detail) return 'detail';
      return this.zoomRatio()<=1.3?'overview':'mid';
    }
    zoomRatio(){return this.adapter.ppu()/(this.adapter.fitPpu('all')||1);}
    // Called by the adapter (coalesced per animation frame) after any camera or size change.
    onCamera(){
      if(this.destroyed||!this.view) return;
      const ppu=this.adapter.ppu();
      // Zooming well out of a focus (pinch, wheel or buttons alike) leaves it where the camera already is, with
      // no snap back to the saved camera; Back is the way to return to the previous framing exactly.
      if(this.focus&&!this.adapter.animating&&ppu/(this.adapter.fitPpu('scope')||ppu)<DEFAULTS.focusExitRatio){this.back({keepCamera:true});return;}
      const L=chooseLevel(this.scopeHierarchy(),ppu*this.lodScale(),this.levelIndex);
      if(L!==this.levelIndex){
        const t0=now();
        this.levelIndex=L;
        this.view=this.buildView(L);
        this.adapter.draw(this.view);
        this.adapter.highlight(this.visibleSelection(),this.incidentIds());
        this.updateChrome();
        this.stats.lodMs=now()-t0;
        this.emitView();
      }else{
        const name=this.levelName();
        if(name!==this.view.level){this.view.level=name;this.updateStatus();}
        if(this.publicBoundary)this.emitView();else this.emitViewSoon();
      }
    }
    emitView(){clearTimeout(this.viewTimer);this.emit('view',{mode:this.mode,level:this.view.level,levelIndex:this.levelIndex,zoom:this.zoomRatio(),focus:this.focus?this.focus.id:null});}
    emitViewSoon(){clearTimeout(this.viewTimer);this.viewTimer=setTimeout(()=>{if(!this.destroyed)this.emitView();},150);}
    emit(type,payload,extra){
      try{this.onEvent({type,payload,selection:this.selection?copy(this.selection):null,...(extra||{})});}
      catch(error){if(global.console)global.console.error('HG Spatial onEvent handler failed',error);}
    }
    // Screen tap from an adapter; `direct` is an engine hit, if any, preferred when it is also within tolerance.
    handleTap(x,y,direct){
      if(!this.config.interaction.selection) return;
      const hits=pickAt(this.adapter.candidates(),x,y,this.config.accessibility.targetSize==='large'?28:DEFAULTS.hitPx);
      if(direct){const i=hits.findIndex(h=>h.kind===direct.kind&&h.id===direct.id);if(i>0)hits.unshift(hits.splice(i,1)[0]);}
      const t=now(),last=this.lastTap,near=last&&Math.hypot(last.x-x,last.y-y)<=DEFAULTS.doubleTapPx;
      if(!hits.length){this.lastTap=null;this.clearSelection();return;}
      let target=hits[0];
      if(near&&t-last.t<=DEFAULTS.doubleTapMs&&last.key===keyOf(target.kind,target.id)){this.lastTap=null;this.activate();return;}
      // Repeated taps on a spot with overlapping objects cycle through them.
      if(near&&hits.length>1&&this.selection&&hits.some(h=>h.kind===this.selection.kind&&h.id===this.selection.id)){
        const i=hits.findIndex(h=>h.kind===this.selection.kind&&h.id===this.selection.id);
        target=hits[(i+1)%hits.length];
      }
      this.lastTap={x,y,t,key:keyOf(target.kind,target.id)};
      this.select(target.kind,target.id,{source:'pointer',overlapping:hits.length});
    }
    // Enter / double-tap: drill into an aggregate, or bring an original object into individual view.
    activate(){
      if(!this.config.interaction.focus) return;
      const s=this.selection;
      if(!s){this.moveSelection(0,0);return;}
      if(s.kind==='cluster'||s.kind==='bundle') this.focusSelection();
      else this.reveal();
    }
    select(kind,id,meta){
      const item=this.lookup(kind,id);
      if(!item) return;
      const originalIds=kind==='cluster'?item.pointIds:kind==='bundle'?item.relationshipIds:[item.id];
      this.selection={kind,id:item.id,originalIds:unique(originalIds),item:copy(item)};
      this.selection.representedBy=this.representation();
      this.adapter.highlight(this.visibleSelection(),this.incidentIds());
      this.updateChrome();
      this.announce(this.selectionTitle());
      this.emit('select',this.selection,meta?{source:meta.source}:null);
    }
    clearSelection(){
      if(!this.selection) return;
      this.selection=null;
      this.adapter.highlight([],[]);
      this.updateChrome();
      this.announce('Selection cleared');
      this.emit('select',null);
    }
    // Visible objects that currently represent the selection (aggregates may stand in for originals).
    visibleSelection(){
      const s=this.selection,v=this.view;
      if(!s||!v) return [];
      if(s.kind==='cluster'&&v.byKey.has(keyOf('cluster',s.id))) return [{kind:'cluster',id:s.id}];
      if(s.kind==='bundle'&&v.bundles.some(b=>b.id===s.id)) return [{kind:'bundle',id:s.id}];
      const map=s.kind==='point'||s.kind==='cluster'?v.representsPoint:v.representsRel;
      const out=new Map();
      for(const id of s.originalIds){const r=map.get(id);if(r)out.set(keyOf(r.kind,r.id),r);}
      return [...out.values()];
    }
    representation(){return this.visibleSelection().map(r=>keyOf(r.kind,r.id));}
    incidentIds(){
      const s=this.selection;
      if(!s||s.kind!=='point'||!this.view||!this.view.representsPoint.has(s.id)||this.view.representsPoint.get(s.id).kind!=='point') return [];
      return (this.data.incident.get(s.id)||[]).map(id=>this.view.representsRel.get(id)).filter(Boolean);
    }
    lookup(kind,id){
      id=asId(id);
      if(kind==='point') return this.data.pointMap.get(id);
      if(kind==='relationship') return this.data.relationshipMap.get(id);
      if(!this.view) return null;
      if(kind==='cluster') return this.view.byKey.get(keyOf(kind,id));
      if(kind==='bundle') return this.view.bundleMap.get(id);
      return null;
    }
    focusSelection(){
      const selected=this.selection;
      if(!selected||(selected.kind!=='cluster'&&selected.kind!=='bundle')) return;
      let pointIds,relationshipIds=[];
      if(selected.kind==='cluster') pointIds=selected.originalIds;
      else{
        relationshipIds=selected.originalIds;
        pointIds=unique(relationshipIds.flatMap(id=>{const rel=this.data.relationshipMap.get(id);return rel?[rel.source,rel.target]:[];}));
      }
      this.history.push({focus:this.focus,focusHierarchy:this.focusHierarchy,levelIndex:this.levelIndex,selection:this.selection,camera:this.adapter.saveCamera(),dataView:this.adapter.saveDataView()});
      this.focus={kind:selected.kind,id:selected.id,pointIds,relationshipIds,count:selected.originalIds.length};
      this.focusHierarchy=buildHierarchy(pointIds.map(id=>this.data.pointMap.get(id)).filter(Boolean),this.frame);
      this.render({camera:'fit',animate:true});
      this.announce(`Focused ${selected.kind} of ${selected.originalIds.length}. Back returns.`);
    }
    back(opts){
      const keep=!!(opts&&opts.keepCamera);
      const previous=this.history.pop();
      if(!previous){if(this.focus)this.leaveFocus(keep);return;}
      this.focus=previous.focus;
      this.focusHierarchy=previous.focusHierarchy;
      // A selection made inside the focus is kept when it still exists; otherwise the pre-focus one returns.
      this.selection=resolveSelection(this.selection,this.data)||resolveSelection(previous.selection,this.data);
      this.levelIndex=keep?null:previous.levelIndex;
      this.render(keep?{camera:'keep'}:{camera:previous.camera?{restore:previous.camera}:previous.dataView?{dataView:previous.dataView}:'fit',animate:true});
      this.announce(this.focus?`Back to focused ${this.focus.kind}`:'Back to full view');
    }
    leaveFocus(keep){this.focus=null;this.focusHierarchy=null;this.history=[];this.render(keep?{camera:'keep'}:{camera:'fit',animate:true});}
    // Fit frames the current scope (the focus, or all data) and keeps selection, focus and Back history.
    fit(){this.render({camera:'fit',animate:true});}
    // Reset returns to the initial state: all data, fitted, nothing selected, no history.
    reset(){this.selection=null;this.focus=null;this.focusHierarchy=null;this.history=[];this.render({camera:'fit',animate:true});this.emit('select',null,{reason:'reset'});}
    // Bring the selected original point/relationship into view as an individual object.
    reveal(){
      const s=this.selection;
      if(!s) return;
      const ids=s.kind==='relationship'?(()=>{const r=this.data.relationshipMap.get(s.id);return r?[r.source,r.target]:[];})():s.kind==='point'?[s.id]:[];
      const pts=ids.map(id=>this.data.pointMap.get(id)).filter(Boolean);
      if(!pts.length) return;
      if(this.focus&&!pts.every(p=>this.focus.pointIds.includes(p.id))) {this.focus=null;this.focusHierarchy=null;this.history=[];}
      const h=this.scopeHierarchy();
      let level=h.detail;
      for(let L=0;L<=h.detail;L++){const m=pointMapFor(h,L);if(ids.every(id=>m.get(id)&&m.get(id).kind==='point')){level=L;break;}}
      this.adapter.centerOn(pts,Math.max(this.adapter.ppu(),ppuForLevel(level)/this.lodScale()));
    }
    zoomBy(factor){this.adapter.zoomBy(factor);}
    // Explicit zoom request relative to the whole-data fit (development control). Leaves focus.
    setZoom(ratio){
      ratio=clamp(Number(ratio)||1,DEFAULTS.minZoomRatio,4096);
      if(this.focus){this.focus=null;this.focusHierarchy=null;this.history=[];}
      this.adapter.zoomToRatio(ratio);
    }
    // Keyboard spatial navigation between visible nodes.
    moveSelection(dx,dy){
      if(!this.config.interaction.selection) return;
      const cands=this.adapter.candidates().filter(c=>!c.pts);
      if(!cands.length) return;
      const rep=this.visibleSelection()[0];
      const from=rep&&cands.find(c=>c.kind===rep.kind&&c.id===rep.id);
      const {w,h}=this.adapter.size();
      let next;
      if(!from) next=cands.reduce((best,c)=>{const d=Math.hypot(c.x-w/2,c.y-h/2);return !best||d<best.d?{c,d}:best;},null).c;
      else next=nearestInDirection(cands,from,dx,dy);
      if(!next) return;
      this.select(next.kind,next.id,{source:'keyboard'});
      if(next.x<0||next.y<0||next.x>w||next.y>h) this.adapter.panToScreen(next.x,next.y);
    }
    setMode(mode){
      if(mode!==this.mode){
        this.mode=mode;
        this.adapter.destroy();
        this.controls.surface.replaceChildren();
        this.controls.labels.replaceChildren();
        this.rebuildModel();
        this.adapter=createAdapter(this);
      }
      this.render({camera:'fit'});
    }
    replaceData(next,reason){
      if(this.destroyed) return;
      const oldSelection=this.selection,oldFocus=this.focus,oldMode=this.mode;
      // A camera the user has moved is kept on the same data coordinates and relative zoom, even when the
      // data bounds (and therefore the scene mapping) change.
      const dataView=this.adapter.autoFit?null:this.adapter.saveDataView();
      this.setData(next,next&&next.mode||this.mode);
      // Keep a focus whose members still exist; otherwise leave it predictably.
      if(oldFocus){
        const ids=oldFocus.pointIds.filter(id=>this.data.pointMap.has(id));
        this.focus=ids.length?{...oldFocus,pointIds:ids,context:null}:null;
        this.history=this.focus?this.history:[];
        this.rebuildModel();
      }
      if(this.mode!==oldMode){const m=this.mode;this.mode=oldMode;this.setMode(m);}
      else this.render({camera:dataView?{dataView}:'fit'});
      const resolved=resolveSelection(oldSelection,this.data,this.view);
      this.selection=resolved;
      if(this.selection) this.selection.representedBy=this.representation();
      this.adapter.highlight(this.visibleSelection(),this.incidentIds());
      this.updateChrome();
      if(oldSelection&&!resolved) this.emit('select',null,{reason:reason||'data-update'});
      else if(resolved&&(resolved.id!==oldSelection.id||resolved.kind!==oldSelection.kind)) this.emit('select',this.selection,{reason:reason||'data-update'});
      this.emit('data',{points:this.data.points.length,relationships:this.data.relationships.length,diagnostics:copy(this.data.diagnostics)});
    }
    applyChanges(changes){
      changes=changes||{};
      const points=new Map(this.data.points.map(p=>[p.id,{...p}]));
      const relationships=new Map(this.data.relationships.map(r=>[r.id,{...r}]));
      for(const id of changes.removePointIds||[]) points.delete(asId(id));
      for(const id of changes.removeRelationshipIds||[]) relationships.delete(asId(id));
      for(const point of changes.points||[]) points.set(asId(point.id),{...points.get(asId(point.id)),...point,id:asId(point.id)});
      for(const rel of changes.relationships||[]) relationships.set(asId(rel.id),{...relationships.get(asId(rel.id)),...rel,id:asId(rel.id)});
      this.replaceData({points:[...points.values()],relationships:[...relationships.values()]},'incremental-update');
    }
    getState(){
      return {mode:this.mode,level:this.view&&this.view.level,levelIndex:this.levelIndex,zoom:this.zoomRatio(),focus:this.focus?{kind:this.focus.kind,id:this.focus.id,pointIds:[...this.focus.pointIds]}:null,
        selection:copy(this.selection),history:this.history.length,visible:this.view?{points:this.view.points.length,clusters:this.view.clusters.length,relationships:this.view.relationships.length,bundles:this.view.bundles.length}:null};
    }
    statusText(){
      const v=this.view;
      if(!this.data.points.length) return 'No points to show';
      const parts=[];
      if(v.clusters.length) parts.push(`${v.clusters.length} cluster${v.clusters.length===1?'':'s'}`);
      if(v.points.length) parts.push(`${v.points.length} point${v.points.length===1?'':'s'}`);
      if(v.bundles.length) parts.push(`${v.bundles.length} bundle${v.bundles.length===1?'':'s'}`);
      if(v.relationships.length) parts.push(`${v.relationships.length} link${v.relationships.length===1?'':'s'}`);
      if(this.focus) return `${this.focus.kind==='cluster'?'Cluster':'Bundle'} of ${this.focus.count} · ${parts.join(' · ')}`;
      if(v.level==='detail'||!v.clusters.length) return parts.join(' · ');
      return `${v.level==='overview'?'Overview':'Zoomed in'} · ${parts.join(' · ')}`;
    }
    selectionTitle(){
      const s=this.selection;
      if(!s) return '';
      if(s.kind==='point') return `Point ${this.data.pointMap.get(s.id)?this.data.pointMap.get(s.id).label:s.id}`;
      if(s.kind==='relationship') return `Relationship ${this.data.relationshipMap.get(s.id)?this.data.relationshipMap.get(s.id).label:s.id}`;
      if(s.kind==='cluster') return `Cluster of ${s.originalIds.length} points`;
      return `Bundle of ${s.originalIds.length} relationship${s.originalIds.length===1?'':'s'}`;
    }
    announce(text){if(this.controls&&text){this.controls.live.textContent='';this.controls.live.textContent=text;}}
    updateStatus(){
      const c=this.controls;
      c.statusText.textContent=this.statusText();
      c.back.hidden=!this.focus;
    }
    updateChrome(){
      if(this.destroyed||!this.controls||!this.view) return;
      this.updateStatus();
      renderInspector(this);
      this.configureChrome();
      const c=this.controls;
      if(c.message.dataset.engine) c.message.hidden=false;
      else if(this.data.points.length) c.message.hidden=true;
      else{
        c.message.hidden=false;
        const skipped=this.data.diagnostics.filter(d=>d.code==='invalid-point'||d.kind==='invalid-point'||d.kind==='duplicate-point').length;
        c.message.replaceChildren(el('strong','','No points to show'),el('span','',skipped?`${skipped} record${skipped===1?' was':'s were'} skipped (missing ID or x/y). See Data notes.`:'Supply points with an id and numeric x and y.'));
      }
    }
    configureChrome(){
      const c=this.controls,o=this.config,p=this.palette();
      c.stage.setAttribute('aria-label',o.accessibility.label);
      c.stage.style.background=p.background;c.stage.style.color=p.text;c.inspector.style.color=p.text;
      c.toolbar.hidden=!o.controls.visible;c.zoomIn.hidden=c.zoomOut.hidden=!o.controls.zoom;
      c.zoomIn.disabled=c.zoomOut.disabled=!o.interaction.zoom;
      c.fit.hidden=!o.controls.fit;c.reset.hidden=!o.controls.reset;c.statusText.hidden=!o.controls.status;
      c.selection.hidden=!o.inspection.visible;c.legend.hidden=!o.legend.visible||!legendKeys(this).length;
      if(c.grid)c.grid.hidden=!o.axes.grid;
      for(const b of [c.back,c.zoomIn,c.zoomOut,c.fit,c.reset]){
        b.style.minHeight=o.accessibility.targetSize==='large'?'44px':'';
        b.style.minWidth=o.accessibility.targetSize==='large'?'44px':'';
      }
    }
    showEngineProblem(label,engineName,url,state,error){
      const c=this.controls;
      c.message.hidden=false;
      c.message.dataset.engine=state;
      if(state==='loading'){c.message.replaceChildren(el('strong','',`Loading the ${label} view…`));return;}
      const retry=button('Try again');
      retry.addEventListener('click',()=>this.userAction('control','renderer',()=>{const dataView=this.adapter.autoFit?null:this.adapter.saveDataView();delete c.message.dataset.engine;c.message.hidden=true;this.adapter.failed=false;this.render({camera:dataView?{dataView}:'fit'});}));
      const detail=el('span','',error?`${engineName} could not start: ${error.message||error}. The records remain listed in the details panel.`:`${engineName} did not load, so the drawing is unavailable. The records remain listed in the details panel.`);
      c.message.replaceChildren(el('strong','',`${label} view unavailable`),detail,el('small','',`Dependency: ${url}`),retry);
    }
    clearEngineProblem(){const c=this.controls;if(c.message.dataset.engine){delete c.message.dataset.engine;c.message.hidden=!!this.data.points.length;}}
    destroy(){
      if(this.destroyed) return;
      this.destroyed=true;
      clearTimeout(this.viewTimer);
      this.adapter.destroy();
      if(this.controls.dispose) this.controls.dispose();
      this.container.replaceChildren();
      this.container.classList.remove('hg-default-shell','hg-public-shell');
    }
  }

  // Selection continuity across data changes: originals persist by ID; an aggregate is remapped when the
  // current view has an aggregate with exactly the same surviving membership, otherwise it is cleared.
  function resolveSelection(selection,data,view){
    if(!selection) return null;
    if(selection.kind==='point'){const p=data.pointMap.get(selection.id);return p?{...selection,item:copy(p)}:null;}
    if(selection.kind==='relationship'){const r=data.relationshipMap.get(selection.id);return r?{...selection,item:copy(r)}:null;}
    const valid=selection.originalIds.filter(id=>selection.kind==='cluster'?data.pointMap.has(id):data.relationshipMap.has(id));
    if(!valid.length) return null;
    if(!view) return {...selection,originalIds:valid};
    const key=JSON.stringify(valid);
    const match=selection.kind==='cluster'?view.clusters.find(c=>JSON.stringify(c.pointIds)===key):view.bundles.find(b=>JSON.stringify(b.relationshipIds)===key);
    if(match) return {kind:selection.kind,id:match.id,originalIds:valid,item:copy(match)};
    if(valid.length===selection.originalIds.length&&valid.length===1) return {kind:selection.kind==='cluster'?'point':'relationship',id:valid[0],originalIds:valid,item:copy(selection.kind==='cluster'?data.pointMap.get(valid[0]):data.relationshipMap.get(valid[0]))};
    return null;
  }

  function createAdapter(viewer){return viewer.mode==='3d'?new BabylonAdapter(viewer):new CytoscapeAdapter(viewer);}

  const STYLE_ID='hg-spatial-default-style';
  const CSS=[
    '.hg-default-shell{display:flex;flex-direction:column;gap:6px;min-height:320px;height:100%;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}',
    '.hg-public-shell{min-height:0}.hg-public-shell .hg-stage{min-height:0}',
    // The stage owns every gesture on it: no page pinch-zoom, double-tap zoom, scroll chaining, text selection or callouts.
    '.hg-stage{position:relative;flex:1 1 auto;min-height:240px;overflow:hidden;background:#fbfcfe;border:1px solid #d5dbe5;border-radius:8px;outline:none;touch-action:none;overscroll-behavior:contain;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}',
    '.hg-stage:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px #2f5fb3}',
    '.hg-grid,.hg-surface,.hg-labels{position:absolute;inset:0}',
    '.hg-grid{pointer-events:none;width:100%;height:100%}',
    '.hg-surface{touch-action:none}',
    '.hg-surface canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}',
    '.hg-labels{pointer-events:none;overflow:hidden}',
    '.hg-label{position:absolute;left:0;top:0;white-space:nowrap;padding:0 3px;border-radius:3px;background:rgba(255,255,255,.86);color:#1f2937;font:500 12px/16px system-ui,-apple-system,"Segoe UI",sans-serif;will-change:transform}',
    '.hg-label.hg-on{font-weight:700;background:#fff;box-shadow:0 0 0 1.5px #d6336c;z-index:2}',
    '.hg-count{position:absolute;left:0;top:0;color:#fff;font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:none;will-change:transform}',
    '.hg-edge-count{position:absolute;left:0;top:0;padding:0 3px;border-radius:3px;background:rgba(251,252,254,.92);color:#4a5568;font:600 11px/15px system-ui,-apple-system,"Segoe UI",sans-serif;will-change:transform}',
    '.hg-tick{position:absolute;left:0;top:0;color:#6b7485;font:10px/12px system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;will-change:transform}',
    '.hg-tick.hg-axis-name{color:#3f4a5c;font:600 11px/13px system-ui,-apple-system,"Segoe UI",sans-serif;background:rgba(251,252,254,.9);padding:0 2px;border-radius:2px}',
    // One row of chrome along the top: Back, status and data warnings on the left, view controls on the right.
    '.hg-top{position:absolute;left:6px;top:6px;right:6px;display:flex;align-items:flex-start;gap:6px;pointer-events:none}',
    '.hg-lead{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px}',
    '.hg-status{min-width:0;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,.9);color:#3f4a5c;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hg-back,.hg-toolbar,.hg-warn{pointer-events:auto;flex:0 0 auto}',
    '.hg-toolbar{display:flex;gap:4px}',
    '.hg-default-shell button{min-height:32px;min-width:40px;padding:0 9px;border:1px solid #c3cbd8;border-radius:6px;background:rgba(255,255,255,.96);color:#1f2937;font:13px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}',
    '.hg-default-shell button:hover{border-color:#8d99ab}',
    '.hg-default-shell button:focus-visible{outline:2px solid #2f5fb3;outline-offset:1px}',
    '.hg-default-shell button:disabled{color:#98a1b0;cursor:default}',
    '.hg-toolbar button{padding:0 8px}',
    '.hg-default-shell button.hg-warn{min-width:0;padding:0 7px;border-color:#e8c48f;background:#fff5e6;color:#9a4a06;font-size:12px}',
    '.hg-message{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:6px;width:min(320px,calc(100% - 40px));padding:12px;border-radius:8px;background:rgba(255,255,255,.95);border:1px solid #d5dbe5;color:#374151;text-align:center;overflow-wrap:anywhere}',
    '.hg-message small{color:#6b7485}',
    '.hg-inspector{flex:0 0 auto;max-height:36vh;overflow:auto;padding:6px 10px;background:#fff;border:1px solid #d5dbe5;border-radius:8px;overflow-wrap:anywhere}',
    '.hg-inspector .hg-hint{color:#556074}',
    '.hg-inspector .hg-warning{color:#9a4a06}',
    '.hg-facts{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;margin:4px 0}',
    '.hg-facts dt{color:#556074;white-space:nowrap}',
    '.hg-facts dd{margin:0;color:#1f2937;min-width:0}',
    '.hg-inspector h4{margin:6px 0 0;font-size:12px;font-weight:600;color:#3f4a5c}',
    '.hg-actions{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px}',
    '.hg-list{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;padding:0;list-style:none}',
    '.hg-list button{min-height:30px;min-width:0;font-size:12px;border-color:#d5dbe5}',
    '.hg-legend{display:flex;flex-wrap:wrap;gap:2px 10px;margin:6px 0 0;padding:4px 0 0;border-top:1px solid #eef1f5;list-style:none;color:#556074;font-size:11px}',
    '.hg-legend li{display:flex;align-items:center;gap:4px;white-space:nowrap}',
    '.hg-legend svg{width:22px;height:12px;flex:0 0 auto}',
    '.hg-more{display:flex;flex-wrap:wrap;gap:0 14px}',
    '.hg-more>details{flex:1 1 180px;min-width:0}',
    '.hg-inspector details{margin-top:4px;color:#445066}',
    '.hg-inspector summary{cursor:pointer;min-height:24px}',
    '.hg-inspector ul.hg-notes{margin:4px 0 0;padding-left:18px}',
    '.hg-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    '[hidden]{display:none!important}',
    '@media (pointer:coarse){.hg-default-shell button{min-height:40px}.hg-toolbar button{min-width:44px}.hg-list button{min-height:36px}}',
    '@media (max-width:420px){.hg-toolbar button{padding:0 6px}.hg-toolbar{gap:3px}}',
    '@media (min-width:900px){.hg-default-shell{flex-direction:row}.hg-inspector{flex:0 0 300px;max-height:none}}'
  ].join('\n');
  function injectStyle(){
    const doc=global.document;
    if(!doc||!doc.head||typeof doc.getElementById!=='function'||doc.getElementById(STYLE_ID)) return;
    const style=doc.createElement('style');
    style.id=STYLE_ID;
    style.textContent=CSS;
    doc.head.append(style);
  }

  // Consumer-facing chrome: the view with one top row (Back, status, data warnings | zoom, Fit, Reset) and the
  // inspector (selection details, legend, browse list, data notes). Development-only controls (data updates,
  // explicit LOD, dataset switching) belong to the host page.
  function makeChrome(container,viewer){
    injectStyle();
    container.classList.add('hg-default-shell');if(viewer.publicBoundary)container.classList.add('hg-public-shell');
    container.replaceChildren();
    const helpId=`hg-help-${viewer.uid}`;
    const stage=el('div','hg-stage');
    stage.tabIndex=0;
    stage.setAttribute('role','application');
    stage.setAttribute('aria-roledescription','spatial data view');
    stage.setAttribute('aria-label','Spatial data view');
    stage.setAttribute('aria-describedby',helpId);
    const grid=svgEl('svg');
    if(grid){grid.setAttribute('class','hg-grid');grid.setAttribute('aria-hidden','true');}
    const surface=el('div','hg-surface');
    const labels=el('div','hg-labels');
    labels.setAttribute('aria-hidden','true');
    const top=el('div','hg-top'),lead=el('div','hg-lead');
    const back=button('← Back');
    back.className='hg-back';
    back.hidden=true;
    back.setAttribute('aria-label','Back to the previous view');
    const statusText=el('div','hg-status');
    const warn=button('');
    warn.className='hg-warn';
    warn.hidden=true;
    lead.append(back,statusText,warn);
    const toolbar=el('div','hg-toolbar');
    toolbar.setAttribute('role','toolbar');
    toolbar.setAttribute('aria-label','View controls');
    const zoomIn=button('+'),zoomOut=button('−'),fit=button('Fit'),reset=button('Reset');
    zoomIn.setAttribute('aria-label','Zoom in');zoomOut.setAttribute('aria-label','Zoom out');
    fit.setAttribute('aria-label','Fit the current view');fit.title='Fit the current view (keeps selection and focus)';
    reset.setAttribute('aria-label','Reset to the full view and clear the selection');reset.title='Reset view and selection';
    toolbar.append(zoomIn,zoomOut,fit,reset);
    top.append(lead,toolbar);
    const message=el('div','hg-message');
    message.hidden=true;
    message.setAttribute('role','status');
    const help=el('div','hg-sr','Arrow keys move between visible objects. Enter drills into a cluster or bundle, or zooms to a point. Escape clears the selection, then goes back. Plus and minus zoom; F fits the view.');
    help.id=helpId;
    const live=el('div','hg-sr');
    live.setAttribute('aria-live','polite');
    stage.append(...(grid?[grid]:[]),surface,labels,top,message,help,live);
    const inspector=el('section','hg-inspector');
    inspector.setAttribute('aria-label','Selection details');
    const selection=el('div','hg-selection');
    const legend=el('ul','hg-legend');
    legend.setAttribute('aria-label','Legend');
    const more=el('div','hg-more');
    const browse=el('details','hg-browse');
    const browseSummary=el('summary','','Browse visible objects');
    const browseList=el('ul','hg-list');
    browse.append(browseSummary,browseList);
    const details=el('details','hg-data');
    const dataSummary=el('summary','');
    const dataNotes=el('ul','hg-notes');
    details.append(dataSummary,dataNotes);
    more.append(browse,details);
    inspector.append(selection,legend,more);
    container.append(stage,inspector);
    back.addEventListener('click',()=>viewer.userAction('control','back',()=>viewer.back()));
    warn.addEventListener('click',()=>{details.open=true;if(details.scrollIntoView)details.scrollIntoView({block:'nearest'});if(dataSummary.focus)dataSummary.focus();});
    zoomIn.addEventListener('click',()=>viewer.config.interaction.zoom&&viewer.userAction('control','zoom',()=>viewer.zoomBy(1.6)));
    zoomOut.addEventListener('click',()=>viewer.config.interaction.zoom&&viewer.userAction('control','zoom',()=>viewer.zoomBy(1/1.6)));
    fit.addEventListener('click',()=>viewer.userAction('control','fit',()=>viewer.fit()));
    reset.addEventListener('click',()=>viewer.userAction('control','reset',()=>viewer.reset()));
    browse.addEventListener('toggle',()=>renderInspector(viewer));
    // Older iOS Safari starts a page pinch-zoom from gesture events even when touch-action is none.
    stage.addEventListener('gesturestart',event=>event.preventDefault());
    stage.addEventListener('keydown',event=>{
      // Keys reach the view from the stage itself or from the drawing surface (a 3D canvas keeps focus after a
      // tap so its multi-touch gestures are not interrupted); chrome buttons keep their own keys.
      if(!(event.target===stage||within(event.target,surface))||event.altKey||event.ctrlKey||event.metaKey) return;
      const k=event.key;
      const actions={
        ArrowLeft:()=>viewer.moveSelection(-1,0),ArrowRight:()=>viewer.moveSelection(1,0),ArrowUp:()=>viewer.moveSelection(0,-1),ArrowDown:()=>viewer.moveSelection(0,1),
        Enter:()=>viewer.activate(),' ':()=>viewer.activate(),
        Escape:()=>{if(viewer.selection)viewer.clearSelection();else viewer.back();},Backspace:()=>viewer.back(),
        '+':()=>viewer.zoomBy(1.25),'=':()=>viewer.zoomBy(1.25),'-':()=>viewer.zoomBy(.8),f:()=>viewer.fit(),F:()=>viewer.fit(),'0':()=>viewer.fit()
      };
      if(!actions[k]) return;
      event.preventDefault();
      if(['+','=','-'].includes(k)&&!viewer.config.interaction.zoom)return;
      const reason=['Enter',' '].includes(k)?(viewer.selection&&['cluster','bundle'].includes(viewer.selection.kind)?'focus':'reveal'):k==='Backspace'?'back':k==='Escape'?(viewer.selection?'clear':'back'):['+','=','-'].includes(k)?'zoom':['f','F','0'].includes(k)?'fit':'select';
      if(k==='Escape'&&viewer.selection&&!viewer.config.interaction.selection)return;
      viewer.userAction('keyboard',reason,actions[k]);
    });
    return {stage,grid,surface,labels,top,lead,statusText,warn,toolbar,message,live,inspector,selection,legend,browse,browseSummary,browseList,details,dataSummary,dataNotes,back,zoomIn,zoomOut,fit,reset,viewport:surface};
  }
  function within(node,root){for(let n=node;n;n=n.parentNode||n.parent) if(n===root) return true;return false;}
  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;}
  function svgEl(tag){const doc=global.document;return doc&&typeof doc.createElementNS==='function'?doc.createElementNS('http://www.w3.org/2000/svg',tag):null;}
  function button(label){const node=el('button','',label);node.type='button';return node;}

  function objectButton(viewer,kind,id,text){
    const b=button(text);
    b.addEventListener('click',()=>viewer.userAction('control','select',()=>{if(!viewer.config.interaction.selection)return;viewer.select(kind,id,{source:'list'});if(viewer.config.interaction.focus&&(kind==='point'||kind==='relationship'))viewer.reveal();}));
    return wrapLi(b);
  }
  function wrapLi(node){const li=el('li','');li.append(node);return li;}
  function limitedList(viewer,kind,ids,textFor){
    const list=el('ul','hg-list'),limit=DEFAULTS.listLimit;
    for(const id of ids.slice(0,limit)) list.append(objectButton(viewer,kind,id,textFor(id)));
    const rest=ids.length-limit;
    const out=[list];
    if(rest>0&&viewer.publicBoundary){
      let offset=0;
      const previous=button('Previous constituents'),next=button('Next constituents'),status=el('span','hg-hint');
      const show=()=>{list.replaceChildren(...ids.slice(offset,offset+limit).map(id=>objectButton(viewer,kind,id,textFor(id))));previous.disabled=offset===0;next.disabled=offset+limit>=ids.length;status.textContent=`${offset+1}–${Math.min(offset+limit,ids.length)} of ${ids.length}`;};
      previous.addEventListener('click',()=>{offset=Math.max(0,offset-limit);show();});
      next.addEventListener('click',()=>{offset=Math.min(Math.floor((ids.length-1)/limit)*limit,offset+limit);show();});
      show();out.push(previous,status,next);
    }else if(rest>0) out.push(el('div','hg-hint',`…and ${rest} more. Focus or zoom in to explore them.`));
    return out;
  }

  function facts(rows){
    const dl=el('dl','hg-facts');
    for(const [k,v,cls] of rows){dl.append(el('dt','',k));dl.append(el('dd',cls||'',v));}
    return dl;
  }
  function rangeText(axis,lo,hi){return lo===hi?axisValue(axis,lo):`${axisValue(axis,lo)} – ${axisValue(axis,hi)}`;}
  // Summary of consumer fields across the members of an aggregate: numeric ranges, the few most common values
  // of text fields, or the number of distinct values. Purely descriptive; no field is given a meaning.
  function memberFieldRows(meta,ids){
    const fields=new Map();
    for(const id of ids) for(const [k,v] of meta.get(id)||[]){if(!fields.has(k))fields.set(k,new Map());const m=fields.get(k);m.set(v,(m.get(v)||0)+1);}
    const out=[];
    for(const [k,m] of fields){
      if(out.length>=6) break;
      const values=[...m.keys()],nums=values.map(Number);
      let text;
      if(values.every((v,i)=>v!==''&&finite(nums[i]))){const lo=nums.reduce((a,b)=>a<b?a:b),hi=nums.reduce((a,b)=>a>b?a:b);text=lo===hi?formatNumber(lo):`${formatNumber(lo)} – ${formatNumber(hi)}`;}
      else if(values.length<=4) text=[...m].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).map(([v,n])=>`${abbreviate(v,20)} ${n}`).join(' · ');
      else text=`${values.length} different values`;
      out.push([k,text]);
    }
    return out;
  }

  function renderInspector(viewer){
    const c=viewer.controls,s=viewer.selection,data=viewer.data,view=viewer.view,ax=data.axes;
    if(!c||!view) return;
    const nodes=[];
    const pointText=id=>{const p=data.pointMap.get(id);return p?`${abbreviate(p.label,28)}${p.label!==id?` (${abbreviate(id,20)})`:''}`:id;};
    const relText=id=>{const r=data.relationshipMap.get(id);return r?`${abbreviate(r.label,20)}${r.label!==id?` (${abbreviate(id,16)})`:''}: ${abbreviate(r.source,14)} → ${abbreviate(r.target,14)}`:id;};
    const shortPoint=id=>{const p=data.pointMap.get(id);return abbreviate(p?p.label:id,24);};
    const endText=(kind,id)=>{if(kind==='point')return shortPoint(id);const cl=view.clusters.find(x=>x.id===id);return cl?`cluster of ${cl.count}`:'cluster';};
    const fields=rows=>viewer.config.inspection.metadata&&rows&&rows.length?[el('h4','','Data fields'),facts(rows)]:[];
    if(!s){
      nodes.push(el('div','hg-hint',data.points.length?'Tap or use arrow keys to select a point, cluster, relationship or bundle. Pinch, scroll or use + − to zoom; double-tap a cluster to focus it.':'Nothing to select yet.'));
    }else{
      const lines=el('div','hg-lines'),actions=el('div','hg-actions');
      nodes.push(el('strong','',viewer.selectionTitle()));
      if(s.kind==='point'){
        const p=data.pointMap.get(s.id)||s.item,rows=[['ID',p.id]];
        rows.push([ax.x.title,axisValue(ax.x,p.x)],[ax.y.title,axisValue(ax.y,p.y)]);
        if(viewer.mode==='3d'||p.z!==null) rows.push([ax.z.title,p.z===null||p.z===undefined?'missing (drawn at z=0 in 3D)':axisValue(ax.z,p.z),p.z==null?'hg-warning':'']);
        const rep=view.representsPoint.get(p.id);
        if(rep&&rep.kind==='cluster'){const cl=view.clusters.find(x=>x.id===rep.id);if(cl)rows.push(['Cluster',`one of ${cl.count} points grouped at this zoom`]);}
        const rels=data.incident.get(p.id)||[];
        if(rels.length){
          let out=0,inc=0,self=0;
          for(const id of rels){const r=data.relationshipMap.get(id);if(!r)continue;if(r.selfLink)self++;else if(r.source===p.id)out++;else inc++;}
          rows.push(['Links',[out?`${out} outgoing`:'',inc?`${inc} incoming`:'',self?`${self} self-link${self===1?'':'s'}`:''].filter(Boolean).join(' · ')]);
        }
        nodes.push(facts(rows),lines,...fields(data.meta.points.get(p.id)));
        if(rels.length){nodes.push(el('h4','',`Relationships (${rels.length}):`),...limitedList(viewer,'relationship',rels,relText));}
        const zoom=button('Zoom to');zoom.addEventListener('click',()=>viewer.userAction('control','reveal',()=>{if(viewer.config.interaction.focus)viewer.reveal();}));actions.append(zoom);
      }else if(s.kind==='relationship'){
        const r=data.relationshipMap.get(s.id)||s.item;
        nodes.push(facts([['ID',r.id],['From',shortPoint(r.source)],['To',shortPoint(r.target)]]),lines);
        lines.append(el('div','',`Direction: ${r.source} ${r.direction==='both'?'↔':r.direction==='none'?'—':'→'} ${r.target}${r.selfLink?' (self-link)':''}`));
        if(r.status==='absent-endpoint') lines.append(el('div','hg-warning','Not drawn: an endpoint is absent from the source points.'));
        const parallel=data.relationships.filter(o=>o.id!==r.id&&((o.source===r.source&&o.target===r.target)||(o.source===r.target&&o.target===r.source))).map(o=>o.id);
        if(parallel.length) lines.append(el('div','',`Parallel relationships: ${parallel.join(', ')}`));
        nodes.push(...fields(data.meta.relationships.get(r.id)));
        const ends=[r.source,r.target].filter((id,i,a)=>data.pointMap.has(id)&&a.indexOf(id)===i);
        if(ends.length) nodes.push(el('h4','','Endpoints'),...limitedList(viewer,'point',ends,pointText));
        if(r.status==='drawable'){const zoom=button('Zoom to');zoom.addEventListener('click',()=>viewer.userAction('control','reveal',()=>{if(viewer.config.interaction.focus)viewer.reveal();}));actions.append(zoom);}
      }else if(s.kind==='cluster'){
        const pts=s.originalIds.map(id=>data.pointMap.get(id)).filter(Boolean),b=bounds(pts),set=new Set(s.originalIds);
        let inner=0,outer=0;
        for(const r of data.relationships){if(r.status!=='drawable')continue;const a=set.has(r.source),d=set.has(r.target);if(a&&d)inner++;else if(a||d)outer++;}
        const rows=[['Points',String(s.originalIds.length)],[ax.x.title,rangeText(ax.x,b.minX,b.maxX)],[ax.y.title,rangeText(ax.y,b.minY,b.maxY)]];
        if(viewer.mode==='3d') rows.push([ax.z.title,rangeText(ax.z,b.minZ,b.maxZ)]);
        rows.push(['Links',`${inner} inside · ${outer} to other points`]);
        nodes.push(facts(rows),lines);
        lines.append(el('div','',`Point IDs: ${s.originalIds.slice(0,8).join(', ')}${s.originalIds.length>8?', …':''}`));
        const summary=memberFieldRows(data.meta.points,s.originalIds);
        if(viewer.config.inspection.metadata&&summary.length) nodes.push(el('h4','','Member fields'),facts(summary));
        nodes.push(el('h4','','Members'),...limitedList(viewer,'point',s.originalIds,pointText));
        const focus=button('Focus');focus.addEventListener('click',()=>viewer.userAction('control','focus',()=>{if(viewer.config.interaction.focus)viewer.focusSelection();}));actions.append(focus);
      }else{
        const b=s.item||{},rows=[];
        if(b.selfLink) rows.push(['Between',`inside one ${b.sourceKind==='cluster'?'cluster':'point'}`]);
        else if(b.source!=null){
          const A=endText(b.sourceKind,b.source),D=endText(b.targetKind,b.target);
          rows.push(['Between',`${A} and ${D}`]);
          rows.push(['Direction',[b.forward?`${b.forward} ${A} → ${D}`:'',b.backward?`${b.backward} ${D} → ${A}`:'',b.directionCounts&&b.directionCounts.both?`${b.directionCounts.both} both`:'',b.directionCounts&&b.directionCounts.none?`${b.directionCounts.none} undirected`:''].filter(Boolean).join(' · ')||'—']);
        }
        rows.push(['Relationships',String(s.originalIds.length)]);
        nodes.push(facts(rows),lines);
        lines.append(el('div','',`${b.selfLink?'Inside one cluster · ':''}Relationship IDs: ${s.originalIds.slice(0,8).join(', ')}${s.originalIds.length>8?', …':''}`));
        const summary=memberFieldRows(data.meta.relationships,s.originalIds);
        if(viewer.config.inspection.metadata&&summary.length) nodes.push(el('h4','','Relationship fields'),facts(summary));
        nodes.push(el('h4','','Constituents'),...limitedList(viewer,'relationship',s.originalIds,relText));
        const focus=button('Focus');focus.addEventListener('click',()=>viewer.userAction('control','focus',()=>{if(viewer.config.interaction.focus)viewer.focusSelection();}));actions.append(focus);
      }
      const shown=viewer.visibleSelection();
      if(!shown.length) lines.append(el('div','hg-hint','Not visible in the current view.'));
      else if(shown.length===1&&shown[0].id!==s.id) lines.append(el('div','hg-hint',`Currently shown inside a ${shown[0].kind}.`));
      else if(shown.length>1) lines.append(el('div','hg-hint',`Currently shown as ${shown.length} visible objects.`));
      const clear=button('Clear');clear.addEventListener('click',()=>viewer.userAction('control','clear',()=>{if(viewer.config.interaction.selection)viewer.clearSelection();}));actions.append(clear);
      nodes.push(actions);
    }
    c.selection.replaceChildren(...nodes);
    renderLegend(viewer);
    // Accessible browsing of what is currently drawn, independent of graphical picking.
    const absent=data.relationships.filter(r=>r.status==='absent-endpoint');
    const visibleCount=view.clusters.length+view.points.length+view.bundles.length+view.relationships.length+absent.length;
    c.browseSummary.textContent=`Browse visible objects (${visibleCount})`;
    c.browse.hidden=!visibleCount;
    if(c.browse.open){
      const items=[...view.clusters.map(x=>['cluster',x.id,`Cluster of ${x.count}`]),...view.points.map(p=>['point',p.id,abbreviate(p.label,28)]),
        ...view.bundles.map(b=>['bundle',b.id,`Bundle of ${b.count}`]),...view.relationships.map(r=>['relationship',r.id,abbreviate(r.label,24)]),...absent.map(r=>['relationship',r.id,`${abbreviate(r.label,24)} (absent endpoint)`])];
      const limit=DEFAULTS.listLimit*2,offset=viewer.publicBoundary?Math.min(c.browseOffset||0,Math.floor((items.length-1)/limit)*limit):0;
      c.browseList.replaceChildren(...items.slice(offset,offset+limit).map(([kind,id,text])=>{const b=button(text);b.addEventListener('click',()=>viewer.userAction('control','select',()=>{if(viewer.config.interaction.selection)viewer.select(kind,id,{source:'list'});}));return wrapLi(b);}));
      if(items.length>limit&&viewer.publicBoundary){
        const previous=button('Previous objects'),next=button('Next objects');previous.disabled=offset===0;next.disabled=offset+limit>=items.length;
        previous.addEventListener('click',()=>{c.browseOffset=Math.max(0,offset-limit);renderInspector(viewer);});
        next.addEventListener('click',()=>{c.browseOffset=offset+limit;renderInspector(viewer);});
        c.browseList.append(wrapLi(previous),wrapLi(el('span','hg-hint',`${offset+1}–${Math.min(offset+limit,items.length)} of ${items.length}`)),wrapLi(next));
      }else if(items.length>limit)c.browseList.append(wrapLi(el('span','hg-hint',`…${items.length-limit} more; zoom or focus to narrow the view.`)));
      if(!viewer.config.inspection.visible&&s&&['cluster','bundle'].includes(s.kind)){
        const kind=s.kind==='cluster'?'point':'relationship';
        const members=el('li','');members.append(el('strong','','Selected constituents'),...limitedList(viewer,kind,s.originalIds,kind==='point'?pointText:relText));c.browseList.append(members);
      }
    }else c.browseList.replaceChildren();
    const notes=[];
    for(const d of data.diagnostics){
      if(d.kind==='absent-endpoint') notes.push(`Relationship ${d.id} not drawn: endpoint missing (${d.source} → ${d.target}).`);
      else if(d.kind==='mixed-z') notes.push(d.message);
      else if(d.kind==='invalid-point') notes.push(`Point ${d.id} skipped: needs an id and numeric x and y.`);
      else if(d.kind==='duplicate-point') notes.push(`Duplicate point ID ${d.id}: later record skipped.`);
      else if(d.kind==='invalid-relationship') notes.push(`Relationship ${d.id} skipped: needs an id, source and target.`);
      else if(d.kind==='duplicate-relationship') notes.push(`Duplicate relationship ID ${d.id}: later record skipped.`);
      else notes.push(d.message||`${d.kind}: ${d.id}`);
    }
    const warnings=notes.length;
    if(viewer.frame.adjusted) notes.push(`Axes are scaled independently so no axis is drawn shorter than 1/${DEFAULTS.maxAxisRatio} of the longest; tick values and the inspector show original coordinates.`);
    const selfLinks=data.relationships.filter(r=>r.selfLink).length;
    c.dataSummary.textContent=`${viewer.mode.toUpperCase()} · ${data.points.length} points · ${data.relationships.length} relationships${selfLinks?` (${selfLinks} self-link${selfLinks===1?'':'s'})`:''}${notes.length?` · ${notes.length} note${notes.length===1?'':'s'}`:''}`;
    c.dataNotes.replaceChildren(...notes.slice(0,200).map((note,i)=>el('li',i<warnings?'hg-warning':'',note)));
    // Data problems get a small warning chip in the view; it opens these notes.
    c.warn.hidden=!warnings;
    c.warn.textContent=`⚠ ${warnings}`;
    c.warn.setAttribute('aria-label',`${warnings} data note${warnings===1?'':'s'}: show details`);
    c.warn.title=`${warnings} data note${warnings===1?'':'s'} (records skipped or not drawn)`;
  }

  // Compact legend for what the current view can show; rebuilt only when that set changes.
  const SWATCHES={
    point:[['circle',{cx:11,cy:6,r:4.5,fill:COLORS.point,stroke:'#fff','stroke-width':1}]],
    cluster:[['circle',{cx:11,cy:6,r:5.5,fill:COLORS.cluster,stroke:'#fff','stroke-width':1}]],
    relationship:[['line',{x1:1,y1:6,x2:15,y2:6,stroke:COLORS.edge,'stroke-width':1.5}],['path',{d:'M14 2.5L21 6L14 9.5Z',fill:COLORS.arrow}]],
    bundle:[['line',{x1:2,y1:6,x2:20,y2:6,stroke:COLORS.bundle,'stroke-width':4,'stroke-linecap':'round'}]],
    self:[['circle',{cx:8,cy:6,r:2.5,fill:COLORS.point}],['path',{d:'M10 4.5C14 -1 21 3 16 8C14 10 11 9 10 7.5',fill:'none',stroke:COLORS.edge,'stroke-width':1.2,'stroke-dasharray':'2.5 2'}]],
    selected:[['circle',{cx:11,cy:6,r:4,fill:COLORS.point,stroke:COLORS.selected,'stroke-width':2.2}]],
    related:[['line',{x1:1,y1:6,x2:21,y2:6,stroke:COLORS.incident,'stroke-width':2.4}]],
    context:[['circle',{cx:6,cy:6,r:2.5,fill:COLORS.context}],['circle',{cx:15,cy:6,r:2.5,fill:COLORS.context}]]
  };
  const LEGEND_TEXT={point:'Point',cluster:'Cluster (count inside)',relationship:'Relationship (arrow → target)',bundle:'Bundle (×count)',self:'Self-link',selected:'Selected',related:'Linked to selection',context:'Outside focus'};
  function legendKeys(viewer){
    const v=viewer.view,d=viewer.data,keys=[];
    if(!d.points.length) return keys;
    keys.push('point');
    if(v.clusters.length) keys.push('cluster');
    if(v.relationships.some(r=>!r.selfLink)) keys.push('relationship');
    if(v.bundles.some(b=>!b.selfLink)) keys.push('bundle');
    if(v.relationships.some(r=>r.selfLink)||v.bundles.some(b=>b.selfLink)) keys.push('self');
    if(viewer.selection) keys.push('selected');
    if(viewer.selection&&viewer.incidentIds().length) keys.push('related');
    if(viewer.focus) keys.push('context');
    return keys;
  }
  function renderLegend(viewer){
    const list=viewer.controls.legend,keys=legendKeys(viewer),sig=keys.join(',')+JSON.stringify([viewer.config.theme,viewer.config.points,viewer.config.relationships,viewer.config.clusters,viewer.config.bundles]);
    list.hidden=!keys.length;
    if(list.dataset.sig===sig) return;
    list.dataset.sig=sig;
    list.replaceChildren(...keys.map(k=>{
      const li=el('li',''),svg=svgEl('svg');
      li.dataset.key=k;
      if(svg){
        svg.setAttribute('viewBox','0 0 22 12');svg.setAttribute('aria-hidden','true');
        for(const [tag,attrs] of SWATCHES[k]){if(k==='relationship'&&tag==='path'&&!viewer.config.relationships.directionCues)continue;const shape=svgEl(tag);for(const a of Object.keys(attrs)){const token=Object.keys(COLORS).find(t=>COLORS[t]===attrs[a]);shape.setAttribute(a,token?viewer.palette()[token]:attrs[a]);}svg.append(shape);}
        li.append(svg);
      }
      li.append(el('span','',k==='cluster'&&!viewer.config.clusters.counts?'Cluster':k==='bundle'&&!viewer.config.bundles.counts?'Bundle':k==='relationship'&&!viewer.config.relationships.directionCues?'Relationship':LEGEND_TEXT[k]));
      return li;
    }));
  }

  function observeResize(target,callback){
    if(typeof global.ResizeObserver==='function'){const ro=new global.ResizeObserver(callback);ro.observe(target);return ()=>ro.disconnect();}
    global.addEventListener('resize',callback);
    return ()=>global.removeEventListener('resize',callback);
  }
  const nextFrame=callback=>(global.requestAnimationFrame||(fn=>setTimeout(fn,16)))(callback);

  // Shared overlay: labels, counts and axis ticks as positioned HTML, planned in screen space for both modes.
  class Overlay{
    constructor(viewer){
      this.viewer=viewer;this.spans=new Map();this.sides=new Map();this.widths=new Map();this.ctx=null;
      const doc=global.document;
      const canvas=doc&&typeof doc.createElement==='function'?doc.createElement('canvas'):null;
      this.ctx=canvas&&canvas.getContext?canvas.getContext('2d'):null;
      if(this.ctx) this.ctx.font=`500 ${DEFAULTS.labelPx}px system-ui,-apple-system,"Segoe UI",sans-serif`;
    }
    measure(text){
      if(!this.widths.has(text)) this.widths.set(text,this.ctx?this.ctx.measureText(text).width:text.length*DEFAULTS.labelPx*.58);
      return this.widths.get(text);
    }
    span(key,className,text){
      let span=this.spans.get(key);
      if(!span){span=el('span',className,text);this.spans.set(key,span);this.viewer.controls.labels.append(span);}
      else{if(span.className!==className)span.className=className;if(span.textContent!==text)span.textContent=text;}
      const p=this.viewer.palette();span.style.color=className==='hg-count'?'#ffffff':className.includes('hg-tick')?p.muted:p.text;
      if(className.includes('hg-on'))span.style.boxShadow=`0 0 0 1.5px ${p.selected}`;
      return span;
    }
    // nodes: {kind,id,x,y,r,text,priority}; edges: {kind,id,x,y,count,text}; ticks: {key,x,y,text,align}
    update(nodes,edges,ticks,w,h){
      const viewer=this.viewer,selected=new Set(viewer.visibleSelection().map(r=>keyOf(r.kind,r.id)));
      const c=viewer.controls,obstacles=[];
      const rectOf=node=>{if(!node||!node.getBoundingClientRect||node.hidden)return null;const a=node.getBoundingClientRect(),b=c.stage.getBoundingClientRect();return a.width?{x0:a.left-b.left-2,y0:a.top-b.top-2,x1:a.right-b.left+2,y1:a.bottom-b.top+2}:null;};
      for(const r of [rectOf(c.toolbar),rectOf(c.statusText),rectOf(c.back)]) if(r) obstacles.push(r);
      const seen=new Set();
      for(const t of viewer.config.axes.visible?ticks||[]:[]){
        const key='tick:'+t.key,span=this.span(key,t.cls||'hg-tick',t.text),tw=tickWidth(this,t.text,t.cls);
        const x=t.align==='right'?t.x-tw-4:t.align==='center'?t.x-tw/2:t.x,y=t.y;
        span.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        obstacles.push({x0:x,y0:y,x1:x+tw,y1:y+12});
        seen.add(key);
      }
      const inView=nodes.filter(n=>n.x>=-n.r&&n.y>=-n.r&&n.x<=w+n.r&&n.y<=h+n.r);
      const items=inView.map(n=>{const k=keyOf(n.kind,n.id),on=selected.has(k);return {id:k,x:n.x,y:n.y,r:n.r,text:n.kind==='point'&&viewer.config.labels.points!=='none'&&(viewer.config.labels.points==='auto'||on)?(on?abbreviate(n.label,40):abbreviate(n.label)):'',priority:(on?1e6:0)+(n.priority||0),forced:on};});
      for(const e of edges) if(e.x>=0&&e.y>=0&&e.x<=w&&e.y<=h){const k=keyOf(e.kind,e.id),on=selected.has(k);const text=e.kind==='bundle'?(viewer.config.bundles.counts&&e.count>1?`×${e.count}`:''):(on&&viewer.config.labels.relationships!=='none'?abbreviate(e.label,32):'');if(text)items.push({id:k,x:e.x,y:e.y,r:0,text,anchor:'center',priority:on?1e6:-1-1/(e.count||1),forced:on});}
      const budget=Math.max(6,Math.floor(w*h/DEFAULTS.labelArea));
      const placed=planLabels(items,w,h,{fontPx:DEFAULTS.labelPx,measure:t=>this.measure(t),obstacles,previous:this.sides,budget});
      this.sides=new Map([...placed].map(([k,v])=>[k,v.side]));
      for(const item of items){
        const choice=placed.get(item.id);
        if(!choice) continue;
        const isEdge=item.anchor==='center',key='lbl:'+item.id;
        const span=this.span(key,isEdge&&!item.forced?'hg-edge-count':item.forced?'hg-label hg-on':'hg-label',item.text);
        span.style.transform=`translate(${choice.box.x0.toFixed(1)}px,${choice.box.y0.toFixed(1)}px)`;
        seen.add(key);
      }
      // Count badges sit on their disc. In 3D, discs at different depths can project on top of each other, so
      // badges are placed nearest first and one that would collide with a nearer badge is dropped (the disc
      // itself stays visible and pickable). Badges that would be clipped by the stage edge or sit under the
      // controls are left out rather than shown half-cut.
      const countBoxes=[],chrome=obstacles.slice(0,obstacles.length-(viewer.config.axes.visible?(ticks||[]).length:0));
      const hits=(box,b)=>box.x0<b.x1&&box.x1>b.x0&&box.y0<b.y1&&box.y1>b.y0;
      const clusters=inView.filter(n=>n.kind==='cluster'&&viewer.config.clusters.counts).sort((p,q)=>(p.depth||0)-(q.depth||0)||q.count-p.count);
      for(const n of clusters){
        const text=String(n.count),tw=this.measure(text),box={x0:n.x-tw/2-1,y0:n.y-7,x1:n.x+tw/2+1,y1:n.y+7};
        if(box.x0<0||box.y0<0||box.x1>w||box.y1>h||countBoxes.some(b=>hits(box,b))||chrome.some(b=>hits(box,b))) continue;
        countBoxes.push(box);
        const key='count:'+n.id,span=this.span(key,'hg-count',text);
        span.style.transform=`translate(${(n.x-tw/2).toFixed(1)}px,${(n.y-6).toFixed(1)}px)`;
        seen.add(key);
      }
      for(const [key,span] of this.spans) if(!seen.has(key)){span.remove();this.spans.delete(key);}
      this.stats={labels:placed.size,candidates:items.length};
    }
    clear(){for(const span of this.spans.values())span.remove();this.spans.clear();this.sides.clear();}
  }

  // Axis text is set 10-11px against the 12px label measure.
  const tickWidth=(overlay,text,cls)=>overlay.measure(text)*(cls&&cls.includes('hg-axis-name')?1:.88);

  // Base adapter behaviour shared by the 2D and 3D engines: frame scheduling, picking candidates, overlay,
  // pointer bookkeeping (multi-touch tap suppression), engine-missing/loading states.
  class AdapterBase{
    constructor(viewer){this.viewer=viewer;this.lodScale=1;this.overlay=new Overlay(viewer);this.pending=false;this.animating=false;this.autoFit=true;this.lastSize='';this.nodes=[];this.edges=[];this.suppressTapUntil=0;this.pointers=new Set();this.cleanups=[];this.virtual={ppu:null};}
    // Bottom edge of the top control row in stage pixels (measured when laid out, else the nominal height).
    chromeBottom(){
      const c=this.viewer.controls,r=c.toolbar&&c.toolbar.getBoundingClientRect?c.toolbar.getBoundingClientRect():null;
      if(r&&r.height){const s=c.stage.getBoundingClientRect();return r.bottom-s.top;}
      return DEFAULTS.chromePx;
    }
    // Plot margins: data stays below the control row and clear of the axis text, and otherwise uses the stage.
    insets(){
      const {w,h}=this.size(),m=DEFAULTS.marginPx;
      if(Math.min(w,h)<260) return {top:m,right:m,bottom:m,left:m};
      const top=Math.max(m,this.chromeBottom()+4);
      // 3D keeps wider slack: nearer glyphs project larger than at the focal distance and orbiting swings corners out.
      if(this.dims===3){const s=DEFAULTS.marginPx3d;return {top:Math.max(s,top),right:s,bottom:s,left:s};}
      const ax=this.viewer.data.axes,named=ax.y.name!==ax.y.key;
      return {top:top+(named?DEFAULTS.tickPx+6:0),right:m,bottom:m+DEFAULTS.tickPx+8,left:m+4};
    }
    listen(target,type,fn,opts){if(!target||!target.addEventListener)return;target.addEventListener(type,fn,opts);this.cleanups.push(()=>target.removeEventListener(type,fn,opts));}
    trackPointers(target){
      // A second finger turns the gesture into pinch/rotate; taps are suppressed until shortly after all lift.
      const stage=this.viewer.controls.stage;
      this.listen(target,'pointerdown',e=>{
        this.inputSource=e.pointerType==='touch'?'touch':'pointer';
        this.pointers.add(e.pointerId);
        if(this.pointers.size>1)this.suppressTapUntil=Infinity;
        this.userInput();
        // Keyboard focus moves to the stage only when it is outside the stage, and only on the first finger.
        // Moving focus away from a focused 3D canvas mid-gesture makes Babylon release its touches, which is
        // what stopped two-finger pinch zoom on phones.
        const doc=global.document;
        if(this.pointers.size===1&&stage&&stage.focus&&doc&&!within(doc.activeElement,stage)) stage.focus({preventScroll:true});
      },true);
      const up=e=>{this.pointers.delete(e.pointerId);if(this.suppressTapUntil===Infinity&&!this.pointers.size)this.suppressTapUntil=now()+350;};
      this.listen(target,'pointerup',up,true);this.listen(target,'pointercancel',up,true);
      this.listen(target,'wheel',()=>{this.inputSource='pointer';this.userInput();},{passive:true,capture:true});
    }
    tapAllowed(){return now()>=this.suppressTapUntil;}
    userInput(){this.destination=null;if(this.animating)this.stopAnimation();}
    requestFrame(){
      if(this.pending) return;
      this.pending=true;
      nextFrame(()=>{this.pending=false;if(!this.dead)this.frameUpdate();});
    }
    frameUpdate(){
      if(!this.ready) {this.overlay.clear();return;}
      if(!this.animating||!this.viewer.publicBoundary)this.viewer.onCamera();
      if(this.dead) return;
      this.project();
      const {w,h}=this.size();
      this.overlay.update(this.nodes,this.edges,this.ticks(),w,h);
      this.afterFrame&&this.afterFrame();
    }
    candidates(){if(this.ready&&this.projectedAt!==this.cameraStamp())this.project();return [...this.nodes,...this.edges.filter(e=>e.pts)];}
    virtualSize(){const s=this.viewer.controls.surface;return {w:s.clientWidth||360,h:s.clientHeight||420};}
    // Engine script not present: wait for window load once (script may still be arriving), then report.
    engineMissing(label,engineName,url){
      const doc=global.document;
      if(doc&&doc.readyState&&doc.readyState!=='complete'&&!this.waiting){
        this.waiting=true;
        this.viewer.showEngineProblem(label,engineName,url,'loading');
        const retry=()=>{this.waiting=false;this.waited=true;if(!this.dead){delete this.viewer.controls.message.dataset.engine;this.viewer.render({camera:'fit'});}};
        this.listen(global,'load',retry,{once:true});
      }else if(!this.waiting) this.viewer.showEngineProblem(label,engineName,url,'missing');
      return false;
    }
    ticks(){return [];}
    destroyBase(){this.dead=true;for(const fn of this.cleanups.splice(0))fn();this.overlay.clear();const g=this.viewer.controls.grid;if(g)g.replaceChildren();}
  }

  // Cytoscape.js 2D adapter. Data coordinates map through frame(); glyph and stroke sizes are divided by the
  // current zoom (restyled in small steps) so they stay constant on screen; labels live in the shared overlay.
  class CytoscapeAdapter extends AdapterBase{
    constructor(viewer){super(viewer);this.dims=2;this.cy=null;this.z=1;this.styledZ=0;this.guard=0;this.scopeFit=1;this.allFit=1;this.keys=new Set();this.model=new Map();this.stretch={x:1,y:1};this.edgeAlpha=1;}
    get ready(){return !!this.cy;}
    ensure(){
      if(this.cy) return true;
      if(this.failed||this.dead||this.viewer.publicBoundary&&(!this.viewer.container.clientWidth||!this.viewer.container.clientHeight)) return false;
      if(typeof global.cytoscape!=='function') return this.engineMissing('2D','Cytoscape.js',CYTO_URL);
      const surface=this.viewer.controls.surface;
      delete this.viewer.controls.message.dataset.engine;
      try{
        this.cy=global.cytoscape({container:surface,elements:[],layout:{name:'preset'},style:this.sheet(),minZoom:1e-3,maxZoom:1e4,boxSelectionEnabled:false,autoungrabify:true,autounselectify:true});
      }catch(error){this.failed=true;surface.replaceChildren();this.viewer.showEngineProblem('2D','Cytoscape.js',CYTO_URL,'error',error);return false;}
      this.viewer.clearEngineProblem();
      this.cy.on('tap',event=>{
        if(!this.tapAllowed()) return;
        const p=event.renderedPosition||{x:0,y:0},t=event.target,d=t&&t!==this.cy&&t.data?t.data():null;
        this.viewer.userAction(this.inputSource||'pointer','select',()=>this.viewer.handleTap(p.x,p.y,d&&d.ref!=null?{kind:d.kind,id:d.ref}:null));
      });
      this.cy.on('viewport',()=>{if(!this.guard&&!this.animating){this.autoFit=false;this.destination=null;}this.clampPan();this.requestFrame();});
      this.configure();
      this.trackPointers(surface);
      this.cleanups.push(observeResize(surface,()=>this.onResize()));
      return true;
    }
    configure(){
      if(!this.cy)return;
      if(this.cy.userZoomingEnabled)this.cy.userZoomingEnabled(this.viewer.config.interaction.zoom);
      if(this.cy.userPanningEnabled)this.cy.userPanningEnabled(this.viewer.config.interaction.pan);
    }
    size(){return this.cy?{w:this.cy.width(),h:this.cy.height()}:this.virtualSize();}
    cameraStamp(){return this.cy?this.cy.zoom()+','+this.cy.pan().x+','+this.cy.pan().y:'';}
    ppu(){return this.destination?this.destination.zoom*DEFAULTS.modelSize:this.cy?this.cy.zoom()*DEFAULTS.modelSize:(this.virtual.ppu||this.fitPpu('all'));}
    fitPpu(which){this.computeFit();return (which==='all'?this.allFit:this.scopeFit)*DEFAULTS.modelSize;}
    modelOf(p){const c=this.viewer.frame.apply(p),S=DEFAULTS.modelSize;return {x:c[0]*S*this.stretch.x,y:-c[1]*S*this.stretch.y};}
    // When the axes are not commensurate, the axis that would leave empty space is stretched (never shrunk) so a
    // wide time range fills a portrait phone instead of a thin band. Changes only with stage size or data.
    updateStretch(){
      const next={x:1,y:1},e=this.viewer.frame.extent;
      if(this.viewer.stretchAllowed()&&e[0]>0&&e[1]>0){
        const {w,h}=this.size(),ins=this.insets();
        const sx=Math.max(w-ins.left-ins.right,1)/e[0],sy=Math.max(h-ins.top-ins.bottom,1)/e[1];
        if(sx>sy) next.x=Math.min(DEFAULTS.maxStretch,sx/sy); else next.y=Math.min(DEFAULTS.maxStretch,sy/sx);
      }
      this.stretch=next;
    }
    extentOf(points){
      if(!points.length) return null;
      let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
      for(const p of points){const m=this.modelOf(p);x0=Math.min(x0,m.x);x1=Math.max(x1,m.x);y0=Math.min(y0,m.y);y1=Math.max(y1,m.y);}
      return {x0,x1,y0,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,w:x1-x0,h:y1-y0};
    }
    computeFit(){
      const {w,h}=this.size(),ins=this.insets();
      const all=this.extentOf(this.viewer.data.points),scope=this.extentOf(this.viewer.scopePoints());
      const fitFor=e=>{
        if(!e) return 1;
        const s=fitScale(e.w,e.h,w,h,ins);
        return s||Math.min(w,h)/(DEFAULTS.modelSize*.6);
      };
      this.allFit=fitFor(all);
      this.scopeFit=this.viewer.focus?clamp(fitFor(scope),this.allFit,this.allFit*4096):this.allFit;
      this.scopeCenter=scope||{cx:0,cy:0};
      const ins2=ins;this.fitOffset={x:(ins2.left-ins2.right)/2,y:(ins2.top-ins2.bottom)/2};
      return this.scopeFit;
    }
    applyCamera(opts){
      const ready=this.ensure();
      this.updateStretch();
      if(!ready){
        this.computeFit();
        if(opts.camera&&opts.camera.dataView){this.virtual.dataView=opts.camera.dataView;this.virtual.ppu=this.allFit*opts.camera.dataView.ratio*DEFAULTS.modelSize;}
        else if(opts.camera==='fit'||!this.virtual.ppu){this.virtual.ppu=this.scopeFit*DEFAULTS.modelSize;const b=bounds(this.viewer.scopePoints());this.virtual.dataView={x:b.cx,y:b.cy};if(!this.viewer.focus)this.autoFit=true;}
        return;
      }
      const cy=this.cy,camera=opts.camera,{w,h}=this.size();
      this.lastSize=`${w}x${h}`;
      this.computeFit();
      const maxLevel=this.viewer.scopeHierarchy().detail;
      cy.minZoom(this.allFit*DEFAULTS.minZoomRatio*(this.viewer.focus?.5:1));
      cy.maxZoom(Math.max(this.allFit*8,ppuForLevel(maxLevel+1)/DEFAULTS.modelSize,this.scopeFit*2));
      if(camera==='fit'||(camera==='auto'&&this.autoFit)){
        if(!this.viewer.focus) this.autoFit=true;
        const z=this.scopeFit,c=this.scopeCenter;
        this.setViewport(z,{x:w/2+this.fitOffset.x-c.cx*z,y:h/2+this.fitOffset.y-c.cy*z},opts.animate);
      }else if(camera&&camera.restore){
        this.setViewport(camera.restore.zoom,camera.restore.pan,opts.animate);
      }else if(camera&&camera.dataView){
        const v=camera.dataView,z=this.allFit*v.ratio,m=v.x==null?{x:this.scopeCenter.cx,y:this.scopeCenter.cy}:this.modelOf({x:v.x,y:v.y});
        this.setViewport(z,{x:w/2-m.x*z,y:h/2-m.y*z},false);
      }
    }
    // Data coordinates at the stage centre plus zoom relative to the whole-data fit. `old` describes the stage
    // size the current camera was set for (during a resize), in which case the cached fit is still the old one.
    saveDataView(old){
      if(!old) this.computeFit();
      if(!this.cy) return {...this.virtual.dataView,ratio:this.ppu()/(this.allFit*DEFAULTS.modelSize)};
      const {w,h}=old||this.size(),z=this.cy.zoom(),pan=this.cy.pan(),fr=this.viewer.frame,S=DEFAULTS.modelSize;
      return {x:fr.invert(0,(w/2-pan.x)/z/S/this.stretch.x),y:fr.invert(1,-(h/2-pan.y)/z/S/this.stretch.y),ratio:z/this.allFit};
    }
    setViewport(zoom,pan,animate){
      const cy=this.cy;
      if(this.animating)this.stopAnimation();
      if((zoom<cy.minZoom()||zoom>cy.maxZoom())&&this.viewer.onClamp)this.viewer.onClamp();
      zoom=clamp(zoom,cy.minZoom(),cy.maxZoom());
      if(this.viewer.publicBoundary)this.destination={zoom,pan:{...pan}};
      if(animate&&!this.viewer.reducedMotion()&&typeof cy.animate==='function'){
        this.stopAnimation();
        if(this.viewer.publicBoundary)this.destination={zoom,pan:{...pan}};
        this.animating=true;
        cy.animate({zoom,pan},{duration:DEFAULTS.animMs,easing:'ease-in-out-cubic',complete:()=>{this.animating=false;this.requestFrame();}});
        return;
      }
      this.guard++;
      try{cy.viewport({zoom,pan});}finally{this.guard--;}
    }
    logicalStamp(){return this.destination?JSON.stringify(this.destination):this.cameraStamp();}
    logicalDataView(){if(!this.destination)return this.saveDataView();this.computeFit();const {w,h}=this.size(),{zoom:z,pan}=this.destination,fr=this.viewer.frame,S=DEFAULTS.modelSize;return {x:fr.invert(0,(w/2-pan.x)/z/S/this.stretch.x),y:fr.invert(1,-(h/2-pan.y)/z/S/this.stretch.y),ratio:z/this.allFit};}
    stopAnimation(){this.destination=null;if(this.cy&&this.animating){this.cy.stop(true,false);this.animating=false;}}
    saveCamera(){return this.cy?{zoom:this.cy.zoom(),pan:{...this.cy.pan()}}:{ppu:this.virtual.ppu};}
    zoomBy(factor){
      if(!this.cy){this.autoFit=false;this.virtual.ppu=clamp(this.ppu()*factor,this.fitPpu('all')*.25,this.fitPpu('all')*4096);this.viewer.onCamera();return;}
      const {w,h}=this.size(),cy=this.cy,z=clamp(cy.zoom()*factor,cy.minZoom(),cy.maxZoom()),pan=cy.pan();
      const cx=w/2,cy0=h/2;
      this.autoFit=false;
      this.setViewport(z,{x:cx-(cx-pan.x)*z/cy.zoom(),y:cy0-(cy0-pan.y)*z/cy.zoom()},true);
    }
    zoomToRatio(ratio){
      this.computeFit();
      if(!this.cy){this.virtual.ppu=this.allFit*ratio*DEFAULTS.modelSize;this.viewer.render({camera:'keep'});return;}
      const {w,h}=this.size(),z=this.allFit*ratio,pan=this.cy.pan(),old=this.cy.zoom();
      const mid={x:(w/2-pan.x)/old,y:(h/2-pan.y)/old};
      this.autoFit=false;
      this.setViewport(z,{x:w/2-mid.x*z,y:h/2-mid.y*z},false);
      this.viewer.render({camera:'keep'});
    }
    centerOn(points,ppu){
      if(!this.cy) {const b=bounds(points);this.autoFit=false;this.virtual.dataView={x:b.cx,y:b.cy};this.virtual.ppu=ppu;this.viewer.onCamera();return;}
      const e=this.extentOf(points),{w,h}=this.size(),ins=this.insets();
      let z=ppu/DEFAULTS.modelSize;
      const fitZ=fitScale(e.w,e.h,w,h,ins);
      if(fitZ) z=Math.min(z,fitZ);
      z=clamp(z,this.cy.minZoom(),this.cy.maxZoom());
      this.autoFit=false;
      this.setViewport(z,{x:w/2+this.fitOffset.x-e.cx*z,y:h/2+this.fitOffset.y-e.cy*z},true);
    }
    panToScreen(x,y){if(!this.cy)return;const {w,h}=this.size(),pan=this.cy.pan();this.setViewport(this.cy.zoom(),{x:pan.x+w/2-x,y:pan.y+h/2-y},true);}
    // Keep some of the data on screen: panning cannot push the whole data extent out of view.
    clampPan(){
      if(this.guard||this.animating||!this.cy) return;
      const e=this.extentOf(this.viewer.scopePoints());
      if(!e) return;
      const {w,h}=this.size(),z=this.cy.zoom(),pan=this.cy.pan(),keep=.3;
      const x0=e.x0*z+pan.x,x1=e.x1*z+pan.x,y0=e.y0*z+pan.y,y1=e.y1*z+pan.y;
      let dx=0,dy=0;
      if(x1<w*keep) dx=w*keep-x1; else if(x0>w*(1-keep)) dx=w*(1-keep)-x0;
      if(y1<h*keep) dy=h*keep-y1; else if(y0>h*(1-keep)) dy=h*(1-keep)-y0;
      if(dx||dy){if(this.viewer.onClamp)this.viewer.onClamp();this.guard++;try{this.cy.pan({x:pan.x+dx,y:pan.y+dy});}finally{this.guard--;}}
    }
    onResize(){
      if(!this.cy||this.dead) return;
      const before=this.size();
      this.cy.resize();
      const {w,h}=this.size();
      if(`${w}x${h}`===this.lastSize) return;
      const [ow,oh]=this.lastSize.split('x').map(Number);
      // A fitted view refits; a camera the user moved keeps the same data at the centre and the same zoom
      // relative to the fit, even when the new stage shape changes the axis stretch.
      if(this.autoFit){this.viewer.render({camera:'fit'});return;}
      const dataView=this.saveDataView({w:ow||before.w,h:oh||before.h});
      this.viewer.render({camera:{dataView}});
    }
    draw(view){
      if(!this.cy) return;
      const cy=this.cy,elements=[],next=new Set(),model=new Map(),moved=[];
      // Existing nodes keep their element (and any Cytoscape state) but move when the data or axis stretch changed.
      const add=(key,def)=>{
        next.add(key);
        const old=this.keys.has(key)?cy.getElementById(key):null;
        if(!old||!old.nonempty()) elements.push(def);
        else if(def.group==='edges'&&(old.data('source')!==def.data.source||old.data('target')!==def.data.target)){cy.elements().filter(e=>e.id()===key).remove();elements.push(def);}
        else if(def.classes){old.removeClass('fwd bwd');for(const c of def.classes.split(' '))old.addClass(c);}
        if(old&&old.nonempty()&&def.position&&old.position){const p=old.position();if(Math.abs(p.x-def.position.x)>1e-6||Math.abs(p.y-def.position.y)>1e-6)moved.push([old,def.position]);}
      };
      // Outside a focus the remaining data stays as small grey context dots: not pickable, not labelled.
      for(const p of view.context||[]){const k='x:'+p.id;add(k,{group:'nodes',data:{id:k,kind:'context'},position:this.modelOf(p),classes:'context'});}
      for(const c of view.clusters){const k='c:'+c.id,pos=this.modelOf(c);model.set(keyOf('cluster',c.id),{...pos,item:c});add(k,{group:'nodes',data:{id:k,ref:c.id,kind:'cluster',count:c.count},position:pos,classes:'cluster'});}
      for(const p of view.points){const k='p:'+p.id,pos=this.modelOf(p);model.set(keyOf('point',p.id),{...pos,item:p});add(k,{group:'nodes',data:{id:k,ref:p.id,kind:'point'},position:pos,classes:'point'});}
      const nodeKey=(kind,id)=>(kind==='cluster'?'c:':'p:')+id;
      // Bundles carry their direction summary as classes so arrowheads show which way their relationships run.
      const bundleCls=b=>b.selfLink?'bundle loop':'bundle'+(b.direction==='forward'||b.direction==='both'?' fwd':'')+(b.direction==='backward'||b.direction==='both'?' bwd':'');
      for(const b of view.bundles){const k='b:'+b.id;add(k,{group:'edges',data:{id:k,ref:b.id,kind:'bundle',source:nodeKey(b.sourceKind,b.source),target:nodeKey(b.targetKind,b.target),count:b.count},classes:bundleCls(b)});}
      for(const r of view.relationships){const k='r:'+r.id;add(k,{group:'edges',data:{id:k,ref:r.id,kind:'relationship',source:nodeKey('point',r.source),target:nodeKey('point',r.target)},classes:(r.selfLink?'relationship loop':'relationship')+(r.direction==='both'?' bwd':'')});}
      // Many edges at once are drawn lighter so they read as texture and do not bury the points and clusters.
      const edgeCount=view.relationships.length+view.bundles.length;
      this.edgeAlpha=clamp(Math.sqrt(60/Math.max(60,edgeCount)),.35,1);
      cy.batch(()=>{
        const stale=cy.elements().filter(e=>!next.has(e.id()));
        if(stale.length) stale.remove();
        for(const [node,pos] of moved) node.position(pos);
        if(elements.length) cy.add(elements.sort((a,b)=>(a.group==='nodes'?0:1)-(b.group==='nodes'?0:1)));
      });
      this.keys=next;this.model=model;this.view=view;
      this.drawnAt=null;
      this.restyle(true);
    }
    restyle(force){
      const z=this.cy.zoom();
      if(force||!this.styledZ||Math.abs(z/this.styledZ-1)>DEFAULTS.restyleStep){this.styledZ=z;this.z=z;this.cy.style().update();}
    }
    afterFrame(){if(this.cy)this.restyle(false);}
    sheet(){
      const px=v=>v/this.z,calm=v=>()=>v*this.edgeAlpha,rec=e=>this.viewer.lookup(e.data('kind'),e.data('ref')),color=e=>{const r=rec(e);return r&&r.style&&r.style.color||this.viewer.config[e.data('kind')==='point'?'points':'relationships'].color;};
      return [
        {selector:'node',style:{'label':'','border-width':()=>px(1.5),'border-color':'#ffffff','overlay-padding':()=>px(6),'overlay-opacity':0,'z-index':4}},
        {selector:'node.point',style:{'background-color':color,'width':e=>px(this.viewer.pointSize(rec(e))),'height':e=>px(this.viewer.pointSize(rec(e)))}},
        {selector:'node.cluster',style:{'background-color':()=>this.viewer.palette().cluster,'border-color':()=>this.viewer.palette().halo,'border-width':()=>px(3),'width':e=>px(this.viewer.clusterSize({count:e.data('count')})),'height':e=>px(this.viewer.clusterSize({count:e.data('count')}))}},
        {selector:'node.context',style:{'background-color':()=>this.viewer.palette().context,'border-width':0,'width':()=>px(DEFAULTS.contextPx),'height':()=>px(DEFAULTS.contextPx),'events':'no','z-index':0}},
        {selector:'edge',style:{'curve-style':'bezier','control-point-step-size':()=>px(18),'width':e=>px(this.viewer.edgeWidth(rec(e))),'line-color':color,'target-arrow-color':()=>this.viewer.palette().arrow,'source-arrow-color':()=>this.viewer.palette().arrow,'target-arrow-shape':e=>this.viewer.config.relationships.directionCues&&(!rec(e)||rec(e).direction!=='none')?'triangle':'none','arrow-scale':.8,'opacity':calm(.9),'overlay-opacity':0,'z-index':2}},
        {selector:'edge.bundle',style:{'line-color':()=>this.viewer.palette().bundle,'width':e=>px(this.viewer.bundleWidth({count:e.data('count')})),'target-arrow-shape':'none','arrow-scale':.6,'opacity':calm(.72),'z-index':1}},
        {selector:'edge.bundle.fwd',style:{'target-arrow-shape':e=>this.viewer.config.relationships.directionCues&&(!rec(e)||rec(e).direction!=='none')?'triangle':'none'}},
        {selector:'edge.relationship.bwd',style:{'source-arrow-shape':()=>this.viewer.config.relationships.directionCues?'triangle':'none'}},
        {selector:'edge.bundle.bwd',style:{'source-arrow-shape':()=>this.viewer.config.relationships.directionCues?'triangle':'none'}},
        {selector:'edge.loop',style:{'line-style':'dashed','line-dash-pattern':()=>[px(4),px(3)],'width':e=>px(e.data('kind')==='relationship'&&((rec(e)&&rec(e).style&&rec(e).style.width)||this.viewer.config.relationships.width!=='auto')?this.viewer.edgeWidth(rec(e)):1.3),'control-point-step-size':()=>px(20),'loop-direction':'-45deg','loop-sweep':'-80deg','opacity':calm(.7)}},
        {selector:'.hg-incident',style:{'line-color':()=>this.viewer.palette().incident,'target-arrow-color':()=>this.viewer.palette().selected,'source-arrow-color':()=>this.viewer.palette().selected,'width':()=>px(2),'opacity':1,'z-index':8}},
        {selector:'.hg-on',style:{'border-color':()=>this.viewer.palette().selected,'border-width':()=>px(3),'line-color':()=>this.viewer.palette().selected,'target-arrow-color':()=>this.viewer.palette().selected,'source-arrow-color':()=>this.viewer.palette().selected,'opacity':1,'z-index':10}},
        {selector:'edge.hg-on',style:{'width':e=>px(e.hasClass('bundle')?bundlePx(e.data('count'))+1:2.4)}}
      ];
    }
    highlight(visible,incident){
      if(!this.cy) return;
      const prefix={point:'p:',cluster:'c:',relationship:'r:',bundle:'b:'};
      this.cy.batch(()=>{
        this.cy.elements('.hg-on, .hg-incident').removeClass('hg-on hg-incident');
        for(const r of incident||[]) this.cy.getElementById(prefix[r.kind]+r.id).addClass('hg-incident');
        for(const r of visible||[]) this.cy.getElementById(prefix[r.kind]+r.id).addClass('hg-on');
      });
      this.requestFrame();
    }
    project(){
      const cy=this.cy,z=cy.zoom(),pan=cy.pan(),view=this.view;
      this.projectedAt=this.cameraStamp();
      if(!view){this.nodes=[];this.edges=[];return;}
      const nodes=[],edges=[],at=new Map();
      for(const [key,m] of this.model){
        const x=m.x*z+pan.x,y=m.y*z+pan.y,it=m.item,cluster=it.kind==='cluster';
        const n={kind:cluster?'cluster':'point',id:it.id,x,y,r:(cluster?this.viewer.clusterSize(it):this.viewer.pointSize(it))/2,label:cluster?'':it.label,count:it.count,priority:cluster?0:(this.viewer.degree.get(it.id)||0)};
        nodes.push(n);at.set(key,n);
      }
      const offsets=pairOffsets(view.relationships);
      for(const b of view.bundles){
        const a=at.get(keyOf(b.sourceKind,b.source)),d=at.get(keyOf(b.targetKind,b.target));
        if(!a||!d) continue;
        const pts=b.selfLink?loopPts(a,20):[[a.x,a.y],[d.x,d.y]];
        const mid=b.selfLink?pts[Math.floor(pts.length/2)]:[(a.x+d.x)/2,(a.y+d.y)/2];
        edges.push({kind:'bundle',id:b.id,count:b.count,label:'',x:mid[0],y:mid[1],pts});
      }
      for(const r of view.relationships){
        const a=at.get(keyOf('point',r.source)),d=at.get(keyOf('point',r.target));
        if(!a||!d) continue;
        const pts=r.selfLink?loopPts(a,20):curvePts(a,d,(offsets.get(r.id)||0)*18);
        const mid=pts[Math.floor(pts.length/2)];
        edges.push({kind:'relationship',id:r.id,count:1,label:r.label,x:mid[0],y:mid[1],pts});
      }
      this.nodes=nodes;this.edges=edges;
    }
    ticks(){
      const g=this.viewer.controls.grid;
      if(!this.cy||!this.viewer.data.points.length){if(g)g.replaceChildren();return [];}
      const {w,h}=this.size(),z=this.cy.zoom(),pan=this.cy.pan(),fr=this.viewer.frame,S=DEFAULTS.modelSize,st=this.stretch;
      const ax=this.viewer.data.axes,o=this.overlay,cls='hg-tick hg-axis-name';
      const dataX=sx=>fr.invert(0,((sx-pan.x)/z)/S/st.x),dataY=sy=>fr.invert(1,-((sy-pan.y)/z)/S/st.y);
      const screenX=v=>((v-fr.center[0])*fr.k[0]*S*st.x)*z+pan.x,screenY=v=>(-(v-fr.center[1])*fr.k[1]*S*st.y)*z+pan.y;
      const out=[],lines=[],row=h-14;
      // Axis names only when the consumer described the axis; otherwise the plain numbers speak for themselves.
      let xLimit=w-8,yTop=8;
      if(ax.x.name!==ax.x.key){const text=`${ax.x.title} →`;out.push({key:'x-name',x:w-2,y:row,text,align:'right',cls});xLimit=w-6-tickWidth(o,text,cls)-8;}
      if(ax.y.name!==ax.y.key){const y=Math.max(3,this.chromeBottom()+3);out.push({key:'y-name',x:3,y,text:`↑ ${ax.y.title}`,align:'left',cls});yTop=y+18;}
      const wide=ax.x.format==='number'?90:120;
      const xt=axisTicks(ax.x,dataX(0),dataX(w),Math.max(2,Math.floor(w/wide)));
      const yt=axisTicks(ax.y,dataY(h),dataY(0),Math.max(2,Math.floor(h/64)));
      let right=-Infinity;
      for(const t of xt){
        const x=screenX(t.value),half=tickWidth(o,t.text)/2;
        if(x<30||x+half>xLimit||x-half<right+8) continue;
        right=x+half;
        out.push({key:'x'+t.text,x,y:row,text:t.text,align:'center'});lines.push(`M${x.toFixed(1)} 0V${h}`);
      }
      for(const t of yt){const y=screenY(t.value);if(y<yTop||y>h-26)continue;out.push({key:'y'+t.text,x:3,y:y-6,text:t.text,align:'left'});lines.push(`M0 ${y.toFixed(1)}H${w}`);}
      if(g){
        let path=g.firstChild;
        if(!path){path=svgEl('path');path.setAttribute('fill','none');path.setAttribute('stroke',this.viewer.palette().grid);path.setAttribute('stroke-width','1');g.append(path);}
        path.setAttribute('stroke',this.viewer.palette().grid);path.setAttribute('d',this.viewer.config.axes.grid?lines.join(''):'');
      }
      return out;
    }
    destroy(){
      this.stopAnimation();
      this.destroyBase();
      if(this.cy) this.cy.destroy();
      this.cy=null;
    }
  }
  function pairOffsets(relationships){
    const groups=new Map(),out=new Map();
    for(const r of relationships){if(r.selfLink)continue;const k=JSON.stringify(r.source<=r.target?[r.source,r.target]:[r.target,r.source]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
    for(const list of groups.values()) if(list.length>1) list.forEach((r,i)=>{const dir=r.source<=r.target?1:-1;out.set(r.id,(i-(list.length-1)/2)*dir);});
    return out;
  }
  function curvePts(a,d,offset){
    if(!offset) return [[a.x,a.y],[d.x,d.y]];
    const dx=d.x-a.x,dy=d.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const cx=(a.x+d.x)/2+nx*offset*2,cy=(a.y+d.y)/2+ny*offset*2,pts=[];
    for(let i=0;i<=8;i++){const t=i/8;pts.push([(1-t)*(1-t)*a.x+2*t*(1-t)*cx+t*t*d.x,(1-t)*(1-t)*a.y+2*t*(1-t)*cy+t*t*d.y]);}
    return pts;
  }
  function loopPts(a,size){
    const r=(a.r||6)+size*.6,pts=[];
    for(let i=0;i<=12;i++){const t=i/12*Math.PI*2;pts.push([a.x+r*.7*(1-Math.cos(t))*Math.SQRT1_2+r*.7*Math.sin(t)*Math.SQRT1_2,a.y-r*.7*(1-Math.cos(t))*Math.SQRT1_2+r*.7*Math.sin(t)*Math.SQRT1_2]);}
    return pts;
  }

  // Babylon.js 3D adapter. One engine/scene/camera per view; renders replace content meshes only, so camera
  // state survives LOD changes. Points and clusters are thin instances (one draw call each) sized from the
  // camera distance so they keep a constant on-screen size at the focal distance; the scene renders on demand.
  class BabylonAdapter extends AdapterBase{
    constructor(viewer){super(viewer);this.dims=3;this.lodScale=DEFAULTS.lodScale3d;this.engine=null;this.scene=null;this.camera=null;this.content=[];this.highlights=[];this.anchors=[];this.edgeAnchors=[];this.activeUntil=0;this.dirty=true;this.glyphPpu=0;this.tubePpu=0;this.fitRadiusAll=1;this.fitRadiusScope=1;}
    get ready(){return !!this.engine;}
    ensure(){
      if(this.engine) return true;
      if(this.failed||this.dead||this.viewer.publicBoundary&&(!this.viewer.container.clientWidth||!this.viewer.container.clientHeight)) return false;
      if(!global.BABYLON||typeof global.BABYLON.Engine!=='function') return this.engineMissing('3D','Babylon.js',BABYLON_URL);
      const B=global.BABYLON,surface=this.viewer.controls.surface;
      const canvas=el('canvas','hg-canvas');
      canvas.setAttribute('aria-hidden','true');
      surface.append(canvas);
      this.canvas=canvas;
      try{
        this.engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true},false);
      }catch(error){
        canvas.remove();this.canvas=null;this.engine=null;this.failed=true;
        this.viewer.showEngineProblem('3D','Babylon.js',BABYLON_URL,'error',error&&error.message?error:new Error('WebGL is not available on this device'));
        return false;
      }
      this.viewer.clearEngineProblem();
      this.engine.setHardwareScalingLevel(1/Math.min(global.devicePixelRatio||1,2));
      this.engine.renderEvenInBackground=false;
      const scene=this.scene=new B.Scene(this.engine);
      scene.clearColor=B.Color4.FromHexString(this.viewer.palette().background+'ff');
      scene.skipPointerMovePicking=true;
      const camera=this.camera=new B.ArcRotateCamera('camera',DEFAULTS.cameraAlpha,DEFAULTS.cameraBeta,40,B.Vector3.Zero(),scene);
      camera.fov=DEFAULTS.fov;
      camera.minZ=.01;
      camera.lowerBetaLimit=.08;camera.upperBetaLimit=Math.PI-.08;
      camera.attachControl(canvas,false);
      camera.wheelDeltaPercentage=.01;
      const pointers=camera.inputs&&camera.inputs.attached&&camera.inputs.attached.pointers;
      if(pointers&&'useNaturalPinchZoom' in pointers) pointers.useNaturalPinchZoom=true;
      const light=new B.HemisphericLight('light',new B.Vector3(.3,1,-.5),scene);
      light.intensity=.95;
      light.groundColor=new B.Color3(.6,.63,.68);
      const mat=(name,hex,alpha)=>{const m=new B.StandardMaterial(name,scene);const c=B.Color3.FromHexString(hex);m.diffuseColor=c;m.emissiveColor=c.scale(.35);m.specularColor=B.Color3.Black();if(alpha!=null)m.alpha=alpha;return m;};
      this.mats={point:mat('point',this.viewer.palette().point),cluster:mat('cluster',this.viewer.palette().cluster),bundle:mat('bundle',this.viewer.palette().bundle,.8),selected:mat('selected',this.viewer.palette().selected,.9),incident:mat('incident',this.viewer.palette().incident),arrow:mat('arrow',this.viewer.palette().arrow),context:mat('context',this.viewer.palette().context,.8)};
      const glyph=(name,segments,material)=>{const m=B.MeshBuilder.CreateSphere(name,{diameter:1,segments},scene);m.material=material;m.isPickable=false;m.alwaysSelectAsActiveMesh=true;m.setEnabled(false);return m;};
      this.pointMesh=glyph('hg-points',12,this.mats.point);
      this.clusterMesh=glyph('hg-clusters',16,this.mats.cluster);
      this.contextMesh=glyph('hg-context',6,this.mats.context);
      // Direction in 3D: small cones (unit height along +Y, apex up) placed at the target end of each line.
      const cone=this.arrowMesh=B.MeshBuilder.CreateCylinder('hg-arrows',{height:1,diameterTop:0,diameterBottom:1,tessellation:10},scene);
      cone.material=this.mats.arrow;cone.isPickable=false;cone.alwaysSelectAsActiveMesh=true;cone.setEnabled(false);
      // Babylon only reports taps that did not move past its drag threshold, so orbit/pan never selects.
      // Double taps are detected by the viewer; Babylon's own DOUBLETAP is treated as a plain tap unless a
      // TAP for the same press was already delivered.
      let lastTapAt=-1;
      scene.onPointerObservable.add(info=>{
        const T=B.PointerEventTypes;
        if(info.type!==T.POINTERTAP&&info.type!==T.POINTERDOUBLETAP) return;
        if(!this.tapAllowed()||(info.type===T.POINTERDOUBLETAP&&now()-lastTapAt<60)) return;
        lastTapAt=now();
        const e=info.event,rect=canvas.getBoundingClientRect();
        const x=e&&e.clientX!=null?e.clientX-rect.left:scene.pointerX,y=e&&e.clientY!=null?e.clientY-rect.top:scene.pointerY;
        this.viewer.userAction(e&&e.pointerType==='touch'?'touch':'pointer','select',()=>this.viewer.handleTap(x,y,null));
      });
      this.trackPointers(canvas);
      let downAt=null,orbitStart=null;
      this.listen(canvas,'pointerdown',e=>{
        downAt=[e.clientX,e.clientY];
        // The first finger of a pinch briefly orbits before the second lands; undo that so pinch only zooms.
        if(this.pointers.size===1) orbitStart={alpha:camera.alpha,beta:camera.beta,t:now()};
        else if(this.pointers.size===2&&orbitStart&&now()-orbitStart.t<=DEFAULTS.orbitUndoMs){
          camera.alpha=orbitStart.alpha;camera.beta=orbitStart.beta;
          camera.inertialAlphaOffset=camera.inertialBetaOffset=0;
          orbitStart=null;this.dirty=true;
        }
      });
      this.listen(canvas,'pointermove',e=>{
        this.wake(400);
        if(downAt&&this.pointers.size&&Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>6) this.autoFit=false;
      });
      this.listen(canvas,'wheel',()=>{this.autoFit=false;this.wake(600);},{passive:true});
      this.listen(canvas,'pointerup',()=>this.wake(1500));
      camera.onViewMatrixChangedObservable.add(()=>{this.wake(600);this.requestFrame();});
      this.engine.runRenderLoop(()=>{
        if(this.dead) return;
        if(this.animation) this.stepAnimation();
        if(this.dirty||this.pointers.size||now()<this.activeUntil){this.dirty=false;scene.render();}
      });
      if(this.viewer.publicBoundary)this.listen(canvas,'webglcontextlost',event=>{
        event.preventDefault();
        const viewer=this.viewer,dataView=this.saveDataView();
        viewer.userAction('system','renderer',()=>{
          const autoFit=this.autoFit;this.destroy();viewer.adapter=createAdapter(viewer);viewer.adapter.failed=true;viewer.adapter.autoFit=autoFit;
          viewer.render({camera:{dataView}});
          viewer.showEngineProblem('3D','Babylon.js',BABYLON_URL,'error',new Error('WebGL context lost'));
        });
      });
      this.cleanups.push(observeResize(surface,()=>this.onResize()));
      return true;
    }
    configure(){
      if(!this.camera)return;
      const c=this.camera,o=this.viewer.config.interaction,p=c.inputs&&c.inputs.attached&&c.inputs.attached.pointers;
      // The shared stage owns keyboard navigation; vendor keyboard input must not also orbit it.
      if(this.viewer.publicBoundary)for(const key of ['keysUp','keysDown','keysLeft','keysRight'])if(key in c)c[key]=[];
      c.wheelDeltaPercentage=o.zoom?.01:0;c.wheelPrecision=o.zoom?3:Infinity;
      c.panningSensibility=o.pan?Math.max(5,6000/this.fitRadiusAll):0;
      if(p){p.angularSensibilityX=p.angularSensibilityY=o.orbit?1000:Infinity;p.panningSensibility=c.panningSensibility;
        p.pinchZoom=o.zoom;p.useNaturalPinchZoom=o.zoom;p.pinchPrecision=o.zoom?12:Infinity;p.pinchDeltaPercentage=0;p.multiTouchPanning=o.pan;}
      const B=global.BABYLON,palette=this.viewer.palette();
      this.scene.clearColor=B.Color4.FromHexString(palette.background+'ff');
      if(this.mats)for(const [k,m] of Object.entries(this.mats)){const color=B.Color3.FromHexString(palette[k]);m.diffuseColor=color;m.emissiveColor=color.scale(.35);}
    }
    wake(ms){this.activeUntil=Math.max(this.activeUntil,now()+(ms||500));}
    size(){return this.canvas&&this.canvas.clientWidth?{w:this.canvas.clientWidth,h:this.canvas.clientHeight}:this.virtualSize();}
    cameraStamp(){const c=this.camera;return c?[c.alpha,c.beta,c.radius,c.target.x,c.target.y,c.target.z,this.lastSize].join(','):'';}
    tanHalf(){return Math.tan((this.camera?this.camera.fov:DEFAULTS.fov)/2);}
    ppuAt(radius){const {h}=this.size();return DEFAULTS.sceneSize*(h/2)/(radius*this.tanHalf());}
    radiusFor(ppu){const {h}=this.size();return DEFAULTS.sceneSize*(h/2)/(ppu*this.tanHalf());}
    ppu(){return this.destination?this.ppuAt(this.destination.radius):this.camera?this.ppuAt(this.camera.radius):(this.virtual.ppu||this.fitPpu('all'));}
    fitPpu(which){this.computeFit();return this.ppuAt(which==='all'?this.fitRadiusAll:this.fitRadiusScope);}
    sceneOf(p){const c=this.viewer.frame.apply(p),S=DEFAULTS.sceneSize;return [c[0]*S,c[1]*S,c[2]*S];}
    boxOf(points){
      if(!points.length) return null;
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const p of points){const s=this.sceneOf(p);for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],s[i]);hi[i]=Math.max(hi[i],s[i]);}}
      return {lo,hi,center:lo.map((v,i)=>(v+hi[i])/2),half:lo.map((v,i)=>(hi[i]-v)/2)};
    }
    computeFit(){
      const {w,h}=this.size(),ins=this.insets(),aspect=w/(h||1);
      const fillH=DEFAULTS.cameraFill*clamp(1-(Math.max(ins.left,ins.right)*2)/w,.4,1),fillV=DEFAULTS.cameraFill*clamp(1-(Math.max(ins.top,ins.bottom)*2)/h,.4,1);
      const fov=this.camera?this.camera.fov:DEFAULTS.fov,pad=DEFAULTS.sceneSize*.02;
      const radiusFor=(box,alpha,beta)=>{
        if(!box) return 40;
        const half=box.half.map(v=>Math.max(v+pad,DEFAULTS.sceneSize*.06));
        return fitDistance(boxCorners(half),alpha,beta,fov,aspect,fillH,fillV);
      };
      const all=this.boxOf(this.viewer.data.points);
      this.allBox=all;
      // A few nearby three-quarter views are tried and the one that frames the data largest wins, so a tall
      // or deep data set is not seen edge-on; the first (default) view is kept unless another is clearly better.
      let best=null;
      for(const yaw of DEFAULTS.cameraYaws) for(const elev of DEFAULTS.cameraElevations){
        const alpha=-Math.PI/2-yaw,beta=Math.PI/2-elev,radius=radiusFor(all,alpha,beta);
        if(!best) best={alpha,beta,radius,first:radius};
        else if(radius<best.radius&&best.first/radius>=DEFAULTS.angleGain) best={alpha,beta,radius,first:best.first};
      }
      this.fitAlpha=best.alpha;this.fitBeta=best.beta;
      this.fitRadiusAll=best.radius;
      if(this.viewer.focus){
        const box=this.boxOf(this.viewer.scopePoints());
        const a=this.camera?this.camera.alpha:DEFAULTS.cameraAlpha,b=this.camera?this.camera.beta:DEFAULTS.cameraBeta;
        this.scopeBox=box;
        this.fitRadiusScope=Math.min(this.fitRadiusAll,radiusFor(box,a,b));
      }else{this.scopeBox=all;this.fitRadiusScope=this.fitRadiusAll;}
    }
    applyCamera(opts){
      if(!this.ensure()){
        this.computeFit();
        if(opts.camera&&opts.camera.dataView){this.virtual.dataView=opts.camera.dataView;this.virtual.ppu=this.ppuAt(this.fitRadiusAll)*opts.camera.dataView.ratio;}
        else if(opts.camera==='fit'||!this.virtual.ppu){this.virtual.ppu=this.ppuAt(this.fitRadiusScope);const b=bounds(this.viewer.scopePoints());this.virtual.dataView={x:b.cx,y:b.cy,z:b.cz};if(!this.viewer.focus)this.autoFit=true;}
        return;
      }
      const B=global.BABYLON,camera=this.camera,cam=opts.camera;
      this.engine.resize();
      this.lastSize=`${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
      this.computeFit();
      const detail=this.viewer.scopeHierarchy().detail;
      camera.lowerRadiusLimit=Math.min(this.fitRadiusScope*.5,this.radiusFor(ppuForLevel(detail+1)/this.lodScale));
      camera.upperRadiusLimit=this.fitRadiusAll/DEFAULTS.minZoomRatio;
      camera.panningSensibility=Math.max(5,6000/this.fitRadiusAll);
      camera.panningOriginTarget=B.Vector3.Zero();
      camera.panningDistanceLimit=DEFAULTS.sceneSize*.9;
      if(cam==='fit'||(cam==='auto'&&this.autoFit)){
        if(!this.viewer.focus) this.autoFit=true;
        const focus=!!this.viewer.focus,box=this.scopeBox;
        const target=box?box.center:[0,0,0];
        this.setCamera({alpha:focus?camera.alpha:this.fitAlpha,beta:focus?camera.beta:this.fitBeta,radius:this.fitRadiusScope,target},opts.animate);
      }else if(cam&&cam.restore){
        this.setCamera(cam.restore,opts.animate);
      }else if(cam&&cam.dataView){
        const v=cam.dataView,target=v.x==null?(this.scopeBox?this.scopeBox.center:[0,0,0]):this.sceneOf({x:v.x,y:v.y,z:v.z});
        this.setCamera({alpha:v.alpha!=null?v.alpha:camera.alpha,beta:v.beta!=null?v.beta:camera.beta,radius:this.fitRadiusAll/v.ratio,target},false);
      }
      this.configure();
      this.dirty=true;
    }
    saveDataView(){
      this.computeFit();
      if(!this.camera) return {...this.virtual.dataView,ratio:this.ppu()/this.ppuAt(this.fitRadiusAll)};
      const c=this.camera,t=c.target,fr=this.viewer.frame,S=DEFAULTS.sceneSize;
      return {x:fr.invert(0,t.x/S),y:fr.invert(1,t.y/S),z:fr.invert(2,t.z/S),alpha:c.alpha,beta:c.beta,ratio:this.fitRadiusAll/c.radius};
    }
    setCamera(c,animate){
      const camera=this.camera;
      const radius=clamp(c.radius,camera.lowerRadiusLimit||0,camera.upperRadiusLimit||Infinity);
      if(radius!==c.radius&&this.viewer.onClamp)this.viewer.onClamp();
      c={...c,radius};
      camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=0;
      camera.inertialPanningX=camera.inertialPanningY=0;
      const target=Array.isArray(c.target)?c.target:[c.target.x,c.target.y,c.target.z];
      if(this.viewer.publicBoundary)this.destination={...c,target:target.slice()};
      if(animate&&!this.viewer.reducedMotion()){
        const t=camera.target;
        // Take the short way round when orbiting back to the default angle.
        let alpha=c.alpha;
        while(alpha-camera.alpha>Math.PI) alpha-=2*Math.PI;
        while(camera.alpha-alpha>Math.PI) alpha+=2*Math.PI;
        this.animation={t0:now(),from:{alpha:camera.alpha,beta:camera.beta,radius:camera.radius,target:[t.x,t.y,t.z]},to:{alpha,beta:c.beta,radius:c.radius,target}};
        this.animating=true;this.wake(DEFAULTS.animMs+200);
        return;
      }
      this.animation=null;this.animating=false;
      this.placeCamera(c.alpha,c.beta,c.radius,target);
    }
    // ArcRotateCamera.setTarget would otherwise rebuild alpha/beta/radius from the old position.
    placeCamera(alpha,beta,radius,target){
      const B=global.BABYLON,camera=this.camera;
      camera.setTarget(new B.Vector3(target[0],target[1],target[2]),false,false,true);
      camera.alpha=alpha;camera.beta=beta;camera.radius=radius;
      this.dirty=true;
    }
    stepAnimation(){
      const a=this.animation;
      const t=clamp((now()-a.t0)/DEFAULTS.animMs,0,1),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,mix=(p,q)=>p+(q-p)*e;
      this.placeCamera(mix(a.from.alpha,a.to.alpha),mix(a.from.beta,a.to.beta),mix(a.from.radius,a.to.radius),[0,1,2].map(i=>mix(a.from.target[i],a.to.target[i])));
      if(t>=1){this.animation=null;this.animating=false;this.requestFrame();}
    }
    logicalStamp(){return this.destination?JSON.stringify(this.destination):this.cameraStamp();}
    logicalDataView(){if(!this.destination)return this.saveDataView();this.computeFit();const c=this.destination,fr=this.viewer.frame,S=DEFAULTS.sceneSize;return {x:fr.invert(0,c.target[0]/S),y:fr.invert(1,c.target[1]/S),z:fr.invert(2,c.target[2]/S),ratio:this.fitRadiusAll/c.radius};}
    stopAnimation(){this.destination=null;this.animation=null;this.animating=false;}
    saveCamera(){
      if(!this.camera) return {ppu:this.virtual.ppu};
      const t=this.camera.target;
      return {alpha:this.camera.alpha,beta:this.camera.beta,radius:this.camera.radius,target:[t.x,t.y,t.z]};
    }
    zoomBy(factor){
      if(!this.camera){this.autoFit=false;this.virtual.ppu=clamp(this.ppu()*factor,this.fitPpu('all')*.25,this.fitPpu('all')*4096);this.viewer.onCamera();return;}
      const c=this.camera,t=c.target;
      this.autoFit=false;
      this.setCamera({alpha:c.alpha,beta:c.beta,radius:clamp(c.radius/factor,c.lowerRadiusLimit,c.upperRadiusLimit),target:[t.x,t.y,t.z]},true);
    }
    zoomToRatio(ratio){
      this.computeFit();
      if(!this.camera){this.virtual.ppu=this.ppuAt(this.fitRadiusAll)*ratio;this.viewer.render({camera:'keep'});return;}
      const c=this.camera,t=c.target;
      this.autoFit=false;
      this.setCamera({alpha:c.alpha,beta:c.beta,radius:clamp(this.fitRadiusAll/ratio,c.lowerRadiusLimit||0,c.upperRadiusLimit||Infinity),target:[t.x,t.y,t.z]},false);
      this.viewer.render({camera:'keep'});
    }
    centerOn(points,ppu){
      if(!this.camera){const b=bounds(points);this.autoFit=false;this.virtual.dataView={x:b.cx,y:b.cy,z:b.cz};this.virtual.ppu=ppu;this.viewer.onCamera();return;}
      const box=this.boxOf(points),c=this.camera;
      let radius=this.radiusFor(ppu);
      if(points.length>1){const {w,h}=this.size();radius=Math.max(radius,fitDistance(boxCorners(box.half.map(v=>Math.max(v,.5))),c.alpha,c.beta,c.fov,w/h,.8));}
      this.autoFit=false;
      this.setCamera({alpha:c.alpha,beta:c.beta,radius:clamp(radius,c.lowerRadiusLimit,c.upperRadiusLimit),target:box.center},true);
    }
    panToScreen(){const s=this.viewer.visibleSelection()[0];if(!s)return;const a=this.anchors.find(x=>x.kind===s.kind&&x.id===s.id);if(a){const c=this.camera;this.setCamera({alpha:c.alpha,beta:c.beta,radius:c.radius,target:a.pos},true);}}
    onResize(){
      if(!this.engine||this.dead) return;
      const priorRadius=this.fitRadiusAll,c=this.camera,t=c.target,fr=this.viewer.frame,S=DEFAULTS.sceneSize;
      const dataView={x:fr.invert(0,t.x/S),y:fr.invert(1,t.y/S),z:fr.invert(2,t.z/S),alpha:c.alpha,beta:c.beta,ratio:priorRadius/c.radius};
      this.engine.resize();
      const size=`${this.canvas.clientWidth}x${this.canvas.clientHeight}`;
      if(size===this.lastSize) return;
      this.lastSize=size;
      if(this.autoFit){this.viewer.render({camera:'fit'});return;}
      if(this.viewer.publicBoundary){this.stopAnimation();this.viewer.render({camera:{dataView}});return;}
      // Keep the camera target and the zoom relative to the new fit distance.
      const ratio=this.fitRadiusScope/this.camera.radius;
      this.computeFit();
      this.camera.radius=this.fitRadiusScope/ratio;
      this.dirty=true;
      this.viewer.render({camera:'keep'});
    }
    disposeList(list){for(const m of list.splice(0)) if(m&&m.dispose) m.dispose(false,false);}
    draw(view){
      if(!this.engine) return;
      const B=global.BABYLON,scene=this.scene;
      this.configure();
      this.disposeList(this.content);
      this.view=view;
      const vec=a=>new B.Vector3(a[0],a[1],a[2]);
      const anchors=[],byKey=new Map();
      for(const c of view.clusters){const a={kind:'cluster',id:c.id,pos:this.sceneOf(c),px:this.viewer.clusterSize(c),label:'',count:c.count,priority:0};anchors.push(a);byKey.set(keyOf('cluster',c.id),a);}
      for(const p of view.points){const a={kind:'point',id:p.id,pos:this.sceneOf(p),px:this.viewer.pointSize(p),color:p.style&&p.style.color,label:p.label,count:1,priority:this.viewer.degree.get(p.id)||0};anchors.push(a);byKey.set(keyOf('point',p.id),a);}
      const hasColors=anchors.some(a=>a.color);
      if(hasColors){const white=new B.Color3(1,1,1);this.mats.point.diffuseColor=white;this.mats.point.emissiveColor=white.scale(.35);}
      this.pointMesh._hgWhite=hasColors;
      this.anchors=anchors;this.anchorByKey=byKey;
      this.contextAnchors=(view.context||[]).map(p=>({pos:this.sceneOf(p),px:DEFAULTS.contextPx}));
      // Relationships: one line system, fading in from the source, with a cone at the target end (arrows).
      const edgeAnchors=[],lines=[],colors=[],arrows=[];
      const calm=clamp(Math.sqrt(60/Math.max(60,view.relationships.length+view.bundles.length)),.35,1);
      const edgeC=B.Color3.FromHexString(this.viewer.palette().edge),bundleC=B.Color3.FromHexString(this.viewer.palette().bundle);
      const startC=edgeC.toColor4(.35*calm),endC=edgeC.toColor4(.95*calm);
      const offsets=pairOffsets(view.relationships);
      const S=DEFAULTS.sceneSize;
      // Arrow at the `to` end of a polyline, pointing along its last segment, set back by the glyph radius.
      const arrowAt=(pts,toEnd,glyph)=>{
        const n=pts.length,tip=toEnd?pts[n-1]:pts[0],prev=toEnd?pts[n-2]:pts[1];
        const dir=normalizeVec([tip[0]-prev[0],tip[1]-prev[1],tip[2]-prev[2]]);
        if(Math.hypot(tip[0]-prev[0],tip[1]-prev[1],tip[2]-prev[2])>1e-9) arrows.push({tip,dir,px:glyph.px});
      };
      for(const r of view.relationships){
        const a=byKey.get(keyOf('point',r.source)),d=byKey.get(keyOf('point',r.target));
        if(!a||!d) continue;
        const pts=r.selfLink?loop3(a.pos,S*.03):curve3(a.pos,d.pos,(offsets.get(r.id)||0)*S*.03);
        lines.push(pts.map(vec));
        const rc=r.style&&r.style.color?B.Color3.FromHexString(r.style.color):edgeC,sc=rc.toColor4(.35*calm),ec=rc.toColor4(.95*calm);
        colors.push(pts.map((p,i)=>r.selfLink?rc.toColor4(.6*calm):B.Color4.Lerp?B.Color4.Lerp(sc,ec,i/(pts.length-1)):(i?ec:sc)));
        if(!r.selfLink&&this.viewer.config.relationships.directionCues){if(r.direction!=='none')arrowAt(pts,true,d);if(r.direction==='both')arrowAt(pts,false,a);}
        edgeAnchors.push({kind:'relationship',id:r.id,pts3:pts,label:r.label,count:1});
      }
      const loopLines=[];
      const tubes=[];
      for(const b of view.bundles){
        const a=byKey.get(keyOf(b.sourceKind,b.source)),d=byKey.get(keyOf(b.targetKind,b.target));
        if(!a||!d) continue;
        if(b.selfLink){const pts=loop3(a.pos,S*.04);loopLines.push(pts.map(vec));edgeAnchors.push({kind:'bundle',id:b.id,pts3:pts,count:b.count,label:''});continue;}
        const pts=[a.pos,d.pos];
        tubes.push({pts,count:b.count});
        if(this.viewer.config.relationships.directionCues&&(b.direction==='forward'||b.direction==='both')) arrowAt(pts,true,d);
        if(this.viewer.config.relationships.directionCues&&(b.direction==='backward'||b.direction==='both')) arrowAt(pts,false,a);
        edgeAnchors.push({kind:'bundle',id:b.id,pts3:pts,count:b.count,label:''});
      }
      this.arrows=arrows;
      this.mats.bundle.alpha=.8*calm;
      if(lines.length){
        const ls=B.MeshBuilder.CreateLineSystem('hg-rels',{lines,colors,useVertexAlpha:true},scene);
        ls.isPickable=false;this.content.push(ls);
      }
      if(loopLines.length){
        const ls=B.MeshBuilder.CreateLineSystem('hg-loops',{lines:loopLines},scene);
        ls.color=bundleC;ls.alpha=.6*calm;ls.isPickable=false;this.content.push(ls);
      }
      this.tubes=tubes;this.tubeMesh=null;this.tubePpu=0;
      this.edgeAnchors=edgeAnchors;
      this.drawGuides();
      this.glyphPpu=0;
      this.updateGlyphs(true);
      this.dirty=true;
    }
    // Keep glyph and bundle sizes constant on screen at the focal distance.
    updateGlyphs(force){
      const ppu=this.ppu()/DEFAULTS.sceneSize;
      if(!force&&this.glyphPpu&&Math.abs(ppu/this.glyphPpu-1)<DEFAULTS.restyleStep) return;
      this.glyphPpu=ppu;
      const fill=(mesh,list)=>{
        if(!list.length){mesh.setEnabled(false);return;}
        const buf=new Float32Array(list.length*16);
        list.forEach((a,i)=>{const s=a.px/ppu,o=i*16;buf[o]=s;buf[o+5]=s;buf[o+10]=s;buf[o+15]=1;buf[o+12]=a.pos[0];buf[o+13]=a.pos[1];buf[o+14]=a.pos[2];});
        mesh.thinInstanceSetBuffer('matrix',buf,16,false);
        const custom=list.some(a=>a.color);
        if(custom||mesh._hgColors){const palette=this.viewer.palette(),base=mesh._hgWhite?new global.BABYLON.Color3(1,1,1):global.BABYLON.Color3.FromHexString(palette.point);const colors=new Float32Array(list.length*4);list.forEach((a,i)=>{const c=global.BABYLON.Color3.FromHexString(a.color||palette.point);colors.set([base.r?c.r/base.r:c.r,base.g?c.g/base.g:c.g,base.b?c.b/base.b:c.b,1],i*4);});mesh.thinInstanceSetBuffer('color',colors,4,false);mesh._hgColors=true;}
        mesh.setEnabled(true);
      };
      fill(this.pointMesh,this.anchors.filter(a=>a.kind==='point'));
      fill(this.clusterMesh,this.anchors.filter(a=>a.kind==='cluster'));
      fill(this.contextMesh,this.contextAnchors||[]);
      this.fillArrows(ppu);
      if(force||!this.tubePpu||Math.abs(Math.log(ppu/this.tubePpu))>Math.log(1.3)) this.rebuildTubes(ppu);
      this.rebuildHighlight();
      this.dirty=true;
    }
    // Cone matrices (row-vector convention): local X and Z span the base, local Y runs base->apex along the line.
    fillArrows(ppu){
      const list=this.arrows||[],mesh=this.arrowMesh;
      if(!mesh) return;
      if(!list.length){mesh.setEnabled(false);return;}
      const L=DEFAULTS.arrowPx/ppu,W=L*.62,buf=new Float32Array(list.length*16);
      list.forEach((a,i)=>{
        const d=a.dir,back=a.px/2/ppu+L/2,o=i*16;
        let u=cross(d,Math.abs(d[1])<.95?[0,1,0]:[1,0,0]);u=normalizeVec(u);
        const v=cross(u,d);
        buf.set([u[0]*W,u[1]*W,u[2]*W,0, d[0]*L,d[1]*L,d[2]*L,0, v[0]*W,v[1]*W,v[2]*W,0, a.tip[0]-d[0]*back,a.tip[1]-d[1]*back,a.tip[2]-d[2]*back,1],o);
      });
      mesh.thinInstanceSetBuffer('matrix',buf,16,false);
      mesh.setEnabled(true);
    }
    rebuildTubes(ppu){
      const B=global.BABYLON;
      if(this.tubeMesh){this.tubeMesh.dispose(false,false);this.content=this.content.filter(m=>m!==this.tubeMesh);this.tubeMesh=null;}
      this.tubePpu=ppu;
      if(!this.tubes||!this.tubes.length) return;
      const meshes=this.tubes.map(t=>B.MeshBuilder.CreateTube('hg-bundle',{path:t.pts.map(p=>new B.Vector3(p[0],p[1],p[2])),radius:this.viewer.bundleWidth(t)/2/ppu,tessellation:8},this.scene));
      const merged=meshes.length>1&&B.Mesh&&B.Mesh.MergeMeshes?B.Mesh.MergeMeshes(meshes,true,true):meshes[0];
      merged.material=this.mats.bundle;merged.isPickable=false;
      this.tubeMesh=merged;this.content.push(merged);
    }
    drawGuides(){
      const B=global.BABYLON,box=this.allBox||this.boxOf(this.viewer.data.points);
      this.guideAnchors=[];
      if(!box) return;
      const fr=this.viewer.frame,lo=box.lo,hi=box.hi,lines=[],v=(x,y,z)=>new B.Vector3(x,y,z);
      const floor=lo[1],names=['x','y','z'],axesInfo=this.viewer.data.axes;
      // Faint floor grid under the data plus the three axes from the low corner, labelled with their names and
      // data ranges in the axis's own wording (times, dates, units).
      const steps=4;
      if(this.viewer.config.axes.grid&&hi[0]>lo[0]&&hi[2]>lo[2]) for(let i=0;i<=steps;i++){const x=lo[0]+(hi[0]-lo[0])*i/steps,z=lo[2]+(hi[2]-lo[2])*i/steps;lines.push([v(x,floor,lo[2]),v(x,floor,hi[2])],[v(lo[0],floor,z),v(hi[0],floor,z)]);}
      const grid=lines.length?B.MeshBuilder.CreateLineSystem('hg-floor',{lines},this.scene):null;
      if(grid){grid.color=B.Color3.FromHexString(this.viewer.palette().grid);grid.isPickable=false;this.content.push(grid);}
      if(!this.viewer.config.axes.visible)return;
      const axes=[];
      for(let i=0;i<3;i++){
        if(!(hi[i]>lo[i])) continue;
        const end=lo.slice();end[i]=hi[i];
        axes.push([v(lo[0],lo[1],lo[2]),v(end[0],end[1],end[2])]);
        const b=fr.bounds,range=[[b.minX,b.maxX],[b.minY,b.maxY],[b.minZ,b.maxZ]][i];
        const at=lo.slice();at[i]=lo[i]+(hi[i]-lo[i])*.12;
        const mid=lo.slice();mid[i]=(lo[i]+hi[i])/2;
        const axis=axesInfo[names[i]];
        this.guideAnchors.push({key:names[i]+'-lo',pos:at,text:axisShort(axis,range[0])},{key:names[i]+'-hi',pos:end,text:axisShort(axis,range[1])},
          {key:names[i]+'-name',pos:mid,text:axis.title,cls:'hg-tick hg-axis-name'});
      }
      if(axes.length){const ax=B.MeshBuilder.CreateLineSystem('hg-axes',{lines:axes},this.scene);ax.color=B.Color3.FromHexString(this.viewer.palette().axis);ax.isPickable=false;this.content.push(ax);}
    }
    rebuildHighlight(){
      const B=global.BABYLON;
      this.disposeList(this.highlights);
      const sel=this.selectedKeys||[],ppu=this.glyphPpu||this.ppu()/DEFAULTS.sceneSize;
      for(const key of sel){
        const a=this.anchorByKey&&this.anchorByKey.get(key);
        if(a){const s=B.MeshBuilder.CreateSphere('hg-sel',{diameter:(a.px+6)/ppu,segments:16},this.scene);s.position=new B.Vector3(a.pos[0],a.pos[1],a.pos[2]);s.material=this.mats.selected;s.isPickable=false;this.highlights.push(s);continue;}
        const e=this.edgeAnchors.find(x=>keyOf(x.kind,x.id)===key);
        if(e){const t=B.MeshBuilder.CreateTube('hg-sel-edge',{path:e.pts3.map(p=>new B.Vector3(p[0],p[1],p[2])),radius:(e.kind==='bundle'?bundlePx(e.count)/2+1:1.3)/ppu,tessellation:8},this.scene);t.material=this.mats.selected;t.isPickable=false;this.highlights.push(t);}
      }
      for(const key of this.incidentKeys||[]){
        const e=this.edgeAnchors.find(x=>keyOf(x.kind,x.id)===key);
        if(e){const t=B.MeshBuilder.CreateTube('hg-incident',{path:e.pts3.map(p=>new B.Vector3(p[0],p[1],p[2])),radius:.9/ppu,tessellation:6},this.scene);t.material=this.mats.incident;t.isPickable=false;this.highlights.push(t);}
      }
      this.dirty=true;
    }
    highlight(visible,incident){
      this.selectedKeys=(visible||[]).map(r=>keyOf(r.kind,r.id));
      this.incidentKeys=(incident||[]).map(r=>keyOf(r.kind,r.id));
      if(!this.engine) return;
      this.rebuildHighlight();
      this.requestFrame();
    }
    afterFrame(){if(this.engine)this.updateGlyphs(false);}
    // Screen projection with the live view*projection matrix (CSS pixels).
    projector(){
      const c=this.camera,{w,h}=this.size();
      const m=c.getViewMatrix(true).multiply(c.getProjectionMatrix(true)).m;
      return p=>{
        const x=p[0]*m[0]+p[1]*m[4]+p[2]*m[8]+m[12],y=p[0]*m[1]+p[1]*m[5]+p[2]*m[9]+m[13],wc=p[0]*m[3]+p[1]*m[7]+p[2]*m[11]+m[15];
        if(wc<=1e-6) return null;
        return [(x/wc*.5+.5)*w,(1-(y/wc*.5+.5))*h,wc];
      };
    }
    project(){
      this.projectedAt=this.cameraStamp();
      const proj=this.projector(),nodes=[],edges=[],focal=this.camera.radius;
      for(const a of this.anchors){
        const s=proj(a.pos);
        if(!s) continue;
        const r=a.px/2*focal/Math.max(s[2],1e-6);
        nodes.push({kind:a.kind,id:a.id,x:s[0],y:s[1],r:Math.max(r,2),label:a.label,count:a.count,priority:a.priority,depth:s[2]});
      }
      nodes.sort((p,q)=>q.depth-p.depth);
      for(const e of this.edgeAnchors){
        const pts=e.pts3.map(proj);
        if(pts.some(p=>!p)) continue;
        const mid=pts[Math.floor(pts.length/2)],a=pts[0],b=pts[pts.length-1];
        const x=e.pts3.length===2?(a[0]+b[0])/2:mid[0],y=e.pts3.length===2?(a[1]+b[1])/2:mid[1];
        edges.push({kind:e.kind,id:e.id,count:e.count,label:e.label,x,y,pts:pts.map(p=>[p[0],p[1]])});
      }
      this.nodes=nodes;this.edges=edges;
      this.guideScreen=(this.guideAnchors||[]).map(g=>{const s=proj(g.pos);return s?{key:g.key,x:s[0]+4,y:s[1]-6,text:g.text,align:'left',cls:g.cls}:null;}).filter(Boolean);
    }
    // Guide text that would overlap is dropped: axis names first, then range ends, then range starts.
    ticks(){
      const {w,h}=this.size(),kept=[],boxes=[],rank=t=>t.cls?0:t.key.endsWith('-hi')?1:2;
      const list=(this.guideScreen||[]).filter(t=>t.x>=0&&t.y>=0&&t.y<h-12).sort((a,b)=>rank(a)-rank(b));
      for(const t of list){
        const box={x0:t.x-2,y0:t.y-1,x1:t.x+tickWidth(this.overlay,t.text,t.cls)+2,y1:t.y+13};
        if(box.x1>w-4||boxes.some(b=>box.x0<b.x1&&box.x1>b.x0&&box.y0<b.y1&&box.y1>b.y0)) continue;
        boxes.push(box);kept.push(t);
      }
      return kept;
    }
    destroy(){
      this.destroyBase();
      this.animation=null;
      if(this.engine){this.engine.stopRenderLoop();this.engine.dispose();}
      if(this.canvas) this.canvas.remove();
      this.engine=null;this.scene=null;this.camera=null;this.canvas=null;
    }
  }
  function curve3(a,d,offset){
    if(!offset) return [a,d];
    const dir=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];
    let perp=cross(dir,[0,1,0]);
    if(Math.hypot(...perp)<1e-6) perp=cross(dir,[1,0,0]);
    perp=normalizeVec(perp);
    const ctrl=[0,1,2].map(i=>a[i]+dir[i]*.5+perp[i]*offset*2),pts=[];
    for(let i=0;i<=10;i++){const t=i/10;pts.push([0,1,2].map(k=>(1-t)*(1-t)*a[k]+2*t*(1-t)*ctrl[k]+t*t*d[k]));}
    return pts;
  }
  function loop3(c,rho){
    const u=[Math.SQRT1_2,Math.SQRT1_2,0],v=[-Math.SQRT1_2,Math.SQRT1_2,0],pts=[];
    for(let i=0;i<=20;i++){const t=i/20*Math.PI*2;pts.push([0,1,2].map(k=>c[k]+u[k]*rho*(1-Math.cos(t))+v[k]*rho*Math.sin(t)));}
    return pts;
  }

  function createSpatialView(container, options){
    return new HGSpatialDefaultView({...(options||{}),container});
  }


  // Public contract boundary. The compatibility viewer above and this controller share one engine.
  class HGSpatialError extends Error {
    constructor(code,path,message){super(message||code);this.name='HGSpatialError';this.code=code;this.path=path||'';}
  }
  const fail=(code,path,message)=>{throw new HGSpatialError(code,path,message);};
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const plain=o=>{
    if(!o||Object.prototype.toString.call(o)!=='[object Object]')return false;
    const p=Object.getPrototypeOf(o);
    return p===null||Object.getPrototypeOf(p)===null;
  };
  const validId=id=>typeof id==='string'&&id.length>0;
  const colorValue=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
  const same=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
  const warning=(code,path,kind,id)=>({code,severity:'warning',path,...(kind?{kind}:{}),...(validId(id)?{id}:{}),message:code.replace(/-/g,' ')});
  const ENUMS={
    'view.mode':['auto','2d','3d'],'view.missingZ':['zero','reject'],'view.aspect':['adaptive','equal'],
    'labels.points':['auto','selected','none'],'labels.relationships':['selected','none'],
    'lod.density':['default','coarser','finer'],'lod.bundleBy':['endpoints','direction-type'],
    'accessibility.reducedMotion':['system','always'],'accessibility.targetSize':['default','large']
  };
  const RANGES={'points.size':[4,64],'relationships.width':[.5,8],'clusters.size':[12,96],'bundles.width':[.5,12]};
  function mergeOptions(current,patch){
    function merge(base,change,defaults,path){
      if(change===undefined)return copy(base);
      if(change===null)return copy(defaults);
      if(!plain(change))fail('invalid-options',path,'Expected an option object');
      const out=copy(base);
      for(const k of Object.keys(change)){
        const next=path+'.'+k;
        if(!own(defaults,k))fail('invalid-options',next,'Unknown option');
        const v=change[k];if(v===undefined)continue;
        if(plain(defaults[k]))out[k]=merge(base[k],v,defaults[k],next);
        else out[k]=v===null?copy(defaults[k]):Array.isArray(v)?v.slice():v;
      }
      return out;
    }
    const out=merge(current,patch,BUILTIN,'options');
    function validate(o,defaults,path){
      for(const k of Object.keys(defaults)){
        const v=o[k],key=path?path+'.'+k:k,p='options.'+key,d=defaults[k];
        if(plain(d)){validate(v,d,key);continue;}
        let ok;
        if(ENUMS[key])ok=ENUMS[key].includes(v);
        else if(RANGES[key])ok=(v==='auto'&&d==='auto')||(finite(v)&&v>=RANGES[key][0]&&v<=RANGES[key][1]);
        else if(key.endsWith('.format'))ok=AXIS_FORMATS.includes(v);
        else if(key.endsWith('.categories'))ok=Array.isArray(v)&&Array.from(v).every(validId)&&new Set(v).size===v.length;
        else if(key.startsWith('theme.')||key.endsWith('.color'))ok=colorValue(v);
        else if(typeof d==='boolean')ok=typeof v==='boolean';
        else ok=typeof v==='string'&&(key!=='accessibility.label'||v.length>0);
        if(!ok)fail('invalid-options',p,'Invalid option value');
      }
    }
    validate(out,BUILTIN,'');
    for(const k of ['x','y','z']){
      const a=out.axes[k],p='options.axes.'+k;
      if(a.format!=='number'&&a.unit!=='')fail('invalid-options',p+'.unit','Units require number format');
      if(a.format==='category'?!a.categories.length:!!a.categories.length)fail('invalid-options',p+'.categories','Categories must match the axis format');
    }
    return out;
  }
  // Iterative JSON copying rejects cycles, accessors and non-JSON values without interpreting metadata.
  function jsonMetadata(input){
    if(!plain(input))throw new Error('metadata');
    const out={},active=new Set(),stack=[{source:input,target:out,exit:false}];
    while(stack.length){
      const job=stack.pop(),source=job.source;
      if(job.exit){active.delete(source);continue;}
      if(active.has(source))throw new Error('cycle');
      active.add(source);stack.push({source,exit:true});
      const keys=Object.keys(source);
      if(Array.isArray(source)&&keys.length!==source.length)throw new Error('sparse array');
      for(const k of keys){
        const desc=Object.getOwnPropertyDescriptor(source,k);
        if(!desc||!own(desc,'value'))throw new Error('accessor');
        const v=desc.value;
        if(v===null||typeof v==='string'||typeof v==='boolean'||finite(v))Object.defineProperty(job.target,k,{value:v,writable:true,enumerable:true,configurable:true});
        else if(Array.isArray(v)||plain(v)){
          const target=Array.isArray(v)?[]:{};
          Object.defineProperty(job.target,k,{value:target,writable:true,enumerable:true,configurable:true});
          stack.push({source:v,target,exit:false});
        }else throw new Error('non-json');
      }
    }
    return out;
  }
  function normalizeRecord(input,kind,path,diagnostics){
    const point=kind==='point',id=plain(input)?input.id:undefined;
    const warn=(code,field)=>diagnostics.push(warning(code,path+(field?'.'+field:''),kind,id));
    if(!plain(input)||!validId(id)||(point?(!finite(input.x)||!finite(input.y)):(!validId(input.source)||!validId(input.target)))){
      warn(point?'invalid-point':'invalid-relationship');return null;
    }
    const required=point?['id','x','y']:['id','source','target'];
    const optional=point?['z','label','category','style','metadata']:['label','type','direction','style','metadata'];
    const out=Object.fromEntries(required.map(k=>[k,input[k]]));
    out.label=id;out.metadata={};
    if(point){out.z=input.z==null?null:finite(input.z)?input.z:null;if(input.z!=null&&!finite(input.z))warn('invalid-z','z');}
    else out.direction='forward';
    for(const k of Object.keys(input))if(!required.includes(k)&&!optional.includes(k))warn('unknown-field',k);
    for(const k of point?['label','category']:['label','type']){
      if(input[k]===undefined)continue;
      if(typeof input[k]!=='string'){warn('invalid-field',k);continue;}
      if(k!=='label'||input[k]!=='')out[k]=input[k];
    }
    if(!point&&input.direction!==undefined){if(['forward','both','none'].includes(input.direction))out.direction=input.direction;else warn('invalid-field','direction');}
    if(input.style!==undefined){
      const style=input.style,measure=point?'size':'width',range=point?[4,64]:[.5,8];
      if(!plain(style))warn('invalid-field','style');
      else{
        const clean={};
        for(const k of Object.keys(style)){
          if(!['color',measure].includes(k)){warn('unknown-field','style.'+k);continue;}
          if(style[k]===undefined)continue;
          if(k==='color'?colorValue(style[k]):finite(style[k])&&style[k]>=range[0]&&style[k]<=range[1])clean[k]=style[k];
          else warn('invalid-field','style.'+k);
        }
        if(Object.keys(clean).length)out.style=clean;
      }
    }
    if(input.metadata!==undefined){try{out.metadata=jsonMetadata(input.metadata);}catch(_){warn('invalid-field','metadata');}}
    return out;
  }
  function envelope(value,keys,code,path){
    if(!plain(value))fail(code,path,'Expected an object');
    for(const k of Object.keys(value))if(!keys.includes(k))fail(code,path+'.'+k,'Unknown field');
  }
  function checkDuplicates(records,path,strict){
    const seen=new Set();
    for(let i=0;i<records.length;i++){
      const r=records[i],id=r&&r.id,p=path+'['+i+'].id';
      if(strict&&(!plain(r)||!validId(id)))fail('invalid-argument',p,'Patch requires a string ID');
      if(!validId(id))continue;
      if(seen.has(id))fail('duplicate-id',p,'Duplicate stable ID');
      seen.add(id);
    }
  }
  function ingest(input){
    envelope(input,['points','relationships'],'invalid-data','data');
    if(!Array.isArray(input.points))fail('invalid-data','data.points','Expected points array');
    if(input.relationships!==undefined&&!Array.isArray(input.relationships))fail('invalid-data','data.relationships','Expected relationships array');
    const diagnostics=[],data={points:[],relationships:[]};
    for(const [key,kind] of [['points','point'],['relationships','relationship']]){
      const records=input[key]||[];checkDuplicates(records,'data.'+key,false);
      records.forEach((r,i)=>{const clean=normalizeRecord(r,kind,'data.'+key+'['+i+']',diagnostics);if(clean)data[key].push(clean);});
    }
    return {data,diagnostics};
  }
  function transaction(current,changes){
    envelope(changes,['points','relationships','removePointIds','removeRelationshipIds'],'invalid-argument','changes');
    const diagnostics=[],data={};
    for(const [key,kind,remove] of [['points','point','removePointIds'],['relationships','relationship','removeRelationshipIds']]){
      for(const k of [key,remove])if(changes[k]!==undefined&&!Array.isArray(changes[k]))fail('invalid-argument','changes.'+k,'Expected an array');
      const patches=changes[key]||[],removals=changes[remove]||[];
      removals.forEach((id,i)=>{if(!validId(id))fail('invalid-argument','changes.'+remove+'['+i+']','Expected a string ID');});
      checkDuplicates(patches,'changes.'+key,true);
      const removed=new Set(removals),map=new Map(current[key].map(r=>[r.id,r]));
      for(const id of removed)map.delete(id);
      patches.forEach((patch,i)=>{
        const path='changes.'+key+'['+i+']';
        if(removed.has(patch.id))fail('conflicting-change',path+'.id','ID is both removed and upserted');
        const candidate={...map.get(patch.id)};
        for(const k of Object.keys(patch)){
          if(patch[k]===undefined)continue;
          if(patch[k]===null&&['label','category','type','style','metadata','direction'].includes(k))delete candidate[k];
          else Object.defineProperty(candidate,k,{value:patch[k],writable:true,enumerable:true,configurable:true});
        }
        const clean=normalizeRecord(candidate,kind,path,diagnostics);
        if(clean)map.set(clean.id,clean);
      });
      data[key]=[...map.values()];
    }
    return {data,diagnostics};
  }
  function resolveMode(data,requested){return requested==='auto'?(data.points.length&&data.points.every(p=>p.z!==null)?'3d':'2d'):requested;}
  function derivedDiagnostics(data,options,mode){
    const out=[],ids=new Set(data.points.map(p=>p.id));
    const missing=data.points.filter(p=>p.z===null);
    if(mode==='3d'&&missing.length){
      if(options.view.missingZ==='reject')fail('missing-z','options.view.missingZ','3D requires a Z value for every point');
      out.push(warning(missing.length===data.points.length?'missing-z':'mixed-z','data.points'));
    }
    data.relationships.forEach((r,i)=>{if(!ids.has(r.source)||!ids.has(r.target))out.push(warning('absent-endpoint','data.relationships['+i+']','relationship',r.id));});
    for(const k of ['x','y','z']){
      const a=options.axes[k];
      data.points.forEach((p,i)=>{
        const v=p[k];if(v===null)return;
        if(a.format==='date'&&Math.abs(v)>8.64e15||a.format==='category'&&(!Number.isInteger(v)||v<0||v>=a.categories.length))out.push(warning('axis-format','data.points['+i+'].'+k,'point',p.id));
      });
    }
    if(mode==='3d'&&(options.relationships.width!=='auto'||data.relationships.some(r=>r.style&&r.style.width!==undefined)))out.push(warning('cosmetic-approximation','options.relationships.width'));
    if(mode==='3d'&&options.bundles.width!=='auto')out.push(warning('cosmetic-approximation','options.bundles.width'));
    return out;
  }
  const owners=new WeakMap(),EVENT_TYPES=['datachange','selectionchange','focuschange','diagnostics','viewchange'];
  const refOf=s=>s?{kind:s.kind,id:s.id}:null;
  function validRef(ref,kinds){
    if(!plain(ref)||Object.keys(ref).some(k=>!['kind','id'].includes(k))||!validId(ref.id)||!(kinds||['point','relationship','cluster','bundle']).includes(ref.kind))fail('invalid-argument','ref','Expected a typed object reference');
    return ref;
  }
  class PublicController {
    constructor(container,data,options,warnings,mode){
      this.container=container;this.data=data;this.options=options;this.ingestion=warnings;this.revision=0;
      this.listeners=new Map(EVENT_TYPES.map(t=>[t,[]]));this.batches=[];this.dead=false;this.busy=true;this.transient=[];
      this.engine=new HGSpatialDefaultView({...data,container,mode,axes:options.axes,config:options,onEvent:()=>this.environmentChanged()});
      const e=this.engine;
      e.publicAction=(source,reason,fn)=>this.mutate(reason,()=>{const result=fn();if(['zoom','reveal'].includes(reason))e.onCamera();return result;},source);
      e.onClamp=()=>{this.transient=[warning('view-clamped','')];};
      this.refreshMetadata();e.updateChrome();
      this.busy=false;this.last=this.state();this.lastSignature=this.signature();this.lastSize=e.adapter.lastSize;
      this.queue('system','mount',this.last.diagnostics.length?[['diagnostics',{diagnostics:this.last.diagnostics}],['viewchange',{state:this.last}]]:[['viewchange',{state:this.last}]]);
      this.stopSize=observeResize(container,()=>{
        if(this.dead)return;
        this.mutate('resize',()=>{
          if(this.measurable()){const a=e.adapter;if(!a.ready)e.render({camera:a.autoFit?'fit':'keep'});else a.onResize();}
        },'system');
      });
    }
    measurable(){return this.container.clientWidth>0&&this.container.clientHeight>0;}
    refreshMetadata(){
      const e=this.engine;
      this.records={point:new Map(this.data.points.map(r=>[r.id,r])),relationship:new Map(this.data.relationships.map(r=>[r.id,r]))};
      for(const [key,kind] of [['points','point'],['relationships','relationship']]){
        e.data.meta[key]=new Map(this.data[key].map(r=>[r.id,metaRows(r.metadata,new Set())]));
      }
      e.data.diagnostics=this.diagnostics();
    }
    diagnostics(){
      const e=this.engine;
      if(!this.derived||this.derived.data!==this.data||this.derived.options!==this.options||this.derived.mode!==e.mode)this.derived={data:this.data,options:this.options,mode:e.mode,warnings:derivedDiagnostics(this.data,this.options,e.mode)};
      const out=[...this.ingestion,...this.derived.warnings,...this.transient];
      if(!this.measurable())out.push(warning('container-hidden','container'));
      else if(!e.adapter.ready)out.push(warning('renderer-unavailable',''));
      return out;
    }
    selection(){
      const e=this.engine,s=e.selection;
      return s?{target:refOf(s),originalIds:s.originalIds.slice().sort(),representedBy:e.visibleSelection().map(refOf).sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:a.id<b.id?-1:a.id>b.id?1:0)}:null;
    }
    state(){
      const e=this.engine,a=e.adapter,v=a.logicalDataView?a.logicalDataView():a.saveDataView(),f=e.focus;
      const empty=!this.data.points.length;
      return copy({revision:this.revision,mode:e.mode,renderStatus:!this.measurable()?'waiting-size':a.ready?'ready':'unavailable',selection:this.selection(),
        focus:f?{target:refOf(f),pointIds:f.pointIds.slice().sort(),relationshipIds:(f.relationshipIds||[]).slice().sort()}:null,canGoBack:!!e.history.length,
        view:{center:{x:empty?0:v.x===undefined?e.frame.center[0]:v.x,y:empty?0:v.y===undefined?e.frame.center[1]:v.y,z:e.mode==='2d'?null:empty?0:v.z===undefined?e.frame.center[2]:v.z},zoom:v.ratio||1,automaticFit:a.autoFit,lod:e.view.level},
        visible:{points:e.view.points.length,relationships:e.view.relationships.length,clusters:e.view.clusters.length,bundles:e.view.bundles.length},diagnostics:this.diagnostics()});
    }
    signature(){
      const e=this.engine,a=e.adapter;
      return JSON.stringify([this.options,e.levelIndex,a.lastSize,a.logicalStamp?a.logicalStamp():a.cameraStamp(),e.history.map(h=>[h.focus&&[h.focus.kind,h.focus.id,h.focus.pointIds,h.focus.relationshipIds],h.dataView])]);
    }
    assertAlive(){if(this.dead)fail('destroyed','','Viewer is destroyed');}
    object(ref){
      const e=this.engine,item=e.lookup(ref.kind,ref.id);if(!item)return null;
      if(ref.kind==='point'||ref.kind==='relationship'){
        const record=this.records[ref.kind].get(ref.id);
        return copy({kind:ref.kind,id:ref.id,record,...(ref.kind==='relationship'?{status:item.status,selfLink:item.selfLink}:{})});
      }
      if(ref.kind==='cluster')return {kind:'cluster',id:item.id,count:item.count,pointIds:item.pointIds.slice().sort()};
      return copy({kind:'bundle',id:item.id,count:item.count,relationshipIds:item.relationshipIds,pointIds:item.pointIds,
        ends:[{kind:item.sourceKind,id:item.source},{kind:item.targetKind,id:item.target}],directionCounts:item.directionCounts});
    }
    selectedRecords(){const s=this.selection();return s?s.originalIds.map(id=>this.object({kind:['point','cluster'].includes(s.target.kind)?'point':'relationship',id})):null;}
    mutate(reason,fn,source,force){
      if(this.busy)return fn();
      this.assertAlive();
      const before=this.last,records=this.selectedRecords(),oldData=this.data,oldSignature=this.lastSignature;
      this.busy=true;let result;
      try{if(this.engine.adapter.animating)this.engine.adapter.stopAnimation();result=fn();}finally{this.busy=false;}
      const currentDiagnostics=this.diagnostics();
      if(!same(this.engine.data.diagnostics,currentDiagnostics)){this.engine.data.diagnostics=currentDiagnostics;this.engine.updateChrome();}
      const after=this.state(),signature=this.signature();
      const changedData=!same(oldData,this.data),selectionChanged=!same(before.selection,after.selection)||!same(records,this.selectedRecords());
      const focusChanged=!same(before.focus,after.focus)||before.canGoBack!==after.canGoBack||this.historyChanged;
      this.historyChanged=false;
      if(!force&&!changedData&&!selectionChanged&&!focusChanged&&same(before,after)&&oldSignature===signature)return result;
      this.revision++;after.revision=this.revision;this.last=after;this.lastSignature=signature;
      this.lastSize=this.engine.adapter.lastSize;
      const events=[];
      if(changedData)events.push(['datachange',{points:this.data.points.length,relationships:this.data.relationships.length,diagnostics:after.diagnostics}]);
      if(selectionChanged)events.push(['selectionchange',{previous:before.selection,selection:after.selection}]);
      if(focusChanged)events.push(['focuschange',{previous:before.focus,focus:after.focus,canGoBack:after.canGoBack}]);
      if(!same(before.diagnostics,after.diagnostics))events.push(['diagnostics',{diagnostics:after.diagnostics}]);
      events.push(['viewchange',{state:after}]);
      if(reason==='select'&&focusChanged)reason='focus';else if(reason==='select'&&before.selection&&!after.selection)reason='clear';
      if(reason==='zoom'&&before.focus&&!after.focus)reason='zoom-out';
      this.queue(source||'api',reason,events);
      return result;
    }
    environmentChanged(){
      if(this.busy||this.dead||!this.engine)return;
      const a=this.engine.adapter;if(a.animating)return;
      const source=a.inputSource||'system',prior=this.last,nowState=this.state();
      let reason=prior.renderStatus!==nowState.renderStatus?'renderer':this.lastSize!==a.lastSize?'resize':prior.view.zoom!==nowState.view.zoom?'zoom':this.engine.mode==='3d'?'orbit':'pan';
      if(prior.focus&&!nowState.focus)reason='zoom-out';
      this.lastSize=a.lastSize;
      this.mutate(reason,()=>{},['renderer','resize'].includes(reason)?'system':source);
    }
    queue(source,reason,events){
      this.batches.push(events.map(([type,payload])=>({type,revision:this.revision,source,reason,payload:copy(payload)})));
      if(this.queued)return;this.queued=true;
      Promise.resolve().then(()=>{
        this.queued=false;if(this.dead)return;
        const batches=this.batches.splice(0);
        for(const batch of batches){
          // One registration snapshot per batch; subscriptions created inside it start with later batches.
          const listeners=new Map([...this.listeners].map(([t,list])=>[t,list.slice()]));
          for(const event of batch)for(const sub of listeners.get(event.type)||[]){
            if(this.dead)return;if(!sub.active)continue;
            try{sub.fn(copy(event));}catch(_){const error=new Error('HGSpatial event listener failed');if(typeof global.reportError==='function')global.reportError(error);else setTimeout(()=>{throw error;},0);}
          }
        }
      });
    }
    repairFocus(f){
      if(!f)return null;
      const pm=this.engine.data.pointMap,rm=this.engine.data.relationshipMap;
      const relationshipIds=f.kind==='bundle'?(f.relationshipIds||[]).filter(id=>rm.has(id)):[];
      const pointIds=f.kind==='bundle'?unique(relationshipIds.flatMap(id=>{const r=rm.get(id);return [r.source,r.target];})).filter(id=>pm.has(id)):f.pointIds.filter(id=>pm.has(id));
      if(!pointIds.length)return null;
      return {...f,pointIds,relationshipIds,count:f.kind==='bundle'?relationshipIds.length:pointIds.length,context:null};
    }
    repairHistory(){
      const e=this.engine,old=JSON.stringify(e.history.map(h=>h.focus&&[h.focus.kind,h.focus.id,h.focus.pointIds,h.focus.relationshipIds]));
      const next=[];
      for(const h of e.history){const f=this.repairFocus(h.focus);if(h.focus&&!f)continue;next.push({...h,focus:f,focusHierarchy:f?buildHierarchy(f.pointIds.map(id=>e.data.pointMap.get(id)),e.frame):null,selection:resolveSelection(h.selection,e.data),camera:null});}
      e.history=next;
      if(e.focus){
        const f=this.repairFocus(e.focus);
        if(f)e.focus=f;
        else{const ancestor=e.history.pop();e.focus=ancestor?ancestor.focus:null;}
      }
      if(!this.data.points.length){e.focus=null;e.history=[];}
      e.focusHierarchy=e.focus?buildHierarchy(e.focus.pointIds.map(id=>e.data.pointMap.get(id)),e.frame):null;
      this.historyChanged=old!==JSON.stringify(e.history.map(h=>h.focus&&[h.focus.kind,h.focus.id,h.focus.pointIds,h.focus.relationshipIds]));
    }
    commitData(candidate,reason){
      derivedDiagnostics(candidate.data,this.options,this.engine.mode); // Fatal policy checks precede all mutation.
      if(same(candidate.data,this.data)&&same(candidate.diagnostics,this.ingestion)&&!this.transient.length)return {diagnostics:copy(this.diagnostics())};
      return this.mutate(reason,()=>{
        this.transient=[];
        const e=this.engine,old=e.selection,dataView=e.adapter.autoFit?null:e.adapter.saveDataView();
        this.data=candidate.data;this.ingestion=candidate.diagnostics;
        e.setData({...this.data,axes:this.options.axes},e.mode);this.repairHistory();this.refreshMetadata();
        e.render({camera:dataView&&this.data.points.length?{dataView}:'fit'});
        e.selection=resolveSelection(old,e.data,e.view);e.adapter.highlight(e.visibleSelection(),e.incidentIds());e.updateChrome();
        return {diagnostics:copy(this.diagnostics())};
      });
    }
    replaceData(data){this.assertAlive();return this.commitData(ingest(data),'replace-data');}
    applyChanges(changes){this.assertAlive();return this.commitData(transaction(this.data,changes),'apply-changes');}
    setOptions(patch){
      this.assertAlive();if(patch===undefined)fail('invalid-options','options','Expected a patch');
      const options=mergeOptions(this.options,patch);
      const explicit=patch===null||(plain(patch)&&own(patch,'view')&&(patch.view===null||plain(patch.view)&&own(patch.view,'mode')&&patch.view.mode!==undefined));
      const mode=explicit?resolveMode(this.data,options.view.mode):this.engine.mode;
      derivedDiagnostics(this.data,options,mode);
      if(same(options,this.options)&&mode===this.engine.mode&&(!explicit||this.engine.adapter.ready)&&!this.transient.length)return {diagnostics:copy(this.diagnostics())};
      return this.mutate('set-options',()=>{
        const e=this.engine,old=this.options,oldSelection=e.selection;
        const representation=!same(old.view,options.view)||!same([old.axes.x,old.axes.y,old.axes.z],[options.axes.x,options.axes.y,options.axes.z])||!same(old.lod,options.lod);
        const dataView=e.adapter.autoFit?null:e.adapter.saveDataView(),retry=explicit&&!e.adapter.ready;
        this.options=options;e.config=options;e.axesInput=options.axes;e.data.axes=normalizeAxes(options.axes);this.transient=[];
        if(mode!==e.mode){
          e.history=e.focus?[{focus:null,selection:e.selection,camera:null,levelIndex:null}]:[];this.historyChanged=true;
          e.setMode(mode);
        }else{
          if(representation)e.rebuildModel();
          if(explicit){e.adapter.failed=false;delete e.controls.message.dataset.engine;}
          if(e.adapter.configure)e.adapter.configure();
          e.configureChrome();
          e.render({camera:representation||retry?(dataView?{dataView}:'fit'):'keep'});
        }
        if(representation)e.selection=resolveSelection(oldSelection,e.data,e.view);
        e.adapter.highlight(e.visibleSelection(),e.incidentIds());this.refreshMetadata();e.updateChrome();
        return {diagnostics:copy(this.diagnostics())};
      });
    }
    target(ref,kinds){validRef(ref,kinds);const obj=this.object(ref);if(!obj)fail('target-not-found','ref','Target is not in the current model');return obj;}
    select(ref){
      this.assertAlive();if(ref!==null)this.target(ref);
      return this.mutate(ref===null?'clear':'select',()=>{if(ref===null)this.engine.clearSelection();else this.engine.select(ref.kind,ref.id);});
    }
    focus(ref){
      this.assertAlive();validRef(ref,['cluster','bundle']);
      if(this.engine.focus&&this.engine.focus.kind===ref.kind&&this.engine.focus.id===ref.id)return;
      this.target(ref,['cluster','bundle']);
      return this.mutate('focus',()=>{
        const e=this.engine;if(e.focus&&e.focus.kind===ref.kind&&e.focus.id===ref.id)return;
        const old=e.selection,obj=e.lookup(ref.kind,ref.id);
        e.selection={...ref,originalIds:(ref.kind==='cluster'?obj.pointIds:obj.relationshipIds).slice(),item:copy(obj)};
        e.focusSelection();if(e.history.length)e.history[e.history.length-1].selection=old;e.selection=old;e.adapter.highlight(e.visibleSelection(),e.incidentIds());e.updateChrome();
      });
    }
    reveal(ref){
      this.assertAlive();const obj=this.target(ref,['point','relationship']);
      if(ref.kind==='relationship'&&![obj.record.source,obj.record.target].some(id=>this.engine.data.pointMap.has(id)))fail('target-not-drawable','ref','No endpoint is drawable');
      return this.mutate('reveal',()=>{
        const e=this.engine,old=e.selection;e.selection={...ref,originalIds:[ref.id]};e.reveal();e.selection=old;
        e.onCamera();e.adapter.highlight(e.visibleSelection(),e.incidentIds());e.updateChrome();
      });
    }
    zoomBy(factor){
      this.assertAlive();if(!finite(factor)||factor<=0)fail('invalid-argument','factor','Expected a positive finite zoom factor');
      return this.mutate('zoom',()=>{
        const e=this.engine,old=e.zoomRatio();this.transient=[];e.zoomBy(factor);e.onCamera();
        if(Math.abs(e.zoomRatio()/(old*factor)-1)>1e-7)this.transient=[warning('view-clamped','factor')];
      });
    }
    fit(){this.assertAlive();return this.mutate('fit',()=>{this.transient=[];this.engine.fit();});}
    reset(){this.assertAlive();return this.mutate('reset',()=>{this.transient=[];this.engine.reset();});}
    back(){this.assertAlive();if(!this.engine.history.length&&!this.engine.focus)return false;this.mutate('back',()=>this.engine.back());return true;}
    getObject(ref){this.assertAlive();validRef(ref);return this.object(ref);}
    getState(){this.assertAlive();return this.state();}
    on(type,listener){
      this.assertAlive();if(!EVENT_TYPES.includes(type))fail('invalid-argument','type','Unknown event type');if(typeof listener!=='function')fail('invalid-argument','listener','Expected a function');
      const sub={fn:listener,active:true},list=this.listeners.get(type);list.push(sub);
      return ()=>{if(!sub.active)return;sub.active=false;const i=list.indexOf(sub);if(i>=0)list.splice(i,1);sub.fn=null;};
    }
    destroy(){
      if(this.dead)return;this.dead=true;this.stopSize();this.engine.destroy();owners.delete(this.container);
      for(const list of this.listeners.values())for(const sub of list){sub.active=false;sub.fn=null;}
      this.listeners.clear();this.batches=[];this.data=null;this.records=null;this.ingestion=[];this.last=null;this.engine=null;this.container=null;
      this.stopSize=null;this.options=null;this.lastSignature=null;this.transient=[];this.derived=null;
    }
  }
  function createPublic(container,input,patch){
    const doc=global.document;
    if(!container||container.nodeType!==1||container.ownerDocument!==doc||container.namespaceURI!=='http://www.w3.org/1999/xhtml'||!container.isConnected)fail('invalid-container','container','Expected a connected HTML element in this document');
    if(owners.has(container))fail('container-in-use','container','Container already has a viewer');
    if(container.childNodes.length)fail('invalid-container','container','Container must be empty');
    const options=mergeOptions(BUILTIN,patch),candidate=ingest(input),mode=resolveMode(candidate.data,options.view.mode);
    derivedDiagnostics(candidate.data,options,mode);
    const controller=new PublicController(container,candidate.data,options,candidate.diagnostics,mode);
    owners.set(container,controller);
    const viewer={};
    for(const name of ['replaceData','applyChanges','setOptions','fit','reset','focus','back','select','reveal','zoomBy','getObject','getState','on','destroy'])viewer[name]=controller[name].bind(controller);
    return Object.freeze(viewer);
  }
  global.HGSpatial=Object.freeze({create:createPublic});

  global.HGSpatialDefault={createSpatialView,normalize,defaultMode,frame,fitScale,fitDistance,cameraBasis,planLabels,buildHierarchy,chooseLevel,ppuForLevel,aggregate,pickAt,nearestInDirection,abbreviate,niceTicks,axisTicks,axisValue,axisShort,normalizeAxes,formatNumber,hashIds,defaults:DEFAULTS,dependencyAssets:{cytoscape:CYTO_URL,babylon:BABYLON_URL}};
})(window);
