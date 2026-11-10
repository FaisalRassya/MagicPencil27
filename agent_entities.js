
// =====================================================================
// Generic entities: Staff, Human Manager, Officials, Competitions,
// Nations, Stadiums.
//   Staff offsets: memory-layout facts, verified live (see PROVENANCE.md).
//   Officials / Competitions / Nations / Stadiums: found in this project
//   by RTTI-scanning the db arrays/pools next to the player array and
//   checking values against known records (see README v6).
// (This block is appended to agent.js by server.js at load time.)
// =====================================================================
var HM_SHIFT = 0x340;

function ptrVector(name) {
  var a = rva(name);
  var b = a.readPointer();
  var e = a.add(8).readPointer();
  return { n: e.sub(b).toInt32() / 8, at: function (i) { return b.add(i * 8).readPointer(); } };
}
// Pool header: +0x00 vector of chunk pointers, +0x24 u32 count, +0x28 u32 object size.
function poolOf(name) {
  var h = rva(name);
  var c0 = h.readPointer().readPointer();
  var n = h.add(0x24).readU32();
  var stride = h.add(0x28).readU32();
  return { n: n, at: function (i) { return c0.add(i * stride); } };
}
function isHumanManager(o) {
  try { var vt = resolveRvas().hmVtable; return !!vt && o.readPointer().equals(vt); } catch (e) { return false; }
}
function derefName(objPtrAddr, nameOff) {
  try { var o = objPtrAddr.readPointer(); if (o.isNull()) return ''; return readFmString(o.add(nameOff)); } catch (e) { return ''; }
}

function F(k, l, t, o, min, max, extra) {
  var f = { k: k, l: l, t: t, o: o, min: min, max: max };
  if (extra) for (var x in extra) f[x] = extra[x];
  return f;
}
function encList(pairs) { return pairs.map(function (p) { return F(p[0], p[1], 'enc', p[2], 1, 20); }); }
function u8List(pairs, extra) { return pairs.map(function (p) { return F(p[0], p[1], 'u8', p[2], 1, 20, extra); }); }

var STAFF_GROUPS = [
  { title: 'Ability & Reputation', box: true, fields: [
    F('ca', 'Current Ability', 'u16', 0xDA, 1, 200), F('pa', 'Potential Ability', 'u16', 0xDC, 1, 200),
    F('home_rep', 'Home Rep', 'u16', 0xD4, 0, 10000), F('current_rep', 'Current Rep', 'u16', 0xD6, 0, 10000),
    F('world_rep', 'World Rep', 'u16', 0xD8, 0, 10000)] },
  { title: 'Contract & Personal', box: true, fields: [
    F('wage', 'Wage (£ / week)', 'u32', 0x20, 0, 100000000, { p: 0x1A8 }),
    F('expiry', 'Contract Expiry', 'date', 0x48, null, null, { p: 0x1A8 }),
    F('dob', 'Date of Birth', 'date', 0x188, null, null, { sh: true })] },
  { title: 'Coaching', fields: encList([['attacking', 'Attacking', 0x32], ['defending', 'Defending', 0x33],
    ['fitness', 'Fitness', 0x34], ['goalkeeping', 'Goalkeepers', 0x2B], ['possession', 'Possession', 0x35],
    ['tactical', 'Tactical', 0x37], ['technical', 'Technical', 0x36], ['set_pieces', 'Set Pieces', 0x43]])
    .concat([F('youngsters', 'Working With Youngsters', 'u8', 0x1C, 1, 20)]) },
  { title: 'Mental', fields: [F('authority', 'Authority', 'u8', 0x14, 1, 20)].concat(encList([
    ['determination', 'Determination', 0x1D], ['motivating', 'Motivating', 0x2F], ['people_mgmt', 'Man Management', 0x2E]])) },
  { title: 'Knowledge', fields: encList([['judge_ability', 'Judging Player Ability', 0x2C],
    ['judge_potential', 'Judging Player Potential', 0x2D], ['judge_staff', 'Judging Staff Ability', 0x42],
    ['negotiating', 'Negotiating', 0x41], ['tactical_knowl', 'Tactical Knowledge', 0x31], ['data_analysis', 'Analysing Data', 0x3C]]) },
  { title: 'Medical', fields: encList([['physiotherapy', 'Physiotherapy', 0x30], ['sports_science', 'Sports Science', 0x3F]]) },
  { title: 'Tactical Style', fields: u8List([['ts_attacking', 'Attacking', 0x10], ['def_line', 'Defensive Line', 0x23],
    ['directness', 'Directness', 0x13], ['flexibility', 'Flexibility', 0x25], ['tempo', 'Tempo', 0x28],
    ['width', 'Width', 0x29], ['trigger_press', 'Trigger Press', 0x1A], ['rotation', 'Squad Rotation', 0x27],
    ['hardness', 'Training Hardness', 0x26]]).concat(encList([['dirtiness', 'Dirtiness', 0x38], ['versatility', 'Versatility', 0x3B]])) },
  { title: 'Board Relations', fields: u8List([['buying_players', 'Buying Players', 0x1E], ['business', 'Business', 0x11],
    ['interference', 'Interference', 0x16], ['mind_games', 'Mind Games', 0x1F], ['patience', 'Patience', 0x19],
    ['resources', 'Resources', 0x1B]]) },
  { title: 'Personality', fields: u8List([['adaptability', 'Adaptability', 0x170], ['ambition', 'Ambition', 0x171],
    ['loyalty', 'Loyalty', 0x172], ['pressure', 'Pressure', 0x173], ['professionalism', 'Professionalism', 0x174],
    ['sportsmanship', 'Sportsmanship', 0x175], ['temperament', 'Temperament', 0x176], ['controversy', 'Controversy', 0x177]], { sh: true }) },
];

