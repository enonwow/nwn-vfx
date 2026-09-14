import {createHash} from 'node:crypto';
import {meshCornerNormals} from '../../core/src/shading.js';

/** Evidence derived from position samples, not a serialized normal channel.
 * Hash each frame in face/corner order, then hash the ordered JSON hash list.
 * Bounded per-frame allocation avoids expanding all normal samples at once. */
export function deformationNormalSamples(frames:number[][][],faces:number[][]){
  const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const hashes=frames.map(vertices=>hash(meshCornerNormals(vertices,faces,'smooth')));
  return {method:'recomputed-from-interpolated-60Hz-positions' as const,source:'derived-from-position-samples' as const,
    frameSets:frames.length,cornerSamples:frames.length*faces.length*3,frameNormalHashesSha256:hash(hashes)};
}
