"""Bounded, read-only retail shader-state audit. Does not execute the game."""
from pathlib import Path
import json, struct, hashlib, capstone
loader=Path(__file__).with_name('audit-multi-emitter-callbacks.py').read_text()
exec(loader[:loader.index('selected=')])
out=Path('output/beam-composite-0281/alpha-discard-audit');out.mkdir(parents=True,exist_ok=True)
selected=['_ZN8GLRender6EnableEN6Aurora17AuroraEnableEnumsE','_ZN8GLRender7DisableEN6Aurora17AuroraEnableEnumsE','_ZN8GLRender22GetCustomShaderProgramEPKcS1_bS1_','_ZN8GLRender10LoadShaderERNS_10PROG_FIXEDEPKcS3_bS3_','_ZN8GLRender11SetUniformsERNS_10PROG_FIXEDE']
names={a:name for name,(a,_) in symbols.items()};md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64);md.detail=True;records=[]
selected+=['_ZN8GLRender26LoadAndCompileSingleShaderEiPKcb','_ZN8GLRender17ConnectShaderDataERNS_10PROG_FIXEDE']
for name in selected:
 a,n=symbols[name];lines=[f'{name} address={a:#x} size={n}']
 for i in md.disasm(at(a,n),a):
  line=f'{i.address:#x} {i.mnemonic} {i.op_str}'
  if i.mnemonic in ('call','jmp') and i.op_str.startswith('0x'):line+=' ; '+names.get(int(i.op_str,16),'')
  for op in i.operands:
   if op.type==capstone.x86.X86_OP_MEM and op.mem.base==capstone.x86.X86_REG_RIP:
    addr=i.address+i.size+op.mem.disp;line+=f' ; RIP={addr:#x}'
    try:
     raw=at(addr,128);ss=raw.split(b'\0')[0]
     if ss and all(32<=c<127 or c in (9,10,13) for c in ss):line+=f' str={ss!r}'
     if op.size==4:line+=f' f32={struct.unpack("<f",raw[:4])[0]}'
    except (StopIteration,struct.error):pass
  lines.append(line)
 data=('\n'.join(lines)+'\n').encode();path=out/(name+'.asm.txt');path.write_bytes(data)
 records.append(dict(symbol=name,address=hex(a),size=n,file=path.name,sha256=hashlib.sha256(data).hexdigest()))
jumps=[dict(table=hex(t),entries=[dict(enum=i,address=hex(t+struct.unpack('<i',at(t+4*i,4))[0])) for i in range(3)]) for t in [0x12f4d40,0x12f4d98]]
preamble=at(0x12f3fd0,1024).split(b'\0')[0];(out/'shader-preamble.txt').write_bytes(preamble)
primary=Path('C:/Projects/New Folder/beam-appearance-audit-2026-09-10')
sources=[dict(path=str(primary/f),sha256=hashlib.sha256((primary/f).read_bytes()).hexdigest()) for f in ['shader-manifest.json','emitter-render.asm.txt','emitter-blend.asm.txt','nwn_retail-fsparticle-2069.txt','nwn_retail-inc_common-2069.txt']]
(out/'manifest.json').write_text(json.dumps(dict(elf=str(elf),sha256=digest,nativeExecuted=False,functions=records,enableDisableJumpTables=jumps,shaderPreamble=dict(address='0x12f3fd0',file='shader-preamble.txt',sha256=hashlib.sha256(preamble).hexdigest()),primarySources=sources),indent=2))
print(json.dumps(dict(output=str(out),functions=len(records),nativeExecuted=False)))
