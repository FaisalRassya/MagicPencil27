// tactic_reader.js — read the user's active FM27 tactic (team instructions) through the in-game hook.
// While capture is on, fmhook logs native->UI data responses (RESP). Opening Tactics > Team Instructions makes
// FM send one record with the 18 active In-Possession options and one with the 9 Out-of-Possession options,
// as TacticTeamInstructionOptions ids (u32 typed values). Verified against the user's screens (Game Pass 0.9.2409).
const fs = require('fs'), path = require('path'), os = require('os');
const hookctl = require('./hookctl');
const OPTS = require('./hook/tactic_options.json'); // id -> enum name (from GameAssembly metadata)
const DATA = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MagicPencil27');
const OUT = path.join(DATA, 'tactic.json');

// enum name -> [instruction label as shown in FM27, option label]
const MAP = {
  PassingStyleMuchShorter: ['Passing Directness', 'Much Shorter'], PassingStyleShorter: ['Passing Directness', 'Shorter'], PassingDirectnessNone: ['Passing Directness', 'Standard'], PassingStyleMoreDirect: ['Passing Directness', 'More Direct'], PassingStyleMuchMoreDirect: ['Passing Directness', 'Much More Direct'],
  MuchLowerTempo: ['Tempo', 'Much Lower'], LowerTempo: ['Tempo', 'Lower'], TempoNone: ['Tempo', 'Standard'], HigherTempo: ['Tempo', 'Higher'], MuchHigherTempo: ['Tempo', 'Much Higher'],
  SetupMuchNarrowerInPossession: ['Attacking Width', 'Much Narrower'], SetupNarrowerInPossession: ['Attacking Width', 'Narrower'], TeamWidthNone: ['Attacking Width', 'Standard'], SetupWiderInPossession: ['Attacking Width', 'Wider'], SetupMuchWiderInPossession: ['Attacking Width', 'Much Wider'],
  AttackTransitionHoldShape: ['Attacking Transition', 'Hold Shape'], AttackingTransitionNone: ['Attacking Transition', 'Balanced'], AttackTransitionCounter: ['Attacking Transition', 'Counter-Attack'],
  BeMoreDisciplined: ['Creative Freedom', 'More Disciplined'], CreativeFreedomNone: ['Creative Freedom', 'Balanced'], BeMoreExpressive: ['Creative Freedom', 'More Expressive'],
  WasteTimeLessOften: ['Time Wasting', 'Less Often'], WasteTimeStandard: ['Time Wasting', 'Standard'], WasteTimeMoreOften: ['Time Wasting', 'More Often'],
  PlayForSetPiecesNone: ['Play for Set Pieces', 'Keep Ball in Play'], PlayForSetPieces: ['Play for Set Pieces', 'Play for Set Pieces'],
  HitEarlyCrosses: ['Patience', 'Less Patient'], PatienceNone: ['Patience', 'Standard'], WorkBallIntoBox: ['Patience', 'More Patient'],
  ShotsFromDistanceStayPatient: ['Shots from Distance', 'Discourage'], ShotsFromDistanceNone: ['Shots from Distance', 'Balanced'], ShotsFromDistanceShootOnSight: ['Shots from Distance', 'Encourage'],
  CrossingNone: ['Crossing Style', 'Balanced'], FloatCrosses: ['Crossing Style', 'Floated'], WhippedCrosses: ['Crossing Style', 'Whipped'], LowCrosses: ['Crossing Style', 'Low'],
  DribbleLess: ['Dribbling', 'Discourage'], DribblingNone: ['Dribbling', 'Balanced'], RunAtDefence: ['Dribbling', 'Encourage'],
  LookForUnderlapNone: ['Supporting Runs', 'Balanced'], LookForUnderlapLeft: ['Supporting Runs', 'Left'], LookForUnderlapRight: ['Supporting Runs', 'Right'], LookForUnderlapBoth: ['Supporting Runs', 'Both'],
  ProgressThroughNone: ['Progress Through', 'Balanced'], FocusPlayDownTheMiddle: ['Progress Through', 'Central'], FocusPlayDownTheLeftFlank: ['Progress Through', 'Left'], FocusPlayDownTheRightFlank: ['Progress Through', 'Right'], FocusPlayDownBothFlanks: ['Progress Through', 'Both Flanks'],
  PassingReceptionIntoFeet: ['Pass Reception', 'To Feet'], PassReceptionNone: ['Pass Reception', 'Balanced'], PassingReceptionIntoSpace: ['Pass Reception', 'Into Space'],
  PlayThroughPress: ['Build-Up Strategy', 'Play Through Press'], BuildUpStrategyNone: ['Build-Up Strategy', 'Balanced'], BypassPress: ['Build-Up Strategy', 'Bypass Press'],
  GoalKicksShort: ['Goal Kicks', 'Short'], GoalKicksNone: ['Goal Kicks', 'Mixed'], GoalKicksLong: ['Goal Kicks', 'Long'],
  GKDistributionPaceSlow: ['GK Distribution (Speed)', 'Slower'], GKDistributionPaceNone: ['GK Distribution (Speed)', 'Balanced'], GKDistributionPaceQuick: ['GK Distribution (Speed)', 'Quicker'],
  GKDistributionTargetNone: ['GK Distribution', 'Balanced'], GKDistributionTargetCentrebacks: ['GK Distribution', 'Center-Backs'], GKDistributionTargetFullbacks: ['GK Distribution', 'Full-Backs'], GKDistributionTargetFlanks: ['GK Distribution', 'Flanks'], GKDistributionTargetPlaymaker: ['GK Distribution', 'Playmaker'], GKDistributionTargetTargetman: ['GK Distribution', 'Target Forward'], GKDistributionTargetClearOppositionDefence: ['GK Distribution', 'Over the Defence'],
  LineOfEngagementLow: ['Line of Engagement', 'Low Block'], LineOfEngagementMid: ['Line of Engagement', 'Mid Block'], LineOfEngagementHigh: ['Line of Engagement', 'High Press'],
  DefensiveLineMuchDeeper: ['Defensive Line', 'Much Lower'], DefensiveLineDeeper: ['Defensive Line', 'Lower'], DefensiveLineStandard: ['Defensive Line', 'Standard'], DefensiveLineHigherDefensiveLine: ['Defensive Line', 'Higher'], DefensiveLineMuchHigher: ['Defensive Line', 'Much Higher'],
  HoldLine: ['Defensive Line Behaviour', 'Step Up More'], DefensiveLineSecondaryStandard: ['Defensive Line Behaviour', 'Balanced'], DropOff: ['Defensive Line Behaviour', 'Drop Off More'],
  PressingIntensityMuchLower: ['Trigger Press', 'Much Less Often'], PressingIntensityLower: ['Trigger Press', 'Less Often'], PressingIntensityNone: ['Trigger Press', 'Standard'], PressingIntensityHigher: ['Trigger Press', 'More Often'], PressingIntensityMuchHigher: ['Trigger Press', 'Much More Often'],
  DefenceTransitionRegroup: ['Defensive Transition', 'Regroup'], DefensiveTransitionNone: ['Defensive Transition', 'Balanced'], DefenceTransitionCounterpress: ['Defensive Transition', 'Counter-Press'],
  StayOnFeet: ['Tackling', 'Stay On Feet'], TacklingNone: ['Tackling', 'Standard'], GetStuckIn: ['Tackling', 'Get Stuck In'],
  PreventShortGKDistribution: ['Short Goalkeeper Distribution', 'Yes'], PreventShortGKDistributionNone: ['Short Goalkeeper Distribution', 'No'],
  PressingTrapIn: ['Pressing Trap', 'Trap Inside'], PressingTrapNone: ['Pressing Trap', 'Balanced'], PressingTrapOut: ['Pressing Trap', 'Trap Outside'],
  CrossStop: ['Cross Engagement', 'Stop Crosses'], CrossEngagementNone: ['Cross Engagement', 'Balanced'], CrossInvite: ['Cross Engagement', 'Invite Crosses'],
};
const STYLES = ['Control Possession', 'Gegenpress', 'Vertical Tiki-Taka', 'Tiki-Taka', 'Wing Play', 'Route One', 'Fluid Counter-Attack', 'Direct Counter-Attack', 'Catenaccio', 'Park The Bus'];

