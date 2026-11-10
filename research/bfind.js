// find byte pattern in FM heap: node bfind.js 69,6a,65 [stride]
const scan = require('./heapscan_bytes_lib.js');
const pat = process.argv[2].split(',').map(x => parseInt(x, 16)); const stride = +(process.argv[3] || 1);
const hits = scan(pat, stride, 200);
console.log(hits.length); for (const h of hits.slice(0, 60)) console.log('0x' + h.toString(16));
