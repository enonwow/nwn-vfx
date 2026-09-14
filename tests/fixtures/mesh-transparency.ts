import {makeDocument,makeMeshLayer,type MeshLayer,type EffectDocument} from '../../packages/core/src/model.js';
import {createTextureAsset,encodePngRgba8} from '../../packages/core/src/textures.js';

/** Near red and far blue quads in ONE mesh, deliberately near-first. */
export function transparencyFixture(){
  const rgba=new Uint8Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++)rgba.set(x<4?[255,0,0,255]:[0,0,255,255],(y*8+x)*4);
  const asset=createTextureAsset('sort-test.png',Buffer.from(encodePngRgba8({width:8,height:8,rgba})).toString('base64'));
  const layer:MeshLayer={...makeMeshLayer('surface'),alpha:.6,position:[0,0,0],color:'#ffffff',texture:`asset:${asset.id}`,blend:'normal',
    material:{diffuse:'#000000',selfIllumination:'#ffffff'},animation:{},geometry:{kind:'custom',
      vertices:[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,.5,-1],[1,.5,-1],[1,.5,1],[-1,.5,1]],
      faces:[[0,1,2],[0,2,3],[4,5,6],[4,6,7]],uv:[[.25,.5],[.75,.5]],uvFaces:[[0,0,0],[0,0,0],[1,1,1],[1,1,1]]}};
  const document:EffectDocument={...makeDocument('empty'),schemaVersion:5,assets:[asset],layers:[layer]};
  return{document,camera:{position:[0,-5,0],target:[0,0,0],fov:35}};
}
/** Reorder faces together with independently indexed UVs; vertices stay exact. */
export function permuteTriangles(document:EffectDocument,mode:'reverse'|'shuffle'){
  const d=structuredClone(document);
  for(const l of d.layers){if(l.type!=='mesh'||l.geometry.kind!=='custom')continue;const g=l.geometry,order=g.faces.map((_,i)=>i);
    if(mode==='reverse')order.reverse();else {let seed=319;for(let i=order.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];}}
    g.faces=order.map(i=>g.faces[i]);if(g.uvFaces)g.uvFaces=order.map(i=>g.uvFaces![i]);
  }return d;
}