function optionsIn(buf) { // u32 option ids stored as TypedValue [01 02 u32]
  const out = [];
  for (let i = 2; i + 4 <= buf.length; i++) if (buf[i - 2] === 1 && buf[i - 1] === 2) { const n = OPTS[buf.readUInt32LE(i)]; if (n && MAP[n]) out.push(n); }
  return out;
}
function parse(lines) {
  let ip = null, oop = null, name = null;
  for (const l of lines) {
    const m = l.match(/^\S+ RESP keys\[\d+\]=\w* items\[\d+\]=(\w+)/); if (!m) continue;
    const b = Buffer.from(m[1].replace(/\.+$/, ''), 'hex');
    const s = b.toString('latin1').match(/\d-\d-\d[\w\- ]{0,60}/); if (s) name = s[0].trim();
    const o = optionsIn(b); if (o.length < 6) continue;
    const fams = new Map(); for (const n of o) if (!fams.has(MAP[n][0])) fams.set(MAP[n][0], MAP[n][1]);
    if (fams.has('Passing Directness') && fams.has('Tempo') && fams.size >= 12) ip = fams;
    if (fams.has('Line of Engagement') && fams.has('Trigger Press') && fams.size >= 6) oop = fams;
  }
  if (!ip && !oop) return null;
  const formation = name ? name.split(' - ')[0].trim() : null;
  const style = name ? STYLES.find(x => name.toLowerCase().includes(x.toLowerCase())) || null : null;
  return { name, formation, style, inPossession: ip ? Object.fromEntries(ip) : null, outOfPossession: oop ? Object.fromEntries(oop) : null, complete: !!(ip && oop), readAt: new Date().toISOString() };
}

let cap = null; // { dir, from, t0 }
async function start() {
  const st = await hookctl.ensure();
  await hookctl.run(['resp all']);
  cap = { dir: st.dir, from: fs.statSync(path.join(st.dir, 'fmhook.log')).size, t0: Date.now() };
  return { ok: true };
}
async function stop() { cap = null; try { await hookctl.run(['resp off']); } catch (e) {} }
async function poll() {
  if (!cap) return { capturing: false, tactic: current() };
  const p = path.join(cap.dir, 'fmhook.log'); const fd = fs.openSync(p, 'r'); const size = fs.fstatSync(fd).size;
  const b = Buffer.alloc(size - cap.from); fs.readSync(fd, b, 0, b.length, cap.from); fs.closeSync(fd);
  const t = parse(b.toString('latin1').split('\n'));
  if (t && t.complete) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(t, null, 1)); await stop(); return { capturing: false, done: true, tactic: t }; }
  if (Date.now() - cap.t0 > 120000) { await stop(); return { capturing: false, timeout: true, partial: t }; }
  return { capturing: true, partial: t };
}
function current() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return null; } }
module.exports = { start, stop, poll, current, parse, MAP };
if (require.main === module) console.log(JSON.stringify(parse(fs.readFileSync(process.argv[2], 'latin1').split('\n')), null, 1));
