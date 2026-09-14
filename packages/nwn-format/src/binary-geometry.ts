import { createHash } from 'node:crypto';
import { DomainError } from '../../core/src/model.js';
import { readAsciiMdl } from './mdl-reader.js';

function fail(message:string):never {throw new DomainError('COMPILE_VALIDATION_FAILED',`Binary geometry: ${message}`);}
const digest=(rows:number[][])=>createHash('sha256').update(JSON.stringify(rows.map(r=>r.map(Math.fround)))).digest('hex');
const cyclic=(v:string[])=>[v,[v[1],v[2],v[0]],[v[2],v[0],v[1]]].map(r=>r.join('/')).sort()[0];

/** Direct, bounded reader of the pinned compiler's model/raw sections. This
 * deliberately reads the draw indices that its ASCII decompiler ignores.
 * Animmesh sets are vertex-major in binary, frame-major in ASCII. Runtime
 * playback/lighting are not inferred from a successful structural comparison.
 */
export function inspectBinaryMeshes(binary:Uint8Array) {
  const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  if(binary.length<12)fail('truncated header');
  const modelSize=data.getUint32(4,true),rawSize=data.getUint32(8,true),rawBase=12+modelSize;
  if(data.getUint32(0,true)!==0||rawBase+rawSize!==binary.length)fail('invalid header');
  const range=(offset:number,size:number,raw=false)=>{
    const length=raw?rawSize:modelSize;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset>length-size)fail('offset outside section');
    return (raw?rawBase:12)+offset;
  };
  const u=(o:number)=>data.getUint32(range(o,4),true),s=(o:number)=>data.getUint16(range(o,2),true);
  const name=(o:number,size:number)=>{
    const bytes=binary.subarray(range(o,size),12+o+size),end=bytes.indexOf(0);
    if(end<1)fail('invalid name');return new TextDecoder('ascii').decode(bytes.subarray(0,end));
  };
  const vectors=(o:number,count:number,width:number,raw:boolean)=>{
    range(o,count*width*4,raw);
    return Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>{
      const v=data.getFloat32(range(o+(i*width+j)*4,4,raw),true);if(!Number.isFinite(v))fail('nonfinite vector');return v;
    }));
  };
  const roots=[{context:'base',offset:u(0x48)}];
  const animations=u(0x78),animationCount=u(0x7c);if(animationCount>32)fail('excessive animations');range(animations,animationCount*4);
  for(let i=0;i<animationCount;i++){
    const o=u(animations+i*4);range(o,0x70);roots.push({context:name(o+8,64),offset:u(o+0x48)});
  }
  const meshes:Array<{context:string;name:string;offset:number;flags:number;render:number;positions:number[][];uv:number[][];
    faces:number[][];draws:number[][];drawOffsets:number[];vertexSets:number[][];textureSets:number[][];
    vertexSetOffset:number;textureSetOffset:number;vertexSetCount:number;textureSetCount:number;samplePeriod:number;controllerTypes:number[]}> = [];
  for(const root of roots){
    const pending=[root.offset],seen=new Set<number>(),names=new Set<string>();
    while(pending.length){
      const o=pending.pop()!;range(o,0x70);if(seen.has(o)||seen.size>=256)fail('cyclic or excessive nodes');seen.add(o);
      const nodeName=name(o+0x20,32);if(names.has(nodeName))fail('duplicate node name');names.add(nodeName);
      const children=u(o+0x48),childCount=u(o+0x4c);if(childCount>256)fail('excessive children');range(children,childCount*4);
      for(let i=0;i<childCount;i++)pending.push(u(children+i*4));
      const flags=u(o+0x6c);if(!(flags&0x20))continue;
      if(flags!==0x21&&flags!==0xa1)fail('unsupported mesh type');range(o,flags===0xa1?0x2a8:0x270);
      const controllers=u(o+0x54),controllerCount=u(o+0x58);if(controllerCount>256)fail('excessive controllers');range(controllers,controllerCount*12);
      const controllerTypes=Array.from({length:controllerCount},(_,i)=>u(controllers+i*12));
      const count=s(o+0x230),faceCount=u(o+0x7c),faceOffset=u(o+0x78);
      if(count>12288||faceCount>4096)fail('excessive geometry');range(faceOffset,faceCount*32);
      const faces=Array.from({length:faceCount},(_,i)=>[0,1,2].map(j=>s(faceOffset+i*32+0x1a+j*2)));
      if(faces.flat().some(i=>i>=count))fail('face index outside vertices');
      const positions=count?vectors(u(o+0x22c),count,3,true):[],uv=count?vectors(u(o+0x234),count,2,true):[];
      const draws:number[][]=[],drawOffsets:number[]=[];
      const drawCount=u(o+0x208),drawCounts=u(o+0x204),drawPointers=u(o+0x210);
      if(drawCount>4096||u(o+0x214)!==drawCount)fail('invalid draw tables');range(drawCounts,drawCount*4);range(drawPointers,drawCount*4);
      if(count&&data.getUint8(range(o+0x224,1))!==3)fail('unsupported triangle mode');
      let indices=0;
      for(let i=0;i<drawCount;i++){
        const n=u(drawCounts+i*4),p=u(drawPointers+i*4);indices+=n;
        if(n%3!==0||indices>12288)fail('invalid draw count');range(p,n*2,true);drawOffsets.push(rawBase+p);
        const draw=Array.from({length:n},(_,j)=>data.getUint16(range(p+j*2,2,true),true));
        if(draw.some(v=>v>=count))fail('draw index outside vertices');draws.push(draw);
      }
      let vertexSetCount=0,textureSetCount=0,vertexSetOffset=0,textureSetOffset=0,samplePeriod=0;
      if(flags===0xa1){
        vertexSetCount=u(o+0x2a0);textureSetCount=u(o+0x2a4);vertexSetOffset=u(o+0x298);textureSetOffset=u(o+0x29c);
        samplePeriod=data.getFloat32(range(o+0x270,4),true);
        if(!Number.isFinite(samplePeriod)||samplePeriod<0||vertexSetCount>1801||textureSetCount>1801||count*(vertexSetCount+textureSetCount)>16_777_216)fail('invalid sample counts/period');
      }
      meshes.push({context:root.context,name:nodeName,offset:o,flags,render:u(o+0xdc),positions,uv,faces,draws,drawOffsets,
        vertexSets:vertexSetCount?vectors(vertexSetOffset,count*vertexSetCount,3,false):[],
        textureSets:textureSetCount?vectors(textureSetOffset,count*textureSetCount,2,false):[],
        vertexSetOffset,textureSetOffset,vertexSetCount,textureSetCount,samplePeriod,controllerTypes});
    }
  }
  return meshes;
}

