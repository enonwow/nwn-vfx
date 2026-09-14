"""Read-only retail ELF extraction; never runs the inspected native program."""
from pathlib import Path
import struct,json,hashlib,capstone
elf=Path('C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights/bin/linux-x86/nwmain-linux')
b=elf.read_bytes();digest=hashlib.sha256(b).hexdigest()
assert digest=='6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700'
offset=struct.unpack_from('<Q',b,40)[0];size,count=struct.unpack_from('<HH',b,58)
sections=[struct.unpack_from('<IIQQQQIIQQ',b,offset+i*size) for i in range(count)]
def at(addr,length):
    s=next(s for s in sections if s[1]!=8 and s[3]<=addr and addr+length<=s[3]+s[5]);o=s[4]+addr-s[3];return b[o:o+length]
symbols={}
for s in sections:
    if s[1] not in (2,11):continue
    strings=sections[s[6]];t=b[strings[4]:strings[4]+strings[5]]
    for o in range(s[4],s[4]+s[5],s[9]):
        ni,_,_,_,addr,n=struct.unpack_from('<IBBHQQ',b,o)
        if addr and n:symbols[t[ni:t.index(b'\0',ni)].decode()]=(addr,n)
selected=[n for n in symbols if n.startswith(('_ZN3Gob','_ZN10CAurObject','_ZN8CallBack')) and any(k in n for k in ['RegisterCallback','DoEvent','DeregisterCallback','CallBackC1'])]
selected+=['_Z16SetEmitterTargetP10CAurObjectPKcPv','_ZN3Gob17ReattachReferenceEP10CAurObjectPKc','_ZN11PartEmitter10InitializeEv','_ZN16LightningEmitter10InitializeEv']
callback_addr=struct.unpack('<Q',at(symbols['_ZTV3Gob'][0]+16+0x58,8))[0]
selected+= [n for n,(a,_) in symbols.items() if a==callback_addr][:1]
out=Path('output/beam-composite-0281/multi-emitter-audit');out.mkdir(parents=True,exist_ok=True)
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64);names={a:n for n,(a,_) in symbols.items()};manifest=[]
for name in selected:
    a,n=symbols[name];lines=[f'{name} address={a:#x} size={n}']
    for i in md.disasm(at(a,n),a):
        line=f'{i.address:#x} {i.mnemonic} {i.op_str}'
        if i.mnemonic=='call' and i.op_str.startswith('0x'):line+=' ; '+names.get(int(i.op_str,16),'')
        lines.append(line)
    data=('\n'.join(lines)+'\n').encode();path=out/(name+'.asm.txt');path.write_bytes(data)
    manifest.append(dict(symbol=name,address=hex(a),size=n,path=str(path),sha256=hashlib.sha256(data).hexdigest()))
(out/'manifest.json').write_text(json.dumps(dict(elf=str(elf),sha256=digest,functions=manifest,nativeExecuted=False),indent=2))
print(json.dumps([dict(symbol=x['symbol'],address=x['address'],size=x['size']) for x in manifest],indent=2))
