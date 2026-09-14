"""Read-only beam audit. Writes evidence; never runs the inspected executables."""
from pathlib import Path
import argparse, bisect, hashlib, json, re, struct
import capstone

ROOT = Path('C:/Projects/New Folder')
ELF = Path('C:/Program Files (x86)/Steam/steamapps/common/Neverwinter Nights/bin/linux-x86/nwmain-linux')
p = argparse.ArgumentParser()
p.add_argument('--output', type=Path, default=ROOT / 'beam-audit-2026-09-10')
p.add_argument('--symbols', nargs='*', default=[])
p.add_argument('--list-symbols', action='store_true')
p.add_argument('--string-refs', nargs='*', default=[])
p.add_argument('--cfunctions', nargs='*', default=[])
p.add_argument('--tag', default='evidence')
a = p.parse_args()
OUT = a.output
OUT.mkdir(parents=True, exist_ok=True)
b = ELF.read_bytes()
assert b[:6] == b'\x7fELF\x02\x01'
off = struct.unpack_from('<Q', b, 40)[0]
size, count, nameidx = struct.unpack_from('<HHH', b, 58)
sections = [struct.unpack_from('<IIQQQQIIQQ', b, off+i*size) for i in range(count)]
def cstr(data, offset):
    return data[offset:data.index(b'\0', offset)].decode('utf-8', 'replace')
names = b[sections[nameidx][4]:sections[nameidx][4]+sections[nameidx][5]]
named = {cstr(names, s[0]): s for s in sections}
def read(addr, length):
    s = next(s for s in sections if s[1] != 8 and s[3] <= addr and addr+length <= s[3]+s[5])
    pos = s[4]+addr-s[3]
    return b[pos:pos+length]
symbols = {}
for s in sections:
    if s[1] not in (2, 11): continue
    strings = sections[s[6]]
    strings = b[strings[4]:strings[4]+strings[5]]
    for pos in range(s[4], s[4]+s[5], s[9]):
        ni, info, other, shndx, addr, length = struct.unpack_from('<IBBHQQ', b, pos)
        if addr and length:
            symbols[cstr(strings, ni)] = dict(address=addr, size=length, type=info & 15)
byaddr = {s['address']: n for n, s in symbols.items()}
if a.string_refs:
    # Bounded x86-64 RIP-relative LEA scan, not a claim about all possible xrefs.
    ro, tx = named['.rodata'], named['.text']
    literals, code = read(ro[3],ro[5]), read(tx[3],tx[5])
    targets = {}
    for value in a.string_refs:
        start = 0
        while (found := literals.find(value.encode()+b'\0', start)) >= 0:
            targets[ro[3]+found] = value
            start = found+1
    functions = sorted((s['address'],s['size'],n) for n,s in symbols.items() if s['type']==2)
    starts = [f[0] for f in functions]
    rows = []
    for match in re.finditer(rb'[\x40-\x4f]\x8d[\x05\x0d\x15\x1d\x25\x2d\x35\x3d].{4}', code, re.S):
        addr = tx[3]+match.start()
        target = addr+7+struct.unpack_from('<i', match[0], 3)[0]
        if target not in targets: continue
        owner = functions[bisect.bisect_right(starts,addr)-1]
        rows.append({'address':hex(addr), 'target':hex(target), 'literal':targets[target],
                     'function':owner[2] if addr<owner[0]+owner[1] else None, 'bytes':match[0].hex()})
    result = {'sourceSha256':hashlib.sha256(b).hexdigest(), 'scan':'RIP-relative LEA instructions only', 'references':rows}
    (OUT/(a.tag+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))
    raise SystemExit(0)
if a.list_symbols:
    selected = [{'symbol':n, 'address':hex(s['address']), 'size':s['size']}
                for n,s in sorted(symbols.items(), key=lambda x:x[1]['address'])
                if s['type']==2 and any(q in n for q in a.symbols)]
    print(json.dumps({'sourceSha256':hashlib.sha256(b).hexdigest(), 'symbols':selected}))
    raise SystemExit(0)
