from pathlib import Path
import struct,json
b=Path('C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights/bin/linux-x86/nwmain-linux').read_bytes()
assert b[:6]==b'\x7fELF\x02\x01'
o=struct.unpack_from('<Q',b,40)[0];z,n,ns=struct.unpack_from('<HHH',b,58)
sec=[struct.unpack_from('<IIQQQQIIQQ',b,o+i*z) for i in range(n)]
names=b[sec[ns][4]:sec[ns][4]+sec[ns][5]]
def cstr(data,o):return data[o:data.index(b'\0',o)].decode('utf-8','replace')
syms=[]
for s in sec:
 if s[1] not in (2,11):continue
 strings=sec[s[6]];t=b[strings[4]:strings[4]+strings[5]]
 for i in range(s[4],s[4]+s[5],s[9]):
  ni,info,other,shndx,addr,size=struct.unpack_from('<IBBHQQ',b,i);name=cstr(t,ni)
  if addr and size:syms.append({'name':name,'address':addr,'size':size,'section':shndx})
for s in syms:
 if ('P2P' in s['name'] or ('PartEmitter' in s['name'] and any(k in s['name'] for k in ['Update','Move','moveParticle','Initialize']))):print(s)
Path('output/beam-motion-research/elf-symbols.json').write_text(json.dumps(syms),encoding='utf-8')
# Resolve the called PLT slot at 0x3fbe40 using ELF relocations.
for s in sec:
 if cstr(names,s[0]) in ['.rela.plt','.plt','.dynsym','.dynstr']:print(cstr(names,s[0]),s)
import capstone
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64)
def bytes_at(addr,size):
 s=next(s for s in sec if s[3]<=addr< s[3]+s[5]);off=s[4]+addr-s[3];return b[off:off+size]
selected=[s for s in syms if s['name']=='_ZN11PartEmitter10InitializeEv'][:1]
byaddr={s['address']:s['name'] for s in syms}
text=[]
for s in selected:
 text.append(s['name'])
 for ins in md.disasm(bytes_at(s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic in ['call','lea','mov']:
   for addr,name in byaddr.items():
    if hex(addr) in ins.op_str and ('Emitter' in name or ins.mnemonic=='call'):line+=' ; '+name
  text.append(line)
plt=next(s for s in sec if cstr(names,s[0])=='.plt');rela=next(s for s in sec if cstr(names,s[0])=='.rela.plt');dyn=sec[rela[6]];dt=sec[dyn[6]];strings=b[dt[4]:dt[4]+dt[5]]
index=(0x3fbe40-plt[3])//16-1;_,info,_=struct.unpack_from('<QQq',b,rela[4]+index*24);no=struct.unpack_from('<I',b,dyn[4]+(info>>32)*24)[0];text.append('PLT 0x3fbe40 = '+cstr(strings,no))
Path('output/beam-motion-research/p2p-initialize.asm.txt').write_text('\n'.join(text),encoding='utf-8');print('\n'.join(text))
requested=['_ZN14MdlNodeEmitter17IsPointToPointSelEv','_ZN14MdlNodeEmitter14IsPointToPointEv','_ZN3Gob13PlayAnimationEPKcfif','_ZN3Gob24SetSynchronizeAnimationsEb','_Z22CreateReferenceObjectsP3GobP4Part','_ZN3Gob7AnimateEf']
lines=[]
for name in requested:
 s=next(s for s in syms if s['name']==name);lines.append('\n'+name)
 for ins in md.disasm(bytes_at(s['address'],s['size']),s['address']):
  line=f'{ins.address:#x} {ins.mnemonic} {ins.op_str}'
  if ins.mnemonic=='call' and ins.op_str.startswith('0x'):line+=' ; '+byaddr.get(int(ins.op_str,16),'')
  if ins.mnemonic=='lea' and 'rip' in ins.op_str:
   try:
    delta=int(ins.op_str.split('rip')[1].strip(' []').replace(' ',''),16);target=ins.address+ins.size+delta
    if target in byaddr:line+=' ; '+byaddr[target]
   except ValueError:pass
  lines.append(line)
Path('output/beam-motion-research/p2p-reference-animation.asm.txt').write_text('\n'.join(lines),encoding='utf-8')
print('\n'.join(lines[:330]))
vt=next(s for s in syms if s['name']=='_ZTV3Gob')
for off in [0x38,0xa0,0x148,0x1a8,0x2a0,0x2c8,0x2d0]:
 addr=struct.unpack('<Q',bytes_at(vt['address']+16+off,8))[0];print(hex(off),hex(addr),byaddr.get(addr))
