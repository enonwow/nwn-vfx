import * as THREE from 'three';
import { interpolateFrames, type CompiledTrail } from './geometry.js';

const canvas=document.querySelector('canvas')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(960,640,false);renderer.setPixelRatio(1);renderer.setClearColor('#080c13');
renderer.outputColorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(39,1.5,.05,100);camera.up.set(0,0,1);camera.position.set(3.4,-5.4,2.75);camera.lookAt(0,0,1.25);
const scene=new THREE.Scene();
const data=await(await fetch('/data')).json();
const pixels=new Uint8Array(data.texture.rgba),bottom=new Uint8Array(pixels.length),size=data.texture.width;
for(let y=0;y<size;y++)bottom.set(pixels.subarray(y*size*4,(y+1)*size*4),(size-1-y)*size*4);
const texture=new THREE.DataTexture(bottom,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
const meshes=(data.meshes as CompiledTrail[]).map(source=>{
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(source.base.vertices.flat(),3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(source.base.uv.flatMap(v=>v.slice(0,2)),2));
  geo.setIndex(source.faces.flat());
  const material=new THREE.MeshBasicMaterial({map:texture,color:source.color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=new THREE.Mesh(geo,material);mesh.frustumCulled=false;scene.add(mesh);return {source,mesh};
});
(window as any).renderProbe=(time:number)=>{
  for(const {source,mesh} of meshes) {
    const frame=interpolateFrames(source,time),p=mesh.geometry.attributes.position as THREE.BufferAttribute,u=mesh.geometry.attributes.uv as THREE.BufferAttribute;
    frame.vertices.forEach((v,i)=>p.setXYZ(i,...v));frame.uv.forEach((v,i)=>u.setXY(i,v[0],v[1]));p.needsUpdate=true;u.needsUpdate=true;
  }
  renderer.render(scene,camera);return canvas.toDataURL('image/png');
};
(window as any).renderProbe(0);
(window as any).probeReady=true;
