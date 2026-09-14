from pathlib import Path

def edit(path, changes):
    p=Path(path); s=p.read_text(encoding='utf-8')
    for before,after in changes:
        assert before in s, (path,before)
        s=s.replace(before,after)
    p.write_text(s,encoding='utf-8',newline='\n')

edit('packages/core/src/model.ts', [
 ("STUDIO_VERSION = '0.29.0'","STUDIO_VERSION = '0.30.0'"),
 ('| 22 | 23;', '| 22 | 23 | 24;'),
 ("  if(document.schemaVersion<23&&", "  if(document.schemaVersion<24&&document.lifecycle==='beam'&&document.audioClips?.some(c=>c.enabled))document.schemaVersion=24;\n  else if(document.schemaVersion<23&&")])
edit('packages/nwn-format/src/mdl-writer.ts',[
 ('export function exporterVersion(document:EffectDocument,binary=false) {',"export function exporterVersion(document:EffectDocument,binary=false) {\n  if(document.lifecycle==='beam'&&document.audioClips?.some(c=>c.enabled))return `nwn-${binary?'binary':'ascii'}-vfx-0.30.0`;"),
 ('21, 22, 23].includes','21, 22, 23, 24].includes')])
edit('packages/contracts/src/schema.ts',[
 ('21,22,23]', '21,22,23,24]'),
 ("'nwn-ascii-vfx-0.29.0'", "'nwn-ascii-vfx-0.29.0','nwn-ascii-vfx-0.30.0'"),
 ("'nwn-binary-vfx-0.29.0'", "'nwn-binary-vfx-0.29.0','nwn-binary-vfx-0.30.0'")])
edit('apps/service/src/commands.ts',[
 ('21,22,23]', '21,22,23,24]'),('maxDocumentSchemaVersion=23','maxDocumentSchemaVersion=24'),
 ("minimumStudioVersion=version>=23", "minimumStudioVersion=version>=24?'0.30.0':version>=23"),
 ('maxDocumentSchemaVersion>=23)return','maxDocumentSchemaVersion>=24)return'),
 ('maxDocumentSchemaVersion<23&&access.projectId','maxDocumentSchemaVersion<24&&access.projectId')])
edit('apps/service/src/app.ts',[("request.headers['x-nwn-vfx-document-schema']==='23'?23:","request.headers['x-nwn-vfx-document-schema']==='24'?24:request.headers['x-nwn-vfx-document-schema']==='23'?23:")])
for path,header in [('apps/cli/src/client.ts','x-nwn-vfx-document-schema'),('apps/web/src/api.ts','X-NWN-VFX-Document-Schema'),('apps/web/src/webmcp.ts','X-NWN-VFX-Document-Schema')]:
    edit(path,[(f"'{header}':'23'",f"'{header}':'24'")])
edit('apps/service/src/project-bundle.ts',[
 ('schemaVersion: project.document.schemaVersion>=23?18:', 'schemaVersion: project.document.schemaVersion>=24?19:project.document.schemaVersion>=23?18:'),
 ("minimumStudioVersion:project.document.schemaVersion>=23?", "minimumStudioVersion:project.document.schemaVersion>=24?'0.30.0':project.document.schemaVersion>=23?"),
 ('16, 17, 18].includes(manifest.schemaVersion)','16, 17, 18, 19].includes(manifest.schemaVersion)'),
 ("    if(document.schemaVersion===23", "    if(document.schemaVersion===24&&(manifest.schemaVersion!==19||manifest.minimumStudioVersion!=='0.30.0'))fail('INVALID_BUNDLE','Dokument 24 wymaga paczki 19 i Studio 0.30.0.');\n    if(document.schemaVersion===23")])
edit('apps/service/src/render.ts',[("document.lifecycle==='duration'&&document.audioClips?.some(c=>c.enabled)?1e-9:0","['duration','beam'].includes(document.lifecycle??'')&&document.audioClips?.some(c=>c.enabled)?1e-9:0")])
for p in ['package.json','package-lock.json']:
    edit(p,[( '"version": "0.29.0"', '"version": "0.30.0"')])
print('Version/schema/header/portable changes applied')
