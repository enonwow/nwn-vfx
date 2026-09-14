import { makeDocument, makeMeshLayer, type MeshLayer, type Vec3, type Vec2 } from '../../packages/core/src/model.js';
import { createTextureAsset, encodePngRgba8 } from '../../packages/core/src/textures.js';

/** Two disconnected rounded components with independent per-face UV corners. */
export function shadingExample() {
  const vertices:Vec3[]=[],faces:Vec3[]=[],uv:Vec2[]=[],uvFaces:Vec3[]=[];
  for (const center of [-.22,.22]) {
    const base=vertices.length,segments=12,rings=6;
    vertices.push([center,0,-.35]);
    for(let r=1;r<=rings;r++)for(let s=0;s<segments;s++){
      const theta=Math.PI*r/(rings+1),phi=2*Math.PI*s/segments;
      vertices.push([center+.15*Math.sin(theta)*Math.cos(phi),.13*Math.sin(theta)*Math.sin(phi),-.35*Math.cos(theta)]);
    }
    const top=vertices.length;vertices.push([center,0,.35]);
    for(let s=0;s<segments;s++) {
      const next=(s+1)%segments;faces.push([base,base+1+next,base+1+s]);
      for(let r=0;r<rings-1;r++){
        const a=base+1+r*segments+s,b=base+1+r*segments+next,c=b+segments,d=a+segments;
        faces.push([a,b,c],[a,c,d]);
      }
      faces.push([base+1+(rings-1)*segments+s,base+1+(rings-1)*segments+next,top]);
    }
  }
  for(const face of faces){const i=uv.length;uv.push([.1,.1],[.9,.1],[.5,.9]);uvFaces.push([i,i+1,i+2]);}
  const rgba=new Uint8Array(8*8*4);for(let i=0;i<64;i++)rgba.set([240,233,208,255],i*4);
  const png=encodePngRgba8({width:8,height:8,rgba}),asset=createTextureAsset('ivory.png',Buffer.from(png).toString('base64'));
  const layer:MeshLayer={...makeMeshLayer('rounded_parts','Rounded components','custom'),duration:1,position:[0,0,.4],
    shading:'smooth',geometry:{kind:'custom',vertices,faces,uv,uvFaces},material:{diffuse:'#ffffff',selfIllumination:'#000000'},
    texture:`asset:${asset.id}`,blend:'normal',animation:{alpha:[{time:0,value:0},{time:.1,value:1},{time:.9,value:1},{time:1,value:0}]}};
  return {layer,png,document:{...makeDocument('empty'),schemaVersion:8 as const,name:'Smooth shading technical example',duration:1,layers:[layer],assets:[asset]},
    camera:{position:[.7,-1.8,.85] as Vec3,target:[0,0,.4] as Vec3,fov:39}};
}
