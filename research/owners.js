// owners of byte candidates: group by RTTI owner (nearest vtable within 0x1000 back)
const fs=require('fs');const {t,describe}=require('./peek.js');
const st=require('./memdiff_data/result.json');
const by={};
const pages=new Map();
for(const [a,v] of st.out){const A=BigInt('0x'+a); if(A<0x10000000000n) continue;
  if(!(v[0]===v[3]&&v[1]===v[4])) continue;
  let owner='?';
  try{const back=t.read((A&~7n)-0x1000n,0x1008);
    for(let o=0x1000;o>=0;o-=8){const q=back.readBigUInt64LE(o); if(q>0x7ff000000000n){const d=describe(q); if(d.startsWith('VT ')){owner=d.slice(3)+' +0x'+(0x1000-o+Number(A&7n)).toString(16);break;}}}}catch(e){}
  const cls=owner.split(' +')[0]; (by[cls]=by[cls]||[]).push(a+' '+owner.split(' ')[1]+' '+v.join(','));
}
for(const [c,l] of Object.entries(by).sort((a,b)=>a[1].length-b[1].length)) console.log(l.length, c, l.slice(0,4).join(' | '));
t.close();
