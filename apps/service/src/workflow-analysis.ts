import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {DomainError,type EffectDocument} from '../../../packages/core/src/model.js';
import {compactDocument,compareDocuments,digestValue,compactDiff} from '../../../packages/core/src/workflow.js';
import {resolveTexture,decodeTextureAsset} from '../../../packages/core/src/textures.js';
import {sampleEmitterAppearance} from '../../../packages/core/src/particles.js';
import {analyzeAudioLevels} from '../../../packages/core/src/audio.js';
import {buildMeshGeometry} from '../../../packages/core/src/mesh.js';
import {meshCornerNormals} from '../../../packages/core/src/shading.js';
import {buildCandidate} from '../../../packages/nwn-format/src/index.js';
import {readAsciiMdl} from '../../../packages/nwn-format/src/mdl-reader.js';
import {readNwnTga,readHak,type ResourceFile} from '../../../packages/nwn-format/src/binary.js';
import {readTxi} from '../../../packages/nwn-format/src/textures.js';
import {hash,canonical,type Store,type Job} from './store.js';

export function artifactBytes(store:Store,artifactId:string){
  const row=store.db.prepare('SELECT value,file_path FROM artifacts WHERE id=?').get(artifactId) as any;
  if(!row)throw new DomainError('NOT_FOUND','Brak artefaktu.');
  const artifact=JSON.parse(row.value),bytes=readFileSync(row.file_path);
  if(hash(bytes)!==artifact.sha256||bytes.length!==artifact.size)throw new DomainError('ARTIFACT_HASH_MISMATCH','Artefakt nie odpowiada zapisanej tożsamości.');
  return bytes;
}
export function candidateFiles(store:Store,jobId:string,projectId:string,revision:number){
  const row=store.db.prepare('SELECT value,snapshot FROM jobs WHERE id=?').get(jobId) as any;if(!row)throw new DomainError('NOT_FOUND','Brak kandydata.');
  const job=JSON.parse(row.value) as Job;
  const mismatch=(message='Kandydat nie odpowiada wybranej rewizji.'):never=>{throw new DomainError('CANDIDATE_TARGET_MISMATCH',message);};
  if(job.status!=='succeeded')mismatch();
  const source={projectId,revision,snapshotSha256:hash(canonical(store.project(projectId,revision).document))};
  const artifact=(name:string)=>{const found=job.artifacts.filter(a=>a.name===name);if(found.length!==1)mismatch('Brak jednoznacznego artefaktu kandydata.');return found[0];};
  if(job.type==='candidate.build'){
    if(job.projectId!==projectId||job.revision!==revision||hash(canonical(JSON.parse(row.snapshot)))!==source.snapshotSha256)mismatch();
    const zip=artifact('candidate.zip');artifactBytes(store,zip.id);
    return{identity:{jobId,type:job.type,...source,candidateSha256:zip.sha256},files:job.artifacts.filter(a=>!['candidate.zip','handoff.json'].includes(a.name)).map(a=>({name:a.name,data:artifactBytes(store,a.id)}))};
  }
  if(job.type!=='iteration.prepare')mismatch();
  const manifest=JSON.parse(artifactBytes(store,artifact('diagnostic-manifest.json').id).toString()),snapshot=JSON.parse(row.snapshot);
  if(manifest.jobId!==jobId||manifest.instanceId!==store.config.instanceId||manifest.workspaceId!==store.config.workspaceId)mismatch();
  const matches=manifest.variants.filter((v:any)=>v.project.projectId===projectId&&v.project.revision===revision);
  if(matches.length!==1)mismatch('Iteracja musi zawierać dokładnie jeden wariant wybranej rewizji.');
  const variant=matches[0],frozen=snapshot.variants.filter((v:any)=>v.id===variant.id&&canonical(v.project)===canonical(source));
  if(canonical(variant.project)!==canonical(source)||frozen.length!==1||hash(canonical(frozen[0].document))!==source.snapshotSha256)mismatch('Snapshot wariantu nie odpowiada wybranej rewizji.');
  const root=artifact('diagnostic.zip'),packed=artifactBytes(store,root.id);
  const extract=(bytes:Uint8Array,selected?:string)=>{let total=0,count=0;return unzipSync(bytes,{filter:f=>{
    if(++count>4096||(total+=f.originalSize)>256*1024*1024)throw new DomainError('LIMIT_EXCEEDED','Archiwum kandydata przekracza limit odczytu.');
    return selected===undefined||f.name===selected;
  }});};
  const nested=extract(packed,variant.candidate.path)[variant.candidate.path];
  if(!nested||nested.length!==variant.candidate.size||hash(nested)!==variant.candidate.sha256)throw new DomainError('ARTIFACT_HASH_MISMATCH','ZIP wariantu nie odpowiada manifestowi.');
  const files=extract(nested),handoff=JSON.parse(Buffer.from(files['handoff.json']??[]).toString());
  if(handoff.jobId!==jobId||handoff.variantId!==variant.id||handoff.projectId!==projectId||handoff.revision!==revision||handoff.snapshotSha256!==source.snapshotSha256)mismatch('Handoff wskazuje inny wariant.');
  for(const entry of handoff.artifacts){const bytes=files[entry.name];if(!bytes||hash(bytes)!==entry.sha256||bytes.length!==entry.size)throw new DomainError('ARTIFACT_HASH_MISMATCH','Zasób wariantu nie odpowiada handoff.');}
  return{identity:{jobId,type:job.type,variantId:variant.id,...source,rootArtifactId:root.id,rootSha256:root.sha256,candidateSha256:variant.candidate.sha256},files:Object.entries(files).filter(([name])=>name!=='handoff.json').map(([name,data])=>({name,data}))};
}
export function exportSummary(files:ResourceFile[]){
  const models:any[]=[];
  for(const file of files.filter(f=>f.name==='source-model.mdl.txt'||f.name==='compiled-roundtrip.mdl.txt'||/\.mdl\.(source|roundtrip)\.txt$/.test(f.name)||f.name.endsWith('.mdl')&&f.data[0]!==0)){
    const mdl=readAsciiMdl(file.data,{requireAnimationOrder:false});
    models.push({file:file.name,modelName:mdl.model,nodes:mdl.nodes.map(n=>({type:n.type,name:n.name,properties:n.properties,
      geometry:Object.fromEntries(Object.entries(n.tables).map(([k,v])=>[k,{rows:v.length,sha256:digestValue(v)}]))})),
      animations:mdl.animations.map(a=>({name:a.name,length:a.length,events:a.events,nodes:a.nodes.map(n=>({name:n.name,properties:n.properties,
        tracks:Object.fromEntries(Object.entries(n.tracks).map(([k,v])=>[k,k==='birthrate'?v:{keys:v.length,sha256:digestValue(v)}]))}))}))});
  }
  const source=models.find(m=>m.file==='source-model.mdl.txt'),compiled=models.find(m=>m.file==='compiled-roundtrip.mdl.txt');
  const keyed=(m:any)=>({nodes:Object.fromEntries(m.nodes.map((n:any)=>[n.name,n])),animations:Object.fromEntries(m.animations.map((a:any)=>[a.name,{...a,nodes:Object.fromEntries(a.nodes.map((n:any)=>[n.name,n]))}]))});
  const differences=source&&compiled?compactDiff(keyed(source),keyed(compiled)):[];
  const readback=source&&compiled?{available:true,sourceFile:source.file,compiledFile:compiled.file,differences:differences.slice(0,100),differenceCount:differences.length,interpretation:'Serialized values, including compiler defaults/float32 rounding. Consult candidate validation for supported-field tolerance checks; native appearance is unqualified.'}:{available:false,reason:'No compiled candidate supplied; effective ASCII export only.'};
  return{models,readback,resources:files.filter(f=>/\.(mdl|tga|txi|wav|hak)$/.test(f.name)).map(f=>({name:f.name,size:f.data.length,sha256:hash(f.data)}))};
}
export function textureMeasurements(width:number,height:number,rgba:Uint8Array){
  const histogram=Array(256).fill(0);let sum=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=rgba[(y*width+x)*4+3];histogram[a]++;sum+=a;if(a){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  const pixels=width*height;
  return{width,height,source:'decoded RGBA8 PNG',unit:'normalized-alpha',meanAlpha:sum/(pixels*255),maxAlpha:histogram.findLastIndex(n=>n>0)/255,
    alphaHistogram:histogram,nonzeroFraction:1-histogram[0]/pixels,overHalfFraction:histogram.slice(128).reduce((a,b)=>a+b,0)/pixels,
    bounds:maxX<0?null:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},rgbaSha256:hash(rgba)};
}
export function analyzeDocument(document:EffectDocument,existingFiles?:ResourceFile[]){
  const findings:any[]=[],textures:any[]=[],emitters:any[]=[],meshes:any[]=[];
  const add=(severity:string,code:string,message:string,data:unknown={},source='document')=>findings.push({severity,code,message,source,data});
  for(const asset of document.assets??[]){try{const p=decodeTextureAsset(asset),stats=textureMeasurements(p.width,p.height,p.rgba);textures.push({assetId:asset.id,...stats});if(!stats.maxAlpha)add('warning','TEXTURE_ZERO_ALPHA','Tekstura nie ma widocznych pikseli.',{assetId:asset.id});else if(stats.meanAlpha<.2)add('warning','TEXTURE_LOW_COVERAGE','Średnia alfa jest mała; nie jest to pomiar widoczności w NWN.',{assetId:asset.id,meanAlpha:stats.meanAlpha});}catch(e){add('error','TEXTURE_INVALID',(e as Error).message,{assetId:asset.id});}}
  for(const l of document.layers){
    if(l.type==='emitter'){
      try{const p=resolveTexture(document,l.texture),stats=textureMeasurements(p.width,p.height,p.rgba),points=[0,l.midPercent??.5,1].map(t=>({ageFraction:t,...sampleEmitterAppearance(l,t)}));
        let proxy=0;for(let k=0;k<1024;k++){const a=sampleEmitterAppearance(l,(k+.5)/1024);proxy+=(a.size*l.scale)**2*a.alpha*stats.meanAlpha/1024;}
        emitters.push({id:l.id,enabled:l.enabled,lifeSeconds:l.life,emissionWindowSeconds:[l.start,l.start+l.duration],update:l.update,count:l.count,points,
          combinedAlpha:points.map(p=>({ageFraction:p.ageFraction,mean:p.alpha*stats.meanAlpha,max:p.alpha*stats.maxAlpha})),estimate:{value:proxy,unit:'m2-alpha',source:'lifetime-average size^2 * authored alpha * mean texture alpha',measuredNativeBrightness:false},flipbook:l.flipbook??null});
        if(points.every(p=>p.alpha===0))add('warning','EMITTER_ZERO_ALPHA','Obwiednia alfy ma wyłącznie zera.',{layerId:l.id});
      }catch(e){add('error','EMITTER_INVALID',(e as Error).message,{layerId:l.id});}
    }else if(l.type==='mesh'){
      try{const g=buildMeshGeometry(l.geometry),seen=new Set<string>();let duplicates=0,degenerate=0,badIndices=0;
        for(const face of g.faces){if(face.some(i=>i<0||i>=g.vertices.length)){badIndices++;continue;}const key=[...face].sort((a,b)=>a-b).join(',');if(seen.has(key))duplicates++;seen.add(key);
          const [a,b,c]=face.map(i=>g.vertices[i]),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;}
        const bounds=(points:number[][])=>[0,1,2].map(axis=>points.reduce((b,p)=>[Math.min(b[0],p[axis]),Math.max(b[1],p[axis])],[Infinity,-Infinity]));
        const normals=meshCornerNormals(g.vertices,g.faces,l.shading??'flat');
        meshes.push({id:l.id,vertices:g.vertices.length,faces:g.faces.length,uv:g.uv.length,duplicates,degenerate,badIndices,deformationFrames:l.animation.vertices?.length??0,shading:l.shading??'flat',source:'authored geometry; no remeshing',boundsMetres:bounds(g.vertices),normalSha256:digestValue(normals),uvOutsideUnitSquare:g.uv.filter(v=>v.some(n=>n<0||n>1)).length,deformationBoundsMetres:(l.animation.vertices??[]).map(k=>({time:k.time,bounds:bounds(k.value)}))});
        if(badIndices)add('error','MESH_INDEX','Indeksy poza zakresem.',{layerId:l.id,count:badIndices});
        if(duplicates||degenerate)add('warning','MESH_TOPOLOGY','Powtórzone lub zdegenerowane ściany; bez automatycznej przebudowy.',{layerId:l.id,duplicates,degenerate});
      }catch(e){add('error','MESH_INVALID',(e as Error).message,{layerId:l.id});}
    }
  }
  let audio:any=null;try{
    const levels=analyzeAudioLevels(document);audio={levels,clips:(document.audioClips??[]).map(c=>({id:c.id,enabled:c.enabled,startSeconds:c.start,endSeconds:c.start+c.duration,sourceOffsetSeconds:c.offset,sourceEndSeconds:c.offset+c.duration,gain:c.gain,sourceAssetId:c.assetId})),period:document.lifecycle==='duration'?{seconds:document.duration,frames44100:document.duration*44100,frames48000:document.duration*48000,sourceAudioStretched:false,stopRule:'Do not dispatch at or after external stop; an issued WAV may finish.'}:null};
    for(const level of levels){if(level.clippedSamples>0)add('warning','AUDIO_CLIPPING','Wykryto przycięte próbki.',level,'existing audio mixer');if(document.audioClips?.some(c=>c.enabled)&&level.peak===0)add('warning','AUDIO_SILENCE','Aktywne klipy dają ciszę w miksie.',level,'existing audio mixer');}
    for(const c of document.audioClips??[]){const a=document.audioAssets?.find(a=>a.id===c.assetId);if(!a||c.offset+c.duration>a.duration+1e-8||c.start+c.duration>document.duration+1e-8)add('error','AUDIO_RANGE','Klip wykracza poza źródło lub okres efektu.',{clipId:c.id});}
  }catch(e){add('error','AUDIO_INVALID',(e as Error).message);}
  let exported:any=null;
  try{
    const files=existingFiles??buildCandidate(document,'vfxanalysis').files;exported=exportSummary(files);
    const expected=existingFiles?buildCandidate(document,exported.models.find((m:any)=>m.file==='source-model.mdl.txt')?.modelName??exported.models[0]?.modelName??'vfxanalysis').files:files;
    for(const f of files.filter(f=>f.name.endsWith('.tga'))){
      const p=readNwnTga(f.data),matching=(document.assets??[]).some(a=>{const s=decodeTextureAsset(a);return p.width===s.width&&p.height===s.height&&hash(p.rgba)===hash(s.rgba);});
      const txi=files.find(x=>x.name===f.name.replace(/\.tga$/,'.txi'));if(!txi)throw new DomainError('TXI_MISSING','Brak TXI zależności tekstury.');
      const expectedTga=expected.find(x=>x.name===f.name),expectedTxi=expected.find(x=>x.name===txi.name);
      if(!expectedTga||hash(readNwnTga(expectedTga.data).rgba)!==hash(p.rgba))throw new DomainError('TEXTURE_PIXEL_MISMATCH','Piksele TGA różnią się od tekstury wyznaczonej przez dokument i eksporter.');
      if(!expectedTxi||hash(expectedTxi.data)!==hash(txi.data))throw new DomainError('TXI_MISMATCH','TXI różni się od ustawień eksportu wyznaczonych przez dokument.');
      // Bytes have already been matched to this document's exporter. Only its
      // periodic profile may produce the closed no-mipmap material.
      const periodic=document.layers.some(l=>l.type==='beam'&&l.enabled&&l.materialMotion)&&new TextDecoder().decode(expectedTxi.data).includes('mipmap 0');
      const settings=readTxi(txi.data,periodic?'linked-periodic-pan-v1':undefined);add('info','TEXTURE_EXPORT_MATCH','Piksele i ustawienia TXI odpowiadają dokumentowi.',{name:f.name,directImportedPng:matching,rgbaSha256:hash(p.rgba),settings},'PNG/derivative → TGA readback');
    }
    for(const f of files.filter(f=>f.name.endsWith('.hak')))for(const r of readHak(f.data)){const standalone=files.find(x=>x.name===r.name);if(!standalone||hash(r.data)!==hash(standalone.data))throw new DomainError('RESOURCE_MISMATCH','Zasób HAK różni się od pliku eksportu.');}
    const sourceModel=exported.models.find((m:any)=>m.file==='source-model.mdl.txt')??exported.models[0];
    for(const node of sourceModel?.nodes??[])if(node.type==='emitter'&&Number(node.properties.birthrate?.[0])===0){
      const keys=sourceModel.animations.flatMap((a:any)=>a.nodes.filter((n:any)=>n.name===node.name).flatMap((n:any)=>n.tracks.birthrate??[]));
      add(keys.some((r:number[])=>r[1]>0)?'info':'warning',keys.some((r:number[])=>r[1]>0)?'ANIMATED_EMISSION_GATE':'NO_POSITIVE_BIRTHRATE',keys.some((r:number[])=>r[1]>0)?'Bazowa emisja0 jest sterowana dodatnimi kluczami animacji.':'Brak dodatniej bazowej emisji lub kluczy.',{node:node.name},'MDL readback');
    }
  }catch(e){add('error',e instanceof DomainError?e.code:'EXPORT_INVALID',(e as Error).message,{},'export/readback');}
  add('hypothesis','NATIVE_APPEARANCE_UNQUALIFIED','Fog, depth, rig, filtrowanie i scena mogą wpływać na wygląd; nie wskazano udowodnionej przyczyny.',{},'known renderer limitations');
  return{version:1,findings,textures,emitters,meshes,audio,exported,nativeVerified:false,artApproved:false};
}
export function compareWithExport(base:EffectDocument,subject:EffectDocument,baselineFiles?:ResourceFile[],subjectFiles?:ResourceFile[]){
  const safe=(d:EffectDocument,files?:ResourceFile[])=>{try{return exportSummary(files??buildCandidate(d,'vfxcompare').files);}catch(e){return{error:(e as Error).message};}};
  return{authored:compareDocuments(base,subject),baselineExport:safe(base,baselineFiles),subjectExport:safe(subject,subjectFiles),summary:{baselineLayers:base.layers.length,subjectLayers:subject.layers.length},nativeVerified:false};
}