export function verifyBinaryGeometry(source:Uint8Array,binary:Uint8Array,options:{allowDuplicateControllers?:boolean}={}){
  const parsed=readAsciiMdl(source),meshes=inspectBinaryMeshes(binary);
  const report={meshNodes:0,baseRenderableMeshes:0,animationMeshBindings:0,drawTriangles:0,vertexSamples:0,uvSamples:0,
    duplicateControllers:0,allDrawIndicesRead:true as const,allSamplesRead:true as const,baseAnimationVertexOrderChecked:true as const};
  for(const mesh of meshes){
    const nodes=mesh.context==='base'?parsed.nodes:parsed.animations.find(a=>a.name===mesh.context)?.nodes;
    const src=nodes?.find(n=>n.name===mesh.name);if(!src)fail('unexpected mesh');
    report.meshNodes++;
    const duplicateCount=mesh.controllerTypes.length-new Set(mesh.controllerTypes).size;report.duplicateControllers+=duplicateCount;
    if(duplicateCount&&!options.allowDuplicateControllers)fail(`duplicate controller type: ${mesh.context}/${mesh.name}`);
    if(!mesh.positions.length){if(src.tables.verts)fail('missing geometry');continue;}
    if(mesh.context==='base'&&mesh.render)report.baseRenderableMeshes++;
    const t=src.tables,frames=(t.animverts?.length??0)/t.verts.length,uvFrames=(t.animtverts?.length??0)/t.tverts.length;
    if(frames!==mesh.vertexSetCount||uvFrames!==mesh.textureSetCount)fail('sample count mismatch');
    if(mesh.flags===0xa1&&mesh.samplePeriod!==Math.fround(Number(src.properties.sampleperiod?.[0]??0)))fail('sample period mismatch');
    const pointKeys=(points:number[][],samples:number[][],n:number,vertexMajor:boolean)=>points.map((p,i)=>digest([p,
      ...Array.from({length:n},(_,f)=>samples[vertexMajor?i*n+f:f*points.length+i])]));
    const sv=pointKeys(t.verts,t.animverts??[],frames,false),su=pointKeys(t.tverts.map(v=>v.slice(0,2)),(t.animtverts??[]).map(v=>v.slice(0,2)),uvFrames,false);
    const bv=pointKeys(mesh.positions,mesh.vertexSets,frames,true),bu=pointKeys(mesh.uv,mesh.textureSets,uvFrames,true);
    const expected=t.faces.map(f=>cyclic([0,1,2].map(i=>sv[f[i]]+su[f[i+4]]))).sort();
    const actual=mesh.faces.map(f=>cyclic(f.map(i=>bv[i]+bu[i]))).sort();
    if(JSON.stringify(expected)!==JSON.stringify(actual))fail(`position/UV/sample corner mismatch: ${mesh.context}/${mesh.name}`);
    const expectedDraw=mesh.faces.map(f=>cyclic(f.map(String))).sort(),actualDraw=mesh.draws.flatMap(d=>Array.from({length:d.length/3},(_,i)=>cyclic(d.slice(i*3,i*3+3).map(String)))).sort();
    if(JSON.stringify(expectedDraw)!==JSON.stringify(actualDraw))fail(`draw indices differ from faces: ${mesh.context}/${mesh.name}`);
    report.drawTriangles+=actualDraw.length;report.vertexSamples+=mesh.vertexSets.length;report.uvSamples+=mesh.textureSets.length;
    if(mesh.context!=='base'&&mesh.flags===0xa1){
      const base=meshes.find(n=>n.context==='base'&&n.name===mesh.name);if(!base)fail('unbound animation mesh');
      for(const k of ['positions','uv','faces','draws'] as const)if(JSON.stringify(base[k])!==JSON.stringify(mesh[k]))fail(`base/animation index order differs: ${mesh.name}/${k}`);
      report.animationMeshBindings++;
    }
  }
  const expectedNodes=[parsed.nodes,...parsed.animations.map(a=>a.nodes)].flat().filter(n=>['trimesh','animmesh'].includes(n.type));
  if(meshes.length!==expectedNodes.length)fail('missing mesh nodes');
  return report;
}
