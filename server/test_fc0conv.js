// fc0conv.js 的 Node 测试：用真实 FCEUX 存档验证 解析 -> 转 web -> 转回 fc0 -> 再解析 一致
const zlib = require('zlib');
const fs = require('fs');
const Conv = require('./fc0conv.js');

const SRC = 'D:/phpstudy_pro/domains/TSZY2/fceux/save/天使之翼2 传说之翼 定制版.bak.fc0';
const buf = fs.readFileSync(SRC);

const inflate = (u) => Promise.resolve(zlib.inflateSync(Buffer.from(u)));
const deflate = (u) => Promise.resolve(zlib.deflateSync(Buffer.from(u)));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}

(async () => {
  // 1. 解析原始 fc0
  const parsed = await Conv.parseFc0(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), inflate);
  console.log('1) 解析 fc0：块类型 =', parsed.chunks.map(c => '0x' + c.type.toString(16)).join(','));
  check('块数量为 8', parsed.chunks.length === 8);
  const c = Conv.collectSformat(parsed);
  const keys = Object.keys(c.sf).sort();
  console.log('   关键字段：', keys.join(' '));
  for (const k of ['PC', 'A', 'X', 'Y', 'S', 'P', 'RAM', 'NTAR', 'PRAM', 'SPRA', 'WRAM', 'REGS', 'CMD', 'CHRR', 'M5KX']) {
    check('字段 ' + k + ' 存在', !!c.sf[k]);
  }
  check('WRAM 大小 16384', c.sf.WRAM.length === 16384, c.sf.WRAM && c.sf.WRAM.length);
  check('M5KX 大小 4096', c.sf.M5KX.length === 4096);
  const pcRaw = c.sf.PC[0] | (c.sf.PC[1] << 8);
  console.log('   CPU: PC=' + pcRaw.toString(16) + ' A=' + c.sf.A[0].toString(16) + ' P=' + c.sf.P[0].toString(16));

  // 2. 转为 web saveState
  const prev = { header: { verticalMirroring: false } };   // 模拟槽位现有存档的 header（水平镜像）
  const web = Conv.fc0ToWebState(parsed, prev);
  console.log('2) web saveState：');
  check('ram 长度 0x8000', web.ram.length === 0x8000);
  check('ram 前 2K 与 FCEUX RAM 一致', web.ram.slice(0, 16).join() === Array.from(c.sf.RAM.slice(0, 16)).join());
  check('cpu.br[0]=PC', web.cpu.br[0] === pcRaw, web.cpu.br[0]);
  check('cpu.r=[A,X,Y,S]', JSON.stringify(web.cpu.r) === JSON.stringify([c.sf.A[0], c.sf.X[0], c.sf.Y[0], c.sf.S[0]]));
  const p = c.sf.P[0];
  check('标志位分解正确', web.cpu.n === ((p >> 7) & 1) && web.cpu.v === ((p >> 6) & 1) && web.cpu.c === (p & 1) && web.cpu.z === ((p >> 1) & 1));
  check('bankRegs=REGS', JSON.stringify(web.mapper.bankRegs) === JSON.stringify(Array.from(c.sf.REGS)));
  check('prgRam=WRAM 前 8K', web.mapper.prgRam.length === 0x2000 && web.mapper.prgRam[0] === c.sf.WRAM[0]);
  check('extraPrgRam=M5KX', web.mapper.extraPrgRam.length === 4096 && web.mapper.extraPrgRam[100] === c.sf.M5KX[100]);
  check('chrRam=CHRR', web.mapper.chrRam[1000] === c.sf.CHRR[1000]);
  check('ppuRam=NTAR', web.mapper.ppuRam[2047] === c.sf.NTAR[2047]);
  check('paletteRam=PRAM', web.ppu.paletteRam[5] === c.sf.PRAM[5]);
  check('regSelect/prgMode/chrMode', web.mapper.regSelect === (c.sf.CMD[0] & 7) && web.mapper.prgMode === ((c.sf.CMD[0] >> 6) & 1) && web.mapper.chrMode === ((c.sf.CMD[0] >> 7) & 1));
  check('mirroring 取自 header(水平=1)', web.mapper.mirroring === 1, web.mapper.mirroring);
  check('v=FetchAddr', web.ppu.v === (c.sf.RADD[0] | (c.sf.RADD[1] << 8)));
  check('不携带 chrPageTable（读档时重建）', !('chrPageTable' in web.mapper));
  check('不携带 apu（读档时保留复位值）', !web.apu);
  console.log('   mapper: bankRegs=' + JSON.stringify(web.mapper.bankRegs) + ' CMD=0x' + c.sf.CMD[0].toString(16) +
    ' IRQ{C,L,A}=' + [c.sf.IRQC[0], c.sf.IRQL[0], c.sf.IRQA[0]].join(','));

  // 3. web -> fc0（FCSX）
  const stream = Conv.webStateToFcsxChunks(web);
  const out = await Conv.fcsxWrap(stream, deflate);
  console.log('3) 导出 fc0：原始 ' + stream.length + ' 字节 -> 压缩 ' + out.length + ' 字节');
  check('FCSX 魔数', out[0] === 0x46 && out[1] === 0x43 && out[2] === 0x53 && out[3] === 0x58);
  const re = await Conv.parseFc0(out.buffer.slice(out.byteOffset, out.byteOffset + out.length), inflate);
  check('往返后块数量为 8', re.chunks.length === 8, re.chunks.length);
  const rc = Conv.collectSformat(re).sf;
  check('往返 PC 一致', (rc.PC[0] | (rc.PC[1] << 8)) === pcRaw);
  check('往返 RAM 一致', Array.from(rc.RAM).join() === Array.from(c.sf.RAM).join());
  check('往返 REGS 一致', Array.from(rc.REGS).join() === Array.from(c.sf.REGS).join());
  check('往返 CHRR 一致', Array.from(rc.CHRR).join() === Array.from(c.sf.CHRR).join());
  check('往返 M5KX 一致', Array.from(rc.M5KX).join() === Array.from(c.sf.M5KX).join());
  check('往返 NTAR 一致', Array.from(rc.NTAR).join() === Array.from(c.sf.NTAR).join());
  check('往返 PRAM 一致', Array.from(rc.PRAM).join() === Array.from(c.sf.PRAM).join());
  check('往返 SPRA 一致', Array.from(rc.SPRA).join() === Array.from(c.sf.SPRA).join());
  check('往返 PPUR 一致', Array.from(rc.PPUR).join() === Array.from(c.sf.PPUR).join());
  check('往返 CMD 一致', rc.CMD[0] === c.sf.CMD[0]);
  check('往返 IRQC/IRQL/IRQA 一致', rc.IRQC[0] === c.sf.IRQC[0] && rc.IRQL[0] === c.sf.IRQL[0] && rc.IRQA[0] === c.sf.IRQA[0]);

  // 4. 导出文件再转回 web（模拟“FCEUX 导出 -> web 导入”的闭环），核心状态不变
  const web2 = Conv.fc0ToWebState(re, prev);
  check('闭环：PC 不变', web2.cpu.br[0] === web.cpu.br[0]);
  check('闭环：bankRegs 不变', JSON.stringify(web2.mapper.bankRegs) === JSON.stringify(web.mapper.bankRegs));
  check('闭环：extraPrgRam 不变', JSON.stringify(web2.mapper.extraPrgRam) === JSON.stringify(web.mapper.extraPrgRam));
  fs.writeFileSync('D:/phpstudy_pro/domains/TSZY2/web/_test_roundtrip.fc0', Buffer.from(out));
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
