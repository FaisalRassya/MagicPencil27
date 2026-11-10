var A = ptr(ADDR_HERE), out = [];
for (var o = 0; o < SIZE_HERE; o += 16) { var s = ''; for (var j = 0; j < 16; j++) { var b = A.add(o + j).readU8(); s += (b < 16 ? '0' : '') + b.toString(16) + ' '; } out.push('+' + o.toString(16) + ': ' + s); }
return out;
