import runpy,contextlib,io,struct
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()):d=runpy.run_path('scripts/research-p2p-elf.py')
md,syms,bytes_at,byaddr=(d[k] for k in ['md','syms','bytes_at','byaddr'])
lines=[]
for addr in [0x4990c0,0x439300,0x437690]:
 s=next((s for s in syms if s['address']==addr),{'address':addr,'size':256});lines.append('\n'+str(s))
 for ins in md.disasm(bytes_at(addr,s['size']),addr):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+byaddr.get(int(ins.op_str,16),'')
  lines.append(line)
seen=set()
for s in syms:
 if s['address'] in seen:continue
 seen.add(s['address'])
 if not (0x400000 < s['address'] < 0x1100000) or s['size']>100000:continue
 # exact x86 near-call byte search, then verify disassembly of matching functions
 raw=bytes_at(s['address'],s['size'])
 targets=[0x4447d0,0x462f70]
 possible=any(raw[i]==0xe8 and s['address']+i+5+struct.unpack_from('<i',raw,i+1)[0] in targets for i in range(len(raw)-4))
 if not possible:continue
 for ins in md.disasm(raw,s['address']):
  if ins.mnemonic=='call' and ins.op_str in [hex(t) for t in targets]:lines.append(f'CALLER {s["name"]} {ins.address:#x} {ins.op_str}')
addr=0x44147f+7+0xeadc06
lines.append(f'CREATE EVENT {addr:#x} {bytes_at(addr,100).split(bytes([0]))[0]!r}')
Path('output/beam-motion-research/p2p-reference-control.txt').write_text('\n'.join(lines),encoding='utf-8')
print('\n'.join(lines))

