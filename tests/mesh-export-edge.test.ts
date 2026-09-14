import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDocument,makeMeshLayer} from '../packages/core/src/model.js';
import {buildCandidate} from '../packages/nwn-format/src/index.js';

test('mesh readback preserves distinct float32 timestamps even when their gap is below comparison tolerance',()=>{
  const layer=makeMeshLayer('tiny-time');layer.animation.position=[{time:0,value:[0,0,0]},{time:5e-10,value:[1,0,0]}];
  const result=buildCandidate({...makeDocument(),schemaVersion:2,layers:[layer]},'tiny_time');
  const keys=result.validation.readback.meshes[0].positionKeys;
  assert.deepEqual(keys.find(row=>row[0]===5e-10),[5e-10,1,0,0]);
});
