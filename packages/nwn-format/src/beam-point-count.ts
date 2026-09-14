import {DomainError} from '../../core/src/model.js';
import {numeric,readAsciiMdl,textProperty} from './mdl-reader.js';

/** Lightning's birthrate is the number of points, including both endpoints.
 * Retail midpoint subdivision reads center +/- floor(pointCount / 2) before
 * testing lightningRadius. Even counts therefore read past the active list.
 * Keep the authored power-of-two segment contract: N segments => N+1 points.
 * See docs/agents/beam-crash-2026-09-10.md for the exact crash and code evidence. */
export function assertBeamPointCount(pointCount:number):void {
  if(![3,5,9,17,33,65].includes(pointCount))
    throw new DomainError('BEAM_POINT_COUNT_UNSAFE','Lightning wymaga 3, 5, 9, 17, 33 lub 65 punktów: birthrate = segments + 1.',{pointCount});
}

export function verifyBeamPointCounts(source:Uint8Array) {
  return readAsciiMdl(source).nodes.filter(n=>n.type==='emitter'&&textProperty(n,'update')==='Lightning').map(n=>{
    const pointCount=numeric(n,'birthrate');assertBeamPointCount(pointCount);
    return {node:n.name,segments:pointCount-1,pointCount};
  });
}