var OFFICIAL_GROUPS = [
  { title: 'Ability & Reputation', box: true, fields: [
    F('ca', 'Current Ability', 'u16', 0x11C, 1, 200), F('pa', 'Potential Ability', 'u16', 0x11E, 1, 200),
    F('rep', 'Reputation', 'u16', 0x120, 0, 10000), F('dob', 'Date of Birth', 'date', 0x60)] },
  { title: 'Referee Attributes (labels not shown by FM; order unconfirmed)', fields: u8List([
    ['attr1', 'Attribute 1', 0x122], ['attr2', 'Attribute 2', 0x123], ['attr3', 'Attribute 3', 0x124],
    ['attr4', 'Attribute 4', 0x125], ['attr5', 'Attribute 5', 0x126], ['attr6', 'Attribute 6', 0x127],
    ['attr7', 'Attribute 7', 0x128]]) },
  { title: 'Personality', fields: u8List([['adaptability', 'Adaptability', 0x48], ['ambition', 'Ambition', 0x49],
    ['loyalty', 'Loyalty', 0x4A], ['pressure', 'Pressure', 0x4B], ['professionalism', 'Professionalism', 0x4C],
    ['sportsmanship', 'Sportsmanship', 0x4D], ['temperament', 'Temperament', 0x4E], ['controversy', 'Controversy', 0x4F]]) },
];

var COMP_GROUPS = [
  { title: 'Reputation', box: true, fields: [
    F('rep', 'Reputation (0-200)', 'u16', 0x188, 0, 200), F('orig_rep', 'Original Reputation', 'u16', 0x18A, 0, 200)] },
  { title: 'Pitch Rules (0.1 m units, 1050 = 105.0 m)', box: true, fields: [
    F('min_len', 'Min Pitch Length', 'u16', 0x164, 500, 1500), F('min_wid', 'Min Pitch Width', 'u16', 0x166, 300, 1000),
    F('max_len', 'Max Pitch Length', 'u16', 0x168, 500, 1500), F('max_wid', 'Max Pitch Width', 'u16', 0x16A, 300, 1000)] },
  { title: 'Season (read-only)', box: true, fields: [
    F('season_start', 'Season Start', 'date', 0x148, null, null, { ro: true }),
    F('season_end', 'Season End', 'date', 0x14C, null, null, { ro: true })] },
];

