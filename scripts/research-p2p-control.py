import runpy,contextlib,io
with contextlib.redirect_stdout(io.StringIO()):d=runpy.run_path('scripts/research-p2p-elf.py')
for name in ['_ZN16MdlNodeReference15InternalControlEP4Partfff','_Z20ExpandReferencePartsP4Part']:
 s=next(s for s in d['syms'] if s['name']==name);print(name)
 for ins in d['md'].disasm(d['bytes_at'](s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+d['byaddr'].get(int(ins.op_str,16),'')
  print(line)
