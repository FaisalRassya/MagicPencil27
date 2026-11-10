// training_builder.js — turn a planner schedule into FM27 interop commands (verified on Game Pass 0.9.2409)
// Event flow per slot (same as clicking in Training > Overview, week card):
//   BeginTrainingWeekEditFromCard + SelectTrainingSession {CqMA:GameDate, Rk7U:slot, OQjn:session}
//   ConfirmTrainingSessionFromCard {OQjn:session}, CommitTrainingWeekFromCard [("110 ",0)]
const t = require('./tvdecode.js');
const EV = { begin: 1222759635, select: 1483633258, confirm: 3824478846, commit: 4108082463 };
// session ids, read from the game UI (Training picker clicks + calendar after writes)
const SESSION_IDS = {
  'Passing Style': 0, 'Build Up': 1, 'Chance Creation': 2, 'In Possession Shape': 3, 'Line of Engagement': 4,
  'Pressing Intensity': 5, 'Pressing Trap': 6, 'Out Of Possession Shape': 7,
  'Press Avoidance': 100, 'Ball Progression': 101, 'Final Third': 102, 'Defensive Block': 103, 'Defensive Positioning': 104,
  'Defensive Engagement': 105, 'Corners': 106, 'Free Kicks': 107, 'Penalties': 108,
  'Individual Development': 200,
  'Rest': 300, 'Recovery': 301, 'Light Conditioning': 302, 'Conditioning': 303, 'Heavy Conditioning': 304,
  'Team Bonding': 400, 'Community Outreach': 401,
};
const num = (v) => v <= 127 ? { t: 17, f: 1, v } : { t: 18, f: 1, v };
function slotCommands(ref, date, slot, id) {
  const sel = t.encTV({ t: 10, f: 1, v: { CqMA: { t: 32, f: 1, v: t.gameDate(date) }, Rk7U: { t: 2, f: 1, v: slot }, OQjn: num(id) } }).toString('hex');
  const conf = t.encTV({ t: 10, f: 1, v: { OQjn: num(id) } }).toString('hex');
  const end = t.encTV({ t: 34, f: 1, v: [['110 ', 0]] }).toString('hex');
  return [`send ${EV.begin} ${ref} ${sel}`, `send ${EV.select} ${ref} ${sel}`, `send ${EV.confirm} ${ref} ${conf}`, `send ${EV.commit} ${ref} ${end}`];
}
// plan: { days: [{ date, slots: [name|null, name|null, name|null] }] } ; returns { cmds, skipped }
module.exports = function build(tpl, plan) {
  const cmds = [], skipped = [];
  for (const d of plan.days || []) (d.slots || []).forEach((name, slot) => {
    if (!name || name === 'MATCH' || name === 'Travel') return;
    const id = SESSION_IDS[name];
    if (id == null) { skipped.push(`${d.date} S${slot + 1} ${name}`); return; }
    cmds.push(...slotCommands(tpl.ref, d.date, slot, id));
  });
  return { cmds, skipped };
};
module.exports.SESSION_IDS = SESSION_IDS;
module.exports.EV = EV;
