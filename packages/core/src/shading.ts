import { DomainError, type MeshLayer, type Vec3 } from './model.js';
import { authoredMeshVertices, compileMeshDeformation, DEFORMATION_HZ, validateMeshDeformation } from './deformation.js';
import { validateNormalMotion } from './normal-motion.js';

// One exact successful input only: material/selection edits need not repeat the
// continuous-motion proof. Never key this by mutable references or a short hash.
// Retaining one source string bounds cache memory by the document size limit.
let lastValidatedMotion:string|undefined;

export const MESH_SHADING_CAPABILITIES = {
  documentSchemaVersion: 8, field: 'shading', modes: ['flat','smooth'], default: 'flat',
  smoothGeometry: 'custom', animatedTransforms: true, vertexDeformation: true,
  deformationNormals: 'recomputed-from-interpolated-60Hz-positions',
  exportedAnimatedNormals: false, binaryAnimmeshNormals: 'static-base-per-corner',
  normals: 'area-weighted-by-shared-vertex-index', weldPositions: false,
  uvSeams: 'independent-UV-indices-do-not-split-normals', nativeVerified: false,
} as const;

/** Area-weighted normals by authored position index. Never weld by position or
 * UV: separate components (even coincident ones) retain independent normals. */
export function smoothVertexNormals(vertices: number[][], faces: number[][]): Vec3[] {
  const sums: Vec3[] = vertices.map(() => [0,0,0]), areas = vertices.map(() => 0);
  for (const face of faces) {
    const [a,b,c] = face.map(i => vertices[i]);
    const u = b.map((v,i) => v-a[i]), v = c.map((v,i) => v-b[i]);
    const n: Vec3 = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for (const i of face) { for (let k=0;k<3;k++) sums[i][k] += n[k]; areas[i] += Math.hypot(...n); }
  }
  return sums.map((n,i) => {
    if (!areas[i]) return [0,0,0]; // Unreferenced positions have no rendered corner.
    const length = Math.hypot(...n);
    if (!Number.isFinite(length) || length <= areas[i]*1e-8)
      throw new DomainError('VALIDATION_ERROR','Gładkie cieniowanie ma nieokreśloną normalną. Popraw winding lub rozdziel indeksy wierzchołków.',{vertexIndex:i});
    return n.map(v=>v/length) as Vec3;
  });
}

export function validateMeshShading(layer: MeshLayer): void {
  if (layer.shading !== undefined && !['flat','smooth'].includes(layer.shading))
    throw new DomainError('VALIDATION_ERROR','Cieniowanie wymaga flat albo smooth.',{layerId:layer.id});
  if (layer.shading === 'smooth') {
    if (layer.geometry.kind !== 'custom')
      throw new DomainError('VALIDATION_ERROR','Smooth wymaga siatki custom.',{layerId:layer.id});
    smoothVertexNormals(layer.geometry.vertices,layer.geometry.faces);
    if(layer.animation.vertices!==undefined){
      validateMeshDeformation(layer);
      const keys=layer.animation.vertices;
      const motionSource=JSON.stringify([layer.geometry.vertices,layer.geometry.faces,keys,layer.start,layer.duration,layer.deformationInterpolation]);
      if(motionSource===lastValidatedMotion)return;
      if(layer.deformationInterpolation&&layer.deformationInterpolation!=='linear'){
        const compiled=compileMeshDeformation(layer,layer.start+layer.duration);
        for(let i=1;i<compiled.frames.length;i++)validateNormalMotion(compiled.frames[i-1],compiled.frames[i],layer.geometry.faces,
          {layerId:layer.id,interval:[(i-1)/DEFORMATION_HZ,i/DEFORMATION_HZ],source:'sampled-60Hz'});
        lastValidatedMotion=motionSource;return;
      }
      let previous={time:0,value:layer.geometry.vertices};
      for(const key of keys){
        validateNormalMotion(key.time===previous.time?key.value:previous.value,key.value,layer.geometry.faces,{layerId:layer.id,interval:[previous.time,key.time],source:'authored'});
        previous=key;
      }
      // Every grid interval wholly within one authored interval is already
      // checked. Only intervals crossing authored knots need another check.
      const ticks=new Set([layer.start,layer.start+layer.duration,...keys.map(k=>k.time+layer.start)]
        .filter(t=>Math.abs(t*DEFORMATION_HZ-Math.round(t*DEFORMATION_HZ))>1e-8).map(t=>Math.floor(t*DEFORMATION_HZ)));
      for(const tick of ticks){const start=tick/DEFORMATION_HZ,end=(tick+1)/DEFORMATION_HZ;
        validateNormalMotion(authoredMeshVertices(layer,start-layer.start),authoredMeshVertices(layer,end-layer.start),layer.geometry.faces,
          {layerId:layer.id,interval:[start,end],source:'sampled-60Hz'});
      }
      lastValidatedMotion=motionSource;
    }
  }
}

export function meshCornerNormals(vertices:number[][],faces:number[][],mode:'flat'|'smooth'): Vec3[] {
  if (mode === 'smooth') {
    const normals=smoothVertexNormals(vertices,faces);
    return faces.flatMap(face=>face.map(i=>[...normals[i]] as Vec3));
  }
  return faces.flatMap(face=>{
    const [a,b,c]=face.map(i=>vertices[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-b[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    return face.map(()=>n.map(x=>x/length) as Vec3);
  });
}
