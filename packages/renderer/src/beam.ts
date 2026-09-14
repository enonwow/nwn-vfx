import * as THREE from 'three';
import type {BeamLayer} from '../../core/src/model.js';
import {sampleBeam} from '../../core/src/beam.js';
import {beamMotionFrame} from '../../core/src/beam-motion.js';
import {materialMotionFrame} from '../../core/src/beam-material-motion.js';
export function createBeamPreview(layer:BeamLayer,map:THREE.Texture) {
  const geometry=new THREE.BufferGeometry();
  const segments=layer.nativeMotion?1:layer.segments;
  const mapped=!!layer.textureMapping;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(mapped?segments*12:(segments+1)*6),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(mapped?Array.from({length:segments},()=>[0,0,1,0,0,1,1,1]).flat():Array.from({length:segments+1},(_,i)=>[i/segments,0,i/segments,1]).flat(),2));
  geometry.setIndex(Array.from({length:segments},(_,i)=>{const n=i*(mapped?4:2);return [n,n+1,n+2,n+1,n+3,n+2];}).flat());
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:layer.blend==='additive'?THREE.AdditiveBlending:THREE.NormalBlending,
    uniforms:{map:{value:map},color:{value:new THREE.Color(layer.color)},alpha:{value:layer.alpha},distance:{value:1},offset:{value:0},moving:{value:!layer.nativeMotion&&!mapped&&layer.flow.speed>0?1:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D map;uniform vec3 color;uniform float alpha;uniform float distance;uniform float offset;uniform float moving;varying vec2 vUv;
      void main(){vec4 texel=texture2D(map,vUv);float pulse=mix(1.,.35+.65*pow(.5+.5*cos((vUv.x*distance-offset)*12.56637),5.),moving);
      gl_FragColor=vec4(texel.rgb*color,texel.a*alpha*pulse);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name=layer.id;return mesh;
}
export function updateBeamPreview(mesh:ReturnType<typeof createBeamPreview>,layer:BeamLayer,time:number,camera:THREE.Camera) {
  const sample=sampleBeam(layer,time),p=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  mesh.updateWorldMatrix(true,false);const eye=mesh.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
  for(let i=0;i<sample.points.length;i++){
    const point=new THREE.Vector3(...sample.points[i]),a=new THREE.Vector3(...sample.points[Math.max(0,i-1)]),b=new THREE.Vector3(...sample.points[Math.min(sample.points.length-1,i+1)]);
    const axis=b.sub(a).normalize(),view=eye.clone().sub(point),side=new THREE.Vector3().crossVectors(axis,view);
    if(side.lengthSq()<1e-10)side.crossVectors(axis,Math.abs(axis.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0));
    side.normalize().multiplyScalar(layer.textureMapping?sample.width:sample.width/2);
    const left=point.clone().sub(side).toArray(),right=point.clone().add(side).toArray();
    if(layer.textureMapping){
      if(i>0){p.setXYZ((i-1)*4+2,...left);p.setXYZ((i-1)*4+3,...right);}
      if(i<sample.points.length-1){p.setXYZ(i*4,...left);p.setXYZ(i*4+1,...right);}
    }else {p.setXYZ(i*2,...left);p.setXYZ(i*2+1,...right);}
  }
  p.needsUpdate=true;mesh.material.uniforms.distance.value=sample.length;mesh.material.uniforms.offset.value=sample.flowOffset;
  if(layer.nativeMotion){
    const frame=beamMotionFrame(layer.nativeMotion,time),u0=(frame%4)/4,u1=u0+.25,v1=1-Math.floor(frame/4)/4,v0=v1-.25;
    const uv=mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    uv.setXY(0,u0,v0);uv.setXY(1,u1,v0);uv.setXY(2,u0,v1);uv.setXY(3,u1,v1);uv.needsUpdate=true;
  }
  if(layer.materialMotion){
    const frame=materialMotionFrame(layer.materialMotion,time),u0=frame/16,u1=(frame+1)/16;
    const uv=mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for(let segment=0;segment<2;segment++){const i=segment*4;uv.setXY(i,u0,0);uv.setXY(i+1,u1,0);uv.setXY(i+2,u0,1);uv.setXY(i+3,u1,1);}uv.needsUpdate=true;
  }
}