var NATION_GROUPS = [
  { title: 'Info (read-only: editable nation fields are not mapped yet)', box: true, fields: [
    F('ranking', 'World Ranking (probable)', 'u16', 0x27A, 0, 300, { p: 0x108, ro: true })] },
];

var STADIUM_GROUPS = [
  { title: 'Capacity', box: true, fields: [
    F('capacity', 'Capacity', 'u32', 0x7C, 0, 200000), F('seating', 'Seating Capacity', 'u32', 0x80, 0, 200000),
    F('used_capacity', 'Used Capacity', 'u32', 0x84, 0, 200000), F('expansion', 'Expansion Capacity', 'u32', 0x8C, 0, 250000)] },
  { title: 'Pitch (0.1 m units)', box: true, fields: [
    F('pitch_len', 'Pitch Length', 'u16', 0x98, 500, 1500), F('pitch_wid', 'Pitch Width', 'u16', 0x9A, 300, 1000)] },
];

function staffName(o) {
  var s = isHumanManager(o) ? HM_SHIFT : 0;
  var n = readFmString(o.add(0x140 + s));
  if (n) return n;
  var common = readNameSub(o.add(0x160 + s));
  if (common) return common;
  return (readNameSub(o.add(0x150 + s)) + ' ' + readNameSub(o.add(0x158 + s))).trim();
}
function eachPtr(rva, cb) { var v = ptrVector(rva); for (var i = 0; i < v.n; i++) { var o = v.at(i); if (!o.isNull() && cb(o) === false) return; } }
function eachPool(rva, cb) { var p = poolOf(rva); for (var i = 0; i < p.n; i++) if (cb(p.at(i)) === false) return; }

var KINDS = {
  staff: {
    groups: STAFF_GROUPS, shiftable: true,
    each: function (cb) { eachPtr('staff', cb); },
    name: staffName,
    sub: function (o) { return (isHumanManager(o) ? 'Human Manager · ' : '') + 'CA ' + o.add(0xDA).readU16() + '/PA ' + o.add(0xDC).readU16(); },
    chips: function (o) {
      var s = isHumanManager(o) ? HM_SHIFT : 0, out = [];
      if (s) out.push('Human Manager');
      var nat = derefName(o.add(0x168 + s), 0x18); if (nat) out.push(nat);
      try {
        var c = o.add(0x1A8 + s).readPointer();
        if (!c.isNull()) { var club = c.add(0x10).readPointer().add(0x30).readPointer(); var cn = readFmString(club.add(0xC0)); if (cn) out.push(cn); }
      } catch (e) {}
      return out;
    },
  },
  officials: {
    groups: OFFICIAL_GROUPS,
    each: function (cb) { eachPtr('officials', cb); },
    name: function (o) { var c = readNameSub(o.add(0x38)); if (c) return c; return (readNameSub(o.add(0x28)) + ' ' + readNameSub(o.add(0x30))).trim(); },
    sub: function (o) { return 'CA ' + o.add(0x11C).readU16() + '/PA ' + o.add(0x11E).readU16() + ' · Rep ' + o.add(0x120).readU16(); },
    chips: function (o) { var n = derefName(o.add(0x40), 0x18); return n ? [n] : []; },
  },
  competitions: {
    groups: COMP_GROUPS,
    each: function (cb) { eachPool('comps', cb); },
    name: function (o) { return readFmString(o.add(0x40)); },
    sub: function (o) { return readFmString(o.add(0x50)) + ' · Rep ' + o.add(0x188).readU16(); },
    chips: function (o) { return [readFmString(o.add(0x48)), readFmString(o.add(0x50))].filter(Boolean); },
  },
  nations: {
    groups: NATION_GROUPS,
    each: function (cb) { eachPool('nations', cb); },
    name: function (o) { return readFmString(o.add(0x18)); },
    sub: function (o) { return readFmString(o.add(0x28)); },
    chips: function (o) {
      var out = [readFmString(o.add(0x28))];
      var st = derefName(o.add(0x118), 0x40); if (st) out.push('Stadium: ' + st);
      return out.filter(Boolean);
    },
  },
  stadiums: {
    groups: STADIUM_GROUPS,
    each: function (cb) { eachPool('stadiums', cb); },
    name: function (o) { return readFmString(o.add(0x40)); },
    sub: function (o) { return 'Capacity ' + o.add(0x7C).readU32(); },
    chips: function (o) { var alt = readFmString(o.add(0x48)); return alt ? [alt] : []; },
  },
};
KINDS.manager = {
  groups: STAFF_GROUPS, shiftable: true,
  each: function (cb) { KINDS.staff.each(function (o) { if (isHumanManager(o)) return cb(o); }); },
  name: staffName, sub: KINDS.staff.sub, chips: KINDS.staff.chips,
};

