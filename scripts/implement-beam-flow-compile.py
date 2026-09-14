from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:100]);p.write_text(s.replace(old,new),encoding='utf-8')
p='packages/nwn-format/src/binary-beam.ts';edit(p,"[140,'lifeexp'],[104,'combinetime']","[144,'lifeexp'],[120,'combinetime']")
p='packages/nwn-format/src/compiled-candidate.ts'
edit(p,"import { execFile }", "import {isBeamFlow} from '../../core/src/beam-flow.js';\nimport { execFile }")
edit(p,"const beam=result.files.find(f=>f.name==='beam.json')!;", "const beam=result.files.find(f=>f.name===(isBeamFlow(document)?'beam-flow.json':'beam.json'))!;")
old="    const resources=readHak(result.files.find(f=>f.name===`${modelName}.hak`)!.data).map(f=>f.name===`${modelName}.mdl`?{...f,data:binary}:f);"
new="""    const compiledModels=new Map<string,Uint8Array>([[modelName+'.mdl',binary]]),additionalProofs=[];
    for(const resource of result.files.filter(f=>f.name.endsWith('.mdl')&&f.name!==modelName+'.mdl')){
      signal?.throwIfAborted();await writeFile(input,resource.data);
      const modelLogs:Record<string,unknown>={};
      for(const [stage,args] of [['compile',['-c','-n','-e',input,output]],['decompile',['-d','-e',output,decompiled]]] as const){
        const response=await run(compiler,[...args],{cwd:directory,windowsHide:true,timeout:60000,maxBuffer:1024*1024,signal});modelLogs[stage]=response;
        if(/\\b(error|warning)\\b/i.test(response.stderr)||/^\\s*(error|warning)\\b/im.test(response.stdout))throw new DomainError('MODEL_COMPILE_FAILED','Diagnostyka kompilacji końcówki.',{model:resource.name,stage,stderr:response.stderr});
        if((await stat(stage==='compile'?output:decompiled)).size>128*1024*1024)throw new DomainError('LIMIT_EXCEEDED','Model końcówki przekracza limit.');
      }
      const compiled=await readFile(output),round=await readFile(decompiled);
      const proof={file:resource.name,sourceMdlSha256:hash(resource.data),binaryMdlSha256:hash(compiled),roundtripMdlSha256:hash(round),
        roundtrip:verifyCompiledRoundtrip(resource.data,round),emission:verifyBinaryEmission(resource.data,compiled),
        flipbook:verifyBinaryFlipbooks(resource.data,compiled),geometry:verifyBinaryGeometry(resource.data,compiled),normals:verifyBinaryNormals(resource.data,compiled)};
      compiledModels.set(resource.name,compiled);additionalProofs.push(proof);logs[resource.name]=modelLogs;
      result.files.push({name:resource.name+'.source.txt',data:resource.data},{name:resource.name+'.roundtrip.txt',data:round});
    }
    if(isBeamFlow(document)){
      const file=result.files.find(f=>f.name==='beam-flow.json')!,flow=JSON.parse(new TextDecoder().decode(file.data));flow.compiledEndpointModels=additionalProofs;
      for(const endpoint of flow.endpoints){endpoint.model.sourceSha256=endpoint.model.sha256;endpoint.model.sha256=hash(compiledModels.get(endpoint.model.file)!);}
      file.data=encode(flow);
    }
    const resources=readHak(result.files.find(f=>f.name===`${modelName}.hak`)!.data).map(f=>compiledModels.has(f.name)?{...f,data:compiledModels.get(f.name)!}:f);"""
edit(p,old,new)
edit(p,"f.name===`${modelName}.mdl`?{...f,data:binary}:f.name===`${modelName}.hak`", "compiledModels.has(f.name)?{...f,data:compiledModels.get(f.name)!}:f.name===`${modelName}.hak`")
edit(p,"...(document.lifecycle==='beam'?[document.layers.some", "...(isBeamFlow(document)?['Finite P2P and all endpoint models compiled and independently read back. Native flow, finite animation and endpoint node attachment remain unverified.']:document.lifecycle==='beam'?[document.layers.some")
