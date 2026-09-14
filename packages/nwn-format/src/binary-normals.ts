import { createHash } from 'node:crypto';
import { DomainError } from '../../core/src/model.js';
import { meshCornerNormals } from '../../core/src/shading.js';
import { readAsciiMdl } from './mdl-reader.js';

function fail(message:string):never {throw new DomainError('COMPILE_VALIDATION_FAILED',`Binary normals: ${message}`);}
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const NORMAL_COMPONENT_TOLERANCE=0.0002;
export interface BinaryNormalReadback {
  nodes:number; corners:number; allCornersRead:true; maxComponentError:number;
  componentTolerance:number; sourceCornerNormalsSha256:string; binaryCornerNormalsSha256:string;
  animmeshNodes:number; animatedNormalSamples:0;
  coverage:'base-trimesh-and-smooth-animmesh-in-base-and-animations';
}

/** Bounds-checked base trimesh and smooth animmesh reader. Binary normals are not emitted
 * by the pinned CLI decompiler. Layout: _NwnLib/NwnMdl{Geometry,Nodes}.h at
 * dunahan/nwnexplorer 56da6dc2fe94da6bbabe83ad18670f47fccd7dfb.
 * Model pointers are relative to byte 12; raw pointers to 12+modelSize.
 * Match every oriented position/UV corner, including duplicate components,
 * before checking its actual stored float32 normal. No native claim. */
