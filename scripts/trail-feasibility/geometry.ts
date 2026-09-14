/** Isolated format experiment. Not a Studio operation or document schema. */
import type { Vec3 } from '../../packages/core/src/model.js';

export interface Anchor { time: number; position: Vec3 }
export interface ProbeTrail {
  name: string; start: number; path: Anchor[]; width: number;
  tailLifetime: number; maxSegmentLength: number; color: string;
}
export interface Section extends Anchor { side: Vec3; up: Vec3 }
export interface Frame { vertices: Vec3[]; uv: Vec3[] }
export interface CompiledTrail {
  name: string; color: string; period: number; sections: Section[];
  base: Frame; faces: Vec3[]; frames: Frame[];
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
export function sectionsFor(trail: ProbeTrail): Section[] {
  const samples: Anchor[] = [trail.path[0]];
  for (let i=1; i<trail.path.length; i++) {
    const a=trail.path[i-1], b=trail.path[i];
    const count=Math.ceil(Math.hypot(...sub(a.position,b.position))/trail.maxSegmentLength);
    if (!count || b.time<=a.time) throw new Error('Distinct ordered anchors required');
    for (let j=1; j<=count; j++) samples.push({time:a.time+(b.time-a.time)*j/count,position:mix(a.position,b.position,j/count)});
  }
  if (samples.length>129) throw new Error(`128 segment budget exceeded: ${samples.length-1}`);
  let previous:Vec3|undefined;
  return samples.map((sample,i)=>{
    const tangent=unit(sub(samples[Math.min(samples.length-1,i+1)].position,samples[Math.max(0,i-1)].position));
    // Project the preceding side into the new normal plane: shared sections,
    // deterministic frame transport, no separately rotated segment ends.
    let side=previous ? sub(previous,mul(tangent,dot(previous,tangent))) : cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[1,0,0]);
    if(Math.hypot(...side)<1e-6) side=cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[1,0,0]);
    side=unit(side); previous=side;
    return {...sample,side,up:unit(cross(tangent,side))};
  });
}
export function sampleSections(trail: ProbeTrail, sections: Section[], globalTime: number, base=false): Frame {
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
export function compileProbe(trail: ProbeTrail, length=4, hz=60): CompiledTrail {
  const sections=sectionsFor(trail), faces:Vec3[]=[];
  for(let i=0;i<sections.length-1;i++) for(const plane of [0,2]) {
    const a=i*4+plane,b=a+4;
    faces.push([a,a+1,b+1],[a,b+1,b],[a,b+1,a+1],[a,b,b+1]);
  }
  const count=Math.ceil(length*hz)+1, frames=Array.from({length:count},(_,i)=>sampleSections(trail,sections,i/hz));
  return {name:trail.name,color:trail.color,period:1/hz,sections,faces,base:sampleSections(trail,sections,0,true),frames};
}
export function interpolateFrames(mesh: CompiledTrail,time:number): Frame {
  const f=Math.max(0,Math.min(mesh.frames.length-1,time/mesh.period)),i=Math.floor(f),a=mesh.frames[i],b=mesh.frames[Math.min(i+1,mesh.frames.length-1)];
  return {vertices:a.vertices.map((v,j)=>mix(v,b.vertices[j],f-i)),uv:a.uv.map((v,j)=>mix(v,b.uv[j],f-i))};
}
export function profilePixels(size=128) {
  const rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const age=1-y/(size-1),offset=3*(x/(size-1)-.5);
    const core=Math.exp(-4*Math.LN2*offset*offset),halo=.12*Math.exp(-4*Math.LN2*(offset/2.8)**2);
    const edge=x===0||x===size-1?0:1;
    rgba.set([255,255,255,Math.round(255*Math.min(1,core+halo)*(1-age)**1.5*edge)],(y*size+x)*4);
  }
  return {width:size,height:size,rgba};
}
