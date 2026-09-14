import {makeLayer,DomainError,type EffectDocument,type EmitterLayer,type Vec3,type BeamLayer,type Change} from './model.js';
import {makeBeamLayer} from './beam.js';

import type {BeamBinding} from './beam-flow-types.js';
export type {BeamBinding} from './beam-flow-types.js';
export {BEAM_FLOW_CAPABILITIES} from './beam-flow-types.js';
export function makeFlowLayer(id:string,length=3.6):EmitterLayer {const life=Math.min(.6,length/3);return {...makeLayer(id,'Strumień cząstek'),update:'Fountain',position:[0,0,0],speed:0,spread:0,gravity:0,start:0,duration:length-life,life,count:120,alpha:0,midAlpha:.4,endAlpha:0,size:.08,midSize:.12,endSize:.04,texture:'glow',beamBinding:{role:'flow',source:[0,0,1.2],target:[0,3,1.2],direction:'source-to-target',pulse:{period:.5,duty:.6}}};}
export function isBeamFlow(document:EffectDocument) {return document.lifecycle==='beam'&&document.layers.some(l=>l.type==='emitter'&&l.enabled&&l.beamBinding);}
export function isCompositeBeam(document:EffectDocument) {return isBeamFlow(document)&&document.layers.some(l=>l.enabled&&l.type==='beam');}
export function boundEmitters(document:EffectDocument):EmitterLayer[] {return document.layers.filter((l):l is EmitterLayer=>l.type==='emitter'&&l.enabled&&!!l.beamBinding);}
/** UI convenience only: authors submit this layer through ordinary changes. */
export function makeStaticFlowStrand(document:EffectDocument,id:string):BeamLayer {
  const binding=boundEmitters(document)[0]?.beamBinding;
  if(!binding)throw new DomainError('BEAM_FLOW_INVALID','Nitka wymaga istniejącego strumienia.');
  return {...makeBeamLayer(id,'Statyczna nitka'),source:[...binding.source],target:[...binding.target],flow:{direction:binding.direction,speed:0},
    width:.008,alpha:.2,radius:0,lightningScale:0,segments:4,textureMapping:{axis:'v',fit:'source'}};
}
/** Shared endpoints are changed in one revision; normal field locks still apply. */
export function beamBindingChanges(document:EffectDocument,layerId:string,binding:BeamBinding):Change[] {
  const changes:Change[]=boundEmitters(document).flatMap(l=>{
    const next=l.id===layerId?binding:{...l.beamBinding!,source:binding.source,target:binding.target,direction:binding.direction};
    return JSON.stringify(next)===JSON.stringify(l.beamBinding)?[]:[{type:'layer.set' as const,layerId:l.id,values:{beamBinding:next}}];
  });
  for(const l of document.layers)if(l.enabled&&l.type==='beam'){
    const values:Record<string,unknown>={};
    for(const key of ['source','target'] as const)if(JSON.stringify(l[key])!==JSON.stringify(binding[key]))values[key]=[...binding[key]];
    if(l.flow.direction!==binding.direction)values.flow={...l.flow,direction:binding.direction};
    if(Object.keys(values).length)changes.push({type:'layer.set',layerId:l.id,values});
  }
  return changes;
}
export function validateBeamFlow(document:EffectDocument) {
  const fail=(message:string,layerId?:string):never=>{throw new DomainError('BEAM_FLOW_INVALID',message,{layerId});};
  const bound=document.layers.filter(l=>Object.hasOwn(l,'beamBinding'));
  if(bound.length&&document.schemaVersion<19)fail('Powiązanie cząstek wymaga dokumentu 19.');
  for(const layer of bound){
    if(layer.type!=='emitter'||layer.update!=='Fountain'||!layer.beamBinding)fail('Powiązanie wymaga emitera Fountain.',layer.id);
    const l=layer as EmitterLayer,b=l.beamBinding!;
    if(!['flow','source','target'].includes(b.role)||!['source-to-target','target-to-source'].includes(b.direction))fail('Nieznana rola lub kierunek.',l.id);
    for(const p of [b.source,b.target])if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>20))fail('Punkty podglądu wymagają XYZ ±20 m.',l.id);
    const distance=Math.hypot(...b.target.map((v,i)=>v-b.source[i]));
    if(distance<.05||distance>30)fail('Odległość punktów musi wynosić 0,05–30 m.',l.id);
    for(const [value,min,max] of [[l.start,0,30],[l.duration,.01,10],[l.life,.01,10],[l.count,1,2000],[l.scale,.01,10],[l.speed,0,20],[l.spread,0,3.141593],[l.gravity,-20,20],[l.alpha,0,1],[l.endAlpha,0,1],[l.size,.001,5],[l.endSize,0,5]])if(!Number.isFinite(value)||value<min||value>max)fail('Parametry cząstek poza zakresem.',l.id);
    if(!Number.isInteger(l.count)||!Number.isInteger(l.seed)||l.seed<0||l.seed>2147483647||![l.color,l.endColor].every(v=>/^#[0-9a-f]{6}$/i.test(v)))fail('Nieprawidłowa liczba cząstek, seed lub kolor.',l.id);
    if(!Array.isArray(l.position)||l.position.length!==3||l.position.some(v=>v!==0))fail('Powiązana warstwa wymaga position [0,0,0]; punkt ciała wybiera integracja.',l.id);
    if(l.start+l.duration+l.life>document.duration+1e-9)fail('Czas projektu musi obejmować emisję i całe życie ostatnich cząstek.',l.id);
    if(b.role==='flow'){
      if(l.speed!==0||l.gravity!==0||l.spread!==0||l.scale!==1||(l.orientation?.[3]??0)!==0)fail('Pierwszy profil P2P wymaga speed/spread/gravity 0, scale 1 i neutralnej orientacji. Dolot określa life.',l.id);
      if(b.node!==undefined)fail('Węzeł FnF dotyczy tylko końcówki.',l.id);
    }else{
      if(b.pulse!==undefined)fail('Impulsy birthrate są obecnie dostępne dla strumienia.',l.id);
      if(typeof b.node!=='string'||! /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(b.node))fail('Końcówka wymaga jawnej nazwy węzła modelu postaci.',l.id);
    }
    if(b.pulse){const {period,duty}=b.pulse;
      if(!Number.isFinite(period)||period<.05||period>3||!Number.isFinite(duty)||duty<.05||duty>.95||Math.ceil(l.duration/period)>48)fail('Impuls wymaga okresu 0,05–3 s, wypełnienia 0,05–0,95 i najwyżej 48 obiegów.',l.id);
    }
  }
  const active=boundEmitters(document);
  if(active.length){
    if(document.lifecycle!=='beam'||document.layers.some(l=>l.enabled&&l.type!=='beam'&&(l.type!=='emitter'||!l.beamBinding)))fail('Aktywne powiązania wymagają trybu beam i powiązanych emiterów.');
    if(active.length>8)fail('Maksymalnie 8 powiązanych emiterów.');
    if(!active.some(l=>l.beamBinding!.role==='flow'))fail('Projekt wymaga co najmniej jednego aktywnego strumienia.');
    const context=(l:EmitterLayer)=>JSON.stringify([l.beamBinding!.source,l.beamBinding!.target,l.beamBinding!.direction]);
    if(active.some(l=>context(l)!==context(active[0])))fail('Warstwy muszą współdzielić punkty i kierunek połączenia.');
    const strands=document.layers.filter((l):l is BeamLayer=>l.enabled&&l.type==='beam');
    if(strands.length){
      if(document.schemaVersion<21)fail('Połączenie nitki i strumienia wymaga dokumentu 21.');
      if(strands.length>4)fail('Profil mieszany obsługuje maksymalnie 4 statyczne nitki.');
      if(strands.length>1&&document.schemaVersion<22)fail('Wiele nitek wymaga dokumentu 22.');
      const binding=active[0].beamBinding!;
      for(const strand of strands){
      if(JSON.stringify([strand.source,strand.target,strand.flow.direction])!==JSON.stringify([binding.source,binding.target,binding.direction]))fail('Nitka i strumień muszą mieć wspólne końce i kierunek.',strand.id);
      if(strand.flow.speed!==0)fail('Statyczna nitka w profilu mieszanym wymaga flow.speed=0.',strand.id);
      }
    }
  }
}

