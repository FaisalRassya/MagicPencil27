// Probe loader: load agent sources + extra probe code against the live process.
const native = require(require('path').join(__dirname, '..', 'native.js'));
const fs = require('fs'), path = require('path');
const TOOL = require('path').join(__dirname, '..', '');
module.exports = function run(probeCode) {
  const pid = native.findFmPid();
  const target = new native.Target(pid);
  const rt = native.makeRuntime(target);
  const src = ['agent.js', 'agent_entities.js', 'agent_medical.js', 'agent_extra.js', 'agent_extra2.js'].map(f => fs.readFileSync(TOOL + f, 'utf8')).join('\n')
    + '\nrpc.exports.__probe = function (arg) {\n' + probeCode + '\n};';
  const rpc = { exports: {} };
  new Function('ptr', 'Process', 'rpc', 'NativePointer', src)(rt.ptr, rt.Process, rpc, rt.NP);
  try { return rpc.exports.__probe(); } finally { target.close(); }
};
if (require.main === module) {
  const out = module.exports(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
}
