import {makeDocument,makeMeshLayer,type EffectDocument,type MeshLayer,type Vec3} from '../../packages/core/src/model.js';
import {createTextureAsset,encodePngRgba8} from '../../packages/core/src/textures.js';

/** Technical panels only; no accepted character asset or external model. */
export function durationExample():Record<'opening'|'loop'|'closing',EffectDocument> {
  const open:Vec3[]=[[-.1,0,0],[-1,0,.55],[-.8,0,-.4],[.1,0,0],[.8,0,-.4],[1,0,.55]];
  const folded:Vec3[]=open.map(([x,y,z],i)=>[i%3===0?x:Math.sign(x)*.16,y,z]);
  const moved:Vec3[]=open.map(([x,y,z],i)=>[x,i%3===0?y:.16,z+(i%3===0?0:.04)]);
  const rgba=new Uint8Array(8*8*4);for(let i=0;i<64;i++)rgba.set([220,80+10*(i%8),60+12*Math.floor(i/8),255],i*4);
  const texture=createTextureAsset('technical-panels.png',Buffer.from(encodePngRgba8({width:8,height:8,rgba})).toString('base64'));
  const base:MeshLayer={...makeMeshLayer('panels','Panele techniczne','custom'),duration:1,position:[0,0,1.2],color:'#ffffff',texture:`asset:${texture.id}`,
    geometry:{kind:'custom',vertices:open,faces:[[0,1,2],[3,4,5]],uv:[[.5,.5],[0,1],[0,0],[.5,.5],[1,0],[1,1]],uvFaces:[[0,1,2],[3,4,5]]},animation:{}};
  const phase=(name:string,lifecycle:'impact'|'duration',values:Vec3[][]):EffectDocument=>{
    const d=makeDocument('empty',name,lifecycle);d.duration=1;d.orientWithObject=true;d.assets=[structuredClone(texture)];
    d.layers=[{...structuredClone(base),animation:{vertices:values.map((value,i)=>({time:i/(values.length-1),value:structuredClone(value)}))}}];return d;
  };
  return {opening:phase('DUR technical opening','impact',[folded,open]),loop:phase('DUR technical loop','duration',[open,moved,open]),closing:phase('DUR technical closing','impact',[open,folded])};
}
