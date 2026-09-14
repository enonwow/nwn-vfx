import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { parseObjGeometry } from '../packages/core/src/obj.js';

// Read-only source verification. Geometry is never committed to any service.
const [out,...paths]=process.argv.slice(2);
if (!out || !paths.length) throw new Error('Usage: tsx scripts/accept-obj-sources.ts REPORT_JSON OBJ_PATH... (explicit Z-up/metres/flat acceptance)');
const results=paths.map(path=>{
  const source=readFileSync(resolve(path));
  const {geometry,report}=parseObjGeometry(new TextDecoder('utf-8',{fatal:true}).decode(source),{sourceUpAxis:'z',metersPerUnit:1,normalMode:'flat',requireUv:true});
  return {path:resolve(path),bytes:source.length,sha256:createHash('sha256').update(source).digest('hex'),report,
    outputCounts:{vertices:geometry.vertices.length,uv:geometry.uv!.length,triangles:geometry.faces.length,uvTriangles:geometry.uvFaces!.length}};
});
const report={version:'0.7.0',readOnly:true,projectMutations:0,nativeVerified:false,results};
mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(resolve(out),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({reportPath:resolve(out),passed:results.length,counts:results.map(result=>({path:result.path,...result.outputCounts}))})+'\n');
