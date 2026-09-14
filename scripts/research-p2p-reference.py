import runpy,contextlib,io,json
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()):d=runpy.run_path('scripts/research-p2p-elf.py')
md,syms,bytes_at,byaddr=(d[k] for k in ['md','syms','bytes_at','byaddr'])
selected=['_Z13NewCAurObjectPKcS0_P8_IO_FILE','_ZN3GobC1EPKc','_ZN3Gob14AttachToObjectEP10CAurObjectPKci','_ZN3Gob13AddAttachmentEPS_']
selected += [s['name'] for s in syms if s['address'] in [0x815a70,0x815b60,0x8137f0]][:3]
lines=[]
for name in dict.fromkeys(selected):
 s=next(s for s in syms if s['name']==name);lines.append('\n'+name)
 for ins in md.disasm(bytes_at(s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+byaddr.get(int(ins.op_str,16),'')
  lines.append(line)
Path('output/beam-motion-research/p2p-creation-beam.asm.txt').write_text('\n'.join(lines),encoding='utf-8')
for line in lines:
 if not line.startswith('0x') or 'call' in line or '1b8' in line:print(line)
