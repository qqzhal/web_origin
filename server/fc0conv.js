/*
 * fc0conv.js — FCEUX/nes.emu 即时存档(.fc0/.fc1-9/.fc2) 与 本站 web 模拟器即时存档(saveState) 互转
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠  历史事故与教训（改本文件前必读）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 【事故一：导出到 FCEUX 读档花屏，按 A 无反应（t 寄存器截断）】
 *   现象：web 导出的 .fc0 在 FCEUX 里读档后，标题/边框图块错乱，游戏时序卡住。
 *   原因：web 的 v/t 是标准 15 位 loopy VRAM 地址寄存器，早期导出时写成
 *         `t & 0x7ff` 截成 11 位，丢失 fineY(bit12-14) + nametable 选择(bit10-11)。
 *         FCEUX 渲染时每条扫描线都用 t 重载 v 的高位段，所以每帧持续花屏；
 *         而"web→导出→再导回 web"往返自洽，问题只在 FCEUX 侧暴露。
 *   修复：t/v 双向都保 15 位（& 0x7fff），新 PPU 位域按 ppur 结构拆分
 *         （PVxx/P_Vx=bit10，PHxx/P_Hx=bit11，PSxx=$2000 bit4 BG 图案表）。
 *
 * 【事故二：导出到 FCEUX 依旧花屏（APU 帧中断风暴，真正的元凶）】
 *   现象：同上，且按 A 只有画面抖动、进不了会议。
 *   排查：用"混合档二分法"（见 gen_hybrids.js）——以 FCEUX 自己的正常档为底，
 *         逐组替换成 web 状态的字段，Lua 逐档加载并钩出 $8000/$8001 写入轨迹。
 *         结果：单独换 CPU/PPU/RAM/WRAM/CHR/bank寄存器/IRQ 全部健康，
 *         只换 SND(声音) 组即花屏。
 *   根因：导出的 APU 状态曾全填 0。FCEUX sound.cpp FrameSoundUpdate()：
 *             if (!fcnt && !(IRQFrameMode & 0x3)) { 发帧中断 }
 *         IQFM=0 时帧中断每序列触发，而游戏的 IRQ 处理器只应答 MMC3 中断
 *         （写 $E000）、从不读 $4015 清帧标志 → 中断线永远悬空 → 处理器
 *         一退出立刻重入（实测每帧 ~119 次）→ CPU 全耗在中断上，游戏时序
 *         崩溃。web 模拟器无此机制所以导入方向一直正常，问题只在 FCEUX 暴露。
 *   修复：SND 块不能全 0，必须给安全默认值（见 webStateToFcsxChunks 的 sndChunk）：
 *             IQFM=1      bit0 置位即抑制帧中断（与正常存档实测值一致）
 *             FHCN=357960 FCEUSND_Reset 的 fhinc（NTSC 14915*24），0 会立即超时
 *             NREG=1、5ACC=1  复位/静态初值
 *   教训：web 没有对应概念的字段，不能想当然填 0——要填 FCEUX 复位(Power/Reset)
 *         后的安全默认值。判断依据是 FCEUX 源码（fceux-2.6.6-yhc/src/），
 *         APU 见 sound.cpp 的 FCEUSND_Reset()。
 *
 * 【排查方法论（再次遇到类似问题的工具）】
 *   - server/gen_hybrids.js + gen_verify.js + ct2_disasm/out/fcx_state_test.lua：
 *     生成混合档 → FCEUX 里 File→Load Lua Script 逐档加载 → 日志统计
 *     "谁在写 bank 寄存器"。健康特征 = 每帧一次的完整 NMI 重映射（pc=c43a/
 *     c449/c458/c464 等）；花屏特征 = pc=c48e/c49d/a1d4/a1e0 死循环刷屏。
 *   - server/test_fc0conv.js      用真实 .fc0 做往返一致性回归（50 项）
 *   - server/test_export_fidelity.js  导出方向 v/t 高位保真回归（17 项）
 *   - server/check_schema.js      转换输出字段名与模拟器 saveVars 严格核对
 *     （字段名拼错会被 setObjState 静默跳过导致读档无效，改字段名后必跑）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 格式说明
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FCEUX FCSX 格式（fceux src/state.cpp FCEUSS_SaveMS / FCEUSS_LoadFP）：
 *   文件头 16 字节：
 *     "FCSX"
 *     u32le totalsize    未压缩 chunk 流总长
 *     u32le stateversion FCEU_VERSION_NUMERIC（读取时不校验具体值）
 *     u32le comprlen     zlib 流长度
 *   后接 comprlen 字节 zlib 流，解压得 chunk 流。
 *   旧式未压缩文件以 "FCS\xFF" 开头，第 5-8 字节是 version，之后直接是 chunk 流。
 * chunk 流：反复 { u8 type; u32le size; data[size] }
 *   type: 1=CPU 2=CPU附加 3=PPU 4=手柄 5=APU 6=电影 8=后备帧 0x10=mapper(SFMDATA) 31=新PPU
 * 块内 SFORMAT 条目：反复 { char desc[4]; u32le size; data[size] }，desc 右侧补 \0。
 * FCEUX 读取时按 desc 匹配写入内部变量，条目缺失/多余/尺寸不符均跳过不报错
 * （state.cpp ReadStateChunk 的 CheckS 容错），所以转换只需覆盖关键变量。
 * 注意 nes.emu 的 .fc2 与 .fc0 格式完全相同（FCEUX 核心），可互通。
 *
 * mapper195 卡带的 SFMDATA（fceux src/boards/mmc3.cpp Mapper195_Init）：
 *   WRAM(16384) KTEX(1) REGS(8) CMD A000 A001 IRQR IRQC IRQL IRQA(各1) CHRR(4096) M5KX(4096)
 * 与 web 端（web/emu/mappers/mapper195.js + web/emu/mappers/mmc3.js 的 saveVars）的对应：
 *   WRAM -> mapper.prgRam(8K, 仅前 8K 可见)   REGS -> mapper.bankRegs
 *   CMD  -> regSelect | prgMode<<6 | chrMode<<7
 *   A000 -> mapper.mirroring（编码一致：0=垂直 1=水平）
 *   IRQR/IRQC/IRQL/IRQA -> reloadIrq/irqCounter/irqLatch/irqEnabled
 *   CHRR -> mapper.chrRam    M5KX($5000-$5FFF) -> mapper.extraPrgRam
 *   chrBankSelect/chrPageTable 是 web 端派生状态，读档时由 setHackState 重建，不参与转换。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fc0Conv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHUNK = { CPU: 1, CPUC: 2, PPU: 3, CTRL: 4, SND: 5, MOVIE: 6, BACKBUF: 8, SFMDATA: 0x10, NEWPPU: 0x1f };

  function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function w16le(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; }
  function w32le(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = (v >> 16) & 0xff; b[o + 3] = (v >> 24) & 0xff; }

  // 把 SFORMAT 的 4 字节 desc 转成键名（去掉尾部 \0）
  function descKey(b) {
    var s = '';
    for (var i = 0; i < 4; i++) { if (b[i] === 0) break; s += String.fromCharCode(b[i]); }
    return s;
  }

  // ---------- 解析 fc0 ----------
  // inflate: (Uint8Array) -> Promise<Uint8Array>，浏览器传 zlib 解压实现
  // 返回 { stateversion, chunks: [{type, data}] }
  function parseFc0(buffer, inflate) {
    var head = new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength));
    if (head.length < 16 || String.fromCharCode(head[0], head[1], head[2]) !== 'FCS') {
      return Promise.reject(new Error('不是 FCEUX 存档文件（缺少 FCS 标识）'));
    }
    var stream, stateversion;
    if (head[3] === 0x58 /* 'X'，压缩格式 */) {
      var totalsize = u32le(head, 4);
      stateversion = u32le(head, 8);
      var comprlen = u32le(head, 12);
      var compressed = new Uint8Array(buffer, 16, Math.min(comprlen, buffer.byteLength - 16));
      return inflate(compressed).then(function (raw) {
        if (raw.length !== totalsize) throw new Error('存档解压后长度不符（' + raw.length + ' ≠ ' + totalsize + '），文件可能损坏');
        return { stateversion: stateversion, chunks: parseChunks(raw) };
      });
    }
    if (head[3] === 0xff /* 旧式未压缩 */) {
      stateversion = u32le(head, 4);
      stream = new Uint8Array(buffer, 8);
      return Promise.resolve({ stateversion: stateversion, chunks: parseChunks(stream) });
    }
    return Promise.reject(new Error('不支持的 FCEUX 存档格式（FCS 后的字节为 0x' + head[3].toString(16) + '）'));
  }

  function parseChunks(u) {
    var chunks = [], off = 0;
    while (off + 5 <= u.length) {
      var type = u[off];
      var size = u32le(u, off + 1);
      if (off + 5 + size > u.length) break;
      chunks.push({ type: type, data: u.subarray(off + 5, off + 5 + size) });
      off += 5 + size;
    }
    return chunks;
  }

  // 把一个块的 data 解析成 { 键名: Uint8Array }
  function readSformat(data) {
    var out = {}, off = 0;
    while (off + 8 <= data.length) {
      var key = descKey(data.subarray(off, off + 4));
      var size = u32le(data, off + 4);
      if (off + 8 + size > data.length) break;
      out[key] = data.subarray(off + 8, off + 8 + size);
      off += 8 + size;
    }
    return out;
  }

  // 从解析结果里取出各块的条目表；merge 为 true 时返回合并视图（后出现的覆盖先出现的）
  function collectSformat(parsed) {
    var byType = {}, merged = {};
    parsed.chunks.forEach(function (c) {
      var sf = readSformat(c.data);
      byType[c.type] = sf;
      for (var k in sf) merged[k] = sf[k];
    });
    return { byType: byType, sf: merged };
  }

  // ---------- FCEUX -> web saveState ----------
  // parsed: parseFc0 的结果；prev: 槽位现有的 saveState（用于沿用 header），可空
  function fc0ToWebState(parsed, prev) {
    var c = collectSformat(parsed);
    var sf = c.sf;
    function need(key) {
      if (!sf[key]) throw new Error('存档缺少必要的 "' + key + '" 数据块，可能不是 Mapper195/MMC3 类游戏的存档');
      return sf[key];
    }

    // --- CPU 块 ---
    var PC = need('PC'), A = need('A'), X = need('X'), Y = need('Y'), S = need('S'), P = need('P'), RAM = need('RAM');
    var p = P[0];
    var ram = new Array(0x8000);
    for (var i = 0; i < 0x8000; i++) ram[i] = i < 0x800 ? RAM[i] : 0;

    // --- PPU 块 ---
    // ⚠ v/t 是 15 位 loopy 寄存器，双向都必须保 & 0x7fff——曾因截断成 11 位
    // （丢 fineY+nametable 位）导致 FCEUX 读档持续花屏，见文件头【事故一】。
    var NTAR = need('NTAR'), PRAM = need('PRAM'), SPRA = need('SPRA'), PPUR = need('PPUR');
    var XOFF = sf.XOFF ? sf.XOFF[0] : 0;
    var VTGL = sf.VTGL ? sf.VTGL[0] : 0;
    var RADD = sf.RADD || [0, 0], TADD = sf.TADD || [0, 0];
    var VBUF = sf.VBUF ? sf.VBUF[0] : 0;
    // FCEUX PPU[4] = [$2000, $2001, $2002, OAM地址]（ppu.cpp: VBlankON/PPUMASK/PPU_status/SPRAM[PPU[3]]）
    var r0 = PPUR[0], r1 = PPUR[1], r2 = PPUR[2], oamadr = PPUR[3];

    // --- 手柄块 ---
    var joys = sf.JOYS || [0, 0, 0, 0];
    var lsts = sf.LSTS ? sf.LSTS[0] : 0;

    // --- mapper 块（SFMDATA）---
    // WRAM/REGS/CMD 是 MMC3 类游戏必有；CHRR/M5KX 仅 mapper195/198 等带板上
    // CHR RAM / $5000-$5FFF XRAM 的卡带才有，缺失时省略字段，读档时保留原值
    var WRAM = need('WRAM'), REGS = need('REGS'), CMD = need('CMD');
    function sfByte(key) { return sf[key] ? sf[key][0] : 0; }
    var prgRam = new Array(0x2000);
    for (i = 0; i < 0x2000; i++) prgRam[i] = WRAM[i]; // FCEUX WRAM 16K，卡带仅 $6000-$7FFF 8K 可见
    var bankRegs = new Array(8);
    for (i = 0; i < 8; i++) bankRegs[i] = REGS[i];
    var mirroring;
    if (prev && prev.header && typeof prev.header.verticalMirroring === 'boolean') {
      // mapper195 的镜像由 iNES 标志位固定（游戏几乎不写 $A000），以槽位存档记录的 header 为准；
      // web 的 mirroring 编码与 MMC3 $A000 一致：0=垂直，1=水平
      mirroring = prev.header.verticalMirroring ? 0 : 1;
    } else {
      mirroring = sfByte('A000') & 1;
    }

    var state = {
      version: 1,
      ram: ram,
      cycles: 0,
      inDma: 0, dmaTimer: 0, dmaBase: 0, dmaValue: 0,
      latchedControl1State: joys[0] || 0,
      latchedControl2State: joys[1] || 0,
      controllerLatched: lsts ? 1 : 0,
      mapperIrqWanted: 0, frameIrqWanted: 0, dmcIrqWanted: 0,
      cpu: {
        r: [A[0], X[0], Y[0], S[0]],
        br: [u16le(PC, 0)],
        n: (p >> 7) & 1, v: (p >> 6) & 1, d: (p >> 3) & 1, i: (p >> 2) & 1, z: (p >> 1) & 1, c: p & 1,
        irqWanted: 0, nmiWanted: 0, cyclesLeft: 0
      },
      // PPU 寄存器/标志是游戏逻辑状态必须恢复；扫描线时序(line/dot)与渲染中间
      // 缓冲(secondaryOam/spriteTiles/atl/atr/tl/th)不提供，读档时保留当前/复位值，
      // 一帧内由游戏自己重填
      ppu: {
        paletteRam: Array.prototype.slice.call(PRAM),
        oamRam: Array.prototype.slice.call(SPRA),
        t: u16le(TADD, 0) & 0x7fff,
        v: u16le(RADD, 0) & 0x7fff,
        w: VTGL ? 1 : 0,
        x: XOFF & 7,
        oamAddress: oamadr,
        readBuffer: VBUF,
        spriteZero: (r2 >> 6) & 1,
        spriteOverflow: (r2 >> 5) & 1,
        inVblank: (r2 >> 7) & 1,
        vramIncrement: (r0 >> 2) & 1,
        spritePatternBase: (r0 >> 3) & 1,
        bgPatternBase: (r0 >> 4) & 1,
        spriteHeight: ((r0 >> 5) & 1) ? 16 : 8,
        slave: 0,
        generateNmi: (r0 >> 7) & 1,
        greyScale: r1 & 1,
        bgInLeft: (r1 >> 1) & 1,
        sprInLeft: (r1 >> 2) & 1,
        bgRendering: (r1 >> 3) & 1,
        sprRendering: (r1 >> 4) & 1,
        emphasis: (r1 >> 5) & 7
      },
      // chrBankSelect/chrPageTable 有意不提供：setObjState 跳过缺失字段，
      // mapper195 的 setHackState 在读档后会用 bankRegs 重建 chrPageTable
      mapper: {
        prgRam: prgRam,
        ppuRam: Array.prototype.slice.call(NTAR),
        bankRegs: bankRegs,
        mirroring: mirroring,
        prgMode: (CMD[0] >> 6) & 1,
        chrMode: (CMD[0] >> 7) & 1,
        regSelect: CMD[0] & 7,
        reloadIrq: sfByte('IRQR') ? 1 : 0,
        irqLatch: sfByte('IRQL'),
        irqEnabled: sfByte('IRQA') ? 1 : 0,
        irqCounter: sfByte('IRQC'),
        lastRead: 0
      }
    };
    if (sf.CHRR) state.mapper.chrRam = Array.prototype.slice.call(sf.CHRR);
    if (sf.M5KX) state.mapper.extraPrgRam = Array.prototype.slice.call(sf.M5KX);
    if (prev && prev.header) state.header = prev.header;
    return state;
  }

  // ---------- 构造 chunk 流（web -> FCEUX） ----------
  function SformatEntry(desc, data) {
    var d = new Uint8Array(8 + data.length);
    for (var i = 0; i < 4; i++) d[i] = i < desc.length ? desc.charCodeAt(i) : 0;
    w32le(d, 4, data.length);
    d.set(data, 8);
    return d;
  }
  function bytes(arr, len) {
    var b = new Uint8Array(len || arr.length);
    for (var i = 0; i < Math.min(arr.length, b.length); i++) b[i] = arr[i] & 0xff;
    return b;
  }
  function Chunk(type, parts) {
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(5 + total);
    out[0] = type; w32le(out, 1, total);
    var o = 5;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  // 返回未压缩 chunk 流（Uint8Array）。state 为 IndexedDB 里的 saveState 对象。
  function webStateToFcsxChunks(state) {
    if (!state || !state.cpu || !state.ppu || !state.mapper) {
      throw new Error('存档内容不完整，无法转换');
    }
    var cpu = state.cpu, ppu = state.ppu, m = state.mapper;
    var PC = (cpu.br && cpu.br[0]) || 0;
    var r = cpu.r || [0, 0, 0, 0];
    var pcArr = new Uint8Array(2); w16le(pcArr, 0, PC & 0xffff);
    var pReg = 0x20 | ((cpu.n ? 1 : 0) << 7) | ((cpu.v ? 1 : 0) << 6) | ((cpu.d ? 1 : 0) << 3) |
               ((cpu.i ? 1 : 0) << 2) | ((cpu.z ? 1 : 0) << 1) | (cpu.c ? 1 : 0);

    // 块 1：CPU（SFCPU 布局）
    var cpuChunk = Chunk(CHUNK.CPU, [
      SformatEntry('PC', pcArr),
      SformatEntry('A', bytes([r[0] || 0])),
      SformatEntry('X', bytes([r[1] || 0])),
      SformatEntry('Y', bytes([r[2] || 0])),
      SformatEntry('S', bytes([r[3] || 0])),
      SformatEntry('P', bytes([pReg])),
      SformatEntry('DB', bytes([0])),
      SformatEntry('RAM', bytes(state.ram || [], 0x800))
    ]);

    // 块 2：CPU 附加（SFCPUC）——web 端无对应状态，全 0 占位
    var cpucChunk = Chunk(CHUNK.CPUC, [
      SformatEntry('JAMM', bytes([0])),
      SformatEntry('IQLB', bytes([0, 0, 0, 0])),
      SformatEntry('ICoa', bytes([0, 0, 0, 0])),
      SformatEntry('ICou', bytes([0, 0, 0, 0])),
      SformatEntry('TSBS', bytes([0, 0, 0, 0, 0, 0, 0, 0])),
      SformatEntry('MooP', bytes([0]))
    ]);

    // 块 3：PPU（FCEUPPU_STATEINFO 布局）
    var v = ppu.v | 0, t = ppu.t | 0;
    var ppu0 = ((ppu.generateNmi ? 1 : 0) << 7) | ((ppu.spriteHeight === 16 ? 1 : 0) << 5) |
               ((ppu.bgPatternBase ? 1 : 0) << 4) | ((ppu.spritePatternBase ? 1 : 0) << 3) |
               ((ppu.vramIncrement ? 1 : 0) << 2);
    var ppu1 = ((ppu.emphasis || 0) << 5) | ((ppu.sprRendering ? 1 : 0) << 4) | ((ppu.bgRendering ? 1 : 0) << 3) |
               ((ppu.sprInLeft ? 1 : 0) << 2) | ((ppu.bgInLeft ? 1 : 0) << 1) | (ppu.greyScale ? 1 : 0);
    var ppu2 = ((ppu.inVblank ? 1 : 0) << 7) | ((ppu.spriteZero ? 1 : 0) << 6) | ((ppu.spriteOverflow ? 1 : 0) << 5);
    // ⚠ RADD/TADD 同样必须 15 位保真（& 0x7fff），截断见文件头【事故一】
    var radd = new Uint8Array(2); w16le(radd, 0, v & 0x7fff);
    var tadd = new Uint8Array(2); w16le(tadd, 0, t & 0x7fff);
    var ppuChunk = Chunk(CHUNK.PPU, [
      SformatEntry('NTAR', bytes(m.ppuRam || [], 0x800)),
      SformatEntry('PRAM', bytes(ppu.paletteRam || [], 0x20)),
      SformatEntry('SPRA', bytes(ppu.oamRam || [], 0x100)),
      SformatEntry('PPUR', bytes([ppu0, ppu1, ppu2, ppu.oamAddress || 0])),
      SformatEntry('KOOK', bytes([0])),
      SformatEntry('DEAD', bytes([0])),
      SformatEntry('PSPL', bytes([0])),
      SformatEntry('XOFF', bytes([ppu.x || 0])),
      SformatEntry('VTGL', bytes([ppu.w ? 1 : 0])),
      SformatEntry('RADD', radd),
      SformatEntry('TADD', tadd),
      SformatEntry('VBUF', bytes([ppu.readBuffer || 0])),
      SformatEntry('PGEN', bytes([0]))
    ]);

    // 块 31：新 PPU（FCEU_NEWPPU_STATEINFO 布局）——web 端为扫描线模拟，无逐周期
    // 状态。loopy 寄存器按 FCEUX ppur 位域拆分（ppu.cpp PPUREGS：fv 3位、v/h 各
    // 1 位即 nametable bit10/bit11、vt/ht 各 5 位、fh=fineX、s=$2000 bit4 BG 表）；
    // PST2(end_cycle) 必须为 341，否则 FCEUX 新 PPU 时序死循环
    function w4(vv) { var b = new Uint8Array(4); w32le(b, 0, vv >>> 0); return b; }
    var newPpuParts = [SformatEntry('IDLS', bytes([0]))];
    ['SR_0', 'SR_1', 'SR_2', 'SR_3', 'SRx0', 'SRx1', 'SRx2', 'SRx3', 'SRx4', 'SRx5', 'SRx6', 'SRx7',
     'SR_4', 'SR_5', 'SR_6'].forEach(function (k) { newPpuParts.push(SformatEntry(k, w4(0))); });
    newPpuParts.push(
      SformatEntry('PFVx', w4((v >> 12) & 7)),
      SformatEntry('PVxx', w4((v >> 10) & 1)),
      SformatEntry('PHxx', w4((v >> 11) & 1)),
      SformatEntry('PVTx', w4((v >> 5) & 0x1f)),
      SformatEntry('PHTx', w4(v & 0x1f)),
      SformatEntry('P_FV', w4((t >> 12) & 7)),
      SformatEntry('P_Vx', w4((t >> 10) & 1)),
      SformatEntry('P_Hx', w4((t >> 11) & 1)),
      SformatEntry('P_VT', w4((t >> 5) & 0x1f)),
      SformatEntry('P_HT', w4(t & 0x1f)),
      SformatEntry('PFHx', w4(ppu.x || 0)),
      SformatEntry('PSxx', w4(ppu.bgPatternBase ? 1 : 0)),
      SformatEntry('PST0', w4(0)),
      SformatEntry('PST1', w4(0)),
      SformatEntry('PST2', w4(341))
    );
    var newPpuChunk = Chunk(CHUNK.NEWPPU, newPpuParts);

    // 块 4：手柄（FCEUCTRL_STATEINFO 布局）
    var ctrlChunk = Chunk(CHUNK.CTRL, [
      SformatEntry('JYRB', bytes([0, 0])),
      SformatEntry('JOYS', bytes([state.latchedControl1State || 0, state.latchedControl2State || 0, 0, 0])),
      SformatEntry('LSTS', bytes([state.controllerLatched ? 1 : 0])),
      SformatEntry('ZBG0', bytes([0])),
      SformatEntry('ZBG1', bytes([0])),
      SformatEntry('LAGF', bytes([0])),
      SformatEntry('LAGC', bytes([0, 0, 0, 0])),
      SformatEntry('FRAM', bytes([0, 0, 0, 0]))
    ]);

    // 块 5：APU（FCEUSND_STATEINFO 布局）——web 端 APU 结构不同，通道状态全 0
    // （读档后游戏会重写寄存器恢复音乐）。三个字段必须给安全默认值，否则中断风暴：
    // - IQFM(IRQFrameMode)=1：FCEUX FrameSoundUpdate 在 !(IRQFrameMode&3) 时每序列
    //   触发帧中断（sound.cpp:625），而游戏 IRQ 处理器只应答 MMC3、不读 $4015 清
    //   帧标志 → 中断线悬空反复重入（实测每帧 ~119 次，游戏时序崩溃花屏）。
    //   bit0 置位即抑制帧中断，与正常运行的 FCEUX 存档实测值一致。
    // - FHCN(fhcnt)=357960：FCEUSND_Reset 的 fhinc(NTSC 14915*24)，0 会立即超时
    // - NREG(nreg)=1、5ACC(DMCacc)=1：FCEUSND_Reset/静态初值
    var sndChunk = Chunk(CHUNK.SND, [
      SformatEntry('FHCN', w4(357960)), SformatEntry('FCNT', bytes([0])),
      SformatEntry('PSG', bytes(new Array(16))), SformatEntry('ENCH', bytes([0])),
      SformatEntry('IQFM', bytes([1])), SformatEntry('NREG', bytes([1, 0])),
      SformatEntry('TRIM', bytes([0])), SformatEntry('TRIC', bytes([0])),
      SformatEntry('E0SP', bytes([0])), SformatEntry('E1SP', bytes([0])), SformatEntry('E2SP', bytes([0])),
      SformatEntry('E0MO', bytes([0])), SformatEntry('E1MO', bytes([0])), SformatEntry('E2MO', bytes([0])),
      SformatEntry('E0D1', bytes([0])), SformatEntry('E1D1', bytes([0])), SformatEntry('E2D1', bytes([0])),
      SformatEntry('E0DV', bytes([0])), SformatEntry('E1DV', bytes([0])), SformatEntry('E2DV', bytes([0])),
      SformatEntry('LEN0', w4(0)), SformatEntry('LEN1', w4(0)), SformatEntry('LEN2', w4(0)), SformatEntry('LEN3', w4(0)),
      SformatEntry('SWEE', bytes([0, 0])),
      SformatEntry('CRF1', w4(0)), SformatEntry('CRF2', w4(0)),
      SformatEntry('SWCT', bytes([0, 0])),
      SformatEntry('SIRQ', bytes([0])),
      SformatEntry('5ACC', w4(1)), SformatEntry('5BIT', bytes([0])), SformatEntry('5ADD', w4(0)),
      SformatEntry('5SIZ', w4(0)), SformatEntry('5SHF', bytes([0])),
      SformatEntry('5HVDM', bytes([0])), SformatEntry('5HVSP', bytes([0])),
      SformatEntry('5SZL', bytes([0])), SformatEntry('5ADL', bytes([0])), SformatEntry('5FMT', bytes([0])),
      SformatEntry('RWDA', bytes([0]))
    ]);

    // 块 8：显示后备帧——纯渲染产物，全 0（FCEUX 读档下一帧即覆盖）
    var backBufChunk = Chunk(CHUNK.BACKBUF, [new Uint8Array(256 * 256)]);

    // 块 0x10：mapper（SFMDATA）
    var sfmd = [
      SformatEntry('WRAM', bytes(m.prgRam || [], 16384)),   // web prgRam 8K + 高 8K 补零
      SformatEntry('KTEX', bytes([0])),
      SformatEntry('REGS', bytes(m.bankRegs || [], 8)),
      SformatEntry('CMD', bytes([((m.regSelect || 0) & 7) | ((m.prgMode ? 1 : 0) << 6) | ((m.chrMode ? 1 : 0) << 7)])),
      SformatEntry('A000', bytes([(m.mirroring || 0) & 1])),
      SformatEntry('A001', bytes([0xff])),
      SformatEntry('IRQR', bytes([m.reloadIrq ? 1 : 0])),
      SformatEntry('IRQC', bytes([m.irqCounter || 0])),
      SformatEntry('IRQL', bytes([m.irqLatch || 0])),
      SformatEntry('IRQA', bytes([m.irqEnabled ? 1 : 0])),
      SformatEntry('CHRR', bytes(m.chrRam || [], 4096))
    ];
    if (m.extraPrgRam) sfmd.push(SformatEntry('M5KX', bytes(m.extraPrgRam, 4096)));
    var sfmChunk = Chunk(CHUNK.SFMDATA, sfmd);

    var parts = [cpuChunk, cpucChunk, ppuChunk, newPpuChunk, ctrlChunk, sndChunk, backBufChunk, sfmChunk];
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var stream = new Uint8Array(total);
    var o = 0;
    parts.forEach(function (p) { stream.set(p, o); o += p.length; });
    return stream;
  }

  // ---------- zlib 压缩包装 ----------
  // deflate: (Uint8Array) -> Promise<Uint8Array>，输出 zlib(RFC1950) 格式
  // 返回完整 .fc0 文件内容
  function fcsxWrap(chunkStream, deflate) {
    return deflate(chunkStream).then(function (compressed) {
      var out = new Uint8Array(16 + compressed.length);
      out[0] = 0x46; out[1] = 0x43; out[2] = 0x53; out[3] = 0x58; // "FCSX"
      w32le(out, 4, chunkStream.length);
      w32le(out, 8, 0);            // stateversion：读取端不校验，写 0
      w32le(out, 12, compressed.length);
      out.set(compressed, 16);
      return out;
    });
  }

  return {
    CHUNK: CHUNK,
    parseFc0: parseFc0,
    readSformat: readSformat,
    collectSformat: collectSformat,
    fc0ToWebState: fc0ToWebState,
    webStateToFcsxChunks: webStateToFcsxChunks,
    fcsxWrap: fcsxWrap
  };
});
