// 导出方向高位数据保真测试：验证 web -> FCEUX 时 v/t 的 15 位值与新 PPU 位域不丢失。
// 背景：曾出现 t 被截断为 11 位（& 0x7ff 丢 fineY/nametable 位）导致 FCEUX 读档花屏。
const zlib = require('zlib');
const Conv = require('./fc0conv.js');

(async () => {
  const state = {
    version: 1,
    ram: new Array(0x8000).fill(0),
    cpu: { r: [1, 2, 3, 4], br: [0x8001], n: 1, v: 0, d: 0, i: 1, z: 0, c: 1 },
    ppu: {
      paletteRam: new Array(32).fill(0x21), oamRam: new Array(256).fill(0),
      t: 0x7abc, v: 0x73f5, w: 1, x: 5, oamAddress: 0x88, readBuffer: 0x42,
      spriteZero: 0, spriteOverflow: 1, inVblank: 1, vramIncrement: 1,
      spritePatternBase: 1, bgPatternBase: 1, spriteHeight: 16, slave: 0,
      generateNmi: 1, greyScale: 0, bgInLeft: 1, sprInLeft: 0,
      bgRendering: 1, sprRendering: 1, emphasis: 6
    },
    mapper: {
      prgRam: new Array(0x2000).fill(0), chrRam: new Array(4096).fill(0),
      ppuRam: new Array(0x800).fill(0), bankRegs: [0, 2, 8, 9, 10, 11, 0, 2],
      mirroring: 1, prgMode: 0, chrMode: 1, regSelect: 7,
      reloadIrq: 0, irqLatch: 128, irqEnabled: 1, irqCounter: 17,
      lastRead: 0, extraPrgRam: new Array(4096).fill(0xff)
    }
  };
  const stream = Conv.webStateToFcsxChunks(state);
  let off = 0, newPpu = null, snd = null;
  while (off + 5 <= stream.length) {
    const type = stream[off], size = stream[off + 1] | (stream[off + 2] << 8) | (stream[off + 3] << 16) | (stream[off + 4] << 24);
    if (type === 0x1f) newPpu = stream.subarray(off + 5, off + 5 + size);
    if (type === 5) snd = stream.subarray(off + 5, off + 5 + size);
    off += 5 + size;
  }
  const get = (name, buf) => {
    let o = 0;
    while (o + 8 <= buf.length) {
      let d = ''; for (let i = 0; i < 4; i++) { if (!buf[o + i]) break; d += String.fromCharCode(buf[o + i]); }
      const s = buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24);
      if (d === name) return buf.subarray(o + 8, o + 8 + s);
      o += 8 + s;
    }
    return null;
  };
  const le32 = b => b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
  const u16 = b => b[0] | (b[1] << 8);
  let ok = 0, bad = 0;
  const chk = (n, c, d) => { if (c) ok++; else { bad++; console.log('FAIL ' + n + ' [' + d + ']'); } };

  // v=0x73f5 = 0111'0011'1111'0101: fv=7, bit11=0, bit10=0, vt=31, ht=21
  chk('v 分量: PFVx=7', le32(get('PFVx', newPpu)) === 7);
  chk('v 分量: PVxx=0', le32(get('PVxx', newPpu)) === 0);
  chk('v 分量: PHxx=0', le32(get('PHxx', newPpu)) === 0);
  chk('v 分量: PVTx=31', le32(get('PVTx', newPpu)) === 31);
  chk('v 分量: PHTx=21', le32(get('PHTx', newPpu)) === 21);
  // t=0x7abc = 0111'1010'1011'1100: fv=7, bit11=1, bit10=0, vt=21, ht=28
  chk('t 分量: P_FV=7', le32(get('P_FV', newPpu)) === 7);
  chk('t 分量: P_Vx=0', le32(get('P_Vx', newPpu)) === 0);
  chk('t 分量: P_Hx=1 (bit11)', le32(get('P_Hx', newPpu)) === 1, le32(get('P_Hx', newPpu)));
  chk('t 分量: P_VT=21', le32(get('P_VT', newPpu)) === 21);
  chk('t 分量: P_HT=28', le32(get('P_HT', newPpu)) === 28);
  chk('PSxx=1 (bgPatternBase)', le32(get('PSxx', newPpu)) === 1);
  chk('PST2=341', le32(get('PST2', newPpu)) === 341);
  // 旧 PPU 块的 RADD/TADD 15 位保真
  let off2 = 0, tadd = null, radd = null;
  while (off2 + 5 <= stream.length) {
    const type = stream[off2], size = stream[off2 + 1] | (stream[off2 + 2] << 8) | (stream[off2 + 3] << 16) | (stream[off2 + 4] << 24);
    if (type === 3) {
      const b = stream.subarray(off2 + 5, off2 + 5 + size);
      tadd = get('TADD', b); radd = get('RADD', b);
    }
    off2 += 5 + size;
  }
  chk('TADD=0x7abc（15位保真）', u16(tadd) === 0x7abc, u16(tadd).toString(16));
  chk('RADD=0x73f5（15位保真）', u16(radd) === 0x73f5, u16(radd).toString(16));
  chk('SND 块 408 字节', snd.length === 408, snd.length);
  // 完整往返
  const out = await Conv.fcsxWrap(stream, u => Promise.resolve(zlib.deflateSync(Buffer.from(u))));
  const re = await Conv.parseFc0(out.buffer.slice(out.byteOffset, out.byteOffset + out.length),
    u => Promise.resolve(zlib.inflateSync(Buffer.from(u))));
  const web2 = Conv.fc0ToWebState(re, { header: { verticalMirroring: false } });
  chk('往返 t=0x7abc（15位）', web2.ppu.t === 0x7abc, web2.ppu.t.toString(16));
  chk('往返 v=0x73f5（15位）', web2.ppu.v === 0x73f5, web2.ppu.v.toString(16));

  console.log(ok + ' 通过, ' + bad + ' 失败');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
