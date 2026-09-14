import runpy,contextlib,io
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()):d=runpy.run_path('scripts/research-p2p-elf.py')
lines=[]
for name in ['_ZN24CNWCVisualEffectOnObject16ApplySpellVisualEt','_ZN24CNWCVisualEffectOnObject15LoadSpellVisualEt','_ZN24CNWCVisualEffectOnObject26ApplyHardCodedVisualEffectEt']:
 s=next(s for s in d['syms'] if s['name']==name);lines.append('\n'+name)
 for ins in d['md'].disasm(d['bytes_at'](s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+d['byaddr'].get(int(ins.op_str,16),'')
  if ins.mnemonic=='lea' and 'rip' in ins.op_str:
   try:
    delta=int(ins.op_str.split('rip')[1].strip(' []').replace(' ',''),16);target=ins.address+ins.size+delta;line+=' ; '+repr(d['bytes_at'](target,64).split(bytes([0]))[0])
   except (ValueError,StopIteration):pass
  lines.append(line)
Path('output/beam-motion-research/p2p-spell-visual.asm.txt').write_text('\n'.join(lines),encoding='utf-8');print('\n'.join(lines))

import struct
base=0x81a9aa+7+0xb0a267
for index in [7,12]:
 target=base+struct.unpack('<i',d['bytes_at'](base+index*4,4))[0]
 print('progfx switch',index,hex(target))