function kindOf(kind) { var k = KINDS[kind]; if (!k) throw new Error('unknown entity kind: ' + kind); return k; }
function findField(k, key) {
  for (var g = 0; g < k.groups.length; g++)
    for (var i = 0; i < k.groups[g].fields.length; i++)
      if (k.groups[g].fields[i].k === key) return k.groups[g].fields[i];
  return null;
}
function fieldAddr(k, base, f) {
  var s = (k.shiftable && isHumanManager(base)) ? HM_SHIFT : 0;
  if (f.p !== undefined) {
    var sub = base.add(f.p + s).readPointer();
    if (sub.isNull()) return null;
    return sub.add(f.o);
  }
  return base.add(f.o + (f.sh ? s : 0));
}
function readField(f, a) {
  switch (f.t) {
    case 'enc': return decodeAttr(a.readU8());
    case 'u8': return a.readU8();
    case 'u16': return a.readU16();
    case 'u32': return a.readU32();
    case 'date': var d = readDate(a); return d.notSet ? null : d.iso;
  }
  throw new Error('bad type ' + f.t);
}
function writeField(f, a, v) {
  if (f.t === 'date') { if (!v) throw new Error('date required'); writeDate(a, v); return; }
  v = Math.round(Number(v));
  if (isNaN(v)) throw new Error('not a number');
  if (f.min != null && v < f.min) v = f.min;
  if (f.max != null && v > f.max) v = f.max;
  switch (f.t) {
    case 'enc': a.writeU8(encodeAttr(v)); return;
    case 'u8': a.writeU8(v); return;
    case 'u16': a.writeU16(v); return;
    case 'u32': a.writeU32(v); return;
  }
}

rpc.exports.listEntities = function (kind, q, limit) {
  var k = kindOf(kind);
  limit = limit || 30;
  q = (q || '').toLowerCase();
  var out = [];
  k.each(function (o) {
    var nm = '';
    try { nm = k.name(o); } catch (e) { return; }
    if (!nm) return;
    if (q && nm.toLowerCase().indexOf(q) === -1) return;
    var sub = '';
    try { sub = k.sub(o); } catch (e) {}
    out.push({ address: o.toString(), name: nm, sub: sub });
    if (out.length >= limit) return false;
  });
  return out;
};

rpc.exports.readEntity = function (kind, addrStr) {
  var k = kindOf(kind);
  var o = ptr(addrStr);
  var res = { address: addrStr, kind: kind, name: k.name(o), chips: [], groups: [] };
  try { res.chips = k.chips(o); } catch (e) {}
  k.groups.forEach(function (g) {
    var fields = [];
    g.fields.forEach(function (f) {
      var a = null, v = null;
      try { a = fieldAddr(k, o, f); if (a) v = readField(f, a); } catch (e) { a = null; }
      fields.push({ key: f.k, label: f.l, type: f.t, value: v, min: f.min, max: f.max, ro: !!f.ro || !a, missing: !a });
    });
    res.groups.push({ title: g.title, box: !!g.box, fields: fields });
  });
  return res;
};

rpc.exports.setEntityField = function (kind, addrStr, key, value) {
  var k = kindOf(kind);
  var f = findField(k, key);
  if (!f) throw new Error('unknown field ' + key);
  if (f.ro) throw new Error(f.l + ' is read-only');
  var o = ptr(addrStr);
  var a = fieldAddr(k, o, f);
  if (!a) throw new Error('this record has no ' + f.l + ' data');
  writeField(f, a, value);
  return { ok: true, field: key, value: readField(f, a) };
};
