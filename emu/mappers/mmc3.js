mappers[4] = function (nes, rom, header) {
  // --- 先定义方法 ---
  this.setPrgBanks = function () {
    let prgCount = this.h.banks * 2;
    let prgMask = prgCount - 1;
    let last2 = prgCount - 2;
    let last1 = prgCount - 1;
    // 容错：bank6/bank7采用mask而非%
    let bank6 = this.bankRegs[6] & prgMask;
    let bank7 = this.bankRegs[7] & prgMask;

    if (this.prgMode === 0) {
      this.prgBankMap = [
        bank6,      // 0x8000
        bank7,      // 0xA000
        last2,      // 0xC000
        last1       // 0xE000
      ];
    } else {
      this.prgBankMap = [
        last2,      // 0x8000
        bank7,      // 0xA000
        bank6,      // 0xC000
        last1       // 0xE000
      ];
    }
  };

  this.setChrBanks = function () {
    let chrCount = this.h.chrBanks ? this.h.chrBanks * 8 : 8;
    let regs = this.bankRegs;
    let chr = [
      (regs[0] & 0xFE) % chrCount,
      (regs[1] & 0xFE) % chrCount,
      regs[2] % chrCount,
      regs[3] % chrCount,
      regs[4] % chrCount,
      regs[5] % chrCount
    ];
    if (this.chrMode === 0) {
      this.chrBankMap = [
        chr[0], (chr[0] + 1) % chrCount,
        chr[1], (chr[1] + 1) % chrCount,
        chr[2], chr[3], chr[4], chr[5]
      ];
    } else {
      this.chrBankMap = [
        chr[2], chr[3], chr[4], chr[5],
        chr[0], (chr[0] + 1) % chrCount,
        chr[1], (chr[1] + 1) % chrCount
      ];
    }
  };

  this.name = "MMC3";
  this.version = 1;

  this.nes = nes;
  this.rom = rom;
  this.h = header;

  this.chrRam = new Uint8Array(0x2000);
  this.prgRam = new Uint8Array(0x2000);
  this.ppuRam = new Uint8Array(0x800);

  // 扩展RAM（16KB，$2000-$5FFF可分页映射，部分盗版/扩展ROM用）
  this.prgExtRam = new Uint8Array(0x4000);

  // 自动检测机制标志
  this._autoDetectHack = true;  // 启用自动检测
  this._accessCounter = 0;      // 访问计数器
  this._hackEnabled = false;    // 是否启用hack模式

  this.bankRegs = new Uint8Array(8);
  this.mirroring = 0;
  this.prgMode = 0;
  this.chrMode = 0;
  this.regSelect = 0;
  this.irqLatch = 0;
  this.irqCounter = 0;
  this.irqEnabled = false;
  this.reloadIrq = false;
  this.lastRead = 0;

  // VirtuaNES特殊hack的ROM CRC32列表（十六进制字符串，全部小写）
  const MMC3_HACKS = {
    "c871cdaa": { irqType: "IRQ_HSYNC", renderMethod: "TILE_RENDER", name: "暗黑破坏神" },
    //"c871cdaa": { irqType: "IRQ_HSYNC", renderMethod: "TILE_RENDER" }, // 暗黑破坏神
    // crc32: { irqType: ..., renderMethod: ... }
    // "xxxxxxxx": { irqType: "IRQ_HSYNC", renderMethod: "TILE_RENDER" }, // 其他ROM CRC32
    // ...可继续添加...
  };

  // 计算ROM的PRG部分CRC32
  let prgCrc32 = calcCRC32(rom.slice(0, header.banks * 0x4000)).toString(16).padStart(8, "0").toLowerCase();
  //log("MMC3 CRC32:"+prgCrc32, "CRC32");
  
  // 特殊处理：同时保留CRC32和自动检测机制
  this._virtuaNESHack = MMC3_HACKS[prgCrc32] !== undefined;
  this.irqType = MMC3_HACKS[prgCrc32]?.irqType || null;
  this.renderMethod = MMC3_HACKS[prgCrc32]?.renderMethod || null;
  
  if (this._virtuaNESHack) {
    this._hackEnabled = true; // 如果CRC32匹配，立即启用hack模式
    log("载入特殊ROM:" + MMC3_HACKS[prgCrc32]?.name);
  }

  this.reset = function (hard) {
    if (hard) {
      // 可选：随机初始化RAM，兼容性更高
      for (let i = 0; i < this.chrRam.length; i++) {
        this.chrRam[i] = Math.floor(Math.random() * 256);
      }
      if (!this.h.battery) {
        for (let i = 0; i < this.prgRam.length; i++) {
          this.prgRam[i] = Math.floor(Math.random() * 256);
        }
      }
      for (let i = 0; i < this.ppuRam.length; i++) {
        this.ppuRam[i] = Math.floor(Math.random() * 256);
      }
    }
    for (let i = 0; i < this.bankRegs.length; i++) {
      this.bankRegs[i] = 0xFF;
    }
    // MMC3标准：PRG初始bank 6/7应为0,1
    this.bankRegs[6] = 0;
    this.bankRegs[7] = 1;

    this.mirroring = 0;
    this.prgMode = 0;
    this.chrMode = 0;
    this.regSelect = 0;
    this.irqLatch = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.reloadIrq = false;
    this.lastRead = 0;

    // 初始化bank映射，防止灰屏
    this.setPrgBanks();
    this.setChrBanks();
  }
  this.reset(true);

  this.saveVars = [
    "name", "chrRam", "prgRam", "ppuRam", "bankRegs", "mirroring", "prgMode",
    "chrMode", "regSelect", "reloadIrq", "irqLatch", "irqEnabled", "irqCounter",
    "lastRead"
  ];

  this.getBattery = function () {
    return Array.prototype.slice.call(this.prgRam);
  }

  this.setBattery = function (data) {
    if (data.length !== 0x2000) {
      return false;
    }
    this.prgRam = new Uint8Array(data);
    return true;
  }

  this.getRomAdr = function (adr) {
    let prgCount = this.h.banks * 2;
    let prgMask = prgCount - 1;
    let last2 = prgCount - 2;
    let last1 = prgCount - 1;
    let bank;
    if (this.prgMode === 0) {
      if (adr < 0xa000) {
        bank = this.bankRegs[6] & prgMask;
      } else if (adr < 0xc000) {
        bank = this.bankRegs[7] & prgMask;
      } else if (adr < 0xe000) {
        bank = last2;
      } else {
        bank = last1;
      }
    } else {
      if (adr < 0xa000) {
        bank = last2;
      } else if (adr < 0xc000) {
        bank = this.bankRegs[7] & prgMask;
      } else if (adr < 0xe000) {
        bank = this.bankRegs[6] & prgMask;
      } else {
        bank = last1;
      }
    }
    // 容错：bank编号为负或NaN时强制为0
    if (isNaN(bank) || bank < 0) bank = 0;
    return (bank * 0x2000 + (adr & 0x1fff)) & this.h.prgAnd;
  }

  this.getMirroringAdr = function (adr) {
    if (this.mirroring === 0) {
      return adr & 0x7ff;
    } else {
      return (adr & 0x3ff) | ((adr & 0x800) >> 1);
    }
  }

  this.getChrAdr = function (adr) {
    if (adr < 0x0000 || adr >= 0x2000) return -1;
    let idx = (adr >> 10) & 7; // 0x0000~0x03FF:0, 0x0400~0x07FF:1, ..., 0x1C00~0x1FFF:7
    let bank = this.chrBankMap ? this.chrBankMap[idx] : 0;
    let chrCount = this.h.chrBanks ? this.h.chrBanks * 8 : 8;
    if (bank < 0 || bank >= chrCount) bank = 0;
    let offset = adr & 0x3FF;
    return (bank * 0x400) + offset;
  };

  this.clockIrq = function () {
    if (this.reloadIrq || this.irqCounter === 0) {
      this.irqCounter = this.irqLatch;
      this.reloadIrq = false;
    } else {
      this.irqCounter = (this.irqCounter - 1) & 0xff;
    }
    if (this.irqCounter === 0 && this.irqEnabled) {
      this.nes.mapperIrqWanted = true;
    }
  }

  this.peak = function (adr) {
    return this.read(adr);
  }

  this.read = function (adr) {
    // 自动检测特殊映射（不依赖CRC32）
    if (this._autoDetectHack && adr >= 0x2000 && adr < 0x6000) {
      // 访问这个区域次数达到阈值，自动启用hack模式
      if (++this._accessCounter >= 10 && !this._hackEnabled) {
        this._hackEnabled = true;
        console.log("MMC3: 自动启用扩展RAM映射");
      }
      
      // 已启用hack模式，处理映射
      if (this._hackEnabled) {
        // $5000-$5FFF优先映射到扩展RAM
        if (adr >= 0x5000 && adr < 0x6000) {
          return this.prgExtRam[adr - 0x4000];
        }
        // 其它区间映射PRG-ROM
        let romAdr = this.getRomAdr(adr);
        if (romAdr < 0 || romAdr >= this.rom.length) return 0;
        return this.rom[romAdr];
      }
    }

    // 兼容旧代码逻辑（基于CRC32的判断）
    if (this._virtuaNESHack && adr >= 0x2000 && adr < 0x6000) {
      // $5000-$5FFF优先扩展RAM
      if (adr >= 0x5000 && adr < 0x6000) {
        return this.prgExtRam[adr - 0x4000];
      }
      // 其它区间映射PRG-ROM
      let romAdr = this.getRomAdr(adr);
      if (romAdr < 0 || romAdr >= this.rom.length) return 0;
      return this.rom[romAdr];
    }
    
    // 标准行为
    if (adr >= 0x5000 && adr < 0x6000) {
      // 标准扩展RAM
      return this.prgExtRam[adr - 0x4000];
    }
    if (adr < 0x6000) {
      return 0;
    }
    if (adr < 0x8000) {
      let idx = adr & 0x1fff;
      if (idx < 0 || idx >= this.prgRam.length) return 0;
      return this.prgRam[idx];
    }
    let romAdr = this.getRomAdr(adr);
    if (romAdr < 0 || romAdr >= this.rom.length) return 0;
    return this.rom[romAdr];
  }

  this.write = function (adr, value) {
    // 自动检测特殊映射（不依赖CRC32）
    if (this._autoDetectHack && adr >= 0x2000 && adr < 0x6000) {
      // 写入操作是一个很强的信号，表明游戏可能需要扩展映射
      if (!this._hackEnabled) {
        this._hackEnabled = true;
        console.log("MMC3: 检测到扩展RAM写入，自动启用扩展映射");
      }
      
      // 已启用hack模式，处理映射
      if (this._hackEnabled) {
        // $5000-$5FFF优先映射到扩展RAM
        if (adr >= 0x5000 && adr < 0x6000) {
          this.prgExtRam[adr - 0x4000] = value;
          return;
        }
        // 其它区间的写入忽略
        return;
      }
    }

    // 兼容旧代码逻辑（基于CRC32的判断）
    if (this._virtuaNESHack && adr >= 0x2000 && adr < 0x6000) {
      // $5000-$5FFF优先扩展RAM
      if (adr >= 0x5000 && adr < 0x6000) {
        this.prgExtRam[adr - 0x4000] = value;
      }
      // 其它区间（如$2000-$4FFF）写入无效，VirtuaNES也是忽略
      return;
    }
    
    // 标准行为
    if (adr >= 0x5000 && adr < 0x6000) {
      this.prgExtRam[adr - 0x4000] = value;
      return;
    }
    if (adr < 0x6000) {
      return;
    }
    if (adr < 0x8000) {
      let idx = adr & 0x1fff;
      if (idx < 0 || idx >= this.prgRam.length) return;
      this.prgRam[idx] = value;
      return;
    }
    switch (adr & 0xE001) {
      case 0x8000:
        this.regSelect = value & 0x7;
        this.prgMode = (value >> 6) & 1;
        this.chrMode = (value >> 7) & 1;
        this.setPrgBanks();
        this.setChrBanks();
        break;
      case 0x8001:
        this.bankRegs[this.regSelect] = value;
        this.setPrgBanks();
        this.setChrBanks();
        break;
      case 0xA000:
        this.mirroring = value & 1;
        if (this.nes.ppu && this.nes.ppu.setMirroring) {
          if (this.mirroring === 0) {
            this.nes.ppu.setMirroring(this.nes.rom.VERTICAL_MIRRORING);
          } else {
            this.nes.ppu.setMirroring(this.nes.rom.HORIZONTAL_MIRRORING);
          }
        }
        break;
      case 0xA001:
        break;
      case 0xC000:
        this.irqLatch = value;
        break;
      case 0xC001:
        this.reloadIrq = true;
        break;
      case 0xE000:
        this.irqEnabled = false;
        this.nes.mapperIrqWanted = false;
        break;
      case 0xE001:
        this.irqEnabled = true;
        break;
    }
  }

  this.ppuRead = function (adr) {
    if (adr < 0x2000) {
      // MMC3 IRQ 触发：A12 上升沿
      if ((this.lastRead & 0x1000) === 0 && (adr & 0x1000) > 0) {
        this.clockIrq();
      }
      this.lastRead = adr;
      let chrAdr = this.getChrAdr(adr);
      if (this.h.chrBanks === 0) {
        if (chrAdr < 0 || chrAdr >= this.chrRam.length) return 0;
        return this.chrRam[chrAdr];
      } else {
        // 只用 chrAdr，不要再加 this.h.chrBase
        if (chrAdr < 0 || chrAdr >= this.chrRom.length) return 0;
        return this.chrRom[chrAdr];
      }
    } else {
      let idx = this.getMirroringAdr(adr);
      if (idx < 0 || idx >= this.ppuRam.length) return 0;
      return this.ppuRam[idx];
    }
  }

  this.ppuPeak = function (adr) {
    if (adr < 0x2000) {
      let chrAdr = this.getChrAdr(adr);
      if (this.h.chrBanks === 0) {
        if (chrAdr < 0 || chrAdr >= this.chrRam.length) return 0;
        return this.chrRam[chrAdr];
      } else {
        if (chrAdr < 0 || chrAdr >= this.chrRom.length) return 0;
        return this.chrRom[chrAdr];
      }
    } else {
      let idx = this.getMirroringAdr(adr);
      if (idx < 0 || idx >= this.ppuRam.length) return 0;
      return this.ppuRam[idx];
    }
  }

  this.ppuWrite = function (adr, value) {
    if (adr < 0x2000) {
      // MMC3 IRQ 触发：A12 上升沿
      if ((this.lastRead & 0x1000) === 0 && (adr & 0x1000) > 0) {
        this.clockIrq();
      }
      this.lastRead = adr;
      let chrAdr = this.getChrAdr(adr);
      if (this.h.chrBanks === 0) {
        // CHR RAM越界保护
        if (chrAdr < 0 || chrAdr >= this.chrRam.length) return;
        this.chrRam[chrAdr] = value;
        return;
      } else {
        // 写CHR ROM直接忽略
        return;
      }
    } else {
      let idx = this.getMirroringAdr(adr);
      if (idx < 0 || idx >= this.ppuRam.length) return;
      this.ppuRam[idx] = value;
      return;
    }
  };

  // 新增：直接挂载 PRGROM 和 CHRROM 数据
  let prgSizex = header.banks * 0x4000;
  this.prgRom = rom.slice(0, prgSizex);

  let chrSize = header.chrBanks * 0x2000;
  if (chrSize > 0) {
    this.chrRom = rom.slice(prgSizex, prgSizex + chrSize);
  }

  this.getChrPageAndTile = function (ppuAddr) {
    if (ppuAddr < 0x2000) {
      // 获取 CHR 地址
      let chrAdr = this.getChrAdr(ppuAddr);
      if (chrAdr === -1) {
        return null;
      }

      // 计算 CHR 页码和 Tile 偏移
      let pageId = Math.floor(chrAdr / 0x1000); // 每页 4KB
      let tileOffset = Math.floor((chrAdr % 0x1000) / 16); // 每个 Tile 占 16 字节
      return { pageId, tileOffset };
    } else {
      return null;
    }
  };

  // 增加：保存 hack ROM 相关状态（例如映射关系、扩展的 RAM 数据等）
  this.getHackState = function () {
    let state = {};
    // 保存常规变量
    this.saveVars.forEach(name => {
      let val = this[name];
      if (val instanceof Uint8Array || val instanceof Uint16Array) {
        state[name] = Array.prototype.slice.call(val);
      } else {
        state[name] = val;
      }
    });
    // 额外保存：把映射到 PRG ROM 上的本应是 ram 的数据（例如 prgExtRam）
    state.prgExtRam = Array.prototype.slice.call(this.prgExtRam);
    // 保存自动检测状态
    state._autoDetectHack = this._autoDetectHack;
    state._accessCounter = this._accessCounter;
    state._hackEnabled = this._hackEnabled;
    return state;
  };

  // 增加：还原 hack ROM 相关状态
  this.setHackState = function (state) {
    this.saveVars.forEach(name => {
      if (name === "prgExtRam") return; // 后续处理
      let val = this[name];
      if (val instanceof Uint8Array) {
        this[name] = new Uint8Array(state[name]);
      } else if (val instanceof Uint16Array) {
        this[name] = new Uint16Array(state[name]);
      } else {
        this[name] = state[name];
      }
    });
    // 还原扩展 RAM (映射到 PRG ROM 的数据)
    if (state.prgExtRam && Array.isArray(state.prgExtRam)) {
      this.prgExtRam = new Uint8Array(state.prgExtRam);
    }
    // 还原自动检测状态
    if (state._autoDetectHack !== undefined) this._autoDetectHack = state._autoDetectHack;
    if (state._accessCounter !== undefined) this._accessCounter = state._accessCounter;
    if (state._hackEnabled !== undefined) this._hackEnabled = state._hackEnabled;
  };
}
