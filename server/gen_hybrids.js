// 混合档生成: 以 FCEUX 正常档为底, 按组替换成 web 导出的字段, 定位致坏字段组
const zlib = require('zlib');
const fs = require('fs');

const WEB = 'D:/phpstudy_pro/domains/TSZY2/web/';
const OUT = 'D:/phpstudy_pro/domains/TSZY2/web/';

function parseFcsx(f) {
  const buf = fs.readFileSync(f);
  const raw = zlib.inflateSync(buf.subarray(16));
  const chunks = [];
  let off = 0;
  while (off + 5 <= raw.length) {
    const type = raw[off], size = raw.readUInt32LE(off + 1);
    if (off + 5 + size > raw.length) break;
    const d = raw.subarray(off + 5, off + 5 + size);
    const entries = [];
    let o = 0;
    while (o + 8 <= d.length) {
      let k = ''; for (let i = 0; i < 4; i++) { if (!d[o + i]) break; k += String.fromCharCode(d[o + i]); }
      const s = d.readUInt32LE(o + 4);
      entries.push({ desc: k, data: d.subarray(o + 8, o + 8 + s) });
      o += 8 + s;
    }
    chunks.push({ type, entries });
    off += 5 + size;
  }
  return { chunks };
}
function buildFcsx(parsed) {
  const parts = [];
  let total = 0;
  for (const c of parsed.chunks) {
    let size = 0;
    for (const e of c.entries) size += 8 + e.data.length;
    const head = Buffer.alloc(5);
    head[0] = c.type; head.writeUInt32LE(size, 1);
    const body = Buffer.alloc(size);
    let o = 0;
    for (const e of c.entries) {
      const d = Buffer.alloc(8);
      for (let i = 0; i < 4; i++) d[i] = i < e.desc.length ? e.desc.charCodeAt(i) : 0;
      d.writeUInt32LE(e.data.length, 4);
      body.set(d, o); o += 8;
      body.set(e.data, o); o += e.data.length;
    }
    parts.push(head, body);
    total += 5 + size;
  }
  const stream = Buffer.concat(parts);
  const compressed = zlib.deflateSync(stream);
  const out = Buffer.alloc(16 + compressed.length);
  out.write('FCSX', 0, 'latin1');
  out.writeUInt32LE(total, 4);
  out.writeUInt32LE(0, 8);
  out.writeUInt32LE(compressed.length, 12);
  compressed.copy(out, 16);
  return out;
}
// 字段索引
function indexFields(p) {
  const m = {};
  for (const c of p.chunks) for (const e of c.entries) m[e.desc] = e.data;
  return m;
}
const WORK = parseFcsx(WEB + 'fceux_work.fc0');
const BRKN = parseFcsx(WEB + 'web_broken.fc0');
const WI = indexFields(BRKN);

// 组定义: desc -> 是否取 web 值
const GROUPS = {
  h_all:  () => true,                                                            // 全部换 web (应复现花屏)
  h_cpu:  (d) => ['PC', 'A', 'X', 'Y', 'S', 'P', 'DB'].includes(d),
  h_cpuc: (d) => ['JAMM', 'IQLB', 'ICoa', 'ICou', 'TSBS', 'MooP'].includes(d),
  h_ppu:  (d) => ['PPUR', 'RADD', 'TADD', 'XOFF', 'VTGL', 'VBUF', 'KOOK', 'DEAD', 'PSPL', 'PGEN', 'IDLS',
                  'PFVx', 'PVxx', 'PHxx', 'PVTx', 'PHTx', 'P_FV', 'P_Vx', 'P_Hx', 'P_VT', 'P_HT', 'PFHx', 'PSxx',
                  'PST0', 'PST1', 'PST2', 'SR_0', 'SR_1', 'SR_2', 'SR_3', 'SR_4', 'SR_5', 'SR_6',
                  'SRx0', 'SRx1', 'SRx2', 'SRx3', 'SRx4', 'SRx5', 'SRx6', 'SRx7'].includes(d),
  h_ram:  (d) => d === 'RAM',
  h_wram: (d) => d === 'WRAM' || d === 'M5KX',
  h_chr:  (d) => d === 'CHRR' || d === 'NTAR' || d === 'PRAM' || d === 'SPRA',
  h_regs: (d) => ['REGS', 'CMD', 'A000', 'A001', 'KTEX'].includes(d),
  h_irq:  (d) => ['IRQR', 'IRQC', 'IRQL', 'IRQA'].includes(d),
  h_ctrl: (d) => ['JYRB', 'JOYS', 'LSTS', 'ZBG0', 'ZBG1', 'LAGF', 'LAGC', 'FRAM'].includes(d),
  h_snd:  (d) => ['FHCN', 'FCNT', 'PSG', 'ENCH', 'IQFM', 'NREG', 'TRIM', 'TRIC', 'E0SP', 'E1SP', 'E2SP',
                  'E0MO', 'E1MO', 'E2MO', 'E0D1', 'E1D1', 'E2D1', 'E0DV', 'E1DV', 'E2DV', 'LEN0', 'LEN1', 'LEN2',
                  'LEN3', 'SWEE', 'CRF1', 'CRF2', 'SWCT', 'SIRQ', '5ACC', '5BIT', '5ADD', '5SIZ', '5SHF',
                  '5HVD', '5HVS', '5SZL', '5ADL', '5FMT', 'RWDA'].includes(d),
  // 全部换但排除 CTRL/SND (验证组合效应)
  h_all2: (d) => !['JYRB', 'JOYS', 'LSTS', 'ZBG0', 'ZBG1', 'LAGF', 'LAGC', 'FRAM',
                   'FHCN', 'FCNT', 'PSG', 'ENCH', 'IQFM', 'NREG', 'TRIM', 'TRIC', 'E0SP', 'E1SP', 'E2SP',
                   'E0MO', 'E1MO', 'E2MO', 'E0D1', 'E1D1', 'E2D1', 'E0DV', 'E1DV', 'E2DV', 'LEN0', 'LEN1', 'LEN2',
                   'LEN3', 'SWEE', 'CRF1', 'CRF2', 'SWCT', 'SIRQ', '5ACC', '5BIT', '5ADD', '5SIZ', '5SHF',
                   '5HVD', '5HVS', '5SZL', '5ADL', '5FMT', 'RWDA'].includes(d),
};

for (const [name, pred] of Object.entries(GROUPS)) {
  const h = JSON.parse(JSON.stringify(WORK, (k, v) => v, 1));  // deep-ish copy
  // 手工深拷贝 (Buffer 需保留)
  const clone = (p) => ({
    chunks: p.chunks.map(c => ({ type: c.type, entries: c.entries.map(e => ({ desc: e.desc, data: e.data })) }))
  });
  const H = clone(WORK);
  let swapped = [];
  for (const c of H.chunks) {
    for (const e of c.entries) {
      if (pred(e.desc) && WI[e.desc]) {
        e.data = WI[e.desc];
        swapped.push(e.desc);
      }
    }
  }
  fs.writeFileSync(OUT + name + '.fc0', buildFcsx(H));
  console.log(name + ': 换入 ' + swapped.join(','));
}
console.log('done');
