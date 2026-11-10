const fs = require('fs');
const t = require(require('path').join(__dirname, '..', 'hook/tvdecode.js'));
const f = process.argv[2];
const r = JSON.parse(fs.readFileSync(f, 'utf8'));
const names = { 1222759635: 'BeginWeekEditFromCard', 1483633258: 'SelectSession', 3824478846: 'ConfirmSessionFromCard', 4108082471: 'CancelWeekEditFromCard', 4108082463: 'CommitWeekFromCard', 1999913557: 'TakeControlGeneralThisOnce', 829782071: 'TakeControlAllGeneral', 1382896754: 'RemoveTrainingForcedScreen', 1869444196: 'ConfirmSession', 846022770: 'ConfirmSessionFromMenu' };
for (const l of r.lines) {
  let m = l.match(/^(\S+) EVENT id=(\d+) to\[\d+\]=(\w*) data\[\d+\]=(\w*)/);
  if (m) { console.log(m[1], 'EV ', names[m[2]] || m[2], JSON.stringify(t.decodeRef(m[3])), JSON.stringify(t.decodeData(m[4])).slice(0, 600)); continue; }
  m = l.match(/^(\S+) NEVENT id=(\d+) data\[\d+\]=(\w*)/);
  if (m) { console.log(m[1], 'NEV', m[2], JSON.stringify(t.decodeData(m[3])).slice(0, 400)); continue; }
  m = l.match(/^(\S+) RESP keys\[(\d+)\]=(\w*) items\[(\d+)\]=(\w*)/);
  if (m) { const b = Buffer.from(m[5].replace(/\.\.\.$/, ''), 'hex'); const strs = (b.toString('latin1').match(/[\x20-\x7e]{4,}/g) || []); console.log(m[1], 'RESP keys', m[2], 'bytes', m[4], strs.slice(0, 60).join(' | ')); }
}
