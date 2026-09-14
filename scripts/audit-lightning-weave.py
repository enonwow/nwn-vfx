"""Read-only bounded audit of the existing retail Lightning update path."""
from pathlib import Path
import json,hashlib,capstone
loader=Path(__file__).with_name('audit-multi-emitter-callbacks.py').read_text()
exec(loader[:loader.index('selected=')])
out=Path('output/beam-multistrand-0282/lightning-audit');out.mkdir(parents=True,exist_ok=True)
names={a:name for name,(a,_) in symbols.items()};md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64);records=[]
for name in ['_ZN16LightningEmitter10InitializeEv','_ZN16LightningEmitter6UpdateEf']:
 a,n=symbols[name];lines=[]
 for i in md.disasm(at(a,n),a):
  line=f'{i.address:#x} {i.mnemonic} {i.op_str}'
  if i.mnemonic=='call' and i.op_str.startswith('0x'):line+=' ; '+names.get(int(i.op_str,16),'')
  lines.append(line)
 data=('\n'.join(lines)+'\n').encode();p=out/(name+'.asm.txt');p.write_bytes(data)
 records.append(dict(symbol=name,address=hex(a),size=n,file=p.name,sha256=hashlib.sha256(data).hexdigest()))
(out/'manifest.json').write_text(json.dumps(dict(elf=str(elf),sha256=digest,functions=records,nativeExecuted=False),indent=2))
print(json.dumps(dict(output=str(out),functions=records),indent=2))
