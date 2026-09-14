import { makeLayer,makeMeshLayer,type Change,type Vec3 } from '../../packages/core/src/model.js';
import { buildMeshGeometry } from '../../packages/core/src/mesh.js';

/** An authored acceptance example, not a product preset or a name-dependent feature. */
export function meshImpactChanges():Change[] {
  const outline:[number,number][]=[[0,0],[.14,.32],[.14,1.5],[-.14,1.5],[-.14,.32]];
  const vertices:Vec3[]=[...outline.map(([x,z])=>[x,-.045,z] as Vec3),...outline.map(([x,z])=>[x,.045,z] as Vec3)];
  const faces:[number,number,number][]=[];
  for(let i=1;i<4;i++){faces.push([0,i,i+1],[5,5+i+1,5+i]);}
  for(let i=0;i<5;i++){const j=(i+1)%5;faces.push([i,i+5,j+5],[i,j+5,j]);}
  for(const [dimensions,position] of [ [[.85,.16,.12],[0,0,1.55]], [[.12,.12,.45],[0,0,1.86]], [[.22,.16,.16],[0,0,2.16]] ] as [Vec3,Vec3][]) {
    const part=buildMeshGeometry({kind:'box',dimensions}),offset=vertices.length;
    vertices.push(...part.vertices.map(v=>v.map((n,i)=>n+position[i]) as Vec3));faces.push(...part.faces.map(f=>f.map(i=>i+offset) as [number,number,number]));
  }
  const sword={...makeMeshLayer('blade','Ostrze — geometria własna','custom'),geometry:{kind:'custom' as const,vertices,faces},scale:.8,color:'#cbb47b',start:0,duration:2.5,alpha:0,
    animation:{position:[{time:0,value:[0,0,1.2] as Vec3},{time:.75,value:[0,0,0] as Vec3},{time:2.5,value:[0,0,0] as Vec3}],
      alpha:[{time:0,value:0},{time:.2,value:.75},{time:.75,value:.95},{time:1.1,value:.55},{time:1.8,value:.15},{time:2.5,value:0}]}};
  const ring={...makeMeshLayer('impact_ring','Pierścień impulsu','ring'),position:[0,0,.03] as Vec3,start:.72,duration:1,scale:.15,alpha:0,color:'#ddbf7b',
    animation:{scale:[{time:0,value:.15},{time:.45,value:1.4},{time:1,value:2.2}],alpha:[{time:0,value:0},{time:.05,value:.75},{time:.3,value:.35},{time:1,value:0}]}};
  const dust={...makeLayer('dust','Pył'),texture:'smoke' as const,update:'Fountain' as const,start:.77,duration:.3,life:.9,count:22,alpha:.3,endAlpha:0,size:.12,endSize:.35,
    gravity:.7,speed:.25,spread:1.3,position:[0,0,.1] as Vec3,color:'#aa9980',endColor:'#635b53'};
  return [{type:'layer.set',layerId:'sparks',values:{name:'Odpryski przy impakcie',start:.75,count:42,life:.55,gravity:3,speed:1.6,spread:1.4,size:.05,endSize:.015,position:[0,0,.08],color:'#c2a76b',endColor:'#746246'}},
    {type:'layer.add',layer:sword},{type:'layer.add',layer:ring},{type:'layer.add',layer:dust}];
}
