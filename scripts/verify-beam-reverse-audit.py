"""Integrity checks for offline audit evidence; not engine playback tests."""
from pathlib import Path
import hashlib,json,math

root=Path('C:/Projects/New Folder/beam-reverse-audit-2026-09-10')
sha=lambda data:hashlib.sha256(data).hexdigest()
inputs=json.loads((root/'inputs.json').read_text())['inputs']
for record in inputs:
    data=Path(record['path']).read_bytes()
    assert len(data)==record['bytes'] and sha(data)==record['sha256']
assert inputs[0]['sha256']=='6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700'
checks={
 'birth-and-curve.asm.txt':[
  '0x4abc45 mov dword ptr [rdi + 0x74], 0',
  '0x4abca6 mov rdx, qword ptr [rax + 0x1e8]',
  '0x4b0811 divss xmm0, dword ptr [r14 + 0xa8]',
  '0x4b0850 subss xmm1, xmm0'],
 'particle-age.asm.txt':[
  '0x4b1bce addss xmm1, xmm0',
  '0x4b1bde mov dword ptr [r13 + 0x74], 0',
  '0x4b1bcc jae 0x4b1c08'],
 'reverse-path.asm.txt':[
  '0x4aa869 mov qword ptr [rbx + 0x1c8], rax',
  '0x4b1053 call qword ptr [rax + 0xc8]',
  '0x4b1142 call 0x5b37d0'],
 'transforms.asm.txt':[
  '0x4379e7 mov r12, qword ptr [r12 + 0x48]',
  '0x43fd07 mov r15, qword ptr [r13 + 0x68]',
  '0x43fe78 mov rax, qword ptr [rbx + 0x38]'],
 'emitter-creation.asm.txt':[
  '0x44144d call 0x4421e0',
  '0x44147f lea rsi, [rip + 0xeadc06]',
  '0x441489 call qword ptr [rax + 0x2a0]'],
 'p2p-flags.asm.txt':['0x4aaa7a and eax, 1','0x4aaa8a sar eax, 1','0x4aaa8c and eax, 1']}
for filename,lines in checks.items():
    text=(root/filename).read_text()
    for line in lines:assert line in text,line
vtable=json.loads((root/'virtual-call-targets.json').read_text())
assert next(v for v in vtable if v['vtable']=='_ZTV3Gob' and v['slot']=='0x2a0')['symbol']=='_ZN3Gob7DoEventEPKcPv'
for name in ['_ZTV4Part','_ZTV13PartReference']:
    assert next(v for v in vtable if v['vtable']==name and v['slot']=='0x20')['address']=='0x437930'

# Independent arithmetic identity for the specific zero-handle curve. This is
# a check of the written derivation, not an emulation of the native renderer.
for i in range(101):
    t=i/100;direct=3*t*t*(1-t)+t*t*t;smooth=t*t*(3-2*t)
    assert math.isclose(direct,smooth,abs_tol=1e-14)
assert (0**3,1**3)==(0,1)
stock=json.loads((root/'stock/manifest.json').read_text())
for resource in stock['resources']:
    data=Path(resource['path']).read_bytes();assert sha(data)==resource['sha256'] and len(data)==resource['size']
for model in stock['decompilation']['models']:assert sha(Path(model['path']).read_bytes())==model['sha256']
for table in stock['type7Tables']:
    assert len(table['rows'])==13
    assert all(r['Param2']=='cast01' and r['Param6']=='****' for r in table['rows'])
flame=next(m for m in stock['decompilation']['models'] if m['resref']=='vim_rayflame')
flow=next(n for n in flame['nodes'] if n.get('p2p')=='1')
assert {k:flow[k] for k in ['update','p2p_sel','birthrate','lifeExp','combinetime']}=={'update':'Fountain','p2p_sel':'1','birthrate':'10','lifeExp':'1','combinetime':'0.5'}

workspace=Path(__file__).resolve().parent.parent
v10=json.loads((workspace/'output/beam-high-visibility-v10/report.json').read_text())
assert v10['passed'] and v10['animationAndFlowUnchanged']
artifacts=[a for job in v10['jobs'] for a in job['artifacts']]
for artifact in artifacts:
    data=Path(artifact['path']).read_bytes();assert sha(data)==artifact['sha256'] and len(data)==artifact['size']
files=[p for p in root.rglob('*') if p.is_file() and p.name!='verification.json']
report={'passed':True,'kind':'offline evidence integrity and arithmetic checks; not native tests',
        'sourceFiles':len(inputs),'instructionAssertions':sum(map(len,checks.values())),
        'stockResources':len(stock['resources']),'stockDecodedModels':len(stock['decompilation']['models']),
        'v10ArtifactFilesChecked':len(artifacts),
        'files':[{'path':str(p),'sha256':sha(p.read_bytes()),'size':p.stat().st_size} for p in sorted(files)]}
(root/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))
