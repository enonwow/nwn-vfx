import {DomainError} from '../../core/src/model.js';
import {readAsciiMdl,numeric} from './mdl-reader.js';

/** Pinned NwnMdlNodes.h: grid at 0x7c/0x80, loop 0x13c, flags 0x144;
 * 12-byte controller records: FPS=128, FrameEnd=132, FrameStart=136.
 * This reads serialized values, not retail-engine playback. */
export function verifyBinaryFlipbooks(source:Uint8Array,binary:Uint8Array) {
  const fail=(message:string):never=>{throw new DomainError('COMPILE_VALIDATION_FAILED','Binary emitter atlas: '+message);};
  const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  if(binary.length<12)return fail('truncated header');
  const size=data.getUint32(4,true);
  if(data.getUint32(0,true)!==0||12+size+data.getUint32(8,true)!==binary.length)fail('invalid header');
  const range=(offset:number,bytes:number)=>{if(!Number.isSafeInteger(offset)||offset<0||bytes<0||offset>size-bytes)fail('offset outside model');return 12+offset;};
  const u=(o:number)=>data.getUint32(range(o,4),true),s=(o:number)=>data.getInt16(range(o,2),true);
  const text=(o:number,n:number)=>{const b=binary.subarray(range(o,n),12+o+n),end=b.indexOf(0);if(end<1)return fail('invalid name');return new TextDecoder('ascii').decode(b.subarray(0,end));};
  const parsed=readAsciiMdl(source), roots=[{name:'base',offset:u(0x48)}];
  const animations=u(0x78),count=u(0x7c);if(count>32)fail('excessive animations');range(animations,count*4);
  for(let i=0;i<count;i++){const a=u(animations+i*4);roots.push({name:text(a+8,64),offset:u(a+0x48)});}
  let emitters=0,animationBindings=0;
  for(const root of roots){
    const pending=[root.offset],seen=new Set<number>(),names=new Set<string>();
    while(pending.length){
      const o=pending.pop()!;range(o,0x70);if(seen.has(o)||seen.size>=256)fail('cyclic or excessive nodes');seen.add(o);
      const name=text(o+0x20,32);if(names.has(name))fail('duplicate node');names.add(name);
      const children=u(o+0x48),n=u(o+0x4c);if(n>256)fail('excessive children');range(children,n*4);for(let i=0;i<n;i++)pending.push(u(children+i*4));
      if(!(u(o+0x6c)&4))continue;range(o,0x148);
      const keys=u(o+0x54),keyCount=u(o+0x58),values=u(o+0x60),valueCount=u(o+0x64);
      if(keyCount>256||valueCount>65536)fail('excessive controllers');range(keys,keyCount*12);range(values,valueCount*4);
      const settings=new Map<number,number>();
      for(let i=0;i<keyCount;i++){
        const k=keys+i*12,type=u(k);if(![128,132,136].includes(type))continue;
        if(settings.has(type)||s(k+4)!==1||data.getInt8(range(k+10,1))!==1)fail('duplicate or animated atlas controller');
        const offset=s(k+8);if(offset<0||offset>=valueCount)fail('invalid controller data');
        const value=data.getFloat32(range(values+offset*4,4),true);if(!Number.isFinite(value))fail('nonfinite controller');settings.set(type,value);
      }
      if(root.name!=='base'){if(settings.size)fail('animation overrides atlas');animationBindings++;continue;}
      const expected=parsed.nodes.find(node=>node.type==='emitter'&&node.name===name);if(!expected)return fail('unexpected emitter');
      for(const [property,offset] of [['xgrid',0x7c],['ygrid',0x80],['loop',0x13c]] as const)if(u(o+offset)!==numeric(expected,property))fail(property+' mismatch');
      if((u(o+0x144)&0x20)!==0)fail('random playback enabled');
      for(const [property,type] of [['fps',128],['frameEnd',132],['frameStart',136]] as const)if(settings.get(type)!==Math.fround(numeric(expected,property)))fail(property+' mismatch');
      emitters++;
    }
  }
  if(emitters!==parsed.nodes.filter(n=>n.type==='emitter').length||animationBindings!==parsed.animations.flatMap(a=>a.nodes).filter(n=>n.type==='emitter').length)fail('missing emitter');
  return {emitters,animationBindings,allSettingsRead:true as const,animationOverrides:false as const};
}
