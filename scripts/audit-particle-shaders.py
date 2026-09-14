"""Read exact stock particle shaders and ELF blend lookup table, without executing NWN."""
from pathlib import Path
import hashlib,json,struct
import capstone
GAME=Path('C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights')
OUT=Path('C:/Projects/New Folder/beam-appearance-audit-2026-09-10')
OUT.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
elfpath=GAME/'bin/linux-x86/nwmain-linux';elf=elfpath.read_bytes()
assert sha(elf)=='6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700'
off=struct.unpack_from('<Q',elf,40)[0];size,count,_=struct.unpack_from('<HHH',elf,58)
sections=[struct.unpack_from('<IIQQQQIIQQ',elf,off+i*size) for i in range(count)]
address=0x12f5040
section=next(s for s in sections if s[1]!=8 and s[3]<=address and address+12<=s[3]+s[5])
pos=section[4]+address-section[3];values=struct.unpack_from('<3I',elf,pos)
assert values==(0x302,0x303,1)
resources=[]
for keypath in [GAME/'data/nwn_base.key',GAME/'data/nwn_retail.key']:
    raw=keypath.read_bytes();assert raw[:8]==b'KEY V1  '
    bc,kc,bo,ko=struct.unpack_from('<4I',raw,8)
    for i in range(kc):
        pos=ko+22*i;name=raw[pos:pos+16].split(b'\0')[0].decode('ascii').lower()
        if name not in ('fsparticle','vsparticle','inc_standard','inc_framebuffer','inc_tonemap','inc_lighting','inc_keyhole','inc_fog','inc_transform','inc_displacement','inc_target','inc_common','inc_shared','inc_material'):continue
        typ,rid=struct.unpack_from('<HI',raw,pos+16)
        _,no,nl,_=struct.unpack_from('<IIHH',raw,bo+12*(rid>>20))
        filename=raw[no:no+nl].split(b'\0')[0].decode('ascii').replace('\\','/')
        bif=GAME/filename
        if not bif.exists():bif=GAME/'data'/filename
        with bif.open('rb') as f:
            head=f.read(20);assert head[:8]==b'BIFFV1  '
            count,fixed,table=struct.unpack_from('<III',head,8);idx=rid&0xfffff;assert idx<count
            f.seek(table+idx*16);rrid,offset,length,rtyp=struct.unpack('<4I',f.read(16));assert rtyp==typ and rrid&0xfffff==idx
            f.seek(offset);data=f.read(length);assert len(data)==length
        path=OUT/f'{keypath.stem}-{name}-{typ}.txt';path.write_bytes(data)
        resources.append(dict(name=name,type=typ,key=str(keypath),keySha256=sha(raw),bif=str(bif),offset=offset,size=length,sha256=sha(data),path=str(path)))
report=dict(nativeExecution=False,elf=dict(path=str(elfpath),sha256=sha(elf)),blendTranslationTable=dict(address=hex(address),bytes=elf[section[4]+address-section[3]:section[4]+address-section[3]+12].hex(),values=values,names=['GL_SRC_ALPHA','GL_ONE_MINUS_SRC_ALPHA','GL_ONE']),resources=resources)
md=capstone.Cs(capstone.CS_ARCH_X86,capstone.CS_MODE_64)
checks=[]
for addr,expected in [
    (0x4aab76,'mov dword ptr [rbx + 0x64], 0'),
    (0x4ad8d0,'mov esi, 1'),(0x4ad8d5,'xor edi, edi'),(0x4ad8d7,'call 0x45cdf0'),
    (0x4af038,'mov esi, 2'),(0x4af03d,'xor edi, edi'),(0x4af048,'call 0x45cdf0'),
    (0x4cb0fd,'jmp 0x3fc560'),
    (0x4c63fc,'mov dword ptr [rdi + 0x90], 0'),(0x4c6406,'mov dword ptr [rdi + 0x94], 1'),
    (0x4c59b1,'jne 0x4c59d0'),
]:
    sec=next(s for s in sections if s[1]!=8 and s[3]<=addr and addr+16<=s[3]+s[5])
    pos=sec[4]+addr-sec[3];ins=next(md.disasm(elf[pos:pos+16],addr))
    actual=ins.mnemonic+' '+ins.op_str;assert actual==expected,(hex(addr),actual,expected)
    checks.append(dict(address=hex(addr),instruction=actual,bytes=ins.bytes.hex()))
report['instructionAssertions']=checks
(OUT/'shader-manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
