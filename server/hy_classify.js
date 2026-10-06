// v7 结果分类 v2 (兼容 \r\n 行尾)
const fs = require('fs');
const OUT = 'D:/phpstudy_pro/domains/TSZY2/ct2_disasm/out/';
const log = fs.readFileSync(OUT + 'fcx_log.txt', 'utf8');
const phases = {};
let cur = null;
for (const l of log.split(/\r?\n/)) {
  const mHead = l.match(/^=== (\S+) ===/);
  if (mHead) { cur = mHead[1]; phases[cur] = {}; continue; }
  const mRow = l.match(/^pc=([0-9a-f]+) R(\d) a=([0-9a-f]+) x=([0-9a-f]+) x(\d+)/);
  if (mRow && cur) phases[cur]['pc' + mRow[1] + '_R' + mRow[2] + '_a' + mRow[3] + '_x' + mRow[4]] = parseInt(mRow[5]);
}
function classify(f) {
  const keys = Object.keys(f);
  const healthy = keys.filter(k => /^pcc43a_|^pcc449_|^pcc458_|^pcc464_|^pc8011_|^pc9f1e_|^pc9f2e_|^pca0b5_|^pca0bf_|^pca0c9_|^pca0d3_/.test(k)).reduce((s, k) => s + f[k], 0);
  const broken = keys.filter(k => /^pcc48e_|^pcc49d_/.test(k)).reduce((s, k) => s + f[k], 0);
  return { healthy, broken };
}
console.log('阶段        健康写  花屏写   判定');
for (const name of ['work', 'h_all', 'h_cpu', 'h_cpuc', 'h_ppu', 'h_ram', 'h_wram', 'h_chr', 'h_regs', 'h_irq']) {
  const f = phases[name] || {};
  const c = classify(f);
  const verdict = c.broken > 50 ? '** 花屏 **' : (c.healthy > 30 ? '健康' : '无特征');
  console.log(name.padEnd(10) + String(c.healthy).padStart(6) + String(c.broken).padStart(8) + '   ' + verdict);
}
console.log();
for (const name of Object.keys(phases)) {
  const f = phases[name];
  const arr = Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('[' + name + '] ' + arr.map(([k, v]) => k.replace(/^pc/, '') + ' x' + v).join('  '));
}
