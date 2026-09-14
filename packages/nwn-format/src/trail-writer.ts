import { createHash } from 'node:crypto';
import { DomainError, type TrailLayer, type EffectDocument } from '../../core/src/model.js';
import { compileTrailParts, pointAt, TRAIL_HZ, type CompiledTrail } from '../../core/src/trails.js';
import { numeric, textProperty, type MdlReadback } from './mdl-reader.js';

export interface TrailExport {layer:TrailLayer;part:CompiledTrail;node:string;textureResref:string}
export interface TrailReadback {
  layerId:string;node:string;kind:'body'|'head';vertices:number;triangles:number;frameSets:number;samplePeriod:number;
  vertexSamples:number;uvSamples:number;animvertsSha256:string;animtvertsSha256:string;texture:string;
  alphaKeys:number[][];maxCheckedHeadDeviationMetres:number;allSamplesRead:true;
}
const hash=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
export function describeTrailExports(document:EffectDocument):TrailExport[] {
  return document.layers.flatMap((layer,index)=>layer.type==='trail'&&layer.enabled?compileTrailParts(layer,document.duration).map((part,j)=>({layer,part,node:`trail_${index}_${j}`,textureResref:''})):[]);
}
const row=(v:number[])=>v.map(n=>Object.is(n,-0)?'0':n.toString()).join(' ');
const table=(name:string,rows:number[][])=>`  ${name} ${rows.length}\n${rows.map(r=>`    ${row(r)}`).join('\n')}\n  endlist\n`;
export function writeTrailNodes(entry:TrailExport,modelName:string):{geometry:string;animation:string} {
  const {part,node,textureResref}=entry,rgb=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255);
  const geometry=`  parent ${modelName}\n  position 0 0 0\n  orientation 0 0 1 0\n  scale 1\n  ambient 0 0 0\n  diffuse ${row(rgb)}\n  selfillumcolor ${row(rgb)}\n  specular 0 0 0\n  shininess 0\n  bitmap ${textureResref}\n  alpha 0\n  transparencyhint 1\n  render 1\n  shadow 0\n  beaming 0\n  inheritcolor 0\n${table('verts',part.base.vertices)}${table('tverts',part.base.uv)}${table('faces',part.faces.map((f,i)=>[...f,1<<Math.floor((i%(part.kind==='body'?8:4))/2),...f,0]))}`;
  return {geometry:`node animmesh ${node}\n${geometry}  sampleperiod 0\nendnode\n`,
    animation:`node animmesh ${node}\n${geometry.replace(/^  alpha .*\n/gm,'')}  sampleperiod ${part.period}\n${table('animverts',part.frames.flatMap(f=>f.vertices))}${table('animtverts',part.frames.flatMap(f=>f.uv))}${table('alphakey',part.alphaKeys)}endnode\n`};
}
export function readbackTrail(parsed:MdlReadback,entry:TrailExport):TrailReadback {
  const {part,node,layer}=entry,base=parsed.nodes.find(n=>n.name===node),animated=parsed.animations[0].nodes.find(n=>n.name===node);
  const check=(condition:unknown,message:string)=>{if(!condition)throw new DomainError('EXPORT_VALIDATION_FAILED',message,{layerId:layer.id,node});};
  check(base&&animated,'Brak węzła smugi.');check(base!.type==='animmesh'&&animated!.type==='animmesh','Nieprawidłowy typ smugi.');
  check(textProperty(base!,'parent')===parsed.model&&textProperty(animated!,'parent')===parsed.model,'Nieprawidłowy rodzic smugi.');
  check(numeric(base!,'alpha')===0&&textProperty(base!,'bitmap')===entry.textureResref&&textProperty(animated!,'bitmap')===entry.textureResref,'Nieprawidłowa widoczność/tekstura smugi.');
  check(numeric(animated!,'sampleperiod')===part.period,'Niezgodny okres próbkowania.');
  const equal=(a:number[][],b:number[][])=>a?.length===b.length&&a.every((row,i)=>row.length===b[i].length&&row.every((n,j)=>n===b[i][j]));
  for(const data of [base!,animated!]) {
    check(equal(data.tables.verts,part.base.vertices)&&equal(data.tables.tverts,part.base.uv),'Utracona geometria/UV bazowe smugi.');
    check(equal(data.tables.faces.map(f=>f.slice(0,3)),part.faces)&&equal(data.tables.faces.map(f=>f.slice(4,7)),part.faces),'Utracone indeksy smugi.');
  }
  const av=animated!.tables.animverts,at=animated!.tables.animtverts;
  check(equal(av,part.frames.flatMap(f=>f.vertices))&&equal(at,part.frames.flatMap(f=>f.uv)),'Utracone próbki narastania/zwężania/zanikania smugi.');
  check(equal(animated!.tracks.alpha,part.alphaKeys),'Utracone klucze alpha smugi.');
  let deviation=0;
  for(let tick=0;tick<=Math.ceil(parsed.animations[0].length*TRAIL_HZ*4);tick++) {
    const t=tick/(TRAIL_HZ*4),a=Math.floor(t*TRAIL_HZ)/TRAIL_HZ,b=a+1/TRAIL_HZ,u=(t-a)*TRAIL_HZ;
    const exact=pointAt(layer.path,t-layer.start),left=pointAt(layer.path,a-layer.start),right=pointAt(layer.path,b-layer.start);
    deviation=Math.max(deviation,Math.hypot(...exact.map((x,i)=>x-(left[i]+(right[i]-left[i])*u))));
  }
  return {layerId:layer.id,node,kind:part.kind,vertices:part.base.vertices.length,triangles:part.faces.length,frameSets:part.frames.length,samplePeriod:part.period,
    vertexSamples:av.length,uvSamples:at.length,animvertsSha256:hash(av),animtvertsSha256:hash(at),texture:entry.textureResref,alphaKeys:animated!.tracks.alpha,maxCheckedHeadDeviationMetres:deviation,allSamplesRead:true};
}
