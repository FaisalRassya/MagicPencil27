// usage: set ADDR and SIZE env via file header replacement
var A = ptr(ADDR_HERE), SIZE = SIZE_HERE;
function cls(o) { try { if (o.isNull()) return null; var vt = o.readPointer(); if (!inModule(vt)) return null; return rttiName(o); } catch (e) { return null; } }
var out = [];
for (var off = 0; off < SIZE; off += 8) {
  var v; try { v = A.add(off).readPointer(); } catch (e) { out.push('+0x' + off.toString(16) + ' <unreadable>'); break; }
  var line = '+0x' + off.toString(16) + ' = ' + v.toString();
  if (!v.isNull() && !inModule(v)) {
    var c = cls(v); if (c) line += '  -> ' + c;
    try {
      var e = A.add(off + 8).readPointer(), n = e.sub(v).toInt32();
      if (n > 0 && n < 0x10000000) {
        var f0 = v.readPointer(); var c2 = cls(f0);
        line += '  [vec? bytes ' + n + (c2 ? ' of ptr ' + c2 + ' n=' + (n / 8) : '') + ']';
        if (!c2) { var c3 = cls(v); if (c3) line += ' inline ' + c3; }
      }
    } catch (x) {}
  } else if (!v.isNull() && inModule(v)) line += '  (module +0x' + v.sub(getModule().base).toString(16) + ')';
  else if (v.isNull()) continue;
  out.push(line);
}
return out;
