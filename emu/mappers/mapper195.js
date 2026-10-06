// mappers/mapper195.js
function Mapper195(nes, rom, header) {
  let prgSize = header.banks * 0x4000;
  let chrSize = header.chrBanks * 0x2000;
  this.prgRom = rom.slice(0, prgSize);
  this.chrRom = chrSize > 0 ? rom.slice(prgSize, prgSize + chrSize) : null;

  mappers[4].call(this, nes, rom, header); // 继承MMC3

  this.name = "Mapper195";
  this.chrRam = new Uint8Array(0x1000); // 4KB CHRRAM
  this.extraPrgRam = new Uint8Array(0x1000); // 0x5000-0x5fff
  this.chrBankSelect = 0x80;

  // 8个1K区块的物理映射表，{isRam, offset}
  this.chrPageTable = new Array(8);

  // 维护物理映射表，类似setchr1r
  this.updateChrPhysMap = function () {
    let regs = this.bankRegs;
    let banks = [
      (regs[0] & 0xFE), (regs[0] | 0x01),
      (regs[1] & 0xFE), (regs[1] | 0x01),
      regs[2], regs[3], regs[4], regs[5]
    ];
    let chrCount = this.h.chrBanks ? this.h.chrBanks * 8 : 8;
    for (let i = 0; i < 8; i++) {
      let bank = banks[i] % chrCount;
      if (bank <= 3) {
        // CHRRAM, offset限制在4K
        this.chrPageTable[i] = { isRam: true, offset: (bank * 0x400) & 0xfff };
      } else {
        // CHRROM
        this.chrPageTable[i] = { isRam: false, offset: (bank * 0x400) & this.h.chrAnd };
      }
    }
  };

  // 重写reset，保留MMC3初始化并加上自定义部分
  var mmc3Reset = this.reset;
  this.reset = function (hard) {
    mmc3Reset.call(this, hard);
    for (let i = 0; i < this.chrRam.length; i++) this.chrRam[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < this.extraPrgRam.length; i++) this.extraPrgRam[i] = Math.floor(Math.random() * 256);
    this.chrBankSelect = 0x80;
    this.bankRegs[6] = 0;
    this.bankRegs[7] = 1;
    this.setPrgBanks && this.setPrgBanks();
    this.setChrBanks && this.setChrBanks();
    this.updateChrPhysMap();
  };
  this.reset(true);

  // 重写read，支持extraPrgRam
  var mmc3Read = this.read;
  this.read = function (adr) {
    if (adr >= 0x5000 && adr < 0x6000) {
      return this.extraPrgRam[adr & 0xfff];
    }
    return mmc3Read.call(this, adr);
  };

  // 重写write，支持extraPrgRam和chrBankSelect，并在写CHR寄存器时更新物理映射表
  var mmc3Write = this.write;
  this.write = function (adr, value) {
    if (adr >= 0x5000 && adr < 0x6000) {
      this.extraPrgRam[adr & 0xfff] = value;
      return;
    }
    if ((adr & 0x6001) === 0x8000) {
      this.chrBankSelect = value;
      this.updateChrBanks();
      this.updateChrPhysMap();
      return;
    }
    if ((adr & 0xE001) === 0x8001) {
      if (this.regSelect < 6) {
        let maxChr = (this.h.chrBanks ? this.h.chrBanks * 8 : 8);
        this.bankRegs[this.regSelect] = value % maxChr;
        this.updateChrPhysMap();
      } else if (this.regSelect === 6 || this.regSelect === 7) {
        let maxPrg = this.h.banks * 2;
        this.bankRegs[this.regSelect] = value % maxPrg;
      }
      return;
    }
    mmc3Write.call(this, adr, value);
  };

  // 重写getChrAdr，返回idx和offset
  this.getChrAdr = function (adr) {
    if (this.chrMode === 1) adr ^= 0x1000;
    let idx;
    if (adr < 0x400) idx = 0;
    else if (adr < 0x800) idx = 1;
    else if (adr < 0xC00) idx = 2;
    else if (adr < 0x1000) idx = 3;
    else if (adr < 0x1400) idx = 4;
    else if (adr < 0x1800) idx = 5;
    else if (adr < 0x1C00) idx = 6;
    else idx = 7;
    let offset = adr & 0x3ff;
    return { idx, offset };
  };

  // 重写ppuRead/ppuWrite，查表决定访问CHRRAM还是CHRROM
  this.ppuRead = function (adr) {
    if (adr < 0x2000) {
      if ((this.lastRead & 0x1000) === 0 && (adr & 0x1000) > 0) {
        this.clockIrq();
      }
      this.lastRead = adr;
      let { idx, offset } = this.getChrAdr(adr);
      let entry = this.chrPageTable[idx];
      if (entry.isRam) {
        return this.chrRam[(entry.offset + offset) & 0xfff];
      } else {
        return this.chrRom[((entry.offset + offset) & this.h.chrAnd)];
      }
    } else {
      return this.ppuRam[this.getMirroringAdr(adr)];
    }
  };

  this.ppuWrite = function (adr, value) {
    if (adr < 0x2000) {
      let { idx, offset } = this.getChrAdr(adr);
      let entry = this.chrPageTable[idx];
      if (entry.isRam) {
        this.chrRam[(entry.offset + offset) & 0xfff] = value;
      }
    } else {
      this.ppuRam[this.getMirroringAdr(adr)] = value;
    }
  };

  // 补充ppuPeak，调试器用
  this.ppuPeak = function (adr) {
    if (adr < 0x2000) {
      let { idx, offset } = this.getChrAdr(adr);
      let entry = this.chrPageTable[idx];
      if (entry.isRam) {
        return this.chrRam[(entry.offset + offset) & 0xfff];
      } else {
        return this.chrRom[((entry.offset + offset) & this.h.chrAnd)];
      }
    } else {
      return this.ppuRam[this.getMirroringAdr(adr)];
    }
  };

  // 重写getRomAdr，允许bankRegs[6]/[7]映射到所有PRG bank
  this.getRomAdr = function (adr) {
    let prgCount = this.h.banks * 2;
    let last2 = prgCount - 2;
    let last1 = prgCount - 1;
    let bank;
    if (this.prgMode === 0) {
      if (adr < 0xa000) {
        bank = this.bankRegs[6] % prgCount;
      } else if (adr < 0xc000) {
        bank = this.bankRegs[7] % prgCount;
      } else if (adr < 0xe000) {
        bank = last2;
      } else {
        bank = last1;
      }
    } else {
      if (adr < 0xa000) {
        bank = last2;
      } else if (adr < 0xc000) {
        bank = this.bankRegs[7] % prgCount;
      } else if (adr < 0xe000) {
        bank = this.bankRegs[6] % prgCount;
      } else {
        bank = last1;
      }
    }
    return (bank * 0x2000 + (adr & 0x1fff)) & this.h.prgAnd;
  };

  // 保留自定义的CHR bank切换
  this.updateChrBanks = function () {
    const chrBank = this.chrBankSelect & 0xFE;
    const chrRamSize = (this.chrBankSelect & 0x20) ? 0x800 : 0x1000;
    const firstRamBank = (this.chrBankSelect & 0xC0) >> 6;
    const lastRamBank = firstRamBank + chrRamSize / 0x400 - 1;

    this.chrRam.fill(0);
    for (let i = firstRamBank; i <= lastRamBank; i++) {
      if (this.chrRom) {
        this.chrRam.set(this.chrRom.subarray(i * 0x400, (i + 1) * 0x400), (i - firstRamBank) * 0x400);
      }
    }
  };

  // 保留电池相关
  this.setBattery = function (battery) {
    this.h.battery = battery;
  };
  this.getBattery = function () {
    return this.h.battery;
  };

  this.getChrPageAndTile = function (ppuAddr) {
    if (ppuAddr < 0x2000) {
      // 获取 CHR 地址
      let { idx, offset } = this.getChrAdr(ppuAddr);
      let entry = this.chrPageTable[idx];
      let chrAdr = entry.offset + offset;

      // 计算 CHR 页码和 Tile 偏移
      let pageId = Math.floor(chrAdr / 0x1000); // 每页 4KB
      let tileOffset = Math.floor((chrAdr % 0x1000) / 16); // 每个 Tile 占 16 字节
      return { pageId, tileOffset };
    } else {
      return null;
    }
  };

}

mappers[195] = Mapper195;