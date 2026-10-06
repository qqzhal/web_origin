// RAM 监视悬浮便签（独立脚本：不改动任何现有 JS 的逻辑，仅在 index.html 多一行引入）
//
// ★ 用法：在下方 WATCH_LIST 里维护你要监听的地址（16 进制 0x 开头）+ 备注，
//   改完保存、刷新页面即可生效。便签里每个地址显示：
//     RAM = 真实内存（游戏眼里最后写入的值）
//     读  = nes.peak() 金手指生效后的读值；两者不一致行尾亮「冻」
//   变化记录里：
//     「写」= 游戏 CPU 主动写入（CT2 金手指每帧直接写 ram[]，不走这条路径，所以不会记成"写"），
//            行尾 @XXXX = 写入时刻的 CPU PC（取指后位置，即写入指令的下一条地址）
//     「变」= RAM 值变化但没有对应写入记录，基本就是金手指写回
//     「锁」= PC 捕捉锁存（见下）
//
// ★ PC 捕捉（WATCH_LIST 可选字段 pc / nth）：
//   有的地址被大量代码轮流复用（典型如 $006C：记分牌移位、多次乘法都写它），
//   只有"来自特定 PC 的那次写入"才是想要的数据。给条目加可选字段即成为捕捉行
//  （行内多一列金色「捕」，每次命中时变化记录记金色「锁」行）：
//     pc:  写入来源 PC。数字=精确匹配；[lo,hi]=区间。
//          填法：先射门几次，看「写」日志里真值那一行的 @XXXX，把它填进来
//     nth: 每第 N 次命中锁存一次（默认 1=每次命中都刷新「捕」值；2=每第 2 次，以此类推）
//     pcMark: 标记 PC。当该地址出现"来自标记 PC 的写入"时，锁存它的前一条写入。
//          适用于"真值写完后紧跟一个固定收尾写入"的场合。实测：射门打门将时，
//          解算值（如 0E=14）写完后清场代码固定写 00 @$CD15；而普通球员对抗的
//          收尾写入是另一个 PC —— 所以支持多标记，任一命中即锁存前一条：
//          pcMark: [lo,hi] 或 [[lo,hi],[lo2,hi2],...]
//     stable: 毫秒。轮询发现"值变化后保持稳定 N 毫秒"即锁存——与界面显示同步、无 PC 错位。
//          适合被复用地址的显示值捕捉；与 pcMark 二选一（stable 对齐实时，pcMark 精确到
//          事件但晚一轮触发）
//     guard: 锁存前的辅助判断（可选，数组=全部满足才锁存）。条件对象写法：
//          { addr:0x0442, any:[0x00,0x0B] }   RAM 值在列表内 → 通过
//          { addr:0x0442, none:[0x00,0x0B] }  RAM 值不在列表内 → 通过（另有 eq/ne 单值写法）
//          防守者判定用"无球方球员号 $0442"：0=我方门将、0x0B=敌门将、其余=普通球员
//          （与 ct2_recorder 对位字段、反汇编 sub_8D06 门将分支一致）
//   例：{ addr: 0x006C, name: '防守数值', stable: 600 }
//   维护：hack ROM 改动导致代码位移后，按「写」日志的 @PC 重新填写 pc / pcMark 即可。
//
// 钩子用"普通函数属性"包装（热路径性能关键，不能用访问器属性）：
// 调试器 js/debugger.js 会直接给 nes.onwrite 赋值，若被覆盖由 1 秒自愈定时器重新接管；
// 点关闭时会卸载自身并把钩子链还原。
(function () {
  // ================= 在这里维护你要监听的地址 =================
  const WATCH_LIST = [
  	{ addr: 0x387, name: '对方1号' },
    //{ addr: 0x3F3, name: '对方10号' },
    //{ addr: 0x303, name: '我方1号' },
    { addr: 0x36F, name: '我方10号' },
    { addr: 0x26, name: '关卡' },

    // 门将防守：锚定 sub_8D06 结尾的 STA $71（1A:8D90，写入 PC 落在 8D91-8D93）——
    //   每次守方解算恰好写一次，值 = min(对抗乘积>>8, $FF) = hack 界面显示的门将防守数。
    //   注意：sub_8D06 是通用对抗例程，带球/拼抢时也会高频触发（对方带球时尤甚），
    //   所以加 silent: true 不记「写」日志只做锁存；锁存再由 guard(敌门将) + arm(接管序列) 过滤
    { addr: 0x0071, name: '门将防守', silent: true, ctx: true, pc: [0x8D91, 0x8D93],
      guard: [{ addr: 0x0442, any: [0x0B] }],
      arm: { maxMs: 40000,
             on:  { addr: 0x0442, pc: [0x8509] },
             off: { addr: 0x0441, pc: [0x8E71, 0xDE17] } } },

    // 球员防守 stable = 值稳定 N 毫秒即锁存。过人时防守值会稳定保持整个显示窗口；
    //   嫌慢可改小（移位链一帧内跑完，400 也安全）。guard：防守者是普通球员（非 0/0x0B）才锁
    { addr: 0x006C, name: '球员防守', stable: 400,
      guard: [{ addr: 0x0442, none: [0x00, 0x0B] }] },

	{ addr: 0x061C, name: '进攻威力' },
    //{ addr: 0x0441, name: '持球者' },
    //{ addr: 0x0442, name: '防守者' },
    // { addr: 0x387, name: '对方1号' },  // 示例：需要更多监听就照这个格式往下加
  ];
  // ============================================================

  const POLL_MS = 250, LOG_MAX = 200;   // 轮询间隔 / 日志上限
  const SCRIPT_VER = 'v21';           // 改动 ramwatch 后记得递增，标题可见便于确认浏览器加载的是新代码
  const STORE_POS = 'ramWatchPos', STORE_FOLD = 'ramWatchFold', STORE_LOGHIDE = 'ramWatchLogHide';

  const watchList = WATCH_LIST.map(w => {
    const e = { addr: w.addr & 0xffff, name: w.name || '', lastRam: null, lastPeak: null };
    if (w.silent) e.silent = true;   // 静默：不记「写/变」日志，只参与捕捉锁存
    if (w.pc != null || w.pcMark != null || w.stable != null) {
      const lohi = Array.isArray(w.pc) ? w.pc : [w.pc != null ? w.pc : 0, w.pc != null ? w.pc : 0];
      e.cap = { lo: lohi[0] & 0xffff, hi: lohi[1] & 0xffff, nth: Math.max(1, w.nth || 1), count: 0 };
      if (w.stable != null) e.cap.stable = Math.max(100, w.stable);   // 值稳定 N 毫秒后锁存
      if (w.pcMark != null) {
        // 多标记：数字 / [lo,hi] / [[lo,hi],...] 统一成区间数组，任一命中即触发
        const raw = (Array.isArray(w.pcMark) && Array.isArray(w.pcMark[0])) ? w.pcMark : [w.pcMark];
        e.cap.mks = raw.map(function (r) {
          const rr = Array.isArray(r) ? r : [r, r];
          return [rr[0] & 0xffff, rr[1] & 0xffff];
        });
        e.cap.mk = true;
      }
      if (w.guard != null) {
        // 辅助判断：锁存前逐条校验 RAM 条件，全部通过才锁存（详见文件头 guard 说明）
        const gl = Array.isArray(w.guard) ? w.guard : [w.guard];
        e.cap.guards = gl.map(function (g) {
          return { addr: g.addr & 0x7ff, any: g.any, none: g.none, eq: g.eq, ne: g.ne };
        });
      }
      if (w.arm && w.arm.on && w.arm.off) {
        // 武装窗：锁存仅在"门将接管→球离门将手"序列内生效（锚点与 ct2_recorder 同源，±3 容差）
        const tol = 3;
        const rng = function (a) { a = a & 0xffff; return [Math.max(0, a - tol), Math.min(0xffff, a + tol)]; };
        e._needArm = true; e._armed = false; e._armedAt = 0;
        e._armOn = { addr: w.arm.on.addr & 0x7ff, rng: rng(Array.isArray(w.arm.on.pc) ? w.arm.on.pc[0] : w.arm.on.pc) };
        e._armMax = w.arm.maxMs || 40000;
        const offRaw = Array.isArray(w.arm.off.pc) ? w.arm.off.pc : [w.arm.off.pc];
        e._armOff = { addr: w.arm.off.addr & 0x7ff, rngs: offRaw.map(rng) };
      }
      e._pv = null; e._pp = 0; e._pm = false;   // 上一条写入的值/PC/是否标记写（pcMark 模式用）
      e.stVal = null; e.stAt = 0; e.stDone = false;   // stable 模式：当前值/变化时刻/已锁存
    }
    return e;
  });
  // 捕捉条目按地址索引：写钩子热路径一次数组访问即可拿到
  const capIndex = {};
  watchList.forEach(w => { if (w.cap) { const k = w.addr & 0x7ff; (capIndex[k] = capIndex[k] || []).push(w); } });
  // 武装窗检测表：写钩子里按 (地址, PC±容差) 识别 门将接管(开拍)/球离门将手(收尾)
  const armOnIdx = {}, armOffIdx = {};
  watchList.forEach(w => {
    if (!w._armOn) return;
    (armOnIdx[w._armOn.addr] = armOnIdx[w._armOn.addr] || []).push(w);
    (armOffIdx[w._armOff.addr] = armOffIdx[w._armOff.addr] || []).push(w);
  });
  // 写入标记表：adr&0x7FF -> 1，钩子里一次数组访问即可判断，开销可忽略
  const mark = new Uint8Array(0x800);
  watchList.forEach(w => { mark[w.addr & 0x7ff] = 1; });
  const nameOf = addr => { const w = watchList.find(w => (w.addr & 0x7ff) === (addr & 0x7ff)); return w ? w.name : ''; };

  const hex = v => v.toString(16).toUpperCase().padStart(2, '0');
  const hex4 = v => '$' + (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

  function getNes() {
    try { if (typeof nes !== 'undefined' && nes && nes.ram) return nes; } catch (e) { /* ignore */ }
    if (window.nes && window.nes.ram) return window.nes;
    return null;
  }

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.textContent = `
    #ramWatchNote {
      position: fixed; right: 76px; bottom: 12px; width: 272px; /* right 避开 quickbar 的右侧竖条 */
      background: linear-gradient(165deg, rgba(30,36,48,.97), rgba(11,15,20,.98));
      color: #fff; border: 1px solid rgba(255,255,255,.14); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.55);
      z-index: 20016; font-size: 12px;
      user-select: none; -webkit-user-select: none; overflow: hidden;
    }
    .rw-head { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: move;
      background: rgba(255,255,255,.05); border-bottom: 1px solid rgba(255,255,255,.08); touch-action: none; }
    .rw-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a4a4a; flex: none; transition: background .3s; }
    .rw-dot.on { background: #2ecc71; box-shadow: 0 0 6px rgba(46,204,113,.8); }
    .rw-dot.act { background: #4aa3ff; box-shadow: 0 0 6px rgba(74,163,255,.8); }
    .rw-dot.hit { background: #ffd54a; box-shadow: 0 0 6px rgba(255,213,74,.8); }
    .rw-title { flex: 1; font-weight: 700; letter-spacing: .5px; }
    .rw-btn { width: 20px; height: 20px; border: none; border-radius: 5px; background: rgba(255,255,255,.1);
      color: #fff; cursor: pointer; font-size: 12px; line-height: 1;
      display: flex; align-items: center; justify-content: center; padding: 0; }
    .rw-btn:hover { background: rgba(255,255,255,.25); }
    .rw-last { display: none; padding: 5px 10px; font-size: 11px; font-family: Consolas, Menlo, monospace;
      background: rgba(0,0,0,.25); border-bottom: 1px solid rgba(255,255,255,.06);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rw-last .w { color: #fff; }
    .rw-last .c { color: #7ee787; }
    .rw-last .l { color: #ffd54a; }
    .rw-last .t { color: rgba(255,255,255,.35); }
    .rw-last:empty { display: none; }
    #ramWatchNote.rw-folded .rw-last { display: block; cursor: pointer; }
    .rw-body { padding: 8px 10px 10px; }
    #ramWatchNote.rw-folded .rw-body { display: none; }
    .rw-rows { max-height: 42vh; overflow-y: auto; overscroll-behavior: contain; }
    .rw-rows::-webkit-scrollbar { width: 6px; }
    .rw-rows::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
    .rw-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-family: Consolas, Menlo, monospace; }
    .rw-name { flex: none; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #ffd54a; font-family: inherit; }
    .rw-addr { color: rgba(255,255,255,.45); flex: none; }
    .rw-cap { color: #ffd54a; font-size: 11px; flex: none; white-space: nowrap; }
    .rw-cap b { color: #fff; }
    .rw-val { flex: 1; white-space: nowrap; }
    .rw-val b { color: #fff; font-weight: 700; }
    .rw-val i { color: #8ab4ff; font-style: normal; }
    .rw-freeze { display: none; background: rgba(255,180,60,.2); color: #ffb347; border-radius: 4px;
      padding: 0 4px; font-size: 10px; flex: none; cursor: help; }
    .rw-row.frozen .rw-freeze { display: inline-block; }
    .rw-loghead { display: flex; justify-content: space-between; align-items: center;
      margin-top: 6px; color: rgba(255,255,255,.55); font-size: 11px; }
    .rw-clear { background: none; border: none; color: #8ab4ff; cursor: pointer; font-size: 11px; padding: 0; }
    .rw-btns { display: flex; gap: 10px; }
    .rw-loghide { background: none; border: none; color: #8ab4ff; cursor: pointer; font-size: 11px; padding: 0; }
    .rw-copy { background: none; border: none; color: #7ee787; cursor: pointer; font-size: 11px; padding: 0; }
    .rw-log { margin-top: 4px; height: 110px; overflow-y: auto; background: rgba(0,0,0,.25);
      border-radius: 6px; padding: 4px 6px; font-family: Consolas, Menlo, monospace;
      font-size: 11px; line-height: 1.5; overscroll-behavior: contain; }
    .rw-log::-webkit-scrollbar { width: 6px; }
    .rw-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
    .rw-log .t { color: rgba(255,255,255,.35); }
    .rw-log .w { color: #fff; }
    .rw-log .c { color: #7ee787; }
    .rw-log .l { color: #ffd54a; }
    .rw-log .empty { color: rgba(255,255,255,.3); }
    .rw-log .a, .rw-last .a { color: rgba(255,255,255,.45); }
    .rw-log .x, .rw-last .x { color: #8ab4ff; }
    .rw-log .p, .rw-last .p { color: rgba(255,255,255,.35); }
    /* 手机端：隐藏地址/PC、收窄面板（桌面显示不受影响） */
    @media (max-width: 980px) {
      #ramWatchNote { width: 210px; right: 10px; }
      .rw-row { gap: 4px; font-size: 11px; }
      .rw-name { max-width: 56px; }
      .rw-log { font-size: 10px; line-height: 1.45; }
      .rw-log .a, .rw-last .a, .rw-log .p, .rw-last .p { display: none; }
    }
    .rw-legend { margin-top: 5px; color: rgba(255,255,255,.4); font-size: 10px; line-height: 1.5; }
  `;
  document.head.appendChild(style);

  // ---------- 便签 DOM ----------
  const note = document.createElement('div');
  note.id = 'ramWatchNote';
  note.innerHTML = `
    <div class="rw-head">
      <span class="rw-dot"></span>
      <span class="rw-title">RAM 监视 ${SCRIPT_VER}</span>
      <button class="rw-btn" data-act="fold" title="折叠/展开">−</button>
      <button class="rw-btn" data-act="close" title="关闭并卸载监听">×</button>
    </div>
    <div class="rw-last" title="最新一条记录，点击展开"></div>
    <div class="rw-body">
      <div class="rw-rows"></div>
      <div class="rw-loghead"><span>变化记录</span><span class="rw-btns"><button class="rw-loghide" title="显示/隐藏变化记录">隐藏</button><button class="rw-copy" title="复制全部记录为纯文本">复制</button><button class="rw-clear">清空</button></span></div>
      <div class="rw-log"><div class="empty">暂无记录</div></div>
    </div>
  `;
  (document.getElementById('fullscreenContainer') || document.body).appendChild(note);

  const dotEl = note.querySelector('.rw-dot');
  const rowsEl = note.querySelector('.rw-rows');
  const logEl = note.querySelector('.rw-log');
  const lastEl = note.querySelector('.rw-last');
  // 折叠态点击摘要条直接展开
  lastEl.addEventListener('click', function () {
    if (folded) note.querySelector('[data-act=fold]').click();
  });

  watchList.forEach(w => {
    const row = document.createElement('div');
    row.className = 'rw-row';
    row.innerHTML =
      `<span class="rw-name" title="${w.name}">${w.name || hex4(w.addr)}</span>` +
      `<span class="rw-addr">${hex4(w.addr)}</span>` +
      (w.cap
        ? `<span class="rw-cap">捕 <b class="rw-capv">--</b></span>`
        : `<span class="rw-val">RAM <b class="rw-ram">--</b> 读 <i class="rw-peak">--</i></span>` +
          `<span class="rw-freeze" title="RAM 与读取值不一致：金手指正在每帧写回">冻</span>`);
    w.rowEl = row;
    if (w.cap) {
      w.capEl = row.querySelector('.rw-capv');   // 捕捉行只显示「捕」：$006C 的实时 RAM 是移位噪音，无意义
    } else {
      w.ramEl = row.querySelector('.rw-ram');
      w.peakEl = row.querySelector('.rw-peak');
    }
    rowsEl.appendChild(row);
  });

  // ---------- 日志（缓冲 + 批量 flush：高频写入地址也不会每条都碰 DOM） ----------
  const logBuf = [];
  let logCount = 0;
  let actWriteAt = 0, actLockAt = 0;   // 状态灯：最近一次「写」/「锁」的时刻
  const lastLogged = new Map();  // addr -> 上次记录的写入值，过滤同地址连续写同值的重复日志
  function addLog(type, addr, oldV, newV, pc, lockName, ctx) {
    try {
      if (type === 'w') actWriteAt = Date.now();   // 状态灯：写入活动
      if (type === 'w' && lastLogged.get(addr) === newV) return;   // 同地址连续写同值：只记第一次
      if (type === 'w') lastLogged.set(addr, newV);
      if (logBuf.length >= LOG_MAX) return;
      const name = nameOf(addr);
      const pcHtml = pc ? ` <span class="p">@${hex4(pc)}</span>` : '';
      const ctxHtml = ctx ? ` <span class="x">${ctx}</span>` : '';
      const addrHtml = `<span class="a">${hex4(addr)}</span>`;
      if (type === 'l') {
        const nm = lockName || name || '捕获';
        logBuf.push({ cls: 'l', html: `<span class="t">${now()}</span> 锁 ${nm}<span class="a">($${hex(addr)})</span> = <b>${hex(newV)}(${newV})</b>${pcHtml}${ctxHtml}` });
        return;
      }
      logBuf.push({
        cls: type === 'w' ? 'w' : 'c',
        html: type === 'w'
          ? `<span class="t">${now()}</span> 写 ${addrHtml}${name ? ' ' + name : ''} = ${hex(newV)}(${newV})${pcHtml}${ctxHtml}`
          : `<span class="t">${now()}</span> 变 ${addrHtml}${name ? ' ' + name : ''} ${hex(oldV)}→${hex(newV)}`
      });
    } catch (e) { /* 日志异常绝不能影响模拟器写入 */ }
  }
  function flushLog() {
    if (!logBuf.length) return;
    if (logCount === 0) logEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of logBuf) {
      const line = document.createElement('div');
      line.className = it.cls;
      line.innerHTML = it.html;
      frag.appendChild(line);
    }
    logEl.appendChild(frag);
    logCount += logBuf.length;
    // 折叠条优先显示最新一条「锁」/「写」（游戏写入是核心诊断信号）；都没有才显示「变」
    // 折叠条优先级：「锁」(捕捉值，最重要，整批只要出现过就显示它) > 「写」> 其余
    let pick = null, pickL = null, pickW = null;
    for (let i = logBuf.length - 1; i >= 0; i--) {
      if (logBuf[i].cls === 'l' && !pickL) pickL = logBuf[i];
      if (logBuf[i].cls === 'w' && !pickW) pickW = logBuf[i];
    }
    pick = pickL || pickW || logBuf[logBuf.length - 1];
    lastEl.innerHTML = pick.html;
    logBuf.length = 0;
    while (logCount > LOG_MAX) { logEl.removeChild(logEl.firstChild); logCount--; }
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog() { logBuf.length = 0; lastLogged.clear(); logEl.innerHTML = '<div class="empty">暂无记录</div>'; lastEl.innerHTML = ''; logCount = 0; }
  note.querySelector('.rw-clear').onclick = clearLog;

  // ---------- 变化记录 显示/隐藏（状态存 localStorage，隐藏时记录照常积累） ----------
  let logHidden = false;
  try { logHidden = localStorage.getItem(STORE_LOGHIDE) === '1'; } catch (e) { /* ignore */ }
  const logHideBtn = note.querySelector('.rw-loghide');
  function applyLogHide() {
    logEl.style.display = logHidden ? 'none' : '';
    logHideBtn.textContent = logHidden ? '显示' : '隐藏';
  }
  logHideBtn.onclick = function () {
    logHidden = !logHidden;
    try { localStorage.setItem(STORE_LOGHIDE, logHidden ? '1' : '0'); } catch (e) { /* ignore */ }
    applyLogHide();
  };
  applyLogHide();

  // ---------- 复制按钮：把变化记录导出为纯文本（时间+内容，一行一条） ----------
  function fallbackCopy(text) {
    // 非安全上下文(http)没有 navigator.clipboard，退回 execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  note.querySelector('.rw-copy').onclick = function () {
    const btn = this;
    const report = function (ok) {
      btn.textContent = ok ? '已复制' : '失败';
      setTimeout(function () { btn.textContent = '复制'; }, 1200);
    };
    const lines = [];
    logEl.querySelectorAll('.w, .c, .l').forEach(function (d) { lines.push(d.textContent); });
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { report(true); },
        function () { report(fallbackCopy(text)); }
      );
    } else {
      report(fallbackCopy(text));
    }
  };

  // ---------- 轮询刷新 ----------
  function updateRow(w, ramV, peakV) {
    w.ramEl.textContent = hex(ramV);
    w.peakEl.textContent = hex(peakV) + '(' + peakV + ')';
    w.rowEl.classList.toggle('frozen', ramV !== peakV);
  }

  function tick() {
    const n = getNes();
    // 状态灯：灰=未载入 绿=监听就绪 蓝=1秒内有写入活动 金=3秒内有捕捉锁存
    let dotCls = '';
    if (n && n.ram && window.loaded) {
      dotCls = 'on';
      if (Date.now() - actWriteAt < 1000) dotCls = 'act';
      if (Date.now() - actLockAt < 3000) dotCls = 'hit';
    }
    dotEl.classList.remove('on', 'act', 'hit');
    if (dotCls) dotEl.classList.add(dotCls);
    if (!n || !n.ram || !window.loaded) return;
    for (const w of watchList) {
      if (w._needArm && w._armed && Date.now() - w._armedAt > w._armMax) w._armed = false;   // 武装兜底超时
      const ramV = n.ram[w.addr & 0x7ff];
      if (w.cap) {
        // 捕捉行：轮询只服务 stable 锁存；不刷 RAM/读 列（复用地址的实时值是噪音）、不记「变」
        if (w.cap.stable != null) {
          if (ramV !== w.stVal) { w.stVal = ramV; w.stAt = Date.now(); w.stDone = false; }
          else if (w.stAt && !w.stDone && Date.now() - w.stAt >= w.cap.stable && guardOk(w, n)) {
            w.stDone = true;
            capLatch(w, w.stVal, 0);
          }
        }
        continue;
      }
      const peakV = n.peak(w.addr);
      if (w.lastRam !== null && ramV !== w.lastRam) addLog('c', w.addr, w.lastRam, ramV);
      if (ramV !== w.lastRam || peakV !== w.lastPeak) {
        w.lastRam = ramV; w.lastPeak = peakV;
        updateRow(w, ramV, peakV);
      }
    }
    flushLog();
  }
  const timer = setInterval(tick, POLL_MS);

  // ---------- onwrite 钩子（记录游戏/CPU 的真实写入 + PC 捕捉） ----------
  // 性能关键：必须是"普通函数属性"，不能用 Object.defineProperty 访问器——
  // nes.js 每条写内存指令都读两次 onwrite，访问器让热路径每秒多上百万次 getter 调用，手机直接掉帧。
  // 调试器若赋值覆盖了钩子，由自愈定时器在 1 秒内重新接管（漏记 1 秒，可接受）。
  let closed = false;
  let nesRef = null;   // 缓存 nes 实例：命中监听地址时直接读 nesRef.cpu.br[0] 取 PC（ct2_recorder 同款手法）
  // 情境快照：防守者($0442 无球方球员号)/动作类型($0621)/球权($05FB)
  function ctxStr(n) {
    try {
      const r = n.ram;
      const df = r[0x442];   // 无球方球员号(对位)：0=我门 0x0B=敌门 01-0A=我方球员 0C-14=敌方球员
      let dfName;
      if (df === 0) dfName = '我门';
      else if (df === 0x0B) dfName = '敌门';
      else if (df <= 0x0A) dfName = '我' + hex(df);
      else dfName = '敌' + hex(df);
      const bw = r[0x5FB];   // 球权：0=我方 0x0B=对方 其余=动画移位状态码(无语义)
      const bwName = bw === 0 ? '我' : bw === 0x0B ? '敌' : '$' + hex(bw);
      return '[防' + dfName + ' 动' + hex(r[0x621]) + ' 权' + bwName + ']';
    } catch (err) { return ''; }
  }
  // guard 辅助判断：逐条校验 RAM 条件（any=在列表内 / none=不在 / eq / ne），全部通过才锁
  function guardOk(e, n) {
    const gs = e.cap && e.cap.guards;
    if (!gs || !n || !n.ram) return true;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i], v = n.ram[g.addr];
      if (g.any != null) { if (g.any.indexOf(v) < 0) return false; }
      else if (g.none != null) { if (g.none.indexOf(v) >= 0) return false; }
      else if (g.eq != null) { if (v !== g.eq) return false; }
      else if (g.ne != null) { if (v === g.ne) return false; }
    }
    return true;
  }
  function capLatch(e, val, pc, ctx) {
    e.capVal = val; e.capPc = pc;
    actLockAt = Date.now();   // 状态灯：捕捉活动
    if (e.capEl) e.capEl.textContent = hex(val) + '(' + val + ')';
    const cs = ctx || (e.ctx && nesRef ? ctxStr(nesRef) : '');
    addLog('l', e.addr, null, val, pc, e.name, cs);
  }
  const wrapped = function (adr, val) {
    if (adr < 0x2000) {
      const idx = adr & 0x7ff;
      const aOn = armOnIdx[idx], aOff = armOffIdx[idx];
      if (mark[idx] || aOn || aOff) {
        const cpu = nesRef && nesRef.cpu;
        const pc = (cpu && cpu.br) ? (cpu.br[0] & 0xffff) : 0;
        if (aOn) {
          for (let i = 0; i < aOn.length; i++) {
            const t = aOn[i], r = t._armOn.rng;
            if (pc >= r[0] && pc <= r[1]) { t._armed = true; t._armedAt = Date.now(); t._pv = null; }
          }
        }
        if (aOff) {
          for (let i = 0; i < aOff.length; i++) {
            const t = aOff[i];
            for (let j = 0; j < t._armOff.rngs.length; j++) {
              const rr = t._armOff.rngs[j];
              if (pc >= rr[0] && pc <= rr[1]) { t._armed = false; break; }
            }
          }
        }
        if (mark[idx]) {
          const caps = capIndex[idx];
          // silent 条目（如 $0071 守方解算）高频触发，不记「写」日志，只走捕捉锁存
          const silent = caps ? caps.some(function (e2) { return e2.silent; }) : false;
          const wantCtx = caps ? caps.some(function (e2) { return !!e2.ctx; }) : false;
          const ctxS = wantCtx ? ctxStr(nesRef) : '';
          if (!silent) addLog('w', adr, null, val, pc, '', ctxS);
          if (caps) {
            for (let i = 0; i < caps.length; i++) {
              const e = caps[i], c = e.cap;
              if (c.mk) {
                // 标记模式：来自任一标记 PC 的写入 = 收尾信号，锁存它的前一条写入
                const isMark = c.mks.some(function (r) { return pc >= r[0] && pc <= r[1]; });
                if (isMark && e._pv != null && !e._pm && guardOk(e, nesRef) && (!e._needArm || e._armed)) {
                  capLatch(e, e._pv, e._pp, ctxS);
                }
                e._pv = val; e._pp = pc; e._pm = isMark;
              } else if (pc >= c.lo && pc <= c.hi && ++c.count >= c.nth) {
                c.count = 0;   // 每 nth 次命中锁存一次并重新计数
                if (guardOk(e, nesRef) && (!e._needArm || e._armed)) capLatch(e, val, pc, ctxS);
              }
            }
          }
        }
      }
    }
    const chain = wrapped.__chain;
    if (chain) chain(adr, val);
  };
  function ensureHook(n) {
    nesRef = n;
    // 必须查整条钩子链：只查头的话，与其他 hook 脚本（ct2_recorder 等）互相插头会形成循环链，
    // 每条写内存指令无限递归，而 cpu.js 的写路径 try/catch 静默吞异常 → 所有 RAM 写入静默失败
    if (n.onwrite === wrapped || chainHasSelf(n.onwrite)) return;
    wrapped.__chain = typeof n.onwrite === 'function' ? n.onwrite : null;
    try { n.onwrite = wrapped; } catch (e) { /* ignore */ }
  }
  function chainHasSelf(node) { while (node) { if (node === wrapped) return true; node = node.__chain; } return false; }
  const nes0 = getNes();
  if (nes0) ensureHook(nes0);
  const healTimer = setInterval(function () {
    if (closed) return;
    const n = getNes();
    if (n && n.onwrite !== wrapped) ensureHook(n);
  }, 1000);

  // ---------- 折叠 / 关闭 ----------
  let folded = false;
  try { folded = localStorage.getItem(STORE_FOLD) === '1'; } catch (e) { /* ignore */ }
  function applyFold() {
    note.classList.toggle('rw-folded', folded);
    note.querySelector('[data-act=fold]').textContent = folded ? '+' : '−';
  }
  applyFold();
  note.querySelector('[data-act=fold]').onclick = function () {
    folded = !folded; applyFold();
    try { localStorage.setItem(STORE_FOLD, folded ? '1' : '0'); } catch (e) { /* ignore */ }
  };
  note.querySelector('[data-act=close]').onclick = function () {
    closed = true;
    clearInterval(timer);
    clearInterval(healTimer);
    const n = getNes();
    if (n && n.onwrite === wrapped) n.onwrite = wrapped.__chain || undefined;  // 还原链尾（调试器钩子）
    note.remove();
  };

  // ---------- 拖拽（位置存 localStorage） ----------
  const head = note.querySelector('.rw-head');
  (function restorePos() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE_POS) || 'null');
      if (p && p.x != null) {
        note.style.left = Math.max(0, Math.min(p.x, window.innerWidth - 60)) + 'px';
        note.style.top = Math.max(0, Math.min(p.y, window.innerHeight - 40)) + 'px';
        note.style.right = 'auto'; note.style.bottom = 'auto';
      }
    } catch (e) { /* ignore */ }
  })();
  head.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.rw-btn')) return;
    const rect = note.getBoundingClientRect();
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
    note.style.right = 'auto'; note.style.bottom = 'auto';
    head.setPointerCapture(e.pointerId);
    function move(ev) {
      const x = Math.max(0, Math.min(ev.clientX - offX, window.innerWidth - rect.width));
      const y = Math.max(0, Math.min(ev.clientY - offY, window.innerHeight - 30));
      note.style.left = x + 'px'; note.style.top = y + 'px';
    }
    function up() {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      try {
        const r = note.getBoundingClientRect();
        localStorage.setItem(STORE_POS, JSON.stringify({ x: r.left, y: r.top }));
      } catch (err) { /* ignore */ }
    }
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });

  // nes 后创建的兜底（正常脚本顺序下 nes 已存在，不会走到）
  if (!nes0) {
    const waitTimer = setInterval(function () {
      const n = getNes();
      if (n) { clearInterval(waitTimer); ensureHook(n); }
    }, 500);
  }
})();
