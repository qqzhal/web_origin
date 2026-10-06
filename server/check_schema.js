// 核对 fc0ToWebState 输出的字段名与 web 模拟器各模块 saveVars 是否一致
const fs = require('fs');
const zlib = require('zlib');
const Conv = require('./fc0conv.js');

const EMU = 'D:/phpstudy_pro/domains/TSZY2/web/emu/';
function grabVars(file, re) {
  const src = fs.readFileSync(EMU + file, 'utf8');
  const m = src.match(re);
  if (!m) throw new Error(file + ' 未匹配到 saveVars');
  return m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}
const nesVars = grabVars('nes/nes.js', /this\.saveVars\s*=\s*\[([^\]]*)\]/);
const cpuVars = grabVars('nes/cpu.js', /this\.saveVars\s*=\s*\[([^\]]*)\]/);
const ppuVars = grabVars('nes/pipu.js', /this\.saveVars\s*=\s*\[([^\]]*)\]/);
const mmc3Vars = grabVars('mappers/mmc3.js', /this\.saveVars\s*=\s*\[([^\]]*)\]/);
const m195Vars = grabVars('mappers/mapper195.js', /saveVars\.concat\(\[([^\]]*)\]\)/);
const mapperVars = mmc3Vars.concat(m195Vars);

let fail = 0;
function check(name, cond, detail) {
  console.log((cond ? '  ok  ' : '  FAIL ') + name + (cond ? '' : '  [' + detail + ']'));
  if (!cond) fail++;
}

(async () => {
  const buf = fs.readFileSync('D:/phpstudy_pro/domains/TSZY2/fceux/save/天使之翼2 传说之翼 定制版.bak.fc0');
  const parsed = await Conv.parseFc0(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    u => Promise.resolve(zlib.inflateSync(Buffer.from(u))));
  const web = Conv.fc0ToWebState(parsed, { header: { verticalMirroring: false } });

  console.log('1) 顶层字段 ⊆ nes.saveVars ∪ 子对象容器：');
  const nesSet = new Set(nesVars.concat(['cpu', 'ppu', 'apu', 'mapper', 'header', 'version', 'saveVars']));
  const topExtra = Object.keys(web).filter(k => !nesSet.has(k));
  check('顶层无未知字段', topExtra.length === 0, topExtra.join(','));
  const nesMissing = nesVars.filter(k => !(k in web));
  check('顶层缺失字段仅为 apu（有意省略）', nesMissing.filter(k => k !== 'apu').length === 0, nesMissing.join(','));

  console.log('2) cpu 字段 ⊆ cpu.saveVars 且核心齐全：');
  const cpuSet = new Set(cpuVars);
  check('cpu 无未知字段', Object.keys(web.cpu).every(k => cpuSet.has(k)), Object.keys(web.cpu).filter(k => !cpuSet.has(k)).join(','));
  const cpuMust = ['r', 'br', 'n', 'v', 'd', 'i', 'z', 'c'];
  check('cpu 必备字段齐全', cpuMust.every(k => k in web.cpu), cpuMust.filter(k => !(k in web.cpu)).join(','));

  console.log('3) ppu 字段 ⊆ ppu.saveVars 且寄存器/标志齐全：');
  const ppuSet = new Set(ppuVars);
  check('ppu 无未知字段', Object.keys(web.ppu).every(k => ppuSet.has(k)), Object.keys(web.ppu).filter(k => !ppuSet.has(k)).join(','));
  // 有意省略的是时序与渲染中间缓冲；寄存器/标志必须全给
  const omitted = ppuVars.filter(k => !(k in web.ppu));
  const allowedOmit = ['secondaryOam', 'spriteTiles', 'line', 'dot', 'evenFrame', 'atl', 'atr', 'tl', 'th', 'spriteZeroIn', 'spriteCount'];
  check('ppu 省略字段仅为时序/中间缓冲', omitted.every(k => allowedOmit.includes(k)), omitted.join(','));
  const ppuMust = ppuVars.filter(k => !allowedOmit.includes(k));
  check('ppu 其余字段全部提供', ppuMust.every(k => k in web.ppu), ppuMust.filter(k => !(k in web.ppu)).join(','));

  console.log('4) mapper 字段 ⊆ mmc3+mapper195 saveVars 且核心齐全：');
  const mSet = new Set(mapperVars);
  check('mapper 无未知字段', Object.keys(web.mapper).every(k => mSet.has(k)), Object.keys(web.mapper).filter(k => !mSet.has(k)).join(','));
  const mMust = ['prgRam', 'chrRam', 'ppuRam', 'bankRegs', 'mirroring', 'prgMode', 'chrMode', 'regSelect', 'reloadIrq', 'irqLatch', 'irqEnabled', 'irqCounter', 'extraPrgRam'];
  check('mapper 必备字段齐全（含 extraPrgRam）', mMust.every(k => k in web.mapper), mMust.filter(k => !(k in web.mapper)).join(','));

  console.log('5) 数据类型符合 setObjState 期望：');
  check('ram 是 Array', Array.isArray(web.ram));
  check('cpu.r/br 是 Array', Array.isArray(web.cpu.r) && Array.isArray(web.cpu.br));
  check('mapper 数组字段是 Array', ['prgRam', 'chrRam', 'ppuRam', 'bankRegs', 'extraPrgRam'].every(k => Array.isArray(web.mapper[k])));
  check('ppu 数组字段是 Array', ['paletteRam', 'oamRam'].every(k => Array.isArray(web.ppu[k])));

  console.log(fail ? '\n共 ' + fail + ' 处不一致' : '\n全部一致，字段名与模拟器 saveVars 完全匹配');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
