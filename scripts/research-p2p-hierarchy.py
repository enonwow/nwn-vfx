import runpy,contextlib,io
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()):d=runpy.run_path('scripts/research-p2p-elf.py')
lines=[]
for name in ['_Z16AnimateHierarchyP4PartP7MdlNodefff','_ZN3Gob7DoEventEPKcPv']:
 s=next(s for s in d['syms'] if s['name']==name);lines.append('\n'+name)
 for ins in d['md'].disasm(d['bytes_at'](s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+d['byaddr'].get(int(ins.op_str,16),'')
  lines.append(line)
print('\n'.join(lines));Path('output/beam-motion-research/p2p-animation-hierarchy.asm.txt').write_text('\n'.join(lines),encoding='utf-8')
