// watch_snap.js — press Ctrl+F9 anywhere (also inside FM) to take the next snapshot.
// Sequence: a1 b1 c1 a2 b2, then compares and prints candidates. Beeps after each snapshot.
const koffi = require(require('path').join(__dirname, '..', 'node_modules/koffi'));
const { execFileSync } = require('child_process');
const fs = require('fs');
const u32 = koffi.load('user32.dll'), k32 = koffi.load('kernel32.dll');
const GetAsyncKeyState = u32.func('int16 __stdcall GetAsyncKeyState(int)');
const Beep = k32.func('int __stdcall Beep(uint32, uint32)');
const DIR = require('path').join(__dirname, '..', 'research/memdiff_data');
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(DIR + '/' + f);
const seq = (process.argv[2] || 'a1,b1,c1,a2,b2').split(',');
let i = 0, down = false;
const log = (s) => { console.log(new Date().toLocaleTimeString(), s); };
log('ready, waiting for Ctrl+F9 → ' + seq[0]);
const timer = setInterval(() => {
  const pressed = (GetAsyncKeyState(0x78) & 0x8000) && (GetAsyncKeyState(0x11) & 0x8000);
  if (pressed && !down) {
    down = true;
    const l = seq[i];
    const out = execFileSync('node.exe', [__dirname + '/memdiff.js', 'snap', l]).toString().trim();
    log(out); Beep(1200, 150); if (++i < seq.length) log('next: ' + seq[i]);
    if (i >= seq.length) {
      clearInterval(timer); Beep(1600, 120); Beep(1600, 120);
      log(execFileSync('node.exe', [__dirname + '/memdiff.js', 'cmp', ...seq]).toString().trim());
      log('\n' + execFileSync('node.exe', [__dirname + '/memdiff.js', 'show', '80']).toString());
    }
  } else if (!pressed) down = false;
}, 40);
