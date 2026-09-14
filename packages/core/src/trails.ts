/** Shared deterministic geometry for editor, offline renders and MDL export. */
import { DomainError, type Vec3, type TrailLayer, type EffectDocument } from './model.js';

export interface Anchor { time: number; position: Vec3 }
export const TRAIL_HZ=60;
export const TRAIL_CAPABILITIES={version:1,documentSchemaVersion:6,maxPathPoints:64,maxSegments:128,
  sampleHz:TRAIL_HZ,maxVertexSamples:1_000_000,maxMdlBytes:128*1024*1024,
  widthUnit:'full-core-fwhm-metres',headSizeUnit:'full-fwhm-diameter-metres',haloFwhmRatio:2.8,geometryWidthRatio:3,
  interpolation:'linear-authored-path; shared-60Hz-frame-interpolation',nativeVerified:false} as const;
export interface Section extends Anchor { side: Vec3; up: Vec3 }
export interface Frame { vertices: Vec3[]; uv: Vec3[] }
export interface CompiledTrail {
  name: string; color: string; period: number; sections: Section[];
  base: Frame; faces: Vec3[]; frames: Frame[];
  kind:'body'|'head';alphaKeys:number[][];
}
const bad=(message:string,details?:unknown):never=>{throw new DomainError('VALIDATION_ERROR',message,details);};
export function validateTrail(layer:TrailLayer,length:number):void {
  for(const [key,min,max] of [['width',.001,.2],['tailLifetime',.05,10],['maxSegmentLength',.005,1],['glowStrength',0,.3],['alpha',0,1],['start',0,30],['duration',.05,30]] as const)
    if(!Number.isFinite(layer[key])||layer[key]<min||layer[key]>max)bad(`Smuga: ${key} poza zakresem ${min}–${max}.`,{layerId:layer.id});
  if(!layer.head||typeof layer.head.enabled!=='boolean'||!Number.isFinite(layer.head.size)||layer.head.size<.001||layer.head.size>.2)bad('Smuga: średnica punktu musi należeć do .001–.2 m.');
  if(layer.profile!=='soft'||layer.blend!=='additive'||!/^#[0-9a-f]{6}$/i.test(layer.color))bad('Smuga wymaga koloru #RRGGBB, soft i additive.');
  if(!Array.isArray(layer.path)||layer.path.length<2||layer.path.length>64||layer.path[0].time!==0)bad('Smuga wymaga 2–64 punktów; pierwszy czas = 0.');
  let previous:Anchor|undefined;
  for(const point of layer.path) {
    if(!Number.isFinite(point.time)||point.time<0||point.time>30||!Array.isArray(point.position)||point.position.length!==3||point.position.some(v=>!Number.isFinite(v)||Math.abs(v)>20))bad('Nieprawidłowy punkt ścieżki.');
    if(previous&&(point.time<=previous.time||Math.hypot(...point.position.map((v,i)=>v-previous!.position[i]))<1e-5))bad('Czasy muszą rosnąć, a kolejne pozycje muszą się różnić o co najmniej 0.00001 m.');
    previous=point;
  }
  if(layer.path.at(-1)!.time+layer.tailLifetime>layer.duration+1e-9||layer.start+layer.duration>length+1e-9)bad('Ścieżka i ogon muszą mieścić się w czasie warstwy oraz efektu.',{layerId:layer.id});
  if(layer.head.enabled&&Math.floor((layer.start+layer.path.at(-1)!.time)*TRAIL_HZ+1e-9)<=Math.ceil(layer.start*TRAIL_HZ-1e-9))bad('Droga punktu prowadzącego musi obejmować co najmniej jeden pełny okres siatki 1/60 s.',{layerId:layer.id});
  sectionsFor(layer);
}
export function trailCost(document:EffectDocument) {
  const frameSets=Math.ceil(document.duration*TRAIL_HZ)+1;
  const trails=document.layers.filter((l):l is TrailLayer=>l.type==='trail'&&l.enabled).map(layer=>{
    const sections=sectionsFor(layer).length,vertices=sections*4+(layer.head.enabled?12:0);
    return {layerId:layer.id,segments:sections-1,vertices,frameSets,vertexSamples:vertices*frameSets,nodes:layer.head.enabled?2:1};
  });
  return {sampleHz:TRAIL_HZ,trails,vertexSamples:trails.reduce((s,t)=>s+t.vertexSamples,0),nodes:trails.reduce((s,t)=>s+t.nodes,0)};
}
export function assertTrailBudget(document:EffectDocument) {
  const cost=trailCost(document);
  if(cost.vertexSamples>TRAIL_CAPABILITIES.maxVertexSamples)throw new DomainError('LIMIT_EXCEEDED','Przekroczono budżet próbek smug. Zmniejsz liczbę odcinków lub czas efektu.',{...cost,maxVertexSamples:TRAIL_CAPABILITIES.maxVertexSamples});
  return cost;
}
const add = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x + b[i]) as Vec3;
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x - b[i]) as Vec3;
const mul = (a: Vec3, s: number): Vec3 => a.map(x => x * s) as Vec3;
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(...a));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function pointAt(path: Anchor[], t: number): Vec3 {
  if (t <= 0) return [...path[0].position];
  for (let i = 1; i < path.length; i++) if (t <= path[i].time) {
    const a = path[i-1], b = path[i];
    return mix(a.position, b.position, clamp((t-a.time)/(b.time-a.time)));
  }
  return [...path.at(-1)!.position];
}
export function sectionsFor(trail: TrailLayer): Section[] {
  const samples: Anchor[] = [trail.path[0]];
  for (let i=1; i<trail.path.length; i++) {
    const a=trail.path[i-1], b=trail.path[i];
    const count=Math.ceil(Math.hypot(...sub(a.position,b.position))/trail.maxSegmentLength);
    if (!Number.isFinite(count)||count<1||b.time<=a.time) bad('Nieprawidłowe odcinki ścieżki.');
    if(samples.length+count>129)throw new DomainError('LIMIT_EXCEEDED','Smuga przekracza 128 odcinków; zwiększ maxSegmentLength lub uprość ścieżkę.',{layerId:trail.id,minimumSegments:samples.length+count-1,maxSegments:128});
    for (let j=1; j<=count; j++) samples.push({time:a.time+(b.time-a.time)*j/count,position:mix(a.position,b.position,j/count)});
  }
  let previous:Vec3|undefined;
  return samples.map((sample,i)=>{
    let direction=sub(samples[Math.min(samples.length-1,i+1)].position,samples[Math.max(0,i-1)].position);
    // An exact reversal has no averaged tangent. Use its outgoing segment;
    // the explicitly authored cusp remains a cusp, without NaN geometry.
    if(Math.hypot(...direction)<1e-8)direction=sub(samples[i+1].position,sample.position);
    const tangent=unit(direction);
    // Project the preceding side into the new normal plane: shared sections,
    // deterministic frame transport, no separately rotated segment ends.
    let side=previous ? sub(previous,mul(tangent,dot(previous,tangent))) : cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[1,0,0]);
    if(Math.hypot(...side)<1e-6) side=cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[1,0,0]);
    side=unit(side); previous=side;
    return {...sample,side,up:unit(cross(tangent,side))};
  });
}
export function sampleSections(trail: TrailLayer, sections: Section[], globalTime: number, base=false): Frame {
  const t=globalTime-trail.start, head=pointAt(trail.path,t), vertices:Vec3[]=[],uv:Vec3[]=[];
  for(const section of sections) {
    const age=clamp((t-section.time)/trail.tailLifetime);
    const born=t>=section.time && t>0;
    // A causal opening ramp starts on the first global sample at/after start.
    // Interpolation can therefore never reveal this layer before its start.
    const opening=clamp((globalTime-Math.ceil(trail.start*60-1e-9)/60)*60);
    const width=base ? trail.width*3 : born ? trail.width*3*(1-age)*opening : 0;
    const center=base || born ? section.position : head;
    for(const [axis,sign,u] of [[section.side,-1,0],[section.side,1,1],[section.up,-1,0],[section.up,1,1]] as const) {
      vertices.push(add(center,mul(axis,width*sign/2)));
      // Bottom-left UV, bottom row is newborn, top row is fully transparent.
      // Invisible base pose uses distinct section UVs. Legacy decompilers weld
      // equal static UVs without considering their different animated ages.
      uv.push([u,base?section.time/trail.path.at(-1)!.time:age,0]);
    }
  }
  return {vertices,uv};
}
export function compileTrail(trail: TrailLayer, length:number, hz=TRAIL_HZ): CompiledTrail {
  const sections=sectionsFor(trail), faces:Vec3[]=[];
  for(let i=0;i<sections.length-1;i++) for(const plane of [0,2]) {
    const a=i*4+plane,b=a+4;
    faces.push([a,a+1,b+1],[a,b+1,b],[a,b+1,a+1],[a,b,b+1]);
  }
  const count=Math.ceil(length*hz)+1, frames=Array.from({length:count},(_,i)=>sampleSections(trail,sections,i/hz));
  return {name:trail.name,color:trail.color,period:1/hz,sections,faces,base:sampleSections(trail,sections,0,true),frames,kind:'body',alphaKeys:[[0,trail.alpha],[length,trail.alpha]]};
}
export function compileTrailParts(trail:TrailLayer,length:number):CompiledTrail[] {
  const body=compileTrail(trail,length);if(!trail.head.enabled)return [body];
  const radius=trail.head.size*1.5,faces:Vec3[]=[],offsets:Vec3[]=[],uv:Vec3[]=[];
  for(const [a,b] of [[0,1],[0,2],[1,2]]) {
    const index=offsets.length;
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {const v:Vec3=[0,0,0];v[a]=x*radius;v[b]=y*radius;offsets.push(v);uv.push([(x+1)/2,(y+1)/2,0]);}
    faces.push([index,index+1,index+2],[index,index+2,index+3],[index,index+2,index+1],[index,index+3,index+2]);
  }
  const sample=(time:number):Frame=>{const p=pointAt(trail.path,time-trail.start);return {vertices:offsets.map(v=>add(v,p)),uv};};
  const start=Math.ceil(trail.start*TRAIL_HZ-1e-9)/TRAIL_HZ,end=Math.floor((trail.start+trail.path.at(-1)!.time)*TRAIL_HZ+1e-9)/TRAIL_HZ;
  // Head has a bounded soft opening and disappearance while still in motion.
  const fade=Math.min(.06,(end-start)/3);
  if(fade<=0)bad('Droga punktu prowadzącego musi obejmować co najmniej jeden okres 1/60 s.');
  const alphaKeys=[[0,0],...[...(start>0?[[start,0]]:[]),[start+fade,trail.alpha],[end-fade,trail.alpha],[end,0]],...(end<length?[[length,0]]:[])];
  return [body,{name:trail.name,color:trail.color,period:body.period,sections:[],kind:'head',alphaKeys,
    base:sample(0),faces,frames:body.frames.map((_,i)=>sample(i/TRAIL_HZ))}];
}
export function trailOpacity(mesh:CompiledTrail,time:number):number {
  for(let i=1;i<mesh.alphaKeys.length;i++)if(time<=mesh.alphaKeys[i][0]){const a=mesh.alphaKeys[i-1],b=mesh.alphaKeys[i];return a[1]+(b[1]-a[1])*clamp((time-a[0])/(b[0]-a[0]));}
  return mesh.alphaKeys.at(-1)![1];
}
export function trailHeadPixels(size=128) {
  const rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const r2=(3*(x/(size-1)-.5))**2+(3*(y/(size-1)-.5))**2,edge=x===0||y===0||x===size-1||y===size-1?0:1;
    rgba.set([255,255,255,Math.round(255*Math.exp(-4*Math.LN2*r2)*edge)],(y*size+x)*4);
  }
  return {width:size,height:size,rgba};
}
export function interpolateFrames(mesh: CompiledTrail,time:number): Frame {
  const f=Math.max(0,Math.min(mesh.frames.length-1,time/mesh.period)),i=Math.floor(f),a=mesh.frames[i],b=mesh.frames[Math.min(i+1,mesh.frames.length-1)];
  return {vertices:a.vertices.map((v,j)=>mix(v,b.vertices[j],f-i)),uv:a.uv.map((v,j)=>mix(v,b.uv[j],f-i))};
}
export function trailProfilePixels(glowStrength:number,size=128) {
  const rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const age=1-y/(size-1),offset=3*(x/(size-1)-.5);
    const core=Math.exp(-4*Math.LN2*offset*offset),halo=glowStrength*Math.exp(-4*Math.LN2*(offset/2.8)**2);
    const edge=x===0||x===size-1?0:1;
    rgba.set([255,255,255,Math.round(255*Math.min(1,core+halo)*(1-age)**1.5*edge)],(y*size+x)*4);
  }
  return {width:size,height:size,rgba};
}
