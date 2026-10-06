// vnesconv.js 的 Node 测试：用真实 VirtuaNES 存档验证 解析→转web→转回st0→再解析 一致
const fs = require('fs');
const Conv = require('./vnesconv.js');

const SRC = 'D:/phpstudy_pro/domains/TSZY2/web/天使之翼2 传说之翼 定制版.st0';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}

const buf = fs.readFileSync(SRC);
const parsed = Conv.parseSt0(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));

// 1) 解析
console.log('1) 解析 .st0');
check('ROM CRC = b834975e (game_hack.nes)', parsed.romCrc === 0xb834975e, parsed.romCrc.toString(16));
check('块数 = 6', Object.keys(parsed.blocks).length === 6, Object.keys(parsed.blocks).join(','));
const ids = Object.keys(parsed.blocks);
check('REG DATA 96B', parsed.blocks['REG DATA'] && parsed.blocks['REG DATA'].data.length === 96);
check('RAM DATA 2336B', parsed.blocks['RAM DATA'] && parsed.blocks['RAM DATA'].data.length === 2336);
check('MMU DATA 41028B', parsed.blocks['MMU DATA'] && parsed.blocks['MMU DATA'].data.length === 41028,
  parsed.blocks['MMU DATA'] && parsed.blocks['MMU DATA'].data.length);
check('MMC DATA 256B', parsed.blocks['MMC DATA'] && parsed.blocks['MMC DATA'].data.length === 256);
check('CTR DATA 32B', parsed.blocks['CTR DATA'] && parsed.blocks['CTR DATA'].data.length === 32);
check('SND DATA 2048B', parsed.blocks['SND DATA'] && parsed.blocks['SND DATA'].data.length === 2048);

// 2) 已知值核对（真实档手工解码结果）
const web = Conv.st0ToWebState(parsed, null);
console.log('2) st0 → web saveState');
check('PC = 0x8103', web.cpu.br[0] === 0x8103, '0x' + web.cpu.br[0].toString(16));
check('A=1 X=28 Y=4 S=db', web.cpu.r[0] === 1 && web.cpu.r[1] === 0x1c && web.cpu.r[2] === 4 && web.cpu.r[3] === 0xdb);
check('vnesRomCrc 带入', web.vnesRomCrc === 0xb834975e);
check('loopy_t = 0x73e0', web.ppu.t === 0x73e0, '0x' + web.ppu.t.toString(16));
check('loopy_v = 0x73a0', web.ppu.v === 0x73a0, '0x' + web.ppu.v.toString(16));
check('PPU reg0 = 0x88 分解', web.ppu.generateNmi === 1 && web.ppu.spriteHeight === 8 && web.ppu.spritePatternBase === 1 && web.ppu.vramIncrement === 0);
check('bankRegs = [124,126,116,117,118,119,12,122]', JSON.stringify(web.mapper.bankRegs) === '[124,126,116,117,118,119,12,122]',
  JSON.stringify(web.mapper.bankRegs));
check('CMD=0x07 → regSelect=7 prgMode=0 chrMode=0', web.mapper.regSelect === 7 && web.mapper.prgMode === 0 && web.mapper.chrMode === 0);
check('镜像 = 垂直(0)', web.mapper.mirroring === 0);
check('IRQ latch=128 counter=127 关', web.mapper.irqLatch === 128 && web.mapper.irqCounter === 127 && web.mapper.irqEnabled === 0);
check('extraPrgRam 取自 $5000 窗', web.mapper.extraPrgRam[0] === 0xa5 && web.mapper.extraPrgRam[1] === 0x26, web.mapper.extraPrgRam.slice(0, 4).join(','));
check('prgRam 取自 $6000 窗', web.mapper.prgRam[0] === 0x85 && web.mapper.prgRam[1] === 0x43, web.mapper.prgRam.slice(0, 4).join(','));
check('chrRam 存在(CRAM 4K)', Array.isArray(web.mapper.chrRam) && web.mapper.chrRam.length === 4096);
check('ppuRam 2K', web.mapper.ppuRam.length === 0x800);
check('手柄 pad1', web.latchedControl1State === 0);

