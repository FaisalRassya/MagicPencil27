import struct, capstone, sys
path = sys.argv[1]; table = int(sys.argv[2], 16); n = int(sys.argv[3])
data = open(path, 'rb').read()
pe = struct.unpack_from('<I', data, 0x3c)[0]
nsec = struct.unpack_from('<H', data, pe + 6)[0]; optsz = struct.unpack_from('<H', data, pe + 20)[0]
secs = []
for i in range(nsec):
    s = pe + 24 + optsz + i * 40
    vs, va, rs, ro = struct.unpack_from('<IIII', data, s + 8)
    secs.append((va, vs, ro, rs))
def r2o(r):
    for va, vs, ro, rs in secs:
        if va <= r < va + max(vs, rs): return r - va + ro
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
for i in range(n):
    t = struct.unpack_from('<I', data, r2o(table + i * 4))[0]
    o = r2o(t); ins = []
    for k, x in enumerate(md.disasm(data[o:o + 120], t)):
        ins.append(x.mnemonic + ' ' + x.op_str)
        if k >= 7 or x.mnemonic in ('ret', 'jmp'): break
    print('type %2d (0x%02x) -> %x : %s' % (i, i, t, ' | '.join(ins)))
