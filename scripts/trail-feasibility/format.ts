import assert from 'node:assert/strict';
import type { Vec3 } from '../../packages/core/src/model.js';
import type { CompiledTrail } from './geometry.js';

const row=(values:number[])=>values.map(x=>Object.is(x,-0)?'0':x.toString()).join(' ');
const table=(name:string,rows:number[][])=>`  ${name} ${rows.length}\n${rows.map(r=>`    ${row(r)}`).join('\n')}\n  endlist\n`;
function staticGeometry(mesh:CompiledTrail) {
  const rgb=[1,3,5].map(i=>parseInt(mesh.color.slice(i,i+2),16)/255);
  return `  position 0 0 0\n  orientation 0 0 1 0\n  scale 1\n  ambient 0 0 0\n  diffuse ${row(rgb)}\n  selfillumcolor ${row(rgb)}\n  specular 0 0 0\n  shininess 0\n  bitmap trail_profile\n  alpha 0\n  transparencyhint 1\n  render 1\n  shadow 0\n  beaming 0\n  inheritcolor 0\n${table('verts',mesh.base.vertices)}${table('tverts',mesh.base.uv)}${table('faces',mesh.faces.map((f,i)=>[...f,1<<Math.floor((i%8)/2),...f,0]))}`;
}
export function writeProbeMdl(meshes:CompiledTrail[],length=4):Uint8Array {
  const geometry=meshes.map(m=>`node animmesh ${m.name}\n  parent trail_probe\n${staticGeometry(m)}  sampleperiod 0\nendnode\n`).join('');
  const animation=meshes.map(m=>`node animmesh ${m.name}\n  parent trail_probe\n${staticGeometry(m)}  sampleperiod ${m.period}\n${table('animverts',m.frames.flatMap(f=>f.vertices))}${table('animtverts',m.frames.flatMap(f=>f.uv))}${table('alphakey',[[0,1],[length,1]])}endnode\n`).join('');
  return new TextEncoder().encode(`#MAXMODEL ASCII\n# ISOLATED FEASIBILITY PROBE, NOT A STUDIO RELEASE; nativeVerified false\nnewmodel trail_probe\nsetsupermodel trail_probe NULL\nclassification EFFECT\nsetanimationscale 1\nbeginmodelgeom trail_probe\nnode dummy trail_probe\n  parent NULL\nendnode\n${geometry}endmodelgeom trail_probe\nnewanim impact trail_probe\n length ${length}\n transtime 0\n animroot trail_probe\nnode dummy trail_probe\n parent NULL\nendnode\n${animation}doneanim impact trail_probe\ndonemodel trail_probe\n`);
}
/** Bounded reader used only in the experiment. Reconstructed table data feeds
 * the browser, so the visual proof cannot accidentally use unexported state. */
export function readProbeMdl(bytes:Uint8Array):CompiledTrail[] {
  assert(bytes.length<64*1024*1024);
  const source=new TextDecoder().decode(bytes).split(/\r?\n/).map(l=>l.trim()).join('\n'),part=source.split('newanim impact trail_probe\n')[1];assert(part);
  const matches=[...part.matchAll(/node animmesh (\w+)\n([\s\S]*?)endnode/g)];assert(matches.length>0);
  return matches.map(([,name,body])=>{
    const lines=body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean),tables=new Map<string,number[][]>(),properties=new Map<string,number[]>();
    for(let i=0;i<lines.length;i++) {
      const [key,...args]=lines[i].split(/\s+/);
      if(['verts','tverts','faces','animverts','animtverts','alphakey'].includes(key)) {
        assert(!tables.has(key));const count=Number(args[0]),width=key==='faces'?8:key==='alphakey'?2:3;
        assert(Number.isInteger(count)&&count>0&&count<2_000_000);const values:number[][]=[];
        for(let j=0;j<count;j++) {const v=lines[++i].split(/\s+/).map(Number);assert(v.length===width&&v.every(Number.isFinite));values.push(v);}
        if(lines[i+1]==='endlist')i++;tables.set(key,values);
      } else if(['sampleperiod','diffuse'].includes(key)) {assert(!properties.has(key));properties.set(key,args.map(Number));}
    }
    const vertices=tables.get('verts')! as Vec3[],uv=tables.get('tverts')! as Vec3[],faces=tables.get('faces')!,av=tables.get('animverts')! as Vec3[],at=tables.get('animtverts')! as Vec3[];
    assert(av.length%vertices.length===0&&at.length%uv.length===0&&av.length/vertices.length===at.length/uv.length);
    assert(faces.every(f=>f.slice(0,3).every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length)&&f.slice(4,7).every(i=>Number.isInteger(i)&&i>=0&&i<uv.length)));
    assert(at.every(v=>v[0]>=0&&v[0]<=1&&v[1]>=0&&v[1]<=1&&v[2]===0));
    const count=av.length/vertices.length,period=properties.get('sampleperiod')![0];assert(period>0);
    const uvByVertex:number[]=[];
    for(const face of faces) for(let j=0;j<3;j++) {const index=face[j],ti=face[j+4];if(uvByVertex[index]!==undefined)assert.deepEqual(uv[uvByVertex[index]],uv[ti]);uvByVertex[index]=ti;}
    assert.equal(uvByVertex.length,vertices.length);assert(uvByVertex.every(Number.isInteger));
    const color='#'+properties.get('diffuse')!.map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
    return {name,color,period,sections:[],base:{vertices,uv:uvByVertex.map(index=>uv[index])},faces:faces.map(f=>f.slice(0,3) as Vec3),frames:Array.from({length:count},(_,i)=>({vertices:av.slice(i*vertices.length,(i+1)*vertices.length),uv:uvByVertex.map(index=>at[i*uv.length+index])}))};
  });
}
