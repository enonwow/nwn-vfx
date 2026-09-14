import type {PreviewConditions} from '../../core/src/workflow.js';
import {beamFlowEnvelope,birthAtQuantile} from '../../core/src/beam-flow.js';
import {createBeamPreview,updateBeamPreview} from './beam.js';
import {buildMaterialMotionAtlas,materialMotionKey} from '../../core/src/beam-material-motion.js';
import {buildBeamMotionAtlas,beamMotionTextureKey} from '../../core/src/beam-motion.js';
import {buildBeamTexture,beamTextureKey} from '../../core/src/beam-texture.js';
import * as THREE from 'three';
import {assertCompositionBudget, compositionSource, type CompositionSnapshot} from '../../core/src/composition.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EffectDocument, EmitterLayer, MeshLayer, TrailLayer, BeamLayer } from '../../core/src/model.js';
import { compileTrailParts, interpolateFrames, trailOpacity, trailProfilePixels, trailHeadPixels, assertTrailBudget, type CompiledTrail } from '../../core/src/trails.js';
import { assertPreviewCamera, type PreviewCamera } from '../../core/src/camera.js';
import { axisAngleToQuaternion, buildMeshGeometry, sampleMeshLayer } from '../../core/src/mesh.js';
import { smoothVertexNormals, validateMeshShading } from '../../core/src/shading.js';
import { assertMeshDeformationBudget, compileMeshDeformation, sampleMeshDeformation, type CompiledMeshDeformation } from '../../core/src/deformation.js';
import { decodeTextureAsset, emitterAppearancePoints, resolveTexture, resolveTextureAsset, sampleEmitterAppearance } from '../../core/src/textures.js';
import { prepareEmitterOrientation, sampleEmitterPosition } from '../../core/src/simulation.js';
import { flipbookFrameUv, sampleFlipbookFrame } from '../../core/src/flipbook.js';
import {MeshTriangleOrder} from './mesh-transparency.js';

function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Expand a full-width metre quad in camera space, then project its corners.
// Triangles retain partial visibility when the centre leaves the viewport and
// avoid both the old 300px clamp and hardware-dependent GL point-size limits.
const vertexShader = `attribute vec3 particleCenter; attribute float particleSize; attribute vec4 tint; attribute vec4 frameUv;
varying vec2 vParticleUv; varying vec4 vFrameUv; varying vec4 vTint;
void main(){vTint=tint;vFrameUv=frameUv;vParticleUv=position.xy+.5;
vec4 mv=modelViewMatrix*vec4(particleCenter,1.);mv.xy+=position.xy*particleSize;gl_Position=projectionMatrix*mv;}`;
const fragmentShader = `varying vec2 vParticleUv; varying vec4 vTint; varying vec4 vFrameUv; uniform float animatedAtlas; uniform float kind; uniform sampler2D assetMap;
void main(){vec2 p=(vec2(vParticleUv.x,1.-vParticleUv.y)-.5)*2.;float r=length(p);float alpha;
if(kind>2.5){vec2 uv=vParticleUv;if(animatedAtlas>.5)uv=mix(vFrameUv.xy,vFrameUv.zw,uv);vec4 texel=texture2D(assetMap,uv);
if(texel.a<=0.||vTint.a<=0.)discard;gl_FragColor=vec4(texel.rgb*vTint.rgb,texel.a*vTint.a);
}else{
if(kind<.5){alpha=pow(max(0.,1.-r),1.8);}else if(kind<1.5){float n=sin(p.x*8.+sin(p.y*5.))*sin(p.y*9.)*.075;alpha=(1.-smoothstep(.15,1.,r+n))*.48;}else{alpha=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r));}
if(alpha<.005||vTint.a<.001)discard;gl_FragColor=vec4(vTint.rgb,alpha*vTint.a);
}
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <premultiplied_alpha_fragment>
}`;
interface InstanceClock {start:number; scale:number; loopSeconds?:number; end?:number}
interface ParticleLayer { clock:InstanceClock; layer: EmitterLayer; mesh: THREE.Mesh; geometry: THREE.InstancedBufferGeometry; material: THREE.ShaderMaterial; seeds: Float32Array; births?:number[]; appearance: ReturnType<typeof emitterAppearancePoints>; orientation: ReturnType<typeof prepareEmitterOrientation> }
type MeshPreviewMaterial = THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
interface GeometryLayer { clock:InstanceClock; layer: MeshLayer; mesh: THREE.Mesh<THREE.BufferGeometry, MeshPreviewMaterial>; deformation?: CompiledMeshDeformation; triangleOrder:MeshTriangleOrder }

