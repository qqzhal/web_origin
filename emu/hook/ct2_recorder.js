// ct2_recorder.js — CT2 比赛事件采集器（逆向注释素材，独立脚本：不改动任何现有 JS 的逻辑）
//
// ★ 目标：为 ct2_disasm 反汇编工程的中文注释提供动态证据。
//   参考原型：ct2_disasm/tools0/log_cmds_full.lua（FCEUX 版），迁移到 web 内核并增强：
//     - 每条记录带 PC + mapper195 实时 ROM 定位（prg 偏移 / 8K 库号 / src0 标签提示）
//     - 数据双通道：localStorage 本地攒数（防刷新丢失）+ 可选自动上传 server/log_api.php
//
// ★ 采集内容（监控点源自 log_cmds_full.lua 的已验证成果）：
//   CMD   $043B攻指令 $043C攻必杀 $043D守指令 $043E守必杀 $0441球权 $0442对位（写钩子，带触发 PC）
//   SCORE $28/$29 比分变化          BALL  $05FB 持球方易主      STAGE $0026 关卡切换
//   INPUT A 键按下（沿检测，附面板快照）   SNAP  门将扑救 RAM 快照流($0300-$04FF)
//   [玩家]/[引擎] 标记：A 键按下后 500ms 内的写入 = 玩家确认，其余 = 引擎演算/AI 改写
//
// ★ 控制台 API（window.CT2Hook）：
//   status()                     采集状态总览
//   exportJSON() / download()    导出全部记录（JSON 字符串 / 触发浏览器下载）
//   upload()                     立即上传增量到服务器（自动上传默认开启，30s 一次）
//   clear() / newSession()       清空本地记录 / 开启新会话
//   setAutoUpload(bool)          开关自动上传
//
// 钩子用"普通函数属性"包装（热路径性能关键，不能用访问器属性）：
// nes.onwrite 是单例回调，debugger.js / ramwatch.js 也会包装，本脚本用 __chain 链式共存，
// 自愈定时器检查"整条钩子链"里是否还有自己，被挤到链中也不重复插队；
// 点关闭时卸载自身并把钩子链还原。
(function () {
  // ================= 版本标识：让"生效版本"可验证 =================
  // ① 面板标题、SYS 启动日志、CT2Hook.status().ver 三处都带版本号
  // ② 自动检测页面引用参数与脚本实际版本不一致（= index.html 或 JS 被浏览器缓存了旧版）
  var SCRIPT_VER = 'v39';
  try {
    var _tag = document.querySelector('script[src*="ct2_recorder"]');
    if (_tag) {
      var _m = _tag.src.match(/v=([\w.]+)/);
      if (_m && _m[1] !== SCRIPT_VER) {
        //console.warn('[CT2采集] 页面引用脚本版本(' + _m[1] + ')与实际版本(' + SCRIPT_VER + ')不一致，可能被缓存，请 Ctrl+F5 强刷');
      }
    }
  } catch (e) { /* ignore */ }
  // ================= 设备：全平台启用（2026-09-16 实测开销 <1%）=================
  // 热路径（每条写内存指令）只多一次 mark 数组比较；记录仅在监控地址值变化时发生。
  // 手机/平板正常开启采集，若极端低端设备吃力可把 ENABLED 改 false 整体关闭
  var ENABLED = true;
  if (!ENABLED) return;

  // ================= 配置区 =================
  var API_URL  = '/server/log_api.php';
  var API_TOKEN = '';   // 上传令牌：实时读取 localStorage 的 syncToken（在其他页面写入即可，无需刷新本页）
  function getApiToken() {
    try { return localStorage.getItem('syncToken') || API_TOKEN; } catch (e) { return API_TOKEN; }
  }
  var AUTO_UPLOAD_DEFAULT = true;               // 自动上传默认开（失败静默退避，不影响游戏）
  var UPLOAD_INTERVAL_MS = 30000;               // 自动上传间隔
  var UPLOAD_BATCH = 300;                       // 每次上传的条数上限（分批）
  var SAVE_INTERVAL_MS = 5000;                  // localStorage 落盘节流
  var REC_LIMIT = 8000;                         // 本地记录环形上限
  var SNAP_LIMIT = 200;                         // 本地快照份数上限
  var PLAYER_WINDOW_MS = 500;                   // A 键按下后该窗口内的写入记为[玩家]（≈Lua 版30帧）
  // 面板事件日志区（滚动显示最近事件，每秒一次批量刷 DOM，点"−"折叠后完全停止刷新）：
  // 开销可忽略（<0.1%），默认开启；数据采集与上传不受此开关影响
  var SHOW_LOG = true;
  // 门将扑救快照流（$0300-$04FF 快照 diff 抓门将技能字段）：
  // 历史使命已完成——技能字段地址已定位（见 out0/ 相关笔记），默认关闭省资源；
  // 需要重新捕捉时改 ENABLE_SNAP = true 即可（锚点/连拍逻辑原样保留）
  var ENABLE_SNAP = false;
  var SNAP_INTERVAL_MS = 500;                   // 门将快照流间隔（≈Lua 版30帧）
  var ANCHOR_TOL = 3;                           // 锚点 PC 匹配容差（写指令最长3字节，PC时序±3内）
  // 同值重写记录开关：true = 值没变但被再次写入时也记一条带"(重写)"标记的记录（定位例程触发时机有用）；
  // false = 跳过同值重写（记录更干净）。折叠键防刷屏两种模式下都生效
  var LOG_REWRITE = false;
  // 指令面板监控地址（写钩子）；$0026=关卡代码（原版 00-20=第1-33关，hack 新增关为 21+）
  var CMD_ADDRS = [0x043B, 0x043C, 0x043D, 0x043E, 0x0441, 0x0442, 0x0026];
  var EVNAME = { 0x043B: '攻指令', 0x043C: '攻必杀', 0x043D: '守指令', 0x043E: '守必杀', 0x0441: '球权', 0x0442: '对位', 0x0026: '关卡' };
  // 门将扑救快照流锚点（log_cmds_full.lua 实测：8509 写 0442=开拍，8E71/DE17 写 0441=收尾）
  // web 内核写钩子触发时 PC 时序与 FCEUX 未必逐字节一致，用 ±ANCHOR_TOL 区间匹配，raw PC 已入日志可事后校准
  var ANCHOR_GK_START = 0x8509;                          // PC 接近此地址写 $0442 = 门将接管
  var ANCHOR_GK_END   = [0x8E71, 0xDE17];                // PC 接近这些地址写 $0441 = 球离门将手
  // 会话内换新会话的间隔（超时后 newSession）
  var SESSION_MAX_AGE_MS = 6 * 3600 * 1000;

  var STORE_REC = 'ct2HookRecords', STORE_SNAP = 'ct2HookSnaps', STORE_SESS = 'ct2HookSession';

  // ================= 解码表 =================
  // 小表内置（来源 log_cmds_full.lua，与 README 关键 RAM 速查表核对一致）
  var ATK = ['射门', '传球', '过人', '二过一', '停球', '漏球', '解围', '点球左', '点球中', '点球右'];
  var DEF = ['挡球', '铲球', '截球', '解围', '争抢', 'follow', '不做', '点球扑左', '点球扑中', '点球扑右'];
  var DEF_GK = ['抱球', '击球', '倒地', '出击', '看着', '防过人', '防射门', '点球扑左', '点球扑中', '点球扑右'];
  // $05FB 是持球方标志：0=我方 / 0x0B=对方（README 原始注释正确，2026-09-16 用户实测确认
  // 对方持球时恒为 0x0B）；其余值非"方"语义，按状态码原样记录。持球人槽位看 $0441/$0442
  function ballName(v) {
    if (v === 0x00) return '我方';
    if (v === 0x0B) return '对方';
    return '$' + v.toString(16).toUpperCase() + '(状态码)';
  }
  // 大表引用 emu/js/cheats.js 的 CT2 知识库全局（加载顺序在 cheats.js 之后，仍做存在性防御）。
  // 注意必须在 valname 等函数定义之前取好引用（修复 Lua 版 DEF_GK 前向引用的坑）
  function cheatGlobal(name) { try { return (typeof window[name] !== 'undefined') ? window[name] : null; } catch (e) { return null; } }
  var SKILL_ALL  = cheatGlobal('指令文本');             // 必杀全局表 00-52（'射门'…'GK防射门'）
  var TBL_SHOOT  = cheatGlobal('射门指令');             // 类内子表，'00 名字' 格式
  var TBL_PASS   = cheatGlobal('传球指令');
  var TBL_DRIB   = cheatGlobal('过人指令');
  var TBL_ONE    = cheatGlobal('二过一指令');
  var TBL_BLOCK  = cheatGlobal('挡球指令');             // 守方类内子表（按 $043D 的类选）
  var TBL_TACKLE = cheatGlobal('铲球指令');
  var TBL_INTER  = cheatGlobal('截球指令');
  var PNAME      = cheatGlobal('playerstr');            // 球员代码->名字 全 00-C7
  function subTableName(entry, v) {                     // '00 名字' -> '名字'；无名项返回 null
    if (!entry || v >= entry.length) return null;
    var s = String(entry[v]), i = s.indexOf(' ');
    return i > 0 ? s.slice(i + 1) : null;
  }

  // ================= 会话与状态 =================
  var sess = null, prevSess = null, orphanFlush = null;
  try { sess = JSON.parse(localStorage.getItem(STORE_SESS) || 'null'); } catch (e) { /* ignore */ }
  if (!sess || Date.now() - sess.start > SESSION_MAX_AGE_MS) {
    prevSess = sess; // 过期的旧会话：其未同步记录稍后以旧身份补传，避免丢失
    sess = { id: 'S' + Date.now().toString(36), start: Date.now(), romTag: '?' };
  }
  var records = [];      // 环形日志 [{seq,k,t,pc,prg,hint,a,o,v,txt,c,...}]
  var snaps = [];        // [{seq,n,tag,t,d(base64)}]
  var seq = 0, uploadedUpTo = 0, paused = false, autoUpload = AUTO_UPLOAD_DEFAULT;
  var shadow = {};       // 监控地址上一次读值（同值重写会以"(重写)"标记记录）
  var lastCmdLine = '';  // 上一条 CMD 折叠键（整行相同跳过，防循环同值重写刷屏，等价 Lua last_line）
  var lastA = -1e9;      // A 键最后按下时刻(ms)
  var prevKeys = {};     // 手柄沿检测
  var keyState = {};     // 8 键实时状态（button数字 -> true/false），供 CMD 行 key= 快照
  var KEY_NAMES = null;  // button数字 -> 名称（首次从 nes.INPUT 反查）
  var lastClock = '';    // 分组用比赛时钟
  var snapArmed = false, snapCount = 0, lastSnapMs = 0;
  var lastScore = null, lastBall = null, lastStage = null;
  var romSeen = false;
  // 单例采集锁（localStorage 心跳）：navigator.locks 在部分环境不可用，用心跳锁跨 tab 互斥
  var TAB_ID = 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var LEADER_KEY = 'ct2HookLeader2', LEADER_HB_MS = 2000, LEADER_STALE_MS = 6000;
  // 键名带代数：IAB 测试环境 tab.close() 不杀 JS，旧版本页面的心跳会永久占住旧键，
  // 换键即让其失效（真实浏览器关页面即死，正常情况下不需要换键）
  var isLeader = false;

  try {
    var saved = JSON.parse(localStorage.getItem(STORE_REC) || 'null');
    var reused = !!(saved && saved.session === sess.id);
    if (reused && Array.isArray(saved.items)) { records = saved.items; seq = records.length ? records[records.length - 1].seq : 0; }
    var savedSnaps = JSON.parse(localStorage.getItem(STORE_SNAP) || 'null');
    if (savedSnaps && savedSnaps.session === sess.id && Array.isArray(saved.snaps)) snaps = savedSnaps.snaps;
    if (reused && typeof saved.uploadedUpTo === 'number') uploadedUpTo = saved.uploadedUpTo;
    // 会话过期换新后旧存档不再恢复：其中未同步的记录挂入补传队列（成为采集主控后以旧会话身份补发，服务端幂等）
    if (!reused && saved && prevSess && saved.session === prevSess.id && Array.isArray(saved.items)) {
      var pendingOrphan = saved.items.filter(function (r) { return (r.seq || 0) > (saved.uploadedUpTo || 0); });
      if (pendingOrphan.length) orphanFlush = { sess: prevSess, items: pendingOrphan };
    }
  } catch (e) { /* ignore */ }

  var ram, peak, frameNo = null;
  function getNes() {
    try { if (typeof nes !== 'undefined' && nes && nes.ram) return nes; } catch (e) { /* ignore */ }
    return (window.nes && window.nes.ram) ? window.nes : null;
  }
  function rb(a) { return ram[a & 0x7ff]; }
  function clockStr() {
    var v = rb(0x05F7); if (v === undefined) return '?';
    var t = v * 10;
    return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
  }
  function frameNow() { return (typeof frameCounter === 'number') ? frameCounter : null; }  // dbmain.js 的 let 全局
  function recLimit(kind) { return kind === 'SNAP' ? SNAP_LIMIT : REC_LIMIT; }
  function pushRec(r) {
    try {
      r.seq = ++seq; r.t = Date.now();
      if (r.k !== 'SNAP') r.c = lastClock;
      var f = frameNow(); if (f !== null) r.f = f;
      records.push(r);
      while (records.length > REC_LIMIT) records.shift();
      if (r.k === 'SNAP') { snaps.push(r); while (snaps.length > SNAP_LIMIT) snaps.shift(); }
      // 面板日志行入缓冲（SHOW_LOG 时才启用；1 秒定时器批量刷 DOM）
      if (SHOW_LOG && typeof fmtRec === 'function') { logBufUI.push(fmtRec(r)); if (logBufUI.length > UI_LOG_MAX + 50) logBufUI.shift(); }
      // 不在这里刷 UI：指令面板高频期每秒可达数百条，DOM 直刷会拖慢游戏，交给 1 秒定时器
    } catch (e) { /* 记录异常绝不能影响模拟器 */ }
  }

  // ---- PC -> ROM 定位（web 独有增强：FCEUX Lua 拿不到 mapper 寄存器）----
  function locate(pc) {
    var r = { pc: pc.toString(16).toUpperCase() };
    try {
      var m = getNes() && getNes().mapper;
      if (m && typeof m.getRomAdr === 'function') {
        var off = m.getRomAdr(pc) >>> 0;
        r.prg = off;                                   // PRG 数据偏移（+16 = .nes 文件偏移）
        var bank8K = off >>> 13, inBank = off & 0x1fff;
        r.hint = (pc >= 0xE000) ? ('FIX_E_' + pc.toString(16).toUpperCase())
               : (pc >= 0xC000) ? ('FIX_C_' + pc.toString(16).toUpperCase())
               : ('bank_' + ('0' + bank8K.toString(16)).slice(-2).toUpperCase() + ' / B_' + ('0' + bank8K.toString(16)).slice(-2).toUpperCase() + '_' + ('000' + inBank.toString(16).toUpperCase()).slice(-4));
      }
    } catch (e) { /* mapper 未就绪或非195，留空 */ }
    return r;
  }

  // ================= 解码（照 log_cmds_full.lua，修 DEF_GK 引用问题）=================
  function playerName(code) {
    if (PNAME && PNAME[code]) return PNAME[code].replace(/^\w+\s*/, '');
    return '?' + code.toString(16).toUpperCase().padStart(2, '0');
  }
  function slotName(v) {
    var mine = v <= 0x0A, base = mine ? 0x0300 : 0x0384, idx = mine ? v : v - 0x0B;
    var code = rb(base + idx * 12);
    return v.toString(16).toUpperCase().padStart(2, '0') + '(' + (mine ? 'M' : 'E') + (idx + 1) + ' ' + playerName(code) + ')';
  }
  function skillName(v, atkCmd, defCmd) {
    var exe = '';
    if (v >= 0x80) { exe = '·执行中'; v -= 0x80; }
    var name = null, tag = '';
    if (atkCmd === 0x01)      { name = subTableName(TBL_PASS, v);  tag = '传:'; }
    else if (atkCmd === 0x02) { name = subTableName(TBL_DRIB, v);  tag = '过:'; }
    else if (atkCmd === 0x03) { name = subTableName(TBL_ONE, v);   tag = '配:'; }
    else if (atkCmd !== null && atkCmd !== undefined && atkCmd < 0x0A) { name = subTableName(TBL_SHOOT, v); }
    if (name === null && SKILL_ALL && SKILL_ALL[v]) name = SKILL_ALL[v];
    // 守方必杀按守指令选守方子表（挡/铲/截）
    if (defCmd !== undefined && defCmd !== null) {
      var d = null;
      if (defCmd === 0x00) d = subTableName(TBL_BLOCK, v);
      else if (defCmd === 0x01) d = subTableName(TBL_TACKLE, v);
      else if (defCmd === 0x02) d = subTableName(TBL_INTER, v);
      if (d) { name = d; tag = '守:'; }
    }
    return v.toString(16).toUpperCase().padStart(2, '0') + '(' + (name || '?') + exe + ')';
  }
  function stageName(v) {
    // 优先读 cheats.js 的关卡对阵表（teamlist，34 项与选关表 26,00-26,21 对应）；
    // 没有名字的（hack 新增关卡等）照记数值——大数值本身就是 hack 加关的证据。
    var tl = cheatGlobal('teamlist');
    if (tl && tl[v]) return v.toString(16).toUpperCase().padStart(2, '0') + '(' + tl[v] + ')';
    var h = v.toString(16).toUpperCase().padStart(2, '0');
    if (v > 0x21) return h + '(超出原版33关, 疑似hack新增关卡)';
    return h + '(第' + (v + 1) + '关)';
  }
  function valName(addr, v) {
    if (v === undefined || v === null) return '??';
    if (addr === 0x0026) return stageName(v);
    if (addr === 0x043B) return v < 0x0A ? v.toString(16).toUpperCase().padStart(2, '0') + '(' + (ATK[v] || '?') + ')' : v.toString(16).toUpperCase();
    if (addr === 0x043D) {
      var gk = (rb(0x0442) === 0x00 || rb(0x0442) === 0x0B);
      if (gk && v < 0x0A) return v.toString(16).toUpperCase().padStart(2, '0') + '(' + (DEF_GK[v] || '?') + ')';
      return v < 0x0A ? v.toString(16).toUpperCase().padStart(2, '0') + '(' + (DEF[v] || '?') + ')' : v.toString(16).toUpperCase();
    }
    if (addr === 0x0441 || addr === 0x0442) return slotName(v);
    if (addr === 0x043C) return skillName(v, rb(0x043B));
    if (addr === 0x043E) return skillName(v, rb(0x043B), rb(0x043D));
    return v.toString(16).toUpperCase().padStart(2, '0');
  }
  // 面板上下文（等价 Lua ctx_short）：攻/守/球——CMD 行尾附加，省去翻前后条目
  function ctxShort() {
    try {
      return '面板: 攻=' + valName(0x043B, rb(0x043B)) + ' 守=' + valName(0x043D, rb(0x043D)) + ' 球=' + slotName(rb(0x0441));
    } catch (e) { return ''; }
  }
  // 按键组合快照（等价 Lua keys_snapshot）：'-' 或 'A+B+START' 式组合
  function keysSnapshot(n) {
    if (!KEY_NAMES && n && n.INPUT) {
      KEY_NAMES = {};
      for (var k in n.INPUT) { if (Object.prototype.hasOwnProperty.call(n.INPUT, k)) KEY_NAMES[n.INPUT[k]] = k; }
    }
    var parts = [];
    for (var b in keyState) { if (keyState[b] && KEY_NAMES && KEY_NAMES[b]) parts.push(KEY_NAMES[b]); }
    return parts.length ? parts.join('+') : '-';
  }

  // ================= 门将扑救快照流 =================
  function nearAnchor(pc, anchor) { return Math.abs(pc - anchor) <= ANCHOR_TOL; }
  function gkSnapshot(tag) {
    try {
      var n = getNes(); if (!n) return;
      var bin = new Uint8Array(0x200);
      for (var a = 0x0300; a <= 0x04FF; a++) bin[a - 0x0300] = rb(a);
      var s = '', CH = '0123456789abcdef';
      for (var i = 0; i < bin.length; i++) { s += CH[bin[i] >> 4] + CH[bin[i] & 15]; }
      snapCount++;
      pushRec({ k: 'SNAP', n: snapCount, tag: tag, d: s });
    } catch (e) { /* ignore */ }
  }

  // ================= onwrite 钩子（链式包装，与 debugger/ramwatch 共存）=================
  var mark = new Uint8Array(0x800);
  CMD_ADDRS.forEach(function (a) { mark[a & 0x7ff] = 1; });
  var wrapped = function (adr, val) {
    try {
      if (adr < 0x2000 && mark[adr & 0x7ff]) {
        var n = getNes();
        if (n) {
          ram = n.ram;                       // 读档会替换 nes.ram 数组，每次都要刷新引用
          var newV = val & 0xFF, oldV = shadow[adr];
          var pc = (n.cpu && n.cpu.br) ? (n.cpu.br[0] & 0xFFFF) : 0;
          shadow[adr] = newV;
          lastClock = clockStr();
          // 门将快照流状态机（锚点区间匹配，raw PC 已入日志可事后校准）—— ENABLE_SNAP 关闭时整段跳过
          if (ENABLE_SNAP) {
            if (adr === 0x0442 && !snapArmed && nearAnchor(pc, ANCHOR_GK_START)) {
              snapArmed = true;
              gkSnapshot('start');
              pushRec({ k: 'SYS', txt: '门将接管，快照流开始' });
            }
            if (adr === 0x0441 && snapArmed && ANCHOR_GK_END.some(function (a2) { return nearAnchor(pc, a2); })) {
              snapArmed = false;
              gkSnapshot('end');
            }
          }
          // 记录：值变化 → old→new；同值重写 → 带"(重写)"标记（逆向定位例程触发时机有信息量）。
          // 折叠键含 who/按键/上下文，与 Lua last_line 等价，防循环同值重写刷屏
          var isRewrite = (oldV !== undefined && oldV === newV);
          var loc = locate(pc);
          var isPlayer = (Date.now() - lastA) <= PLAYER_WINDOW_MS;
          var txt = (EVNAME[adr] || '') + ' $' + adr.toString(16).toUpperCase().padStart(4, '0') + ': '
                  + valName(adr, oldV) + '→' + valName(adr, newV) + (isRewrite ? '(重写)' : '');
          var keys = keysSnapshot(n);
          var ctx = ctxShort();
          var foldKey = txt + '|' + (isPlayer ? 'P' : 'E') + '|' + keys + '|' + ctx;
          // 同值重写受 LOG_REWRITE 开关控制（用户开关区）；关闭时跳过记录，影子状态与轮询水位照常更新
          if (!(isRewrite && !LOG_REWRITE) && foldKey !== lastCmdLine) {
            lastCmdLine = foldKey;
            pushRec({
              k: 'CMD', a: adr, o: (oldV === undefined ? null : oldV), v: newV,
              who: isPlayer ? 'P' : 'E',
              txt: txt + ' | ' + ctx + ' | key=' + keys,
              pc: loc.pc, prg: loc.prg, hint: loc.hint
            });
          }
          // 同步轮询水位：写钩子已记录的关卡变化，tick 不再重复记
          if (adr === 0x0026) lastStage = newV;
          // 门将接管期间的连续快照（≈每30帧一份）—— ENABLE_SNAP 关闭时不触发
          if (ENABLE_SNAP && snapArmed && Date.now() - lastSnapMs >= SNAP_INTERVAL_MS) { lastSnapMs = Date.now(); gkSnapshot('seq'); }
        }
      }
    } catch (e) { /* 钩子内异常绝不能影响模拟器写路径 */ }
    var chain = wrapped.__chain;
    if (chain) chain(adr, val);
  };
  function chainHas(node) { while (node) { if (node === wrapped) return true; node = node.__chain; } return false; }
  function ensureHook(n) {
    if (chainHas(n.onwrite)) return;
    wrapped.__chain = (typeof n.onwrite === 'function') ? n.onwrite : null;
    try { n.onwrite = wrapped; } catch (e) { /* ignore */ }
  }

  // ================= 手柄包装：A 键沿检测（[玩家]窗口 + INPUT 日志）=================
  function hookButtons(n) {
    if (n.__ct2RecBtnHooked) return;
    var op = n.setButtonPressed, or_ = n.setButtonReleased;
    if (typeof op !== 'function') return;
    n.setButtonPressed = function (player, button) {
      try {
        if (button === n.INPUT.A) {
          lastA = Date.now();
          if (!prevKeys.A) {
            prevKeys.A = true;
            lastClock = clockStr();
            //pushRec({ k: 'INPUT', txt: 'A按下 面板: 攻=' + valName(0x043B, rb(0x043B)) + ' 必=' + valName(0x043C, rb(0x043C)) + ' 守=' + valName(0x043D, rb(0x043D)) });// 暂时不记录
          }
        }
      } catch (e) { /* ignore */ }
      return op.call(n, player, button);
    };
    n.setButtonReleased = function (player, button) {
      try { if (button === n.INPUT.A) prevKeys.A = false; } catch (e) { /* ignore */ }
      return or_.call(n, player, button);
    };
    n.__ct2RecBtnHooked = true;
  }

  // ================= 轮询：比分 / 持球方 / 关卡 / ROM 识别 =================
  var ROM_TAGS = { 32: 'origin(中版原版)', 80: 'game(传说之翼)', 96: 'game2(纵横天下)' };
  function romTagOf(n) {
    // romTag = bank 标签 + ' | ' + 游戏文件名。
    // bank 前缀不能去掉：log_view.php 靠 romTag 前缀（game2/game/origin）推断 banks 数，
    // 选择反汇编用的 ROM 文件与 src 源码目录（写入点反汇编功能依赖）。
    // 文件名取 loadRom 记录的 loadedName（dbmain.js 顶层 let，全加载路径统一赋值；
    // 不挂 window 须裸引用，hook 动态注入晚于 dbmain 执行无 TDZ 问题），用于区分同 banks 的不同改版。
    var name = '';
    try {
      if (typeof loadedName !== 'undefined' && loadedName) name = loadedName;
    } catch (e) { /* ignore */ }
    var bankTag = '';
    try {
      var b = n.mapper && n.mapper.h && n.mapper.h.banks;
      if (b) bankTag = ROM_TAGS[b] || ('banks' + b);
    } catch (e) { /* ignore */ }
    if (bankTag && name) return bankTag + ' | ' + name;
    return bankTag || name || '?';
  }
  var romAnnounced = false; // 页面级标志：每次加载首个识别到的 ROM 记录一条，此后仅变化时再记
  function tick() {
    try {
      var n = getNes();
      if (!n || !n.ram || !window.loaded) return;
      ram = n.ram; peak = n.peak.bind(n);
      hookButtons(n);
      if (n.mapper && n.mapper.h) {
        var tag = romTagOf(n);
        var changed = tag !== '?' && tag !== sess.romTag;
        if (!romAnnounced && tag !== '?') { romAnnounced = true; changed = true; }
        if (changed) {
          sess.romTag = tag;
          try { localStorage.setItem(STORE_SESS, JSON.stringify(sess)); } catch (e2) { /* ignore */ }
          pushRec({ k: 'SYS', txt: 'ROM载入: ' + sess.romTag + ' 会话=' + sess.id });
        }
      }
      var sc = rb(0x28) * 256 + rb(0x29);
      if (lastScore !== null && sc !== lastScore) {
        pushRec({ k: 'SCORE', o: [lastScore >> 8, lastScore & 255], v: [rb(0x28), rb(0x29)], txt: '比分 我' + (lastScore >> 8) + '-' + (lastScore & 255) + ' → 我' + rb(0x28) + '-' + rb(0x29) + '（球权随之重置）' });
      }
      lastScore = sc;
      var ball = rb(0x05FB);
      if (lastBall !== null && ball !== lastBall) pushRec({ k: 'BALL', o: lastBall, v: ball, txt: '球权 ' + ballName(ball) });
      lastBall = ball;
      // $0026 关卡双层监控：写钩子记 CPU 写（带 PC）；下面轮询兜底记读档/金手指直写——
      // 读档是整块 RAM 快照恢复（nes.setState），不走 CPU 写指令，onwrite 触发不到，实测已验证
      var st = rb(0x26);
      if (lastStage === null) { lastStage = st; }
      else if (st !== lastStage) {
        lastClock = clockStr();
        pushRec({ k: 'STAGE', o: lastStage, v: st, txt: '关卡 ' + stageName(lastStage) + ' → ' + stageName(st) });
        lastStage = st;
      }
      lastClock = clockStr();
    } catch (e) { /* ignore */ }
  }

  // ================= localStorage 持久化（节流）=================
  var saveTimer = null;
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        localStorage.setItem(STORE_REC, JSON.stringify({ session: sess.id, uploadedUpTo: uploadedUpTo, items: records }));
        localStorage.setItem(STORE_SNAP, JSON.stringify({ session: sess.id, snaps: snaps }));
      } catch (e) { /* 超限等异常静默：本地丢了还有上传通道 */ }
    }, SAVE_INTERVAL_MS);
  }
  setInterval(scheduleSave, SAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', function () {
    try {
      localStorage.setItem(STORE_REC, JSON.stringify({ session: sess.id, uploadedUpTo: uploadedUpTo, items: records }));
      localStorage.setItem(STORE_SNAP, JSON.stringify({ session: sess.id, snaps: snaps }));
      // leader 主动放锁，加速其他页面接管
      var cur = readLeader();
      if (isLeader && cur && cur.tab === TAB_ID) localStorage.removeItem(LEADER_KEY);
    } catch (e) { /* ignore */ }
  });
  // 手机端（尤其 iOS）杀后台不走 beforeunload，切后台时也保存一版
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'hidden') return;
    try {
      localStorage.setItem(STORE_REC, JSON.stringify({ session: sess.id, uploadedUpTo: uploadedUpTo, items: records }));
      localStorage.setItem(STORE_SNAP, JSON.stringify({ session: sess.id, snaps: snaps }));
    } catch (e) { /* ignore */ }
  });

  // ---------- 单例采集锁（心跳 2s / 过期 6s，抢锁后回读验证防竞态） ----------
  function readLeader() {
    try { return JSON.parse(localStorage.getItem(LEADER_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeLeader() {
    try { localStorage.setItem(LEADER_KEY, JSON.stringify({ tab: TAB_ID, ts: Date.now() })); } catch (e) { /* ignore */ }
  }
  function showStandby() {
    buildUi();
    cntEl.textContent = '待命：另一页面采集中，关闭它后自动接管';
    dotEl.className = 'cr-dot';
  }
  function tryBecomeLeader() {
    if (isLeader) return;
    var cur = readLeader();
    if (cur && cur.tab !== TAB_ID && Date.now() - cur.ts < LEADER_STALE_MS) {
      showStandby();
      setTimeout(tryBecomeLeader, 5000);
      return;
    }
    writeLeader();
    setTimeout(function () {          // 回读验证：抢锁瞬间有竞争者则让位
      var now = readLeader();
      if (!now || now.tab !== TAB_ID) { showStandby(); setTimeout(tryBecomeLeader, 5000); return; }
      isLeader = true;
      boot();
      setInterval(writeLeader, LEADER_HB_MS);
    }, 300);
  }

  // ================= 上传（server/log_api.php，UNIQUE(session,seq) 幂等）=================
  var uploading = false, uploadTimer = null, uploadFailStreak = 0;
  function apiReq(action, body) {
    return fetch(API_URL + '?action=' + action, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'X-Sync-Token': getApiToken() } : { 'X-Sync-Token': getApiToken() },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); });
  }
  // 旧会话未同步记录补传：沿用旧会话 id 与原生 seq 分批发送；服务端 UNIQUE(session,seq) 幂等，
  // 重发已收过的条目会被忽略，不会产生重复数据，也不会混入新会话。
  function flushOrphan(o) {
    var meta = { romTag: o.sess.romTag, ua: navigator.userAgent, start: o.sess.start };
    var i = 0;
    function sendBatch(retry) {
      var batch = o.items.slice(i, i + UPLOAD_BATCH);
      apiReq('upload', { session: o.sess.id, meta: meta, items: batch }).then(function (res) {
        if (res && res.ok) {
          i += batch.length;
          if (i < o.items.length) sendBatch(true);
        } else if (retry) {
          sendBatch(false); // 服务器拒绝（如令牌无效）：重试一次后放弃并告警，避免死循环
        } else {
          console.warn('[CT2采集] 旧会话 ' + o.sess.id + ' 补传被服务器拒绝，剩余 ' + (o.items.length - i) + ' 条未补传');
        }
      }).catch(function () {
        if (retry) sendBatch(false);
        else console.warn('[CT2采集] 旧会话 ' + o.sess.id + ' 补传失败，剩余 ' + (o.items.length - i) + ' 条未补传');
      });
    }
    if (o.items.length) sendBatch(true);
  }
  function doUpload() {
    if (uploading || paused) return Promise.resolve({ skipped: true });
    var pending = records.filter(function (r) { return r.seq > uploadedUpTo; });
    if (!pending.length) return Promise.resolve({ ok: true, inserted: 0 });
    uploading = true;
    var batch = pending.slice(0, UPLOAD_BATCH);
    return apiReq('upload', {
      session: sess.id, meta: { romTag: sess.romTag, ua: navigator.userAgent, start: sess.start },
      items: batch
    }).then(function (res) {
      uploading = false; uploadFailStreak = 0;
      if (res && res.ok) {
        uploadedUpTo = Math.max(uploadedUpTo, batch[batch.length - 1].seq);
        scheduleSave(); updateUi();
      }
      return res;
    }).catch(function () {
      uploading = false; uploadFailStreak++;
      var delay = Math.min(UPLOAD_INTERVAL_MS * uploadFailStreak, 300000);
      clearTimeout(uploadTimer); uploadTimer = setTimeout(autoUploadTick, delay);
      return { ok: false, retryIn: delay };
    });
  }
  function autoUploadTick() { if (autoUpload && !paused) doUpload().then(function () { if (autoUpload) uploadTimer = setTimeout(autoUploadTick, UPLOAD_INTERVAL_MS); }); }

  // ================= UI 迷你面板（左下角，避开 ramwatch 右下便签）=================
  var note, cntEl, dotEl, logEl;
  var logBufUI = [];        // 待刷的日志行（批量 flush，高峰期不逐条碰 DOM）
  var UI_LOG_MAX = 150;     // 日志区 DOM 行数上限
  var uiFold = false;       // 日志区折叠状态（localStorage 记忆）
  try { uiFold = localStorage.getItem('ct2HookFold') === '1'; } catch (e) { /* ignore */ }
  function fmtRec(r) {
    var c = '<span class="t">' + (r.c || '') + '</span> ';
    switch (r.k) {
      case 'CMD':   return c + '<span class="' + (r.who === 'P' ? 'p' : 'w') + '">[' + (r.who === 'P' ? '玩家' : '引擎') + ']</span> ' + (r.txt || '') + (r.hint ? ' <span class="t">@' + r.hint.split('/').pop() + '</span>' : '');
      case 'SCORE': return c + '[比分] ' + (r.txt || '').replace('比分 ', '');
      case 'BALL':  return c + '[球权] ' + (r.txt || '').replace('球权 ', '');
      case 'STAGE': return c + '[关卡] ' + (r.txt || '').replace('关卡 $0026=', '');
      case 'INPUT': return c + '[按键] ' + (r.txt || '').replace('A按下 ', '');
      case 'SNAP':  return c + '[快照] #' + r.n + '(' + r.tag + ')';
      default:      return (r.txt || r.k);
    }
  }
  function flushLogUI() {
    if (!logEl || !logBufUI.length) return;
    if (logEl.querySelector('.empty')) logEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (const line of logBufUI) {
      var div = document.createElement('div');
      div.className = 'e';
      div.innerHTML = line;
      frag.appendChild(div);
    }
    logEl.appendChild(frag);
    logBufUI.length = 0;
    while (logEl.children.length > UI_LOG_MAX) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function buildUi() {
    if (note) return;   // 待命阶段已建过面板，接管后直接复用，避免 DOM 里出现两个同 id 元素
    var style = document.createElement('style');
    style.textContent = `
      #ct2RecNote { position: fixed; left: 12px; bottom: 12px; background: linear-gradient(165deg, rgba(30,36,48,.97), rgba(11,15,20,.98));
        color: #fff; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.55);
z-index: 20015; font-size: 12px; user-select: none; overflow: hidden; max-width:100%; }
      .cr-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: rgba(255,255,255,.05);
        cursor: move; touch-action: none; }
      .cr-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a4a4a; flex: none; }
      .cr-dot.on { background: #e74c3c; box-shadow: 0 0 6px rgba(231,76,60,.8); }
      .cr-dot.up { background: #2ecc71; box-shadow: 0 0 6px rgba(46,204,113,.8); }
      .cr-title { flex: 1; font-weight: 700; }
      .cr-btn { border: none; border-radius: 5px; background: rgba(255,255,255,.1); color: #fff; cursor: pointer;
        font-size: 11px; padding: 3px 7px; }
      .cr-btn:hover { background: rgba(255,255,255,.25); }
      #ct2RecNote.cr-fold .cr-body, #ct2RecNote.cr-fold .cr-log { display: none; }
      /* 折叠态：隐藏「下载」，压缩其余按钮，标题栏只留 上传/清空/折叠 */
      #ct2RecNote.cr-fold .cr-btn[data-act="dl"] { display: none; }
      #ct2RecNote.cr-fold .cr-btn { padding: 3px 5px; }
      .cr-body { padding: 6px 10px 8px; font-family: Consolas, Menlo, monospace; font-size: 11px; color: rgba(255,255,255,.75); }
      .cr-log { margin: 0 10px 8px; height: 150px; overflow-y: auto; background: rgba(0,0,0,.25);
        border-radius: 6px; padding: 4px 6px; font-family: Consolas, Menlo, monospace;
        font-size: 11px; line-height: 1.6; overscroll-behavior: contain; }
      .cr-log::-webkit-scrollbar { width: 6px; }
      .cr-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
      .cr-log .e { white-space: nowrap; }
      .cr-log .t { color: rgba(255,255,255,.35); }
      .cr-log .p { color: #ffd54a; }
      .cr-log .w { color: #fff; }
      .cr-log .empty { color: rgba(255,255,255,.3); }
    `;
    document.head.appendChild(style);
    note = document.createElement('div');
    note.id = 'ct2RecNote';
    note.innerHTML = `
      <div class="cr-head">
        <span class="cr-dot"></span><span class="cr-title">CT2 采集 ${SCRIPT_VER}</span>
        <button class="cr-btn" data-act="up">上传</button>
        <button class="cr-btn" data-act="dl">下载</button>
        <button class="cr-btn" data-act="clear">清空</button>
        <button class="cr-btn" data-act="fold" title="最小化/展开">−</button>
      </div>
      <div class="cr-body">等待载入游戏…</div>` +
      (SHOW_LOG ? `<div class="cr-log"><div class="empty">暂无事件</div></div>` : ``);
    (document.getElementById('fullscreenContainer') || document.body).appendChild(note);
    cntEl = note.querySelector('.cr-body');
    dotEl = note.querySelector('.cr-dot');
    logEl = note.querySelector('.cr-log');
    note.querySelector('[data-act=up]').onclick = function () { doUpload(); };
    note.querySelector('[data-act=dl]').onclick = function () { CT2Hook.download(); };
    note.querySelector('[data-act=clear]').onclick = function () { CT2Hook.clear(); };
    var foldBtn = note.querySelector('[data-act=fold]');
    function applyFold() {
      note.classList.toggle('cr-fold', uiFold);
      foldBtn.textContent = uiFold ? '+' : '−';
    }
    applyFold();
    foldBtn.onclick = function () {
      uiFold = !uiFold; applyFold();
      try { localStorage.setItem('ct2HookFold', uiFold ? '1' : '0'); } catch (e) { /* ignore */ }
    };
    // ---------- 拖动（照 ramwatch 模式：头部把手 + pointer capture + 位置记忆） ----------
    (function restorePos() {
      try {
        var p = JSON.parse(localStorage.getItem('ct2HookPos') || 'null');
        if (p && p.x != null) {
          note.style.left = Math.max(0, Math.min(p.x, window.innerWidth - 60)) + 'px';
          note.style.top = Math.max(0, Math.min(p.y, window.innerHeight - 30)) + 'px';
          note.style.right = 'auto'; note.style.bottom = 'auto';
        }
      } catch (e) { /* ignore */ }
    })();
    var head = note.querySelector('.cr-head');
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.cr-btn')) return;
      var rect = note.getBoundingClientRect();
      var offX = e.clientX - rect.left, offY = e.clientY - rect.top;
      note.style.right = 'auto'; note.style.bottom = 'auto';
      head.setPointerCapture(e.pointerId);
      function move(ev) {
        var x = Math.max(0, Math.min(ev.clientX - offX, window.innerWidth - rect.width));
        var y = Math.max(0, Math.min(ev.clientY - offY, window.innerHeight - 30));
        note.style.left = x + 'px'; note.style.top = y + 'px';
      }
      function up() {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        try {
          var rr = note.getBoundingClientRect();
          localStorage.setItem('ct2HookPos', JSON.stringify({ x: rr.left, y: rr.top }));
        } catch (err) { /* ignore */ }
      }
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }
  function updateUi() {
    if (!cntEl) return;
    var pending = records.filter(function (r) { return r.seq > uploadedUpTo; }).length;
    cntEl.textContent = sess.romTag + ' | ' + sess.id + ' | ' + records.length + ' 条 (待传' + pending + ') 快照' + snaps.length + (paused ? ' | 已暂停' : '');
  }
  var lastUiCount = -1;
  setInterval(function () {
    if (!note || !records || !isLeader) return;   // 待命页面保持待命文本，不刷数据
    if (records.length !== lastUiCount) { lastUiCount = records.length; updateUi(); }
    if (logEl && !uiFold && logBufUI.length) flushLogUI();
    if (dotEl) dotEl.className = 'cr-dot ' + (paused ? '' : (records.length && uploadedUpTo >= records[records.length - 1].seq ? 'up' : 'on'));
  }, 1000);

  // ================= 对外 API =================
  var CT2Hook = {
    status: function () {
      return {
        ver: SCRIPT_VER,
        enabled: true, session: sess.id, romTag: sess.romTag, paused: paused, autoUpload: autoUpload,
        records: records.length, snaps: snaps.length, uploadedUpTo: uploadedUpTo,
        pending: records.filter(function (r) { return r.seq > uploadedUpTo; }).length,
        hook: (function () { var n = getNes(); return n ? (chainHas(n.onwrite) ? 'attached' : 'waiting') : 'no-nes'; })()
      };
    },
    exportJSON: function () { return JSON.stringify({ session: sess.id, romTag: sess.romTag, exported: new Date().toISOString(), records: records, snaps: snaps }, null, 1); },
    download: function () {
      var blob = new Blob([CT2Hook.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ct2_hook_' + sess.id + '.json';
      a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    },
    upload: function () { return doUpload(); },
    clear: function () {
      // 清空必须连带换新会话：服务端按 UNIQUE(session, seq) 去重，若沿用旧会话，
      // 新记录 seq 从 1 重计会全部撞上去重约束，后续上传将永远被服务器忽略
      return CT2Hook.newSession(true); // 用户主动清空：未传记录一并丢弃，不补传
    },
    newSession: function (dropPending) {
      // 换会话前，把当前会话未同步的记录挂入补传队列：以旧会话身份补发（服务端幂等），新会话数据保持干净
      var pending = dropPending ? [] : records.filter(function (r) { return r.seq > uploadedUpTo; });
      if (pending.length) { var o = { sess: sess, items: pending.slice() }; orphanFlush = o; flushOrphan(o); } // 页面运行中 boot 不会再触发，立即异步补发
      sess = { id: 'S' + Date.now().toString(36), start: Date.now(), romTag: sess.romTag };
      records = []; snaps = []; seq = 0; uploadedUpTo = 0; shadow = {}; snapCount = 0; snapArmed = false;
      logBufUI.length = 0;
      if (logEl) logEl.innerHTML = '<div class="empty">暂无事件</div>';
      try { localStorage.setItem(STORE_SESS, JSON.stringify(sess)); } catch (e) { /* ignore */ }
      scheduleSave();
      updateUi(); return sess.id;
    },
    setAutoUpload: function (v) { autoUpload = !!v; return autoUpload; },
    pause: function () { paused = true; updateUi(); },
    resume: function () { paused = false; updateUi(); },
    tryLead: function () { if (!isLeader) tryBecomeLeader(); return isLeader; }   // 手动触发接管（后台节流时重试变慢，可用它立即抢）
  };
  window.CT2Hook = CT2Hook;

  // ================= 启动：单例采集（localStorage 心跳锁，多页面只允许一个采集者）=================
  // localStorage 是站点级共享的，多个游戏页面各自内存 records 会互相覆盖保存、
  // 丢数据 + 会话 id 错乱。心跳锁保证同一时刻只有一个页面采集，
  // 采集页关闭时 beforeunload 主动放锁，待命页面 5 秒内自动接管。
  function boot() {
    buildUi();
    updateUi();
    if (orphanFlush) { var o = orphanFlush; orphanFlush = null; flushOrphan(o); } // 成为采集主控后补发旧会话未同步记录
    pushRec({ k: 'SYS', txt: '会话开始 ' + sess.id }); // 标记会话加载起点（会话 id 随上传提交到服务器）
    setInterval(tick, 250);
    setInterval(function () { var n = getNes(); if (n) { ensureHook(n); hookButtons(n); } }, 1000);
    (function waitNes() {
      var n = getNes();
      if (n) { ensureHook(n); hookButtons(n); } else { setTimeout(waitNes, 500); }
    })();
    if (autoUpload) uploadTimer = setTimeout(autoUploadTick, UPLOAD_INTERVAL_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryBecomeLeader);
  else tryBecomeLeader();
})();
