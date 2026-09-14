import {validateAuthoring} from './workflow.js';
import {validateBeamDocument} from './beam.js';
import {durationSeams} from './lifecycle.js';
import { documentProfile, EFFECT_LOCK_ID, DomainError, MAX_DOCUMENT_BYTES, promoteDocumentSchema, type AxisAngle, type EffectDocument, type Keyframe, type MeshGeometry, type MeshLayer, type Vec2, type Vec3 } from './model.js';
import { MAX_TEXTURE_ASSETS, resolveTextureAsset, validateTextureAsset } from './textures.js';
import { validateTrail, assertTrailBudget } from './trails.js';
import { validateMeshShading } from './shading.js';
import { validateMeshDeformation, assertMeshDeformationBudget } from './deformation.js';
import {assertAudioDocument} from './audio.js';
import {validateEmitterFlipbook} from './flipbook.js';

export function buildMeshGeometry(geometry: MeshGeometry): { vertices: Vec3[]; faces: [number, number, number][]; uv:Vec2[]; uvFaces:[number,number,number][] } {
  if (geometry.kind === 'custom') return { vertices: geometry.vertices.map(v => [...v]), faces: geometry.faces.map(f => [...f]),
    uv:(geometry.uv??[]).map(v=>[...v]),uvFaces:(geometry.uvFaces??[]).map(v=>[...v]) };
  if (geometry.kind === 'box') {
    const [x, y, z] = geometry.dimensions.map(v => v / 2);
    return { vertices: [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],
      faces: [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]],
      // Each box face receives the complete image; separate indices retain seams at edges.
      uv:Array.from({length:6},()=>[[0,0],[1,0],[1,1],[0,1]] as Vec2[]).flat(),
      uvFaces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[8,9,10],[8,10,11],[12,13,14],[12,14,15],[16,17,18],[16,18,19],[20,21,22],[20,22,23]] };
  }
  const vertices: Vec3[] = [], faces: [number, number, number][] = [];
  if (geometry.innerRadius === 0) {
    vertices.push([0,0,0]);
    for (let i=0;i<geometry.segments;i++) { const a=i*Math.PI*2/geometry.segments; vertices.push([Math.cos(a)*geometry.outerRadius,Math.sin(a)*geometry.outerRadius,0]); }
    for (let i=0;i<geometry.segments;i++) faces.push([0,i+1,(i+1)%geometry.segments+1]);
  } else {
    for (let i=0;i<geometry.segments;i++) { const a=i*Math.PI*2/geometry.segments;
      vertices.push([Math.cos(a)*geometry.innerRadius,Math.sin(a)*geometry.innerRadius,0],[Math.cos(a)*geometry.outerRadius,Math.sin(a)*geometry.outerRadius,0]); }
    for (let i=0;i<geometry.segments;i++) { const a=i*2,b=(i+1)%geometry.segments*2; faces.push([a,a+1,b+1],[a,b+1,b]); }
  }
  return { vertices, faces, uv:vertices.map(([x,y])=>[.5+x/(2*geometry.outerRadius),.5+y/(2*geometry.outerRadius)]),uvFaces:faces.map(f=>[...f]) };
}