export function updateMeshPreviewVertices(layer: MeshLayer, geometry: THREE.BufferGeometry, vertices: number[][]): void {
  const data = buildMeshGeometry(layer.geometry), expanded = !!((data.uv.length && data.uvFaces.length) || layer.material || layer.shading === 'smooth');
  const order = expanded ? data.faces.flat() : vertices.map((_, i) => i);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  order.forEach((source, i) => positions.setXYZ(i, vertices[source][0], vertices[source][1], vertices[source][2]));
  positions.needsUpdate = true;
  if(layer.shading==='smooth'){
    const normals=smoothVertexNormals(vertices,data.faces),attribute=geometry.getAttribute('normal') as THREE.BufferAttribute;
    order.forEach((source,i)=>attribute.setXYZ(i,...normals[source]));attribute.needsUpdate=true;
  }else geometry.computeVertexNormals();
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
}

/** Explicit smooth uses authored position indices even when UV corners expand.
 * Other explicit materials use flat normals, matching smoothing group 0.
 * Legacy meshes keep their existing geometry/material path for compatibility. */
export function createMeshPreviewGeometry(layer: MeshLayer): THREE.BufferGeometry {
  validateMeshShading(layer);
  const data = buildMeshGeometry(layer.geometry), geometry = new THREE.BufferGeometry();
  if ((data.uv.length && data.uvFaces.length) || layer.material || layer.shading === 'smooth') {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.faces.flatMap(face => face.flatMap(index => data.vertices[index])), 3));
    if (data.uv.length && data.uvFaces.length)
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvFaces.flatMap(face => face.flatMap(index => data.uv[index])), 2));
  } else {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices.flat(), 3));
    geometry.setIndex(data.faces.flat());
  }
  if (layer.shading === 'smooth') {
    const normals = smoothVertexNormals(data.vertices,data.faces);
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.faces.flatMap(face=>face.flatMap(index=>normals[index])),3));
  } else geometry.computeVertexNormals();
  return geometry;
}

export function createMeshPreviewMaterial(layer: MeshLayer, map: THREE.DataTexture | null): MeshPreviewMaterial {
  const common = { map, opacity: layer.alpha, side: THREE.FrontSide, premultipliedAlpha: false,
    blending: layer.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending };
  const material = layer.material
    ? new THREE.MeshLambertMaterial({ ...common, color: layer.material.diffuse, emissive: layer.material.selfIllumination,
      emissiveIntensity: 1, emissiveMap: map, flatShading: layer.shading !== 'smooth' })
    : new THREE.MeshBasicMaterial({ ...common, color: layer.color, transparent: true, depthWrite: false });
  // All Studio maps are immutable RGBA8 DataTextures. Inspect alpha once, not
  // per frame; one translucent texel requires the whole mesh to blend.
  const pixels = map?.image.data;
  let textureHasAlpha = false;
  if (pixels) for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) { textureHasAlpha = true; break; }
  }
  material.userData.textureHasAlpha = textureHasAlpha;
  updateMeshPreviewOpacity(layer, material, layer.alpha);
  return material;
}