export function verifyBinaryNormals(source:Uint8Array,binary:Uint8Array):BinaryNormalReadback {
  const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  if(binary.length<12)fail('truncated header');
  const modelSize=view.getUint32(4,true),rawSize=view.getUint32(8,true),rawBase=12+modelSize;
  if(view.getUint32(0,true)!==0||rawBase+rawSize!==binary.length)fail('invalid header');
  const range=(offset:number,size:number,base=12,length=modelSize)=>{
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset>length-size)fail('offset outside section');
    return base+offset;
  };
  const uint=(offset:number)=>view.getUint32(range(offset,4),true);
  const vector=(offset:number,count:number)=>Array.from({length:count},(_,i)=>{
    const n=view.getFloat32(range(offset+i*4,4,rawBase,rawSize),true);if(!Number.isFinite(n))fail('nonfinite raw data');return n;
  });
  function tree(root:number){
  const nodeMap=new Map<string,number>(),seen=new Set<number>(),pending=[root];
  while(pending.length){
    const offset=pending.pop()!;range(offset,0x70);
    if(seen.has(offset)||seen.size>=256)fail('cyclic or excessive nodes');seen.add(offset);
    const bytes=binary.subarray(range(offset+0x20,32),12+offset+0x40),end=bytes.indexOf(0);
    if(end<1)fail('invalid node name');
    const name=new TextDecoder('ascii').decode(bytes.subarray(0,end));if(nodeMap.has(name))fail('duplicate name');nodeMap.set(name,offset);
    const children=uint(offset+0x48),count=uint(offset+0x4c);if(count>256)fail('excessive children');range(children,count*4);
    for(let i=0;i<count;i++)pending.push(uint(children+i*4));
  }
  return nodeMap;
  }
  const expectedAll:number[][]=[],actualAll:number[][]=[];
  let nodes=0,maxComponentError=0,animmeshNodes=0;
  const parsed=readAsciiMdl(source);
  const contexts=[{source:parsed.nodes,nodeMap:tree(uint(0x48)),base:true}];
  if(parsed.animations.some(a=>a.nodes.some(n=>n.type==='animmesh'&&n.tables.faces?.every(f=>f[3]===1)))){
    const animations=uint(0x78),count=uint(0x7c);if(count!==parsed.animations.length||count>32)fail('animation count mismatch');range(animations,count*4);
    for(let i=0;i<count;i++){
      const offset=uint(animations+i*4);range(offset,0x70);
      const bytes=binary.subarray(range(offset+8,64),12+offset+72),end=bytes.indexOf(0);if(end<1)fail('invalid animation name');
      const name=new TextDecoder('ascii').decode(bytes.subarray(0,end)),src=parsed.animations.find(a=>a.name===name);if(!src)fail('unknown animation');
      contexts.push({source:src.nodes,nodeMap:tree(uint(offset+0x48)),base:false});
    }
  }
  const signature=(p:number[],uv:number[])=>JSON.stringify([...p,...uv].map(n=>Math.fround(n)));
  const cyclic=(keys:string[])=>[keys,[keys[1],keys[2],keys[0]],[keys[2],keys[0],keys[1]]].map(a=>a.join('|')).sort()[0];
  for(const context of contexts)for(const src of context.source.filter(n=>(context.base&&n.type==='trimesh')||(n.type==='animmesh'&&n.tables.faces?.every(f=>f[3]===1)))){
    const offset=context.nodeMap.get(src.name);if(offset===undefined)fail('missing mesh');range(offset,src.type==='animmesh'?0x2a8:0x270);
    if(uint(offset+0x6c)!==(src.type==='animmesh'?0xa1:0x21))fail('unexpected node type');
    if(src.type==='animmesh'){
      // m_avAnimNormals is a legacy compiler array, not a supported input.
      // Read its actual count rather than inferring animated-normal support.
      if(uint(offset+0x290)!==0)fail('unexpected animated normal array');animmeshNodes++;
    }
    const faceOffset=uint(offset+0x78),faceCount=uint(offset+0x7c),vertexCount=view.getUint16(range(offset+0x230,2),true);
    const verticesOffset=uint(offset+0x22c),uvOffset=uint(offset+0x234),normalOffset=uint(offset+0x244);
    if(faceCount!==src.tables.faces.length||!vertexCount||vertexCount>12288)fail('invalid mesh counts');
    range(faceOffset,faceCount*32);range(verticesOffset,vertexCount*12,rawBase,rawSize);range(normalOffset,vertexCount*12,rawBase,rawSize);range(uvOffset,vertexCount*8,rawBase,rawSize);
    const mode=src.tables.faces.every(f=>f[3]===0)?'flat':src.tables.faces.every(f=>f[3]===1)?'smooth':fail('unsupported source smoothing masks');
    const normals=meshCornerNormals(src.tables.verts,src.tables.faces.map(f=>f.slice(0,3)),mode);
    const buckets=new Map<string,Array<{keys:string[];normals:number[][]}>>();
    src.tables.faces.forEach((f,i)=>{
      const keys=[0,1,2].map(k=>signature(src.tables.verts[f[k]],src.tables.tverts[f[k+4]].slice(0,2))),key=cyclic(keys);
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push({keys,normals:normals.slice(i*3,i*3+3)});
    });
    for(let f=0;f<faceCount;f++){
      const indices=[0,1,2].map(k=>view.getUint16(range(faceOffset+f*32+0x1a+k*2,2),true));
      if(indices.some(i=>i>=vertexCount))fail('face vertex outside table');
      const keys=indices.map(i=>signature(vector(verticesOffset+i*12,3),vector(uvOffset+i*8,2)));
      const actual=indices.map(i=>vector(normalOffset+i*12,3)),bucket=buckets.get(cyclic(keys));
      if(!bucket?.length)fail('position/UV/winding mismatch');
      let match=-1,rotation=-1;
      for(let b=0;b<bucket.length&&match<0;b++)for(let r=0;r<3;r++){
        const candidate=bucket[b];
        if(keys.every((key,k)=>key===candidate.keys[(k+r)%3]&&actual[k].every((n,j)=>Math.abs(n-candidate.normals[(k+r)%3][j])<=NORMAL_COMPONENT_TOLERANCE))){match=b;rotation=r;break;}
      }
      if(match<0)fail(`normal mismatch at ${src.name} face ${f}`);
      const candidate=bucket.splice(match,1)[0];
      actual.forEach((n,k)=>{
        const expected=candidate.normals[(k+rotation)%3];expectedAll.push(expected);actualAll.push(n);
        n.forEach((x,j)=>maxComponentError=Math.max(maxComponentError,Math.abs(x-expected[j])));
      });
    }
    if([...buckets.values()].some(b=>b.length))fail('missing source corners');nodes++;
  }
  return {nodes,corners:actualAll.length,allCornersRead:true,maxComponentError,componentTolerance:NORMAL_COMPONENT_TOLERANCE,
    sourceCornerNormalsSha256:hash(expectedAll),binaryCornerNormalsSha256:hash(actualAll),animmeshNodes,animatedNormalSamples:0,
    coverage:'base-trimesh-and-smooth-animmesh-in-base-and-animations'};
}