function fail(message: string, details?: unknown): never { throw new DomainError('VALIDATION_ERROR', message, details); }
function axisValid(v: AxisAngle, label: string) {
  if (!Array.isArray(v) || v.length !== 4 || v.some(x => !Number.isFinite(x)) || Math.abs(Math.hypot(v[0],v[1],v[2])-1)>1e-5 || Math.abs(v[3])>8*Math.PI)
    fail(`${label}: orientacja wymaga jednostkowej osi i kąta w radianach (±8π).`);
}
function range(n: number, min: number, max: number, label: string) { if (!Number.isFinite(n)||n<min||n>max) fail(`${label}: wartość poza zakresem ${min}–${max}.`); }
function vector(v: Vec3, min: number, max: number, label: string) {
  if (!Array.isArray(v)||v.length!==3) fail(`${label}: wymagane trzy liczby.`);
  v.forEach(n=>range(n,min,max,label));
}
export function assertDocumentInvariants(document: EffectDocument): void {
  validateAuthoring(document);
  if(document.orientWithObject!==undefined&&typeof document.orientWithObject!=='boolean')fail('Obracanie z postacią wymaga wartości logicznej.');
  if(document.locks.some(l=>l.layerId===EFFECT_LOCK_ID&&!['orientWithObject','lifecycle','authoring','*'].includes(l.field)))fail('Nieznana blokada całego efektu.');
  if (new TextEncoder().encode(JSON.stringify(document)).length>MAX_DOCUMENT_BYTES) throw new DomainError('LIMIT_EXCEEDED','Dokument przekracza limit 6 MiB.');
  validateBeamDocument(document);
  const requiredVersion=promoteDocumentSchema({...document}).schemaVersion;
  if(requiredVersion!==document.schemaVersion) fail(`Nowe właściwości wymagają dokumentu w wersji ${requiredVersion}.`);
  if((document.assets?.length??0)>MAX_TEXTURE_ASSETS) throw new DomainError('LIMIT_EXCEEDED','Limit projektu: 8 tekstur.');
  const assetIds=new Set<string>();
  for(const asset of document.assets??[]) {if(assetIds.has(asset.id)) fail('Identyfikatory zasobów muszą być unikalne.',{assetId:asset.id});assetIds.add(asset.id);validateTextureAsset(asset);}
  const ids = new Set<string>();
  for (const layer of document.layers) {
    if (ids.has(layer.id)) fail('Identyfikatory warstw muszą być unikalne.', { layerId: layer.id });
    ids.add(layer.id);
    validateEmitterFlipbook(layer,document);
    if(layer.type!=='mesh'&&Object.hasOwn(layer,'deformationInterpolation'))fail('Interpolacja deformacji dotyczy tylko siatek.',{layerId:layer.id});
    if(layer.type==='trail'){validateTrail(layer,document.duration);continue;}
    if(layer.texture) resolveTextureAsset(document,layer.texture);
    if (layer.type !== 'mesh') {
      if (layer.orientation !== undefined) axisValid(layer.orientation, layer.name);
      continue;
    }
    if (document.schemaVersion < 2) fail('Geometria wymaga dokumentu co najmniej w wersji 2.');
    validateMeshDeformation(layer);
    if (layer.material !== undefined && (!layer.material || Object.keys(layer.material).sort().join(',') !== 'diffuse,selfIllumination'
      || ![layer.material.diffuse,layer.material.selfIllumination].every(value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))))
      fail('Materiał wymaga dokładnie kolorów diffuse i selfIllumination w formacie #RRGGBB.',{layerId:layer.id});
    if (layer.start+layer.duration>document.duration+1e-9) fail('Geometria wykracza poza czas efektu.',{layerId:layer.id});
    axisValid(layer.orientation, layer.name);
    const geometry = layer.geometry;
    if (geometry.kind==='ring' && geometry.innerRadius>=geometry.outerRadius) fail('Promień zewnętrzny pierścienia musi być większy od wewnętrznego.');
    const {vertices,faces,uv,uvFaces}=buildMeshGeometry(geometry);
    if(geometry.kind==='custom' && ((geometry.uv===undefined)!==(geometry.uvFaces===undefined))) fail('UV wymaga współrzędnych i indeksów uvFaces.',{layerId:layer.id});
    if(layer.texture && geometry.kind==='custom' && (!uv.length||!uvFaces.length)) fail('Teksturowana siatka custom wymaga jawnych UV.',{layerId:layer.id});
    if(uv.length||uvFaces.length) {
      if(uvFaces.length!==faces.length) fail('Liczba trójkątów UV musi odpowiadać liczbie ścian.',{layerId:layer.id});
      for(const coordinate of uv) if(coordinate.length!==2||coordinate.some(v=>!Number.isFinite(v)||v<0||v>1)) fail('Współrzędne UV muszą należeć do zakresu 0–1.',{layerId:layer.id,coordinate});
      for(const [index,face] of uvFaces.entries()) if(face.length!==3||face.some(i=>!Number.isInteger(i)||i<0||i>=uv.length)) fail('Niepoprawny indeks UV.',{layerId:layer.id,faceIndex:index,uvFace:face});
    }
    for (const face of faces) {
      if (face.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length)||new Set(face).size!==3) fail('Trójkąt odwołuje się do niepoprawnych wierzchołków.',{layerId:layer.id,face});
      const [a,b,c]=face.map(i=>vertices[i]); const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      if (Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10) fail('Siatka zawiera trójkąt o zerowym polu.',{layerId:layer.id,face});
    }
    validateMeshShading(layer);
    for (const [channel, keys] of Object.entries(layer.animation)) {
      if (channel === 'vertices') { validateMeshDeformation(layer); continue; }
      let previous=-1;
      for (const key of keys) {
        range(key.time,0,layer.duration,`${channel}.time`);
        if (key.time<=previous) fail('Czasy kluczy muszą rosnąć, bez duplikatów.',{layerId:layer.id,channel});
        previous=key.time;
        if (channel==='position') vector(key.value as Vec3,-20,20,'position');
        else if (channel==='orientation') axisValid(key.value as AxisAngle,'orientation');
        else range(key.value as number, channel==='scale'?.01:0,channel==='scale'?10:1,channel);
      }
    }
  }
  assertTrailBudget(document);
  assertMeshDeformationBudget(document);
  assertAudioDocument(document);
  if(document.lifecycle!==undefined&&!['impact','duration','beam'].includes(document.lifecycle))fail('Nieznany tryb efektu.');
  if(document.profileId!==documentProfile(document.lifecycle))fail('Profil dokumentu nie odpowiada trybowi efektu.');
  durationSeams(document);
  for (const lock of document.locks) if (lock.layerId!==EFFECT_LOCK_ID && !ids.has(lock.layerId)&&!document.audioClips?.some(c=>c.id===lock.layerId)) fail('Blokada odwołuje się do nieistniejącej warstwy.',{layerId:lock.layerId});
}