export function updateMeshPreviewOpacity(layer: MeshLayer, material: MeshPreviewMaterial, alpha: number): void {
  material.opacity = alpha;
  const transparent = !layer.material || alpha < 1 || material.userData.textureHasAlpha === true || layer.blend === 'additive';
  if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
  material.depthWrite = !transparent;
}
export class EffectRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(39, 1, .05, 100);
  readonly controls: OrbitControls;
  private particleLayers: ParticleLayer[] = [];
  private geometryLayers: GeometryLayer[] = [];
  private beamLayers:Array<{clock:InstanceClock;layer:BeamLayer;mesh:ReturnType<typeof createBeamPreview>}>=[];
  private trailLayers:Array<{clock:InstanceClock;layer:TrailLayer;part:CompiledTrail;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>}> = [];
  private instances:Array<{group:THREE.Group;start:number;end:number}> = [];
  private textures = new Map<string, THREE.DataTexture>();
  private document: EffectDocument | null = null;
  private grid: THREE.GridHelper;
  private reference: THREE.Group;
  private width = 1;
  private height = 1;
  private conditions?:PreviewConditions;
  private effectRoot=new THREE.Group();
  private rigGroup=new THREE.Group();
  constructor(readonly canvas: HTMLCanvasElement, interactive = true) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    // Both built-in mesh materials and particle shaders receive linear RGB and
    // use the same output conversion. Alpha remains linear and unpremultiplied.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor('#101821');
    // Fixed world-space lighting is shared by editor, PNG and every video frame.
    // This Lambert preview is an approximation, not a native NWN light model.
    this.scene.add(new THREE.AmbientLight('#ffffff', .28));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2);
    keyLight.position.set(-3, -4, 7); this.scene.add(keyLight);
    this.camera.up.set(0, 0, 1); this.camera.position.set(3.4, -5.4, 2.75);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.target.set(0, 0, .7);
    this.controls.enabled = interactive; this.controls.minDistance = 1.4; this.controls.maxDistance = 15; this.controls.maxPolarAngle = Math.PI * .49; this.controls.update();
    this.grid = new THREE.GridHelper(20, 40, '#344758', '#24313f'); this.grid.rotation.x = Math.PI / 2; this.grid.position.z = -.015;
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    gridMaterials.forEach(m => { m.transparent = true; m.opacity = .38; }); this.scene.add(this.grid);
    this.reference = new THREE.Group();
    this.scene.add(this.effectRoot,this.rigGroup);
    const material = new THREE.MeshBasicMaterial({ color: '#71879a', wireframe: true, transparent: true, opacity: .12 });
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(.19, 1.25, 4, 8), material); capsule.rotation.x = Math.PI / 2; capsule.position.set(-1.1, 0, .82); this.reference.add(capsule); this.scene.add(this.reference);
  }
  resize(width: number, height: number) {
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
  }
  setBackground(light: boolean) { this.renderer.setClearColor(light ? '#ccd1d5' : '#101821'); }
  setGrid(visible: boolean) { this.grid.visible = visible; this.reference.visible = visible&&!this.conditions?.rig; }
  resetCamera() { this.camera.position.set(3.4, -5.4, 2.75); this.camera.fov = 39; this.camera.updateProjectionMatrix(); this.controls.target.set(0, 0, .7); this.controls.update(); }
  getCamera(): PreviewCamera { return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), fov: this.camera.fov }; }
  setRenderCamera(camera: PreviewCamera) {
    assertPreviewCamera(camera);
    // Export cameras must not be clamped by interactive OrbitControls limits.
    this.camera.position.set(...camera.position); this.controls.target.set(...camera.target);
    this.camera.fov = camera.fov; this.camera.lookAt(...camera.target);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  setConditions(conditions?:PreviewConditions){
    this.conditions=conditions;
    this.renderer.setClearColor(conditions?.background==='light'?'#ccd1d5':conditions?.background==='gray'?'#777777':'#101821');
    for(const child of this.scene.children){if(child instanceof THREE.AmbientLight)child.intensity=.28*(conditions?.lightIntensity??1);if(child instanceof THREE.DirectionalLight)child.intensity=2*(conditions?.lightIntensity??1);}
    for(const child of [...this.rigGroup.children]){this.rigGroup.remove(child);if(child instanceof THREE.Mesh||child instanceof THREE.LineSegments){child.geometry.dispose();(Array.isArray(child.material)?child.material:[child.material]).forEach(m=>m.dispose());}}
    const rig=conditions?.rig;this.rigGroup.visible=!!rig;this.reference.visible=!rig&&this.grid.visible;
    this.effectRoot.position.set(0,0,0);this.effectRoot.rotation.set(0,0,0);
    if(rig){
      const h=rig.height,segments=[0,0,h,0,0,.45*h, -.35*h,0,.55*h,0,0,.78*h, .35*h,0,.55*h,0,0,.78*h, -.13*h,0,0,0,0,.45*h, .13*h,0,0,0,0,.45*h];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
      this.rigGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#829bad'})));
      for(const [name,point] of Object.entries({origin:[0,0,0],impact:[0,0,.65*h],'left-hand':[-.35*h,0,.55*h],'right-hand':[.35*h,0,.55*h]})){
        const marker=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),new THREE.MeshBasicMaterial({color:name===rig.anchor?'#fbc474':'#4e9ea5'}));marker.name=name;marker.position.set(point[0],point[1],point[2]);this.rigGroup.add(marker);
      }
    }
  }
  setDocument(document: EffectDocument,conditions?:PreviewConditions) {
    this.setConditions(conditions??document.authoring?.preview);
    this.setSources([{document,clock:{start:0,scale:1},parent:this.effectRoot}]);
    if(this.conditions?.camera)this.setRenderCamera(this.conditions.camera);
  }
  setComposition(snapshot:CompositionSnapshot) {
    this.setConditions();
    assertCompositionBudget(snapshot);
    const instances=snapshot.input.instances.map(i=>{
      const document=compositionSource(snapshot,i).document,group=new THREE.Group();
      group.name=i.id;group.position.set(...i.position);group.rotation.z=i.yawRadians;group.scale.setScalar(i.scale??1);
      return {document,clock:{start:i.start,scale:i.scale??1,end:i.start+(i.duration??document.duration)},parent:group};
    });
    this.setSources(instances);
    for(const source of instances){this.scene.add(source.parent);this.instances.push({group:source.parent,start:source.clock.start,end:Math.min(snapshot.input.duration,source.clock.end!)});}
    this.setGrid(snapshot.input.referenceGeometry??true);
  }
  private setSources(sources:Array<{document:EffectDocument;clock:InstanceClock;parent:THREE.Object3D}>) {
    for(const {mesh} of this.beamLayers){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}this.beamLayers=[];
    for(const p of this.particleLayers){p.mesh.removeFromParent();p.geometry.dispose();p.material.dispose();}this.particleLayers=[];
    for(const {mesh} of this.geometryLayers){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}this.geometryLayers=[];
    for(const {mesh} of this.trailLayers){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();}this.trailLayers=[];
    for(const {group} of this.instances)group.removeFromParent();this.instances=[];
    const usedTextures = new Set<string>();
    for(const {document,clock:sourceClock,parent} of sources){
    const clock={...sourceClock,...(document.lifecycle==='duration'?{loopSeconds:document.duration}:{})};
    assertTrailBudget(document);
    assertMeshDeformationBudget(document);
    this.document = document;
    const textureFor = (reference?: string | null, beam?:BeamLayer) => {
      if (!reference) return null;
      const asset = resolveTextureAsset(document, reference);
      const key = (beam?.materialMotion?materialMotionKey(beam):beam?.nativeMotion?beamMotionTextureKey(beam):beam?.textureMapping?beamTextureKey(beam):(asset?.id || `builtin:${reference}`))+':'+(this.conditions?.filtering??'legacy-linear');
      usedTextures.add(key);
      let texture = this.textures.get(key);
      if (!texture) {
        const { width, height, rgba } = beam?.materialMotion?buildMaterialMotionAtlas(document,beam).pixels:beam?.nativeMotion?buildBeamMotionAtlas(document,beam).pixels:beam?.textureMapping?buildBeamTexture(document,beam).pixels:asset ? decodeTextureAsset(asset) : resolveTexture(document, reference), bottomUp = new Uint8Array(rgba.length);
        // PNG stores top-first rows; our shared UV origin is bottom-left. Flip
        // bytes exactly once rather than depending on browser image upload rules.
        for (let y = 0; y < height; y++) bottomUp.set(rgba.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
        texture = new THREE.DataTexture(bottomUp, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.premultiplyAlpha = false;
        texture.minFilter = !beam?.materialMotion&&this.conditions?.filtering==='export-mipmaps'?THREE.LinearMipmapLinearFilter:THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.generateMipmaps = !beam?.materialMotion&&this.conditions?.filtering==='export-mipmaps';
        texture.needsUpdate = true; this.textures.set(key, texture);
      }
      return texture;
    };
    for (const layer of document.layers) {
      if(layer.type==='beam'){if(layer.enabled){const mesh=createBeamPreview(layer,textureFor(layer.texture,layer)!);parent.add(mesh);this.beamLayers.push({layer,mesh,clock});}continue;}
      if(layer.type==='trail') {
        if(!layer.enabled)continue;
        for(const part of compileTrailParts(layer,document.duration)) {
          const pixels=part.kind==='head'?trailHeadPixels():trailProfilePixels(layer.glowStrength),bottomUp=new Uint8Array(pixels.rgba.length);
          for(let y=0;y<pixels.height;y++)bottomUp.set(pixels.rgba.subarray((pixels.height-1-y)*pixels.width*4,(pixels.height-y)*pixels.width*4),y*pixels.width*4);
          const map=new THREE.DataTexture(bottomUp,pixels.width,pixels.height,THREE.RGBAFormat,THREE.UnsignedByteType);
          map.colorSpace=THREE.SRGBColorSpace;map.minFilter=this.conditions?.filtering==='export-mipmaps'?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;map.magFilter=THREE.LinearFilter;map.generateMipmaps=this.conditions?.filtering==='export-mipmaps';map.needsUpdate=true;
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.base.vertices.flat(),3));
          geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.base.uv.flatMap(v=>v.slice(0,2)),2));geometry.setIndex(part.faces.flat());
          const material=new THREE.MeshBasicMaterial({map,color:layer.color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,premultipliedAlpha:false});
          const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name=layer.id;parent.add(mesh);this.trailLayers.push({layer,part,mesh,clock});
        }
        continue;
      }
      if (layer.type === 'mesh') {
        const geometry = createMeshPreviewGeometry(layer);
        const material = createMeshPreviewMaterial(layer, textureFor(layer.texture));
        const deformation=layer.enabled&&layer.animation.vertices!==undefined?compileMeshDeformation(layer,document.duration):undefined;
        const mesh=new THREE.Mesh(geometry,material);mesh.name=layer.id;parent.add(mesh);this.geometryLayers.push({layer,mesh,deformation,clock,triangleOrder:new MeshTriangleOrder(geometry)});
        continue;
      }
      if (layer.type !== 'emitter') continue;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0, .5,-.5,0, .5,.5,0, -.5,.5,0], 3));
      geometry.setIndex([0,1,2,0,2,3]); geometry.instanceCount = layer.count;
      geometry.setAttribute('particleCenter', new THREE.InstancedBufferAttribute(new Float32Array(layer.count * 3), 3));
      geometry.setAttribute('particleSize', new THREE.InstancedBufferAttribute(new Float32Array(layer.count), 1));
      geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(new Float32Array(layer.count * 4), 4));
      geometry.setAttribute('frameUv', new THREE.InstancedBufferAttribute(new Float32Array(layer.count * 4), 4));
      const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, premultipliedAlpha: false,
        blending: (layer.blend || (layer.texture === 'smoke' || layer.texture.startsWith('asset:') ? 'normal' : 'additive')) === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { animatedAtlas: {value: layer.flipbook ? 1 : 0}, kind: { value: layer.texture.startsWith('asset:') ? 3 : layer.texture === 'spark' ? 0 : layer.texture === 'smoke' ? 1 : 2 },
          assetMap: { value: layer.texture.startsWith('asset:') ? textureFor(layer.texture) : null } } });
      const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.name = layer.id; parent.add(mesh);
      // Keep the historical six-value seed stride: births and directions do not
      // change when removing the previously implicit lifetime/velocity jitter.
      const rand = random((layer.seed ^ document.seed) >>> 0); const seeds = new Float32Array(layer.count * 6);
      for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
      this.particleLayers.push({ clock, layer, mesh, geometry, material, seeds, ...(layer.beamBinding?{births:Array.from({length:layer.count},(_,i)=>birthAtQuantile(beamFlowEnvelope(layer,document.duration).rows,seeds[i*6]))}:{}), appearance: emitterAppearancePoints(layer), orientation: prepareEmitterOrientation(layer) });
    }
    }
    for (const [id, texture] of this.textures) if (!usedTextures.has(id)) { texture.dispose(); this.textures.delete(id); }
  }
  render(globalTime: number, solo: string | null = null) {
    const rig=this.conditions?.rig;
    if(rig){
      this.rigGroup.position.set(...rig.position.map((v,i)=>v+rig.velocity[i]*globalTime) as [number,number,number]);this.rigGroup.rotation.z=rig.yaw;
      if(rig.attachEffect){const h=rig.height,anchor=rig.anchor==='impact'?[0,0,.65*h]:rig.anchor==='left-hand'?[-.35*h,0,.55*h]:rig.anchor==='right-hand'?[.35*h,0,.55*h]:[0,0,0];
        this.effectRoot.position.copy(this.rigGroup.position).add(new THREE.Vector3(...anchor as [number,number,number]).applyAxisAngle(new THREE.Vector3(0,0,1),rig.yaw));this.effectRoot.rotation.z=rig.yaw;}
    }
    for(const {layer,mesh,clock} of this.beamLayers){mesh.visible=layer.enabled&&(!solo||solo===layer.id)&&globalTime>=clock.start;updateBeamPreview(mesh,layer,globalTime-clock.start,this.camera);}
    for(const i of this.instances)i.group.visible=globalTime>=i.start&&globalTime<=i.end;
    for(const {layer,part,mesh,clock} of this.trailLayers) {
      const time=globalTime-clock.start;
      mesh.visible=layer.enabled&&(!solo||solo===layer.id);mesh.material.opacity=trailOpacity(part,time);
      const frame=interpolateFrames(part,time),positions=mesh.geometry.attributes.position as THREE.BufferAttribute,uv=mesh.geometry.attributes.uv as THREE.BufferAttribute;
      frame.vertices.forEach((v,i)=>positions.setXYZ(i,...v));frame.uv.forEach((v,i)=>uv.setXY(i,v[0],v[1]));positions.needsUpdate=uv.needsUpdate=true;
    }
    for (const {layer,mesh,deformation,clock,triangleOrder} of this.geometryLayers) {
      const elapsed=globalTime-clock.start,time=clock.loopSeconds&&elapsed>=0?elapsed%clock.loopSeconds:elapsed;
      if(deformation)updateMeshPreviewVertices(layer,mesh.geometry,sampleMeshDeformation(deformation,time));
      const state=sampleMeshLayer(layer,time);
      mesh.visible=state.visible&&(!solo||solo===layer.id);mesh.position.set(...state.position);
      mesh.quaternion.set(...axisAngleToQuaternion(state.orientation));mesh.scale.setScalar(state.scale);
      updateMeshPreviewOpacity(layer, mesh.material, state.alpha);
      if(mesh.visible)triangleOrder.update(mesh,this.camera);
    }
    for (const p of this.particleLayers) {
      const time=globalTime-p.clock.start;
      const l = p.layer; p.mesh.visible = l.enabled && (!solo || solo === l.id);
      const positions = p.geometry.getAttribute('particleCenter') as THREE.BufferAttribute;
      const sizes = p.geometry.getAttribute('particleSize') as THREE.BufferAttribute;
      const tints = p.geometry.getAttribute('tint') as THREE.BufferAttribute;
      const frameUvs = p.geometry.getAttribute('frameUv') as THREE.BufferAttribute;
      for (let i = 0; i < l.count; i++) {
        const offset = i * 6, birth = p.births?.[i] ?? (l.start + (l.update === 'Fountain' ? p.seeds[offset] * l.duration : 0)), age = time - birth;
        const progress = age / l.life;
        if (age < 0 || age >= l.life) { sizes.setX(i, 0); tints.setW(i, 0); continue; }
        if (l.flipbook) frameUvs.setXYZW(i,...flipbookFrameUv(l.flipbook,sampleFlipbookFrame(l.flipbook,age)));
        const azimuth = p.seeds[offset + 2] * Math.PI * 2, theta = p.seeds[offset + 3] * l.spread;
        positions.setXYZ(i, ...sampleEmitterPosition(l, age, azimuth, theta, l.speed, p.orientation));
        const appearance = sampleEmitterAppearance(l, progress, p.appearance);
        sizes.setX(i, Math.max(0, appearance.size * l.scale * p.clock.scale));
        tints.setXYZW(i, ...appearance.color, appearance.alpha);
      }
      positions.needsUpdate = sizes.needsUpdate = tints.needsUpdate = true;
      if(l.flipbook) frameUvs.needsUpdate=true;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    for(const {mesh} of this.trailLayers)mesh.material.map?.dispose();this.trailLayers=[];
    this.controls.dispose(); this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
        object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose());
      }
    }); for (const texture of this.textures.values()) texture.dispose(); this.textures.clear(); this.renderer.dispose();
  }
}
