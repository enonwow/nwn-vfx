import { DomainError } from '../../core/src/model.js';
import { readAsciiMdl, type MdlNode } from './mdl-reader.js';

function fail(message: string): never { throw new DomainError('COMPILE_VALIDATION_FAILED', message); }
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= Math.max(1e-6, Math.abs(b)*1e-6);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v,i)=>near(v,b[i]));
const quaternion = ([x,y,z,angle]: number[]) => {
  if (Math.abs(angle)<1e-9) return [0,0,0,1];
  const length=Math.hypot(x,y,z); if(!length)fail('Nieprawidłowa oś obrotu kompilatora.');
  return [x/length*Math.sin(angle/2),y/length*Math.sin(angle/2),z/length*Math.sin(angle/2),Math.cos(angle/2)];
};
function sameRotation(a:number[],b:number[]) {
  const aa=quaternion(a),bb=quaternion(b);
  return same(aa,bb)||same(aa,bb.map(x=>-x));
}
const omittedDefaults:Record<string,string[]>={render:['1'],beaming:['0'],inheritcolor:['0'],sizemid_y:['0']};
const cyclic=(v:string[])=>[v,[v[1],v[2],v[0]],[v[2],v[0],v[1]]].map(r=>r.join('|')).sort()[0];

/** Decompiler traversal and vertex welding may differ from source order.
 * Compare every triangle corner and every animation sample after explicit
 * remapping; never rely on counts alone or compare orientations as raw axes.
 * Normals/lighting and retail playback are not established by this check.
 */
export function verifyCompiledRoundtrip(source:Uint8Array,roundtrip:Uint8Array) {
  const a=readAsciiMdl(source),b=readAsciiMdl(roundtrip,{requireAnimationOrder:false,compiledTimeBounds:true});
  if(a.model!==b.model||a.classification!==b.classification||a.animations.length!==b.animations.length)fail('Kompilator zmienił model lub animacje.');
  const report={nodes:0,triangles:0,vertexSamples:0,uvSamples:0,controllers:0,maxSampleError:0};
  function remap(context:string,src:number[][],dst:number[][],samples:number[][]=[],actual:number[][]=[]) {
    const frames=samples.length/src.length,actualFrames=actual.length/dst.length;
    if(!Number.isInteger(frames)||frames!==actualFrames)fail(`Kompilator zmienił liczbę klatek ${context}.`);
    const aliases=new Map<string,number>();
    const canonical=src.map((v,i)=>{
      // Binary MDL stores float32. Distinct JS doubles such as .96 and
      // .9600000000000001 cannot form distinct binary classes. Include every
      // sample so coincident base corners with divergent animation stay apart.
      // Do not group by `near`: it is tolerant, non-transitive and less strict.
      const signature=JSON.stringify([v,...Array.from({length:frames},(_,f)=>samples[f*src.length+i])].map(row=>row.map(Math.fround)));
      if(!aliases.has(signature))aliases.set(signature,i);return aliases.get(signature)!;
    });
    const mapping=dst.map((v,j)=>{
      const index=src.findIndex((p,i)=>same(v,p)&&Array.from({length:frames},(_,f)=>f).every(f=>same(actual[f*dst.length+j],samples[f*src.length+i])));
      if(index<0)fail(`Utracony wierzchołek, UV lub próbka animacji po kompilacji: ${context}, wiersz wyniku ${j}.`);
      for(let f=0;f<frames;f++)for(let k=0;k<actual[f*dst.length+j].length;k++)report.maxSampleError=Math.max(report.maxSampleError,Math.abs(actual[f*dst.length+j][k]-samples[f*src.length+index][k]));
      return canonical[index];
    });
    const reached=new Set(mapping),classes=new Set(canonical);
    if(reached.size!==classes.size)fail(`Kompilator zgubił rozróżnialne dane geometrii: ${context}, klasy float32 ${reached.size}/${classes.size}, pierwszy brakujący wiersz źródła ${canonical.find(i=>!reached.has(i))}.`);
    return {canonical,mapping,checked:samples.length};
  }
  function nodes(before:MdlNode[],after:MdlNode[]) {
    if(before.length!==after.length)fail('Kompilator zmienił liczbę węzłów.');
    for(const n of before) {
      const m=after.find(x=>x.name===n.name);if(!m||m.type!==n.type)fail(`Utracony węzeł ${n.name}.`);
      report.nodes++;
      for(const [key,value] of Object.entries(n.properties)) {
        const actual=m.properties[key]??omittedDefaults[key];
        if(!actual)fail(`Kompilator pominął ${n.name}.${key}.`);
        const ok=key==='orientation'?sameRotation(value.map(Number),actual.map(Number)):
          value.every(x=>Number.isFinite(Number(x)))?same(value.map(Number),actual.map(Number)):JSON.stringify(value)===JSON.stringify(actual);
        if(!ok)fail(`Kompilator zmienił ${n.name}.${key}.`);
      }
      for(const [key,rows] of Object.entries(n.tracks)) {
        // A single controller key is decompiled as a static property.
        const actual=m.tracks[key]??(rows.length===1&&m.properties[key]?[[0,...m.properties[key].map(Number)]]:undefined);
        if(!actual||actual.length!==rows.length||rows.some((row,i)=>!near(row[0],actual[i][0])||!(key==='orientation'?sameRotation(row.slice(1),actual[i].slice(1)):same(row.slice(1),actual[i].slice(1)))))fail(`Utracony kontroler ${n.name}.${key}.`);
        report.controllers++;
      }
      if(Object.keys(m.tracks).some(k=>!n.tracks[k]))fail(`Nieoczekiwany kontroler ${n.name}.`);
      if(n.tables.verts) {
        if(!m.tables.verts||!m.tables.tverts||!m.tables.faces)fail(`Utracone tabele ${n.name}.`);
        const v=remap(`${n.name}.verts`,n.tables.verts,m.tables.verts,n.tables.animverts,m.tables.animverts);
        const uv=remap(`${n.name}.tverts`,n.tables.tverts,m.tables.tverts,n.tables.animtverts,m.tables.animtverts);
        const keys=(faces:number[][],vi:number[],ui:number[])=>faces.map(f=>cyclic([0,1,2].map(i=>`${vi[f[i]]}/${ui[f[i+4]]}`))).sort();
        if(JSON.stringify(keys(n.tables.faces,v.canonical,uv.canonical))!==JSON.stringify(keys(m.tables.faces,v.mapping,uv.mapping)))fail(`Kompilator zmienił indeksy, UV lub winding ${n.name}.`);
        report.triangles+=n.tables.faces.length;report.vertexSamples+=v.checked;report.uvSamples+=uv.checked;
      }
    }
  }
  nodes(a.nodes,b.nodes);
  for(const anim of a.animations) {
    const actual=b.animations.find(x=>x.name===anim.name);
    if(!actual||anim.root!==actual.root||!near(anim.length,actual.length)||anim.events.length!==actual.events.length||anim.events.some((e,i)=>e.name!==actual.events[i].name||!near(e.time,actual.events[i].time)))fail('Kompilator zmienił czas, korzeń lub zdarzenia animacji.');
    nodes(anim.nodes,actual.nodes);
  }
  return report;
}