/** Linear gates, at most 1 ms ramps; integral is authored count, not an exact native count. */
export function beamFlowEnvelope(layer:EmitterLayer,length:number) {
  const pulse=layer.beamBinding?.pulse,intervals:Array<[number,number]>=[];
  for(let i=0;i<(pulse?Math.ceil(layer.duration/pulse.period):1);i++){
    const a=layer.start+(pulse?i*pulse.period:0),b=Math.min(layer.start+layer.duration,a+(pulse?pulse.period*pulse.duty:layer.duration));
    if(b>a)intervals.push([a,b]);
  }
  const ramps=intervals.map(([a,b])=>Math.min(.001,(b-a)/4));
  const area=intervals.reduce((v,[a,b],i)=>v+b-a-ramps[i],0),rate=layer.count/area;
  const rows:number[][]=[[0,0]];
  intervals.forEach(([a,b],i)=>rows.push([a,0],[a+ramps[i],rate],[b-ramps[i],rate],[b,0]));rows.push([length,0]);
  return {rows:rows.filter((r,i)=>i===0||r[0]!==rows[i-1][0]),rate,ramp:Math.max(...ramps)};
}
/** Invert the same piecewise-linear birth integral used by native export. */
export function birthAtQuantile(rows:number[][],quantile:number):number {
  const total=rows.slice(1).reduce((s,r,i)=>s+(r[0]-rows[i][0])*(r[1]+rows[i][1])/2,0);
  let left=Math.max(0,Math.min(1-Number.EPSILON,quantile))*total;
  for(let i=1;i<rows.length;i++){
    const [a,y]=rows[i-1],[b,z]=rows[i],dt=b-a,area=dt*(y+z)/2;
    if(area>0&&left<area){
      const slope=(z-y)/dt;
      // Stable quadratic root avoids cancellation near a flat ramp.
      const x=Math.abs(slope)<1e-12?left/y:2*left/(y+Math.sqrt(Math.max(0,y*y+2*slope*left)));
      return a+(left===0?0:x);
    }
    left-=area;
  }
  return rows[rows.length-1][0];
}
/** Retail zero-handle Bezier with combineTime=0. Inputs may be current moving endpoints. */
export function sampleBeamFlow(binding:BeamBinding,age:number,life:number,source=binding.source,target=binding.target):Vec3 {
  const t=Math.max(0,Math.min(1,age/life)),u=t*t*(3-2*t);
  const [a,b]=binding.direction==='source-to-target'?[source,target]:[target,source];
  return a.map((v,i)=>v+(b[i]-v)*u) as Vec3;
}