// 3) web → st0 → 再解析（往返）
console.log('3) web → st0 往返');
const out = Conv.webStateToSt0(web);
const re = Conv.parseSt0(out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
check('往返后 CRC 保留', re.romCrc === 0xb834975e);
check('往返块数 6', Object.keys(re.blocks).length === 6);
check('往返文件大小与原档一致 (45924)', out.length === buf.length, out.length + ' vs ' + buf.length);
check('FrameIRQ 抑制位 0x40（防中断风暴）', re.blocks['REG DATA'].data[8] === 0x40,
  '0x' + re.blocks['REG DATA'].data[8].toString(16));
// ⚠ 无损路径：导入时暂存了原始块字节，往返必须字节级一致
let byteDiff = 0;
for (let i = 0; i < buf.length; i++) if (buf[i] !== out[i]) byteDiff++;
check('往返与原档字节级一致（无损路径）', byteDiff === 0, byteDiff + ' 字节差异');
// 无损路径连 loopy_v 也原样保留（v=t 仅用于重建路径）
const web2 = Conv.st0ToWebState(re, null);
check('无损往返 t/v 保持', web2.ppu.t === 0x73e0 && web2.ppu.v === 0x73a0,
  't=0x' + web2.ppu.t.toString(16) + ' v=0x' + web2.ppu.v.toString(16));
check('往返 PC 不变', web2.cpu.br[0] === 0x8103);
check('往返 bankRegs 不变', JSON.stringify(web2.mapper.bankRegs) === JSON.stringify(web.mapper.bankRegs));
check('往返 extraPrgRam 不变', JSON.stringify(web2.mapper.extraPrgRam) === JSON.stringify(web.mapper.extraPrgRam));
check('往返 prgRam 不变', JSON.stringify(web2.mapper.prgRam) === JSON.stringify(web.mapper.prgRam));
check('往返 ppuRam 不变', JSON.stringify(web2.mapper.ppuRam) === JSON.stringify(web.mapper.ppuRam));
check('往返 chrRam 不变', JSON.stringify(web2.mapper.chrRam) === JSON.stringify(web.mapper.chrRam));
check('往返镜像不变', web2.mapper.mirroring === 0);
check('往返 IRQ 不变', web2.mapper.irqLatch === 128 && web2.mapper.irqCounter === 127 && web2.mapper.irqEnabled === 0);
// 与原文件字节级对比（同构状态应能完全重建）
let diff = 0;
const orig = new Uint8Array(buf);
for (let i = 0; i < Math.min(out.length, orig.length); i++) if (out[i] !== orig[i]) diff++;
console.log('   与原 .st0 字节差异: ' + diff + '/' + buf.length + '（含模拟器运行态差异，非零正常）');

// 4) web(来自FCEUX链路) → st0 的交叉转换
console.log('4) 交叉：FCEUX 链路的 web 状态 → st0');
const zlib = require('zlib');
const Fc0 = require('./fc0conv.js');
const fbuf = fs.readFileSync('D:/phpstudy_pro/domains/TSZY2/fceux/save/天使之翼2 传说之翼 定制版.bak.fc0');
const fp = Fc0.parseFc0(fbuf.buffer.slice(fbuf.byteOffset, fbuf.byteOffset + fbuf.length), u => Promise.resolve(zlib.inflateSync(Buffer.from(u)))).then(function (p) {
  const prevState = null;
  const webF = Fc0.fc0ToWebState(p, { header: { verticalMirroring: false } });
  // 模拟：导入 st0 拿到 CRC，再从 FCEUX 档转的 web 状态导出 st0（无 CRC 时应为 0）
  const st0out = Conv.webStateToSt0(webF);
  const rep = Conv.parseSt0(st0out.buffer.slice(st0out.byteOffset, st0out.byteOffset + st0out.length));
  check('FCEUX web → st0 解析成功', Object.keys(rep.blocks).length === 6);
  check('无 CRC 时填 0', rep.romCrc === 0);
  const webBack = Conv.st0ToWebState(rep, null);
  check('交叉往返 PC 不变', webBack.cpu.br[0] === webF.cpu.br[0]);
  check('交叉往返 bankRegs 不变', JSON.stringify(webBack.mapper.bankRegs) === JSON.stringify(webF.mapper.bankRegs));
  check('交叉往返 WRAM 不变', JSON.stringify(webBack.mapper.prgRam) === JSON.stringify(webF.mapper.prgRam));
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
});