rela, plt, dyn = named['.rela.plt'], named['.plt'], named['.dynsym']
ds = sections[dyn[6]]
ds = b[ds[4]:ds[4]+ds[5]]
for i, pos in enumerate(range(rela[4], rela[4]+rela[5], rela[9])):
    _, info, _ = struct.unpack_from('<QQq', b, pos)
    ni = struct.unpack_from('<I', b, dyn[4]+(info>>32)*dyn[9])[0]
    byaddr[plt[3]+16*(i+1)] = cstr(ds, ni)+'@plt'
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
md.detail = True
out = []
for n, s in sorted(symbols.items(), key=lambda x:x[1]['address']):
    if s['type'] != 2 or not any(q in n for q in a.symbols): continue
    out.append(f'\n{n} address={s["address"]:#x} size={s["size"]}')
    for ins in md.disasm(read(s['address'], s['size']), s['address']):
        hints = []
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_IMM:
                if op.imm in byaddr: hints.append(byaddr[op.imm])
                if ins.mnemonic.startswith('mov') and op.size in (2, 4, 8) and 0 <= op.imm < 2**(8*op.size):
                    raw = op.imm.to_bytes(op.size,'little')
                    if len(raw.rstrip(b'\0')) >= 2 and all(32 <= c < 127 for c in raw.rstrip(b'\0')):
                        hints.append('ASCII-immediate='+repr(raw))
            if op.type == capstone.x86.X86_OP_MEM and op.mem.base == capstone.x86.X86_REG_RIP:
                target = ins.address+ins.size+op.mem.disp
                hints.append(f'RIP={target:#x}')
                if target in byaddr: hints.append(byaddr[target])
                try:
                    raw = read(target, 64).split(b'\0')[0]
                    if len(raw) >= 2 and all(32 <= c < 127 for c in raw): hints.append('str='+repr(raw))
                    if 'ss' in ins.mnemonic: hints.append('f32='+str(struct.unpack('<f',read(target,4))[0]))
                except StopIteration: pass
        out.append(f'{ins.address:#x} {ins.mnemonic} {ins.op_str}' + (' ; '+', '.join(hints) if hints else ''))
    if 'ApplyHardCodedVisualEffect' in n:
        base = 0x81a9aa+7+0xb0a267
        for idx in (7,12):
            out.append(f'switch index {idx} -> {base+struct.unpack("<i",read(base+idx*4,4))[0]:#x}')
if out:
    dst = OUT / (a.tag+'.asm.txt')
    dst.write_text('\n'.join(out), encoding='utf-8')
    print(json.dumps({'path':str(dst),'lines':len(out)}))
cpath = ROOT / 'export/decompiled_all.c'
c = cpath.read_text(encoding='utf-8')
matches = list(re.finditer(r'^[^\n;{}]*\b(FUN_[0-9a-f]+)\([^;{}]*\)\s*\n\s*\{', c, re.M))
newlines = [i for i,char in enumerate(c) if char == '\n']
index = [{'name':m[1], 'line':bisect.bisect_left(newlines,m.start())+1,'offset':m.start()} for m in matches]
if a.cfunctions:
    parts = []
    for i,m in enumerate(matches):
        if m[1] not in a.cfunctions: continue
        end = c.index('\n}', m.end())+2
        text = c[m.start():end]
        line = index[i]['line']
        parts.append('\n'+ '\n'.join(f'{line+j}: {t}' for j,t in enumerate(text.splitlines())))
    dst = OUT / (a.tag+'.toolset.c.txt')
    dst.write_text('\n'.join(parts), encoding='utf-8')
    print(json.dumps({'path':str(dst),'functions':len(parts)}))
(OUT/'toolset-function-index.json').write_text(json.dumps(index), encoding='utf-8')
manifest = {'inputs':[{'path':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in (ELF,cpath,ROOT/'export/functions.tsv',ROOT/'export/strings.tsv',ROOT/'item-retail-extract/nss/nwscript.nss')], 'executablesRun':False, 'toolsetExportIsGameClient':False}
(OUT/'inputs.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
vtables = []
for name in ['_ZTV3Gob','_ZTV10CNWCObject','_ZTV12CNWCCreature','_ZTV4Part','_ZTV13PartReference','_ZTV8Particle']:
    s = symbols.get(name)
    if not s: continue
    for delta in [0x18,0x20,0x30,0x38,0x58,0x78,0xa0,0xa8,0xc8,0xd0,0x148,0x158,0x180,0x238,0x298,0x2a0,0x2d8]:
        if 16+delta+8 > s['size']: continue
        target = struct.unpack('<Q',read(s['address']+16+delta,8))[0]
        vtables.append({'vtable':name,'slot':hex(delta),'address':hex(target),'symbol':byaddr.get(target)})
(OUT/'virtual-call-targets.json').write_text(json.dumps(vtables,indent=2),encoding='utf-8')
print(json.dumps({'indexedToolsetFunctions':len(index)}))
