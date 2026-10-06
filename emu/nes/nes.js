// 补丁规则定义
const PATCH_RULES = [
  // 比赛卡顿
  { addr: 0x3CA88, from: [0xA5, 0x1B, 0x10, 0xFC, 0x29, 0x7F, 0x85, 0x1B], to: [0xA9, 0x01, 0x20, 0x15, 0xC5, 0xEA, 0xEA, 0xEA] },
  { addr: 0x7FEAE, from: [0xA5, 0x1B, 0x10, 0xFC, 0x29, 0x7F, 0x85, 0x1B], to: [0xEA, 0xEA, 0xEA, 0xA9, 0x01, 0x20, 0x15, 0xC5] },
  { addr: 0x7F329, from: [0xA9, 0x06, 0x85, 0x23, 0x8D, 0x00, 0x80, 0xA9, 0x1E, 0x8D, 0x01, 0x80, 0x20, 0x83, 0xFE], to: [0x20, 0x57, 0xF7, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA, 0xEA] },
  // 左上角体力
  { addr: 0x338EE, from: [0x01, 0x20, 0x10, 0x02, 0x00, 0x00, 0x10, 0x02, 0x02, 0x01, 0x01, 0x6D, 0xBE], to: [0x0B, 0x20, 0x06, 0x02, 0x00, 0x00, 0x06, 0x02, 0x01, 0x01, 0x01, 0x59, 0xBE] },
  { addr: 0x33E6C, from: [0x00, 0x00, 0x00], to: [0xE1, 0x00, 0xFC] },
  // 场次
  { addr: 0x33463, from: [0x21, 0x22, 0x07, 0x04, 0x00, 0x01, 0x07, 0x03, 0x02, 0x01, 0x01, 0xDC, 0xBB], to: [0x41, 0x22, 0x07, 0x03, 0x00, 0x01, 0x07, 0x02, 0x01, 0x02, 0x05, 0xDE, 0xBB] },
];


const PATCH_CT2CN = [
  { addr: 0x5B01D, from: [0x28], to: [0x00] },
  { addr: 0x5B027, from: [0x2A], to: [0x02] },
  { addr: 0x7C9A4, from: [0x28], to: [0x00] },
  { addr: 0x7C9AE, from: [0x2A], to: [0x02] },
  { addr: 0x7EAD4, from: [0x28], to: [0x00] },
  { addr: 0x7EADE, from: [0x2A], to: [0x02] },
  { addr: 0x7F904, from: [0x28], to: [0x00] },
  { addr: 0x7F908, from: [0x2A], to: [0x02] },
  { addr: 0x7F9A3, from: [0x28], to: [0x00] },
  { addr: 0x7F9A9, from: [0x2A], to: [0x02] },
  { addr: 0x7F9DB, from: [0x28], to: [0x00] },
  { addr: 0x7F9DF, from: [0x2A], to: [0x02] },
  { addr: 0x7FE38, from: [0x28], to: [0x00] },
  { addr: 0x7FE3C, from: [0x2A], to: [0x02] },
];

//天使之翼2中文版部分无法打开修复修复
function autoPatchCT2CNerror(rom, mapper) {
  if (mapper !== 74 && mapper !== 195 && mapper !== 198) return;
  let matched = 0;
  let patchList = [];
  for (let rule of PATCH_CT2CN) {
    let ok = true;
    if (rom.length <= rule.addr + rule.from.length) {
      ok = false;
    } else {
      for (let i = 0; i < rule.from.length; i++) {
        if (rom[rule.addr + i] !== rule.from[i]) {
          ok = false;
          break;
        }
      }
    }
    if (ok) {
      matched++;
      patchList.push(rule);
    }
  }
  if (matched >= PATCH_CT2CN.length) {
    for (let rule of patchList) {
      for (let i = 0; i < rule.to.length; i++) {
        rom[rule.addr + i] = rule.to[i];
      }
    }
    if (typeof log === "function") log("自动修复天使之翼2中文版.", "patch");
  }
}



