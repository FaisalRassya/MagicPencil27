// trsweep.js — write a sequence of session ids into given dates (3 slots each) to learn id->name mapping
const t = require(require('path').join(__dirname, '..', 'hook/tvdecode.js'));
const hookctl = require(require('path').join(__dirname, '..', 'hookctl.js'));
const REF = '052030303101000000203031310900000064697547b56407006d756848ef3302016d61655457020018';
const ev = { begin: 1222759635, select: 1483633258, confirm: 3824478846, commit: 4108082463 };
const dates = process.argv[2].split(','); let id = +process.argv[3];
const cmds = [];
const plan = [];
for (const d of dates) for (let s = 0; s < 3; s++) { if (id > 127) break;
  const sel = t.encTV({ t: 10, f: 1, v: { CqMA: { t: 32, f: 1, v: t.gameDate(d) }, Rk7U: { t: 2, f: 1, v: s }, OQjn: { t: 17, f: 1, v: id } } }).toString('hex');
  const conf = t.encTV({ t: 10, f: 1, v: { OQjn: { t: 17, f: 1, v: id } } }).toString('hex');
  const end = t.encTV({ t: 34, f: 1, v: [['110 ', 0]] }).toString('hex');
  cmds.push(`send ${ev.begin} ${REF} ${sel}`, `send ${ev.select} ${REF} ${sel}`, `send ${ev.confirm} ${REF} ${conf}`, `send ${ev.commit} ${REF} ${end}`);
  plan.push(`${d} S${s + 1} = ${id}`); id++;
}
(async () => { console.log(plan.join('\n')); const r = await hookctl.run(cmds, 30000); console.log(r.log.slice(-2)); })().catch(e => console.error('ERR', e.message));
