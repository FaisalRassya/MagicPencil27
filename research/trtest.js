// trtest.js — replay one training session change through the in-game hook
const t = require(require('path').join(__dirname, '..', 'hook/tvdecode.js'));
const hookctl = require(require('path').join(__dirname, '..', 'hookctl.js'));
const REF = process.env.REF || '052030303101000000203031310900000064697547b56407006d756848ef3302016d61655457020018';
const [date, slot, cur, next] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const ev = { begin: 1222759635, select: 1483633258, confirm: 3824478846, commit: 4108082463, cancel: 4108082471 };
const sel = t.encTV({ t: 10, f: 1, v: { CqMA: { t: 32, f: 1, v: t.gameDate(date) }, Rk7U: { t: 2, f: 1, v: slot }, OQjn: { t: 17, f: 1, v: cur } } }).toString('hex');
const conf = t.encTV({ t: 10, f: 1, v: { OQjn: { t: 17, f: 1, v: next } } }).toString('hex');
const end = t.encTV({ t: 34, f: 1, v: [['110 ', 0]] }).toString('hex');
const mode = process.argv[6] || 'commit';
const cmds = [`send ${ev.begin} ${REF} ${sel}`, `send ${ev.select} ${REF} ${sel}`, `send ${ev.confirm} ${REF} ${conf}`, `send ${ev[mode]} ${REF} ${end}`];
(async () => { console.log(cmds.join('\n')); console.log(await hookctl.run(['log on', ...cmds, 'log off'])); })().catch(e => console.error('ERR', e.message));