type Quaternion = [number,number,number,number];
export function axisAngleToQuaternion(v: AxisAngle): Quaternion { const s=Math.sin(v[3]/2); return [v[0]*s,v[1]*s,v[2]*s,Math.cos(v[3]/2)]; }
function interpolateOrientation(a: AxisAngle,b: AxisAngle,t: number): AxisAngle {
  const q=axisAngleToQuaternion(a); let r=axisAngleToQuaternion(b),dot=q.reduce((s,v,i)=>s+v*r[i],0);
  if (dot<0) { r=r.map(v=>-v) as Quaternion;dot=-dot; }
  let out: number[];
  if (dot>.9995) out=q.map((v,i)=>v+(r[i]-v)*t);
  else { const angle=Math.acos(Math.min(1,dot)),d=Math.sin(angle); out=q.map((v,i)=>(v*Math.sin((1-t)*angle)+r[i]*Math.sin(t*angle))/d); }
  const len=Math.hypot(...out); out=out.map(v=>v/len);
  const w=Math.max(-1,Math.min(1,out[3])),s=Math.sqrt(Math.max(0,1-w*w));
  return s<1e-8?[0,0,1,0]:[out[0]/s,out[1]/s,out[2]/s,2*Math.acos(w)];
}
function sample<T>(base:T, keys:Keyframe<T>[]|undefined,time:number,lerp:(a:T,b:T,t:number)=>T):T {
  let previous:Keyframe<T>={time:0,value:base};
  for (const key of keys||[]) {
    if (key.time>time) return lerp(previous.value,key.value,(time-previous.time)/(key.time-previous.time));
    previous=key;
  }
  return previous.value;
}
export function sampleMeshLayer(layer:MeshLayer,time:number): {visible:boolean;position:Vec3;orientation:AxisAngle;scale:number;alpha:number} {
  const t=Math.max(0,Math.min(layer.duration,time-layer.start));
  const scalar=(a:number,b:number,n:number)=>a+(b-a)*n;
  const position=sample(layer.position,layer.animation.position,t,(a,b,n)=>a.map((v,i)=>scalar(v,b[i],n)) as Vec3);
  const orientation=sample(layer.orientation,layer.animation.orientation,t,interpolateOrientation);
  const scale=sample(layer.scale,layer.animation.scale,t,scalar),alpha=sample(layer.alpha,layer.animation.alpha,t,scalar);
  return { visible:layer.enabled&&time>=layer.start&&time<=layer.start+layer.duration&&alpha>0,position:[...position],orientation:[...orientation],scale,alpha };
}
