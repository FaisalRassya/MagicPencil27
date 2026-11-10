var X = rpc.exports; X.getSaveInfo();
var out = {};
['wildsmith', 'prempeh-murray', 'boyd-munce'].forEach(function (n) {
  var p = ptr(X.findPlayersByName(n, 1)[0].address), o = {};
  for (var off = 0x188; off <= 0x1c0; off += 8) o['+' + off.toString(16)] = p.add(off).readPointer().toString();
  var b = p.add(0x1a0).readPointer(), e = p.add(0x1a8).readPointer();
  var rows = [];
  var n12 = Math.min(40, Math.floor(Number(e.sub(b).toInt32()) / 12));
  o.vec1a0 = { bytes: e.sub(b).toInt32() };
  for (var i = 0; i < 24; i++) {
    var a = b.add(i * 12), s = '';
    for (var j = 0; j < 12; j++) { var x = a.add(j).readU8(); s += (x < 16 ? '0' : '') + x.toString(16); }
    var w = a.readU16(), y = a.add(2).readU16();
    rows.push(s + '  date ' + y + '/' + (w & 0x1FF) + ' f' + (w >> 9) + '  u16s ' + [a.add(4).readU16(), a.add(6).readU16(), a.add(8).readU16(), a.add(10).readU16()].join(','));
  }
  o.rows = rows;
  out[n] = o;
});
return out;
