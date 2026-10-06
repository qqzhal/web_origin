// 验证档生成: h_sndfix(只换修复后SND) + h_allfix(web全量+修复后SND)
const zlib = require('zlib');
const fs = require('fs');
const WEB = 'D:/phpstudy_pro/domains/TSZY2/web/';

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
function buildFcsx(p) {
  const parts = [];
  let total = 0;
  for (const c of p.chunks) {
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
function idx(p) { const m = {}; for (const c of p.chunks) for (const e of c.entries) m[e.desc] = e.data; return m; }
const clone = (p) => ({ chunks: p.chunks.map(c => ({ type: c.type, entries: c.entries.map(e => ({ desc: e.desc, data: e.data })) })) });

const WORK = parseFcsx(WEB + 'fceux_work.fc0');
const BRKN = parseFcsx(WEB + 'web_broken.fc0');
const WI = idx(BRKN);

// 修复后的 SND 字段（与 fc0conv.js 一致）
function safeSnd() {
  const w4 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; };
  const list = [];
  const add = (d, buf) => list.push({ desc: d, data: buf });
  add('FHCN', w4(357960)); add('FCNT', Buffer.from([0]));
  add('PSG', Buffer.alloc(16)); add('ENCH', Buffer.from([0]));
  add('IQFM', Buffer.from([1])); add('NREG', Buffer.from([1, 0]));
  add('TRIM', Buffer.from([0])); add('TRIC', Buffer.from([0]));
  for (const d of ['E0SP', 'E1SP', 'E2SP', 'E0MO', 'E1MO', 'E2MO', 'E0D1', 'E1D1', 'E2D1', 'E0DV', 'E1DV', 'E2DV']) add(d, Buffer.from([0]));
  add('LEN0', w4(0)); add('LEN1', w4(0)); add('LEN2', w4(0)); add('LEN3', w4(0));
  add('SWEE', Buffer.from([0, 0]));
  add('CRF1', w4(0)); add('CRF2', w4(0));
  add('SWCT', Buffer.from([0, 0]));
  add('SIRQ', Buffer.from([0]));
  add('5ACC', w4(1)); add('5BIT', Buffer.from([0])); add('5ADD', w4(0));
  add('5SIZ', w4(0)); add('5SHF', Buffer.from([0]));
  add('5HVDM', Buffer.from([0])); add('5HVSP', Buffer.from([0]));
  add('5SZL', Buffer.from([0])); add('5ADL', Buffer.from([0])); add('5FMT', Buffer.from([0]));
  add('RWDA', Buffer.from([0]));
  return list;
}
const SND_FIELDS = new Set(safeSnd().map(e => e.desc));

const NO_CTRLSND = new Set(['JYRB', 'JOYS', 'LSTS', 'ZBG0', 'ZBG1', 'LAGF', 'LAGC', 'FRAM'].concat(Array.from(SND_FIELDS)));

// h_sndfix: 只换 SND 为安全默认
{
  const H = clone(WORK);
  const snd = safeSnd();
  const map = {}; snd.forEach(e => map[e.desc] = e.data);
  for (const c of H.chunks) for (const e of c.entries) if (map[e.desc]) e.data = map[e.desc];
  fs.writeFileSync(WEB + 'h_sndfix.fc0', buildFcsx(H));
  console.log('h_sndfix done');
}
// h_allfix: 除 CTRL/SND 外全部换 web, SND 用安全默认
{
  const H = clone(WORK);
  const snd = safeSnd();
  const sndMap = {}; snd.forEach(e => sndMap[e.desc] = e.data);
  for (const c of H.chunks) {
    for (const e of c.entries) {
      if (sndMap[e.desc]) e.data = sndMap[e.desc];
      else if (!NO_CTRLSND.has(e.desc) && WI[e.desc]) e.data = WI[e.desc];
    }
  }
  fs.writeFileSync(WEB + 'h_allfix.fc0', buildFcsx(H));
  console.log('h_allfix done');
}
