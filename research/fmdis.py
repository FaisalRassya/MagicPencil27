import sys, capstone
# usage: dis.py <file> <fileOffset hex> [count]  (or rva with --rva and PE mapping)
path = sys.argv[1]; off = int(sys.argv[2], 16); n = int(sys.argv[3]) if len(sys.argv) > 3 else 80
data = open(path, 'rb').read()
import struct
pe = struct.unpack_from('<I', data, 0x3c)[0]
nsec = struct.unpack_from('<H', data, pe + 6)[0]; optsz = struct.unpack_from('<H', data, pe + 20)[0]
secs = []
for i in range(nsec):
    s = pe + 24 + optsz + i * 40
    vs, va, rs, ro = struct.unpack_from('<IIII', data, s + 8)
    secs.append((va, vs, ro, rs))
def rva2off(r):
    for va, vs, ro, rs in secs:
        if va <= r < va + max(vs, rs): return r - va + ro
def off2rva(o):
    for va, vs, ro, rs in secs:
        if ro <= o < ro + rs: return o - ro + va
if '--rva' in sys.argv: off = rva2off(off)
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
rva = off2rva(off)
for i, ins in enumerate(md.disasm(data[off:off + 4000], rva)):
    print('%08x  %-8s %s' % (ins.address, ins.mnemonic, ins.op_str))
    if i >= n: break
    if ins.mnemonic in ('ret', 'int3') and '--noret' not in sys.argv and i > 3: break
