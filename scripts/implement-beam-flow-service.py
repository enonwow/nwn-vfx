from pathlib import Path
def edit(path,old,new):
 p=Path(path);s=p.read_text(encoding='utf-8');assert old in s,(path,old[:90]);p.write_text(s.replace(old,new),encoding='utf-8')
for p in ['apps/web/src/api.ts','apps/web/src/webmcp.ts','apps/cli/src/client.ts']:
 edit(p,"'X-NWN-VFX-Document-Schema':'18'" if 'web/' in p else "'x-nwn-vfx-document-schema':'18'","'X-NWN-VFX-Document-Schema':'19'" if 'web/' in p else "'x-nwn-vfx-document-schema':'19'")
p='apps/service/src/app.ts';edit(p,"request.headers['x-nwn-vfx-document-schema']==='18'?18:","request.headers['x-nwn-vfx-document-schema']==='19'?19:request.headers['x-nwn-vfx-document-schema']==='18'?18:")
p='apps/service/src/commands.ts'
edit(p,'15,16,17,18]','15,16,17,18,19]')
edit(p,'maxDocumentSchemaVersion=18','maxDocumentSchemaVersion=19')
edit(p,'maxDocumentSchemaVersion>=18','maxDocumentSchemaVersion>=19')
edit(p,'if(maxDocumentSchemaVersion<18&&access.projectId)','if(maxDocumentSchemaVersion<19&&access.projectId)')
edit(p,"        if(maxDocumentSchemaVersion<18&&['changes.preview','changes.apply'].includes(command.operation))", "        if(maxDocumentSchemaVersion<19&&['changes.preview','changes.apply'].includes(command.operation))\n          for(const c of (command.input.changes??[]) as Change[])\n            if((c.type==='layer.set'&&Object.hasOwn(c.values,'beamBinding'))||(c.type==='layer.add'&&Object.hasOwn(c.layer,'beamBinding'))||(c.type==='locks.set'&&c.locks.some(l=>l.field==='beamBinding')))upgradeRequired(19);\n        if(maxDocumentSchemaVersion<18&&['changes.preview','changes.apply'].includes(command.operation))")
p='apps/service/src/project-bundle.ts'
edit(p,'schemaVersion: project.document.schemaVersion>=18?', 'schemaVersion: project.document.schemaVersion>=19?14:project.document.schemaVersion>=18?')
edit(p,"minimumStudioVersion:project.document.schemaVersion>=18?", "minimumStudioVersion:project.document.schemaVersion>=19?'0.27.0':project.document.schemaVersion>=18?")
edit(p,'10, 11, 12, 13].includes(manifest.schemaVersion)','10, 11, 12, 13, 14].includes(manifest.schemaVersion)')
edit(p,'    if(document.schemaVersion===18',"    if(document.schemaVersion===19&&(manifest.schemaVersion!==14||manifest.minimumStudioVersion!=='0.27.0'))fail('INVALID_BUNDLE','Dokument 19 wymaga paczki v14 i Studio 0.27.0.');\n    if(document.schemaVersion===18")
for p in ['package.json','package-lock.json']:
 edit(p,'"version": "0.26.2"','"version": "0.27.0"')