// 检查和自动 patch 函数
function autoPatchRomIfNeeded(rom, mapper) {
  if (mapper !== 74 && mapper !== 195 && mapper !== 198) return;
  let matched = 0;
  let patchList = [];
  for (let rule of PATCH_RULES) {
    let ok = true;
    if (rom.length <= rule.addr + rule.from.length) {
      ok = false;
    } else {
      for (let i = 0; i < rule.from.length; i++) {
        if (rom[rule.addr + i] !== rule.from[i]) {
          ok = false;
          break;
        }
      }
    }
    if (ok) {
      matched++;
      patchList.push(rule);
    }
  }
  if (matched >= 5) {
    for (let rule of patchList) {
      for (let i = 0; i < rule.to.length; i++) {
        rom[rule.addr + i] = rule.to[i];
      }
    }
    // 带球节奏、时间变动调整
    rom[0x7E0FD] = 0x08;
    rom[0x7E169] = 0x08;
    if (typeof log === "function") log("自动开启中文版卡顿修复补丁.", "patch");
  }
}

function Nes() {

  // state version, for savestates
  this.stateVersion = 1;
  // ram
  this.ram = new Uint8Array(0x800);
  // cpu
  this.cpu = new Cpu(this);
  // ppu
  this.ppu = new Ppu(this);
  // apu
  this.apu = new Apu(this);
  // mapper / rom
  this.mapper;

  // 添加镜像模式常量
  this.rom = {
    VERTICAL_MIRRORING: 0,
    HORIZONTAL_MIRRORING: 1,
    FOUR_SCREEN_MIRRORING: 2,
    SINGLE_SCREEN_MIRRORING_LOW: 3,
    SINGLE_SCREEN_MIRRORING_HIGH: 4
  };

  // 全局变量：保存ROM头部16字节数据
  this.romheadbase = null;

  // current controller state, changes externally
  this.currentControl1State = 0;
  this.currentControl2State = 0;

  // callbacks for onread(adr, val), onwrite(adr, val) and onexecute(adr, val)
  this.onread = undefined;
  this.onwrite = undefined;
  this.onexecute = undefined;

  // 金手指结构：[{ enabled, name, codes: [{address, value, compare}] }]
  this.cheatCodes = [{ enabled: false, name: "我方门将水平大降", codes: [{ address: 0x0307, value: 0x01 }, { address: 0x0308, value: 0x4F }] },
  { enabled: false, name: "我方空门", codes: [{ address: 0x030A, value: 0x15 }] },
  { enabled: false, name: "敌方门将水平大降", codes: [{ address: 0x038B, value: 0x01 }, { address: 0x038C, value: 0x4F }] },
  { enabled: false, name: "敌方空门", codes: [{ address: 0x038E, value: 0x15 }] },
  {
    enabled: false, name: "翼解锁全技能(赛中解锁)", codes: [
      { address: 0x0448, value: 0x80 },
      { address: 0x0446, value: 0x05 },
      { address: 0x0449, value: 0x80 }
    ]
  },
  {
    enabled: false, name: "我方全员满级", codes: [
      { address: 0x0303, value: 0x62 }, { address: 0x030F, value: 0x62 }, { address: 0x031B, value: 0x62 },
      { address: 0x0327, value: 0x62 }, { address: 0x0333, value: 0x62 }, { address: 0x033F, value: 0x62 },
      { address: 0x034B, value: 0x62 }, { address: 0x0357, value: 0x62 }, { address: 0x0363, value: 0x62 },
      { address: 0x036F, value: 0x62 }, { address: 0x037B, value: 0x62 }
    ]
  },
  {
    enabled: false, name: "我方全员体力999", codes: [
      { address: 0x0301, value: 0xE7 }, { address: 0x0302, value: 0x03 }, { address: 0x030D, value: 0xE7 }, { address: 0x030E, value: 0x03 },
      { address: 0x0319, value: 0xE7 }, { address: 0x031A, value: 0x03 }, { address: 0x0325, value: 0xE7 }, { address: 0x0326, value: 0x03 },
      { address: 0x0331, value: 0xE7 }, { address: 0x0332, value: 0x03 }, { address: 0x033D, value: 0xE7 }, { address: 0x033E, value: 0x03 },
      { address: 0x0349, value: 0xE7 }, { address: 0x034A, value: 0x03 }, { address: 0x0355, value: 0xE7 }, { address: 0x0356, value: 0x03 },
      { address: 0x0361, value: 0xE7 }, { address: 0x0362, value: 0x03 }, { address: 0x036D, value: 0xE7 }, { address: 0x036E, value: 0x03 },
      { address: 0x0379, value: 0xE7 }, { address: 0x037A, value: 0x03 }
    ]
  },
  {
    enabled: false, name: "敌方全员满级", codes: [
      { address: 0x0387, value: 0x62 }, { address: 0x0393, value: 0x62 }, { address: 0x039F, value: 0x62 },
      { address: 0x03AB, value: 0x62 }, { address: 0x03B7, value: 0x62 }, { address: 0x03C3, value: 0x62 },
      { address: 0x03CF, value: 0x62 }, { address: 0x03DB, value: 0x62 }, { address: 0x03E7, value: 0x62 },
      { address: 0x03F3, value: 0x62 }, { address: 0x03FF, value: 0x62 }
    ]
  }];
  this.cheatCodes_ct2 = [];

  // 预处理金手指为Map以提高性能
  this.cheatMap = new Map();
  this.cheatMap_ct2 = new Map();
  this.updateCheatMaps = function() {
    this.cheatMap.clear();
    this.cheatMap_ct2.clear();
    for (let cheat of this.cheatCodes) {
      if (!cheat.enabled) continue;
      for (let code of cheat.codes) {
        this.cheatMap.set(code.address, code);
      }
    }
    for (let cheat of this.cheatCodes_ct2) {
      if (!cheat.enabled) continue;
      for (let code of cheat.codes) {
        this.cheatMap_ct2.set(code.address, code);
      }
    }
  };
  this.updateCheatMaps();

  /**
   * 添加金手指
   * @param {boolean|string} enabled 是否启用
   * @param {string} name 金手指名称
   * @param {string} codeStr 形如 "0000:00,0448:80" 或 "038E:15 A5 A8 11 12" 的字符串
   * @param {number} [groupIndex] 可选，分组标记
   */
  this.addCheat = function (enabled, name, codeStr, groupIndex) {
    if (typeof enabled === "string") enabled = enabled === "true";
    let codes = [];
    // 支持多种格式
    if (codeStr.indexOf(',') !== -1) {
      // 逗号分隔格式
      codes = codeStr.split(',').map(item => {
        const parts = item.split(':');
        let obj = {
          address: parseInt(parts[0], 16),
          value: parseInt(parts[1], 16),
          compare: parts[2] !== undefined ? parseInt(parts[2], 16) : undefined
        };
        if (groupIndex !== undefined) obj._groupIndex = groupIndex;
        return obj;
      });
    } else if (/^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}( [0-9a-fA-F]{2})*/.test(codeStr)) {
      // 形如 038E:15 A5 A8 11 12
      const match = codeStr.match(/^([0-9a-fA-F]{4}):((?: [0-9a-fA-F]{2})+|[0-9a-fA-F]{2}(?: [0-9a-fA-F]{2})*)$/);
      if (match) {
        const baseAddr = parseInt(match[1], 16);
        const values = match[2].trim().split(/\s+/);
        for (let i = 0; i < values.length; i++) {
          let obj = {
            address: baseAddr + i,
            value: parseInt(values[i], 16)
          };
          if (groupIndex !== undefined) obj._groupIndex = groupIndex;
          codes.push(obj);
        }
      }
    } else if (/^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}(:[0-9a-fA-F]{2})?$/.test(codeStr)) {
      // 单条
      const parts = codeStr.split(':');
      let obj = {
        address: parseInt(parts[0], 16),
        value: parseInt(parts[1], 16),
        compare: parts[2] !== undefined ? parseInt(parts[2], 16) : undefined
      };
      if (groupIndex !== undefined) obj._groupIndex = groupIndex;
      codes.push(obj);
    }
    this.cheatCodes.push({ enabled, name, codes });
    this.updateCheatMaps();
  };

  /**
   * 设置金手指开关
   * @param {number} idx 金手指索引
   * @param {boolean} enabled 是否启用
   */
  this.setCheatEnabled = function (idx, enabled) {
    if (this.cheatCodes[idx]) this.cheatCodes[idx].enabled = enabled;
    this.updateCheatMaps();
  };

  /**
   * 设置CT2专用金手指
   * @param {Array} ct2Cheats CT2金手指数组
   */
  this.setCT2Cheats = function (ct2Cheats) {
    this.cheatCodes_ct2 = ct2Cheats;
    this.updateCheatMaps();
  };

  this.reset = function (hard) {
    // 如果有正在播放的自定义音乐，在重置时停止它
    try {
      if (window && typeof window.customMusicStop === 'function') {
        window.customMusicStop();
      }
    } catch (e) {
      // ignore
    }
    if (hard) {
      // 随机初始化RAM，兼容性最佳
      for (let i = 0; i < this.ram.length; i++) {
        this.ram[i] = 0;//Math.floor(Math.random() * 256);
      }
    }
    this.cpu.reset();
    this.ppu.reset();
    this.apu.reset();
    if (this.mapper) {
      this.mapper.reset(hard);
    }

    // cycle timer, to sync cpu/ppu
    this.cycles = 0;

    // oam dma
    this.inDma = false;
    this.dmaTimer = 0;
    this.dmaBase = 0;
    this.dmaValue = 0;

    // controllers
    this.latchedControl1State = 0;
    this.latchedControl2State = 0;
    this.controllerLatched = false;

    // irq sources
    this.mapperIrqWanted = false;
    this.frameIrqWanted = false;
    this.dmcIrqWanted = false;
  }
  this.reset(true);
  this.saveVars = [
    "ram", "cycles", "inDma", "dmaTimer", "dmaBase", "dmaValue",
    "latchedControl1State", "latchedControl2State", "controllerLatched",
    "mapperIrqWanted", "frameIrqWanted", "dmcIrqWanted"
  ];

  this.loadRom = function (rom, onLoaded) {
    // 设置游戏文件名
    this.gameFileName = window.currentGameFileName || "未知游戏";
    // 载入新游戏前，停止任何外部自定义音乐播放
    try {
      if (window && typeof window.customMusicStop === 'function') {
        window.customMusicStop();
      }
    } catch (e) {
      // ignore
    }
    if (rom.length < 0x10) {
      log(i18n('log.rom.load_failed', { err: "Invalid rom length" }), "rom");
      if (onLoaded) onLoaded(false);
      return false;
    }
    if (
      rom[0] !== 0x4e || rom[1] !== 0x45 ||
      rom[2] !== 0x53 || rom[3] !== 0x1a
    ) {
      log(i18n('log.rom.unsupported_format'), "rom");
      if (onLoaded) onLoaded(false);
      return false;
    }
    let header = this.parseHeader(rom);
    // 保存头部16字节数据到全局变量
    this.romheadbase = rom.slice(0, header.base);
    // 跳过头部和trainer
    let romData = rom.subarray(header.base);

    //修复部分中文版无法打开的问题
    autoPatchCT2CNerror(rom, header.mapper);
    // 新增：自动中文版卡顿修复补丁
    autoPatchRomIfNeeded(rom, header.mapper);

    // 放宽判断：只要PRG部分和CHR部分有一部分存在就允许加载
    let minLength = header.base + Math.max(0, header.banks * 0x4000) + Math.max(0, header.chrBanks * 0x2000);
    if (rom.length < minLength) {
      if (minLength - rom.length > 16) {
        log(i18n('log.rom.load_failed', { err: "Rom file is missing data, expect " + minLength + ", got " + rom.length }), "rom");
      }
      // 继续加载
    }

    const loadMapperAndInit = (err) => {
      if (err || mappers[header.mapper] === undefined) {
        log(i18n('log.rom.unsupported_mapper', { mapper: header.mapper }), "rom");
        if (onLoaded) onLoaded(false);
        return false;
      }
      try {
        this.mapper = new mappers[header.mapper](this, romData, header); // 始终用 romData
        this.renderMethod = this.mapper.renderMethod || null;
        this.irqType = this.mapper.irqType || null;
      } catch (e) {
        log(i18n('log.rom.load_failed', { err: e }), "rom");
        if (onLoaded) onLoaded(false);
        return false;
      }
      
      // 输出游戏信息到控制台
      const crc32 = calcCRC32(romData);
      const mapperFileMap = {
        0: "nrom", 1: "mmc1", 2: "uxrom", 3: "cnrom", 4: "mmc3", 7: "aorom",
        16: "bandai", 23: "mapper23", 24: "vrc6a", 74: "mapper74", 195: "mapper195", 198: "mapper198"
      };
      const mapperName = mapperFileMap[header.mapper] || ("mapper" + header.mapper);
      const prgSize = header.banks * 0x4000;
      const chrSize = header.chrBanks * 0x2000;
      
      console.log("=== 游戏加载信息 ===");
      console.log("CRC32:", "0x" + crc32.toString(16).padStart(8, "0").toUpperCase());
      console.log("游戏名称:", this.gameFileName);
      console.log("Mapper ID:", header.mapper);
      console.log("Mapper 名称:", mapperName);
      console.log("PRG ROM 大小:", prgSize, "bytes (" + (prgSize / 1024) + " KB)");
      console.log("CHR ROM 大小:", chrSize, "bytes (" + (chrSize / 1024) + " KB)");
      console.log("PRG Banks:", header.banks);
      console.log("CHR Banks:", header.chrBanks);
      console.log("镜像模式:", header.verticalMirroring ? "垂直" : "水平");
      console.log("电池备份:", header.battery ? "是" : "否");
      console.log("Trainer:", header.trainer ? "是" : "否");
      console.log("四屏模式:", header.fourScreen ? "是" : "否");
      console.log("===================");
      
      // 设置全局游戏文件名
      window.currentGameFileName = this.gameFileName;
      
      log(
        i18n('log.rom.load_success', { name: this.mapper.name }) + ": " + this.mapper.h.banks +
        " PRG bank(s)_" + this.mapper.h.chrBanks + "CHR bank(s)"
        , "nes");
      if (onLoaded) onLoaded(true);
      return true;
    };

    // 动态加载mapper
    if (typeof loadMapper === "function") {
      loadMapper(header.mapper, loadMapperAndInit);
      return;
    } else {
      // 兼容老流程
      loadMapperAndInit();
    }
  }

  this.parseHeader = function (rom) {
    let o = {
      banks: rom[4],
      chrBanks: rom[5],
      mapper: (rom[6] >> 4) | (rom[7] & 0xf0),
      verticalMirroring: (rom[6] & 0x01) > 0,
      battery: (rom[6] & 0x02) > 0,
      trainer: (rom[6] & 0x04) > 0,
      fourScreen: (rom[6] & 0x08) > 0,
    };
    o["base"] = 16 + (o.trainer ? 512 : 0);
    o["chrBase"] = o.base + 0x4000 * o.banks;
    o["prgAnd"] = (o.banks * 0x4000) - 1;
    o["chrAnd"] = o.chrBanks === 0 ? 0x1fff : (o.chrBanks * 0x2000) - 1;
    o["saveVars"] = [
      "banks", "chrBanks", "mapper", "verticalMirroring", "battery", "trainer",
      "fourScreen"
    ];
    return o;
  }

  this.getPixels = function (data) {
    this.ppu.setFrame(data);
  }

  this.getSamples = function (data, count) {
    // apu returns ~29780 samples for a frame (NTSC)
    // we need count values (0 - 1)
    let samples = this.apu.getOutput();
    let inputSamples = samples[1]; // APU output array
    let inputCount = samples[0];   // Number of samples from APU

    if (inputCount === 0) {
      // No samples available, fill with silence
      for (let i = 0; i < count; i++) {
        data[i] = 0;
      }
      return;
    }

    // Simple linear interpolation resampling
    let ratio = inputCount / count;
    for (let i = 0; i < count; i++) {
      let inputIndex = i * ratio;
      let index = Math.floor(inputIndex);
      let fraction = inputIndex - index;

      if (index >= inputCount - 1) {
        // Last sample
        data[i] = inputSamples[inputCount - 1];
      } else {
        // Linear interpolation between samples
        let sample1 = inputSamples[index];
        let sample2 = inputSamples[index + 1];
        data[i] = sample1 * (1 - fraction) + sample2 * fraction;
      }
    }
  }

  this.cycle = function () {
    if (this.cycles === 0) {
      this.cycles = 3;

      if (this.controllerLatched) {
        this.latchedControl1State = this.currentControl1State;
        this.latchedControl2State = this.currentControl2State;
      }

      // 优化：仅在必要时处理 IRQ
      if (this.mapperIrqWanted || this.frameIrqWanted || this.dmcIrqWanted) {
        this.cpu.irqWanted = true;
      } else {
        this.cpu.irqWanted = false;
      }

      if (!this.inDma) {
        if (this.onexecute && this.cpu.cyclesLeft === 0) {
          this.onexecute(this.cpu.br[0], this.peak(this.cpu.br[0]));
        }
        this.cpu.cycle();
      } else {
        // 优化：减少 DMA 处理的分支
        if (this.dmaTimer++ % 2 === 0) {
          this.ppu.write(4, this.dmaValue);
        } else {
          this.dmaValue = this.read(this.dmaBase + ((this.dmaTimer / 2) & 0xff));
        }
        if (this.dmaTimer === 513) {
          this.dmaTimer = 0;
          this.inDma = false;
        }
      }

      this.apu.cycle();
    }

    // 修复：确保所有 PPU 行都调用 cycle
    this.ppu.cycle();
    this.cycles--;
  };

  this.runFrame = function () {
    do {
      this.cycle()
    } while (!(this.ppu.line === 240 && this.ppu.dot === 0));
  }

  // peak
  this.peak = function (adr) {
    adr &= 0xffff;

    // 应用所有启用的金手指
    let code = this.cheatMap.get(adr);
    if (code && (code.compare === undefined || this.ram[adr & 0x7ff] === code.compare)) {
      return code.value;
    }
    code = this.cheatMap_ct2.get(adr);
    if (code && (code.compare === undefined || this.ram[adr & 0x7ff] === code.compare)) {
      return code.value;
    }

    if (adr < 0x2000) {
      return this.ram[adr & 0x7ff];
    }
    if (adr < 0x4000) {
      // PPU寄存器镜像（VirtuaNES风格：每8字节循环）
      return this.ppu.peak(adr & 0x7);
    }
    if (adr < 0x4020) {
      // APU/I/O端口
      if (adr === 0x4014) return 0;
      if (adr === 0x4016) return (this.latchedControl1State & 1) | 0x40;
      if (adr === 0x4017) return (this.latchedControl2State & 1) | 0x40;
      return this.apu.peak(adr);
    }
    // $4020-$5FFF: 交给mapper（MMC3 hack ROM会映射ROM）
    if (adr < 0x6000) {
      return this.mapper.peak(adr);
    }
    // $6000-$FFFF: 交给mapper
    return this.mapper.peak(adr);
  }

  // cpu read
  this.read = function (adr) {
    adr &= 0xffff;
    if (this.onread) this.onread(adr, this.peak(adr));

    // 应用所有启用的金手指
    let code = this.cheatMap.get(adr);
    if (code && (code.compare === undefined || this.ram[adr & 0x7ff] === code.compare)) {
      return code.value;
    }
    code = this.cheatMap_ct2.get(adr);
    if (code && (code.compare === undefined || this.ram[adr & 0x7ff] === code.compare)) {
      return code.value;
    }

    if (adr < 0x2000) {
      return this.ram[adr & 0x7ff];
    }
    if (adr < 0x4000) {
      return this.ppu.read(adr & 0x7);
    }
    if (adr < 0x4020) {
      if (adr === 0x4014) return 0;
      if (adr === 0x4016) {
        let ret = this.latchedControl1State & 1;
        this.latchedControl1State >>= 1;
        this.latchedControl1State |= 0x80;
        return ret | 0x40;
      }
      if (adr === 0x4017) {
        let ret = this.latchedControl2State & 1;
        this.latchedControl2State >>= 1;
        this.latchedControl2State |= 0x80;
        return ret | 0x40;
      }
      return this.apu.read(adr);
    }
    // $4020-$5FFF: 交给mapper
    if (adr < 0x6000) {
      return this.mapper.read(adr);
    }
    return this.mapper.read(adr);
  }

  // cpu write
  this.write = function (adr, value) {
    adr &= 0xffff;
    if (this.onwrite) this.onwrite(adr, value);

    // 自定义音乐监控：检查0x700-0x704地址的写入
    if (adr >= 0x700 && adr <= 0x704 && window.customMusicMonitor) {
      if (window.customMusicMonitor(adr, value)) {
        // 如果返回true，表示拦截了音乐播放，不执行原生写入
        return;
      }
    }

    // 通知自定义音乐弹出层更新内存监控显示
    if (adr >= 0x700 && adr <= 0x704 && window.customMusicUpdateMonitor) {
      window.customMusicUpdateMonitor(adr, value);
    }

    if (adr < 0x2000) {
      this.ram[adr & 0x7ff] = value;
      return;
    }
    if (adr < 0x4000) {
      this.ppu.write(adr & 0x7, value);
      return;
    }
    if (adr < 0x4020) {
      if (adr === 0x4014) {
        this.inDma = true;
        this.dmaBase = value << 8;
        return;
      }
      if (adr === 0x4016) {
        this.controllerLatched = (value & 0x01) > 0;
        return;
      }
      this.apu.write(adr, value);
      return;
    }
    // $4020-$5FFF: 交给mapper
    if (adr < 0x6000) {
      this.mapper.write(adr, value);
      return;
    }
    this.mapper.write(adr, value);
  }

  // print bytes and words nicely
  this.getByteRep = function (val) {
    return ("0" + val.toString(16)).slice(-2);
  }

  this.getWordRep = function (val) {
    return ("000" + val.toString(16)).slice(-4);
  }

  // get controls in
  this.setButtonPressed = function (player, button) {
  if (player === 1) {
    this.currentControl1State |= (1 << button);
  }
    
    else if (player === 2) {
      this.currentControl2State |= (1 << button);
    }
  }

  this.setButtonReleased = function (player, button) {
    if (player === 1) {
      this.currentControl1State &= (~(1 << button)) & 0xff;
    } else if (player === 2) {
      this.currentControl2State &= (~(1 << button)) & 0xff;
    }
  }

  this.INPUT = {
    A: 0,
    B: 1,
    SELECT: 2,
    START: 3,
    UP: 4,
    DOWN: 5,
    LEFT: 6,
    RIGHT: 7
  }

  // save states, battery saves
  this.getBattery = function () {
    if (this.mapper.h.battery) {
      return { data: this.mapper.getBattery() };
    }
    return undefined;
  }

  this.setBattery = function (data) {
    if (this.mapper.h.battery) {
      return this.mapper.setBattery(data.data);
    }
    return true;
  }

  this.getState = function () {
    let cpuObj = this.getObjState(this.cpu);
    let ppuObj = this.getObjState(this.ppu);
    // Use APU's custom getSaveState method to handle non-serializable functions
    let apuObj = this.apu.getSaveState ? this.apu.getSaveState() : this.getObjState(this.apu);
    // 如果是 hack ROM，则调用专用方法，否则调用通用 getObjState
    let mapperObj = (this.mapper._virtuaNESHack && typeof this.mapper.getHackState === 'function') ?
      this.mapper.getHackState() : this.getObjState(this.mapper);
    let headerObj = this.getObjState(this.mapper.h);
    let final = this.getObjState(this);
    final["cpu"] = cpuObj;
    final["ppu"] = ppuObj;
    final["apu"] = apuObj;
    final["mapper"] = mapperObj;
    final["header"] = headerObj;
    final["mapperVersion"] = this.mapper.version;
    final["version"] = this.stateVersion;
    return final;
  };
  // 在 getState 函数之后增加 setState 方法
  this.setState = function (state) {
    try {
      // 还原 Nes 自身状态（例如 cycles、dmaTimer 等）
      this.setObjState(this, state);
      // 还原各个子模块状态：cpu、ppu、apu、mapper
      this.setObjState(this.cpu, state.cpu);
      this.setObjState(this.ppu, state.ppu);
      this.setObjState(this.apu, state.apu);
      if (this.mapper) {
        if (this.mapper._virtuaNESHack && typeof this.mapper.setHackState === 'function') {
          // 使用 hack ROM 专用的状态还原方法，同时内部处理映射问题
          this.mapper.setHackState(state.mapper);
        } else {
          this.setObjState(this.mapper, state.mapper);
        }
      }
      return true;
    } catch (e) {
      console.error("setState 失败:", e);
      return false;
    }
  };
  // 修改 getObjState，专门处理 ram 数据（保存 0x8000 范围的数据）
  this.getObjState = function (obj) {
    let ret = {};
    for (let i = 0; i < obj.saveVars.length; i++) {
      let name = obj.saveVars[i];
      let val = obj[name];
      if (name === "ram") {
        // 如果 ram 实际长度不足 0x8000，则补零；若超出，则仅取前 0x8000 字节
        let arr = new Uint8Array(0x8000);
        arr.set(val.subarray(0, Math.min(val.length, 0x8000)));
        ret[name] = Array.from(arr);
      } else if (val instanceof Uint8Array || val instanceof Uint16Array) {
        ret[name] = Array.prototype.slice.call(val);
      } else {
        ret[name] = val;
      }
    }
    return ret;
  }

  // 修改 setObjState，也专门处理 ram 数据（还原 0x8000 范围的数据）
  this.setObjState = function (obj, save) {
    for (let i = 0; i < obj.saveVars.length; i++) {
      let name = obj.saveVars[i];
      if (name === "ram") {
        if (save[name] && Array.isArray(save[name])) {
          // 如果原来的 ram 长度小于 0x8000，只还原已有长度的数据
          let len = Math.min(obj[name].length, 0x8000);
          let newRam = new Uint8Array(0x8000);
          for (let j = 0; j < len; j++) {
            newRam[j] = save[name][j];
          }
          obj[name] = newRam;
        }
      } else {
        let val = obj[name];
        if (val instanceof Uint8Array) {
          obj[name] = new Uint8Array(save[name]);
        } else if (val instanceof Uint16Array) {
          obj[name] = new Uint16Array(save[name]);
        } else {
          obj[name] = save[name];
        }
      }
    }
  }

  // 修改 checkObjState，对于 ram 数据只比较第一段 0x8000 内的数据
  this.checkObjState = function (obj, save) {
    for (let i = 0; i < obj.saveVars.length; i++) {
      let name = obj.saveVars[i];
      if (name === "ram") {
        // 用新 Uint8Array 比较前 0x8000 字节
        let original = new Uint8Array(0x8000);
        original.set(obj[name].subarray(0, Math.min(obj[name].length, 0x8000)));
        let saved = new Uint8Array(save[name]);
        for (let j = 0; j < 0x8000; j++) {
          if (original[j] !== saved[j]) return false;
        }
      } else if (obj[name] !== save[name]) {
        return false;
      }
    }
    return true;
  }
}
