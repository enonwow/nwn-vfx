import { makeDocument, makeMeshLayer, type EffectDocument, type MeshLayer, type Vec3 } from '../../packages/core/src/model.js';
import { createTextureAsset, encodePngRgba8 } from '../../packages/core/src/textures.js';

/** Technical fixture, not Ugryzienie artwork or a product preset. */
export function deformationExample(): { document: EffectDocument; layer: MeshLayer; png: Uint8Array } {
  const rgba = new Uint8Array(64 * 64 * 4);
  for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
    const u=x/63,v=y/63;
    // A baked asymmetric pale reflection over red pigment, not runtime specular.
    const h=Math.exp(-((u-.3)**2/.0015+(v-.35)**2/.07));
    const shade=.72+.28*Math.sin(u*Math.PI)*Math.sin(v*Math.PI);
    rgba.set([Math.round(160*shade+80*h),Math.round(9+92*h),Math.round(17+88*h),255],(y*64+x)*4);
  }
  const png=encodePngRgba8({width:64,height:64,rgba});
  const asset=createTextureAsset('deformation-red.png',Buffer.from(png).toString('base64'));
  const base:Vec3[]=[[0,0,0],[-.025,0,.005],[-.025,0,.018],[-.008,0,.03],[.014,0,.025],[.028,0,.016],[.026,0,.003]];
  const middle:Vec3[]=[[0,0,0],[-.16,.012,-.028],[-.19,-.009,.034],[-.057,.013,.079],[.073,-.011,.061],[.21,.018,.037],[.17,-.004,-.033]];
  const final:Vec3[]=[[0,0,0],[-.22,.025,-.061],[-.27,-.017,.007],[-.085,.03,.095],[.10,-.028,.029],[.31,.04,.02],[.25,-.013,-.08]];
  const faces:Vec3[]=Array.from({length:5},(_,i)=>[0,i+2,i+1]);
  const layer:MeshLayer={...makeMeshLayer('deforming_surface','Deforming red surface','custom'),start:.4,duration:.45,position:[0,0,.32],alpha:0,
    color:'#ffffff',material:{diffuse:'#ffffff',selfIllumination:'#000000'},blend:'normal',texture:`asset:${asset.id}`,
    geometry:{kind:'custom',vertices:base,faces,uv:[[1,.08],[1,.6],[.66,.92],[.33,1],[0,.65],[0,.1],[.5,0]],uvFaces:faces.map(f=>f.map(i=>6-i) as Vec3)},
    animation:{vertices:[{time:0,value:base},{time:.137,value:middle},{time:.45,value:final}],
      alpha:[{time:0,value:0},{time:.025,value:1},{time:.3,value:.9},{time:.45,value:0}]}};
  return {document:{...makeDocument('empty'),name:'Generic mesh deformation example',schemaVersion:7,duration:2,layers:[layer],assets:[asset]},layer,png};
}
