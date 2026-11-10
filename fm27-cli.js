#!/usr/bin/env node
// FM27 Memory Editor - CLI
// Usage:
//   node fm27-cli.js player find-uid <uid>
//   node fm27-cli.js player find-name <substring>
//   node fm27-cli.js player show <address>
//   node fm27-cli.js player set <address> <field> <value>
//   node fm27-cli.js club find-name <substring>
//   node fm27-cli.js club show <address>
//   node fm27-cli.js club set <address> <field> <value>
//
// Requires FM27 (fm.exe) to be running with a save loaded.

const native = require('./native'); // ReadProcessMemory/WriteProcessMemory backend (no Frida)

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }
  const [entity, action, ...rest] = args;

  const pid = native.findFmPid();
  if (!pid) {
    console.error('fm.exe not found. Is Football Manager 27 running?');
    process.exit(1);
  }
  const api = native.attach(pid);

  try {
    await api.ping();
  } catch (e) {
    console.error('Failed to talk to FM27 process:', e.message);
    process.exit(1);
  }

  if (entity === 'player') {
    await handlePlayer(api, action, rest);
  } else if (entity === 'club') {
    await handleClub(api, action, rest);
  } else {
    printUsage();
  }

  api.__close();
}

async function findFmPid(device) {
  const processes = await device.enumerateProcesses();
  const p = processes.find(p => p.name.toLowerCase() === 'fm.exe');
  return p ? p.pid : null;
}

async function handlePlayer(api, action, rest) {
  if (action === 'find-uid') {
    const uid = parseInt(rest[0], 10);
    const result = await api.findPlayerByUid(uid);
    console.log(result ? JSON.stringify(result, null, 2) : 'Not found.');
  } else if (action === 'find-name') {
    const needle = rest[0];
    const results = await api.findPlayersByName(needle, 25);
    console.log(`Found ${results.length} (showing up to 25):`);
    for (const r of results) console.log(`  ${r.address}  UID ${r.uid}  ${r.name}`);
  } else if (action === 'show') {
    const addr = rest[0];
    const p = await api.readPlayer(addr);
    console.log(`${p.name}  (UID ${p.uid})`);
    console.log(`CA: ${p.ca}  PA: ${p.pa}  Morale: ${p.morale}`);
    console.log('Attributes:');
    const entries = Object.entries(p.attributes).sort();
    for (const [k, v] of entries) console.log(`  ${k.padEnd(20)} ${v}`);
  } else if (action === 'set') {
    const [addr, field, valueStr] = rest;
    const value = parseInt(valueStr, 10);
    const result = await api.setPlayerAttribute(addr, field, value);
    console.log(JSON.stringify(result));
  } else {
    printUsage();
  }
}

async function handleClub(api, action, rest) {
  if (action === 'find-name') {
    const needle = rest[0];
    const results = await api.findClubsByName(needle, 25);
    console.log(`Found ${results.length} (showing up to 25):`);
    for (const r of results) console.log(`  ${r.address}  ${r.name}`);
  } else if (action === 'show') {
    const addr = rest[0];
    const c = await api.readClub(addr);
    console.log(JSON.stringify(c, null, 2));
  } else if (action === 'set') {
    const [addr, field, valueStr] = rest;
    const value = parseInt(valueStr, 10);
    const result = await api.setClubFinance(addr, field, value);
    console.log(JSON.stringify(result));
  } else {
    printUsage();
  }
}

function printUsage() {
  console.log(`
FM27 Memory Editor

  player find-uid <uid>
  player find-name <substring>
  player show <address>
  player set <address> <field> <value>      field = any attribute name, or ca / pa

  club find-name <substring>
  club show <address>
  club set <address> <field> <value>        field = balance / transferBudget / wageBudget / youthGrant

Examples:
  node fm27-cli.js player find-uid 61094101
  node fm27-cli.js player show 0x12560dd2ff8
  node fm27-cli.js player set 0x12560dd2ff8 heading 15
  node fm27-cli.js player set 0x12560dd2ff8 ca 150
  node fm27-cli.js club find-name Spurs
  node fm27-cli.js club set 0x... transferBudget 100000000
`);
}

main().catch(e => { console.error(e); process.exit(1); });
