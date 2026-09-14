import {DomainError} from '../../core/src/model.js';
import {readAsciiMdl,numeric,textProperty,vector} from './mdl-reader.js';
import {assertBeamPointCount,verifyBeamPointCounts} from './beam-point-count.js';
/** Direct pinned NwnMdlNodes.h read: reference refModel 0x70 / reattachable
 * 0xb0; controllers are 12-byte records. No decompiler-derived values. */
export function verifyBinaryBeam(source:Uint8Array,binary:Uint8Array) {
  const finite=readAsciiMdl(source).nodes.some(n=>n.type==='emitter'&&numeric(n,'p2p')===1);
  verifyBeamPointCounts(source);
  const fail=(s:string):never=>{throw new DomainError('COMPILE_VALIDATION_FAILED','Binary beam: '+s);};
  const d=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  if(binary.length<12)fail('header');const size=d.getUint32(4,true);
  if(d.getUint32(0,true)!==0||12+size+d.getUint32(8,true)!==binary.length)fail('size');
  const range=(o:number,n:number)=>{if(!Number.isSafeInteger(o)||!Number.isSafeInteger(n)||o<0||n<0||o>size-n)fail('bounds');return o+12;};
  const u=(o:number)=>d.getUint32(range(o,4),true),s=(o:number)=>d.getInt16(range(o,2),true),f=(o:number)=>{const v=d.getFloat32(range(o,4),true);if(!Number.isFinite(v))fail('float');return v;};
  const str=(o:number,n:number)=>{const b=binary.subarray(range(o,n),o+n+12),end=b.indexOf(0);if(end<0)fail('string');return new TextDecoder('ascii').decode(b.subarray(0,end));};
  const parsed=readAsciiMdl(source);if(parsed.animations.length!==(finite?1:0)||u(0x7c)!==parsed.animations.length)fail('unexpected animation');
  const queue=[{o:u(0x48),parent:'NULL'}],seen=new Set<number>(),names=new Set<string>(),results=[];
  while(queue.length){
    const {o,parent}=queue.pop()!;range(o,0x70);if(seen.has(o)||seen.size>=64)fail('cycle/count');seen.add(o);
    const name=str(o+0x20,32),flags=u(o+0x6c),node=parsed.nodes.find(n=>n.name===name)??fail('missing node');
    if(!node||names.has(name)||textProperty(node,'parent')!==parent)fail('node/parent');names.add(name);
    const child=u(o+0x48),count=u(o+0x4c);if(count>16)fail('children');range(child,count*4);for(let i=0;i<count;i++)queue.push({o:u(child+i*4),parent:name});
    const ct=u(o+0x54),n=u(o+0x58),data=u(o+0x60),dataCount=u(o+0x64);if(n>128||dataCount>4096)fail('controllers');range(ct,n*12);range(data,dataCount*4);
    const values=new Map<number,number[]>();
    for(let i=0;i<n;i++){const k=ct+i*12,id=u(k),rows=s(k+4),keys=s(k+6),offset=s(k+8),columns=d.getInt8(range(k+10,1));
      if(values.has(id)||rows!==1||keys<0||keys>=dataCount||offset<0||columns<1||columns>4||offset>dataCount-columns||f(data+keys*4)!==0)fail('controller rows');
      values.set(id,Array.from({length:columns},(_,j)=>f(data+(offset+j)*4)));
    }
    const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
    if(node.type==='reference'){
      range(o,0xb4);if(flags!==17||str(o+0x70,64)!=='fx_ref'||u(o+0xb0)!==1||!equal(values.get(8),vector(node,'position').map(Math.fround)))fail('reference target');
      results.push({node:name,parent,type:'reference',refModel:str(o+0x70,64),reattachable:u(o+0xb0),position:values.get(8)});
    }else if(node.type==='emitter'){
      const moving=textProperty(node,'update')==='Fountain'&&numeric(node,'p2p')===1;
      range(o,0x148);if(flags!==5||str(o+0x88,32)!==(moving?'Fountain':'Lightning')||str(o+0xa8,32)!==(moving?'Normal':'Linked')||u(o+0x144)!==(moving?3:258))fail('emitter mode/flags');
      if(!moving)assertBeamPointCount(values.get(88)?.[0]??NaN);
      for(const [id,field] of [[128,'fps'],[132,'frameend'],[136,'framestart'],[84,'alphastart'],[80,'alphaend'],[464,'alphamid'],[88,'birthrate'],[168,'sizestart'],[172,'sizeend'],...(moving?[[144,'lifeexp'],[120,'combinetime'],[152,'p2p_bezier2'],[156,'p2p_bezier3']] as const:[[208,'lightningdelay'],[212,'lightningradius'],[216,'lightningscale']] as const),[192,'velocity']] as const)
        if(!equal(values.get(id),[Math.fround(numeric(node,field))]))fail(field);
      for(const [id,field] of [[108,'colorstart'],[96,'colorend'],[468,'colormid']] as const)if(!equal(values.get(id),vector(node,field).map(Math.fround)))fail(field);
      if(str(o+0xe8,64)!==textProperty(node,'texture')||str(o+0xc8,32)!==textProperty(node,'blend'))fail('material');
      for(const [field,offset] of [['xgrid',0x7c],['ygrid',0x80],['loop',0x13c]] as const)if(u(o+offset)!==numeric(node,field))fail(field);
      results.push({node:name,parent,type:'emitter',update:moving?'Fountain':'Lightning',render:moving?'Normal':'Linked',flags:moving?3:258,texture:str(o+0xe8,64),controllers:Object.fromEntries(values)});
    }else if(node.type!=='dummy')fail('unsupported node');
  }
  if(seen.size!==parsed.nodes.length)fail('node count');
  return {version:1,allReferencesRead:true,allBeamControllersRead:true,nativeVerified:false,nodes:results};
}
