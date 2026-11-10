var X = rpc.exports; X.getSaveInfo();
var names = ['wildsmith', 'prempeh-murray', 'quinlan', 'onyedinma'];
function dates(a, len) {
  var out = [];
  for (var i = 0; i + 4 <= len; i += 2) {
    try { var y = a.add(i + 2).readU16(); if (y !== 2027 && y !== 2026) continue; var w = a.add(i).readU16(), d = w & 0x1FF; if (d >= 1 && d <= 366) out.push('+' + i.toString(16) + ':' + y + '/' + d + (w >> 9 ? 'f' + (w >> 9) : '')); } catch (e) { break; }
  }
  return out;
}
var res = {};
names.forEach(function (n) {
  var p = ptr(X.findPlayersByName(n, 1)[0].address), r = [];
  for (var off = 0; off < 0x420; off += 8) {
    var v; try { v = p.add(off).readPointer(); } catch (e) { continue; }
    if (v.isNull() || inModule(v) || v.compare(ptr('0x10000000000')) < 0) continue;
    var cls = null; try { if (inModule(v.readPointer())) cls = rttiName(v); } catch (e) {}
    if (cls && /ACTUAL_PLAYER|TEAM@|CLUB@|NATION@|CITY@/.test(cls)) continue;
    var d1 = dates(v, 0x80);
    var line = '+0x' + off.toString(16) + (cls ? ' ' + cls : '') + ' direct[' + d1.join(' ') + ']';
    try { var e = p.add(off + 8).readPointer(), nb = e.sub(v).toInt32(); if (nb > 0 && nb < 0x2000) { line += ' vecbytes ' + nb; var f = v.readPointer(); if (!f.isNull() && !inModule(f)) line += ' first->[' + dates(f, 0x60).join(' ') + ']'; } } catch (e2) {}
    if (d1.length || line.indexOf('first->[+') >= 0) r.push(line);
  }
  res[n] = r;
});
return res;
