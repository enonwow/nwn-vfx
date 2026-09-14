"""Read named stock 2DA resources and their Type7 models; never run the game."""
from pathlib import Path
import argparse, hashlib, json, re, shlex, struct, subprocess

parser=argparse.ArgumentParser()
parser.add_argument('--decompile',action='store_true')
args=parser.parse_args()

GAME=Path('C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights')
OUT=Path('C:/Projects/New Folder/beam-reverse-audit-2026-09-10/stock')
OUT.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
catalog=[]
for keypath in [GAME/'data/nwn_base.key',GAME/'data/nwn_retail.key']:
    raw=keypath.read_bytes();assert raw[:8]==b'KEY V1  '
    key_sha=sha(raw)
    bc,kc,bo,ko=struct.unpack_from('<4I',raw,8)
    assert bo+12*bc<=len(raw) and ko+22*kc<=len(raw)
    for i in range(kc):
        pos=ko+22*i;name=raw[pos:pos+16].split(b'\0')[0].decode('ascii').lower()
        typ,rid=struct.unpack_from('<HI',raw,pos+16)
        if typ not in (2002,2017):continue
        assert rid>>20<bc
        _,no,nl,_=struct.unpack_from('<IIHH',raw,bo+12*(rid>>20))
        filename=raw[no:no+nl].split(b'\0')[0].decode('ascii').replace('\\','/')
        bif=GAME/filename
        if not bif.exists():bif=GAME/'data'/filename
        catalog.append(dict(name=name,type=typ,rid=rid,key=str(keypath),keySha256=key_sha,bif=str(bif)))

records=[]
def extract(entry):
    with Path(entry['bif']).open('rb') as f:
        head=f.read(20);assert head[:8]==b'BIFFV1  '
        count,fixed,table=struct.unpack_from('<III',head,8);idx=entry['rid']&0xfffff;assert idx<count
        f.seek(table+idx*16);rid,offset,size,typ=struct.unpack('<4I',f.read(16));assert typ==entry['type']
        assert rid&0xfffff==idx
        f.seek(offset);data=f.read(size);assert len(data)==size
    folder=OUT/Path(entry['key']).stem;folder.mkdir(exist_ok=True)
    dest=folder/(entry['name']+('.mdl' if typ==2002 else '.2da'))
    if dest.exists():assert dest.read_bytes()==data
    else:dest.write_bytes(data)
    records.append({**entry,'path':str(dest),'offset':offset,'size':size,'sha256':sha(data)})
    return data

tables=[];models=set()
for entry in catalog:
    if entry['name']!='progfx' or entry['type']!=2017:continue
    data=extract(entry);lines=[x.strip() for x in data.decode('ascii').splitlines() if x.strip()]
    assert lines[0]=='2DA V2.0';header=shlex.split(lines[1]);rows=[]
    for line in lines[2:]:
        parts=shlex.split(line);row=dict(zip(header,parts[1:]))
        if row.get('Type')!='7':continue
        row={'rowId':parts[0],**row};rows.append(row)
        if row.get('Param1') not in (None,'****'):models.add(row['Param1'].lower())
    tables.append({'key':entry['key'],'rows':rows})
for entry in catalog:
    if entry['type']==2002 and entry['name'] in models:extract(entry)
report={'nativeExecution':False,'scope':'Both KEY catalogs independently; no claim about runtime override precedence',
        'type7Tables':tables,'resources':records,'unresolvedModelNames':sorted(models-{r['name'] for r in records if r['type']==2002})}
if args.decompile:
    compiler=Path(__file__).resolve().parent.parent/'bin/native/win32/nwnmdlcomp.exe'
    expected='5b8b49441cbc8121ff8f38ec48651e2388d54842ccc12128cf2b59f8b735739d'
    assert sha(compiler.read_bytes())==expected
    decoded=[]
    for record in records:
        if record['type']!=2002:continue
        dest=Path(record['path']).with_suffix('.decompiled.mdl.txt')
        if not dest.exists():
            run=subprocess.run([str(compiler),'-d','-e',record['path'],str(dest)],cwd=dest.parent,
                               capture_output=True,timeout=20,creationflags=subprocess.CREATE_NO_WINDOW)
            assert run.returncode==0,(record['name'],run.stdout,run.stderr)
        text=dest.read_text(encoding='ascii')
        base=re.split(r'(?im)^newanim\s',text)[0]
        fields=['parent','update','render','blend','p2p','p2p_sel','birthrate','lifeExp','sizeStart','sizeStart_y','alphaStart','combinetime','p2p_bezier2','p2p_bezier3','refmodel','reattachable']
        nodes=[]
        for node in re.finditer(r'(?ims)^node\s+(emitter|reference)\s+(\S+)\s*\n(.*?)^endnode',base):
            properties={}
            for line in node[3].splitlines():
                parts=line.split()
                if parts and parts[0].lower() in {f.lower() for f in fields}:properties[parts[0]]=' '.join(parts[1:])
            nodes.append({'type':node[1],'name':node[2],**properties})
        decoded.append({'resref':record['name'],'sourceSha256':record['sha256'],'path':str(dest),'sha256':sha(dest.read_bytes()),
                        'animations':re.findall(r'(?im)^newanim\s+(\S+)',text),'nodes':nodes})
    report['decompilation']={'compilerSha256':expected,'resourceFree':True,'nativeGameExecution':False,'models':decoded}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'tables':len(tables),'models':len([r for r in records if r['type']==2002]),'unresolved':report['unresolvedModelNames'],
                  'decompiled':len(report.get('decompilation',{}).get('models',[])),'manifest':str(OUT/'manifest.json')}))
