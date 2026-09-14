import {DomainError} from '../../core/src/model.js';
import {readAsciiMdl,numeric,textProperty} from './mdl-reader.js';

const flags={p2p:1,p2p_sel:2,affectedByWind:4,m_isTinted:8,bounce:16,random:32,inherit:64,inheritvel:128,inherit_local:256,splat:512,inherit_part:1024};
function fail(message:string):never {throw new DomainError('COMPILE_VALIDATION_FAILED','Binary emitter emission: '+message);}

/** Direct format read, independent of the compiler's ASCII decompiler.
 * Pinned NwnMdlGeometry.h / NwnMdlNodes.h: events 0xb8, 36-byte records;
 * emitter controller 88 is birthrate (on light nodes 88 means radius).
 * This bounded reader covers the exported emitter subset, not arbitrary MDL. */
export function readBinaryEmission(binary:Uint8Array) {
  const d=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  if(binary.length<12)fail('truncated header');
  const size=d.getUint32(4,true);
  if(d.getUint32(0,true)!==0||12+size+d.getUint32(8,true)!==binary.length)fail('invalid header');
  const range=(offset:number,n:number)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(n)||offset<0||n<0||offset>size-n)fail('offset outside model');return offset+12;};
  const u=(o:number)=>d.getUint32(range(o,4),true),s=(o:number)=>d.getInt16(range(o,2),true);
  const f=(o:number)=>{const n=d.getFloat32(range(o,4),true);if(!Number.isFinite(n))fail('nonfinite float');return n;};
  const str=(o:number,n:number)=>{const b=binary.subarray(range(o,n),12+o+n),end=b.indexOf(0);if(end<0)fail('unterminated string');return new TextDecoder('ascii').decode(b.subarray(0,end));};
  const nodes=(root:number)=>{
    const pending=[root],seen=new Set<number>(),names=new Set<string>(),emitters=[];
    while(pending.length){
      const o=pending.pop()!;range(o,0x70);if(seen.has(o)||seen.size>=256)fail('cyclic or excessive nodes');seen.add(o);
      const name=str(o+0x20,32);if(!name||names.has(name))fail('duplicate or empty node');names.add(name);
      const children=u(o+0x48),count=u(o+0x4c);if(count>256)fail('excessive children');range(children,count*4);
      for(let i=0;i<count;i++)pending.push(u(children+i*4));
      const nodeFlags=u(o+0x6c);if(!(nodeFlags&4))continue;range(o,0x148);
      const controllers=u(o+0x54),controllerCount=u(o+0x58),data=u(o+0x60),dataCount=u(o+0x64);
      if(controllerCount>256||dataCount>65536)fail('excessive controller data');range(controllers,controllerCount*12);range(data,dataCount*4);
      let birthrate:number[][]|null=null;let detonateController=false;
      for(let i=0;i<controllerCount;i++){
        const k=controllers+i*12,type=u(k);if(type===228)detonateController=true;if(type!==88)continue;
        const rows=s(k+4),keyOffset=s(k+6),valueOffset=s(k+8),columns=d.getInt8(range(k+10,1));
        if(birthrate||rows<1||rows>256||columns!==1||keyOffset<0||valueOffset<0||keyOffset>dataCount-rows||valueOffset>dataCount-rows)fail('invalid birthrate controller');
        birthrate=Array.from({length:rows},(_,j)=>[f(data+(keyOffset+j)*4),f(data+(valueOffset+j)*4)]);
        if(birthrate.some((r,j)=>r[0]<0||r[1]<0||(j>0&&r[0]<=birthrate![j-1][0])))fail('invalid birthrate keys');
      }
      emitters.push({node:name,nodeFlags,update:str(o+0x88,32),render:str(o+0xa8,32),blend:str(o+0xc8,32),texture:str(o+0xe8,64),
        xgrid:u(o+0x7c),ygrid:u(o+0x80),spawnType:u(o+0x84),twoSidedTexture:u(o+0x138),loop:u(o+0x13c),emitterFlags:u(o+0x144),birthrate,detonateController});
    }
    return emitters.sort((a,b)=>a.node.localeCompare(b.node));
  };
  const pointer=u(0x78),count=u(0x7c);if(count>32)fail('excessive animations');range(pointer,count*4);
  const animations=Array.from({length:count},(_,i)=>{
    const a=u(pointer+i*4);range(a,0xc4);
    const events=u(a+0xb8),n=u(a+0xbc);if(n>256)fail('excessive events');range(events,n*36);
    return {name:str(a+8,64),root:str(a+0x78,64),length:f(a+0x70),transition:f(a+0x74),
      events:Array.from({length:n},(_,j)=>({time:f(events+j*36),name:str(events+j*36+4,32)})),emitters:nodes(u(a+0x48))};
  });
  return {model:str(8,64),baseEmitters:nodes(u(0x48)),animations};
}

export function verifyBinaryEmission(source:Uint8Array,binary:Uint8Array) {
  const expected=readAsciiMdl(source),actual=readBinaryEmission(binary);
  if(actual.model!==expected.model||actual.animations.length!==expected.animations.length)fail('model/animation mismatch');
  const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const base=expected.nodes.filter(n=>n.type==='emitter');
  if(actual.baseEmitters.length!==base.length)fail('base emitter count');
  for(const node of base){
    const read=actual.baseEmitters.find(n=>n.node===node.name);if(!read||read.nodeFlags!==5||read.detonateController)fail('base emitter flags/controller');
    for(const property of ['update','render','blend','texture'] as const)if(read[property]!==textProperty(node,property))fail(property+' mismatch');
    const mask=Object.entries(flags).reduce((v,[name,bit])=>v|(numeric(node,name)?bit:0),0);
    if(read.emitterFlags!==mask||read.loop!==numeric(node,'loop')||read.spawnType!==numeric(node,'spawntype')||read.twoSidedTexture!==numeric(node,'twosidedtex'))fail('emitter settings mismatch');
    if(!equal(read.birthrate,[[0,Math.fround(numeric(node,'birthrate'))]]))fail('base birthrate mismatch');
  }
  for(const animation of expected.animations){
    const read=actual.animations.find(a=>a.name===animation.name);if(!read||read.root!==animation.root||read.length!==Math.fround(animation.length)||read.transition!==0)fail('animation identity/length/transition');
    if(!equal(read.events,animation.events.map(e=>({...e,time:Math.fround(e.time)}))))fail('event table mismatch');
    const emitters=animation.nodes.filter(n=>n.type==='emitter');if(read.emitters.length!==emitters.length)fail('animation emitter count');
    for(const node of emitters){
      const binding=read.emitters.find(n=>n.node===node.name);if(!binding||binding.nodeFlags!==5||binding.detonateController)fail('animation binding/controller');
      const rows=node.tracks.birthrate??[[0,numeric(node,'birthrate')]];
      if(!equal(binding.birthrate,rows.map(r=>r.map(Math.fround))))fail('animated birthrate mismatch');
    }
  }
  return {...actual,allEventRecordsRead:true,allBirthrateControllersRead:true,baseEmitterFlagsRead:true,nativeVerified:false};
}
