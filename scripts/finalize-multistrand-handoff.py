"""Freeze release metadata; preserve old runtime and accepted service data."""
import hashlib,json,shutil
from pathlib import Path
root=Path.cwd()
out=root/'output/beam-multistrand-0282'
lab=root/'output/beam-composite-0281/lab'
runtime=lab/'runtime-0282'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,data): p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
old_manifest=read(lab/'runtime-manifest.json')
for entry in old_manifest['files']:
    p=Path(old_manifest['runtime'])/entry['path']
    assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'],p
for name in ['beam-multistrand.md','beam-multistrand-acceptance-2026-09-10.md']:
    shutil.copy2(root/'docs/agents'/name,runtime/'docs/agents'/name)
shutil.copy2(root/'README.md',runtime/'README.md')
shutil.copy2(root/'skills/nwn-vfx/SKILL.md',runtime/'skills/nwn-vfx/SKILL.md')
shutil.copy2(root/'docs/agents/examples/beam-multistrand/run.mjs',runtime/'docs/agents/examples/beam-multistrand/run.mjs')
entries=[]
for p in sorted(runtime.rglob('*')):
    if p.is_file():
        data=p.read_bytes();entries.append({'path':p.relative_to(runtime).as_posix(),'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
write(lab/'runtime-0282-manifest.json',{'version':'0.28.2','runtime':str(runtime),'port':14387,'processId':31324,'files':entries,'oldRuntimeFilesVerified':len(old_manifest['files'])})
handoff=read(lab/'handoff.json')
handoff['version']['cliVersion']='0.28.2'
handoff['cli']=str(runtime/'bin/nwn-vfx.mjs')
handoff['service']['processId']=31324
handoff['releaseHandoffPath']=str(out/'handoff.json')
handoff['runtimeManifestPath']=str(lab/'runtime-0282-manifest.json')
write(lab/'handoff.json',handoff)
def candidate(name):
    p=read(out/('public-'+name+'.json'));a=next(a for a in p['artifacts'] if a['fileName']=='candidate.zip')
    return {'projectId':p['projectId'],'revision':p['revision'],'jobId':p['jobId'],'strands':p['strands'],'artifact':a,'downloadedZip':str(out/(name+'.zip'))}
release={'version':'0.28.2','documentSchema':22,'projectZipSchema':17,'endpoint':handoff['service']['endpoint'],
    'instanceId':handoff['instanceId'],'workspaceId':handoff['workspaceId'],'actorId':handoff['actorId'],
    'cli':handoff['cli'],'configPath':handoff['configPath'],'service':handoff['service'],
    'runtimeManifestPath':handoff['runtimeManifestPath'],'previousHandoffPath':str(out/'pre-upgrade/handoff.json'),
    'source':{'projectId':'0bb65bb5-d27d-4197-8728-5f44561cc83a','revision':2,'jobId':'92498861-e37e-4cb2-839b-ac57da48ccfa'},
    'consumerCandidate':candidate('four'),'comparisonCandidate':candidate('three'),
    'modelName':'vstrands282','exactEssenceAndAssetsPreserved':True,
    'tests':{'pass':313,'fail':0,'skipped':0,'productionBuild':'pass','webmcp':'pass'},
    'evidence':{name:str(out/name) for name in ['public-readback.json','webmcp-acceptance.json','preservation.json','all-tests.log','build-final.log']},
    'contract':str(runtime/'docs/agents/beam-multistrand.md'),
    'acceptance':str(runtime/'docs/agents/beam-multistrand-acceptance-2026-09-10.md'),
    'example':str(runtime/'docs/agents/examples/beam-multistrand/run.mjs'),
    'nativeVerified':False,'phasedWeavingSupported':False,'consumerOwnsNativeIntegration':True}
write(out/'handoff.json',release)
print(json.dumps({'handoff':str(out/'handoff.json'),'frozenRuntimeFiles':len(entries),'oldRuntimeFilesUnchanged':len(old_manifest['files'])},indent=2))
