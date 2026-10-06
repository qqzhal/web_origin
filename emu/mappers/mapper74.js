// mappers/mapper74.js
function Mapper74(nes, rom, header) {
  let prgSize = header.banks * 0x4000;
let chrSize = header.chrBanks * 0x2000;
this.prgRom = rom.slice(0, prgSize);
this.chrRom = chrSize > 0 ? rom.slice(prgSize, prgSize + chrSize) : null;

  mappers[4].call(this, nes, rom, header);

  this.name = "Mapper74";
  this.chrRam = new Uint8Array(0x1000); // 4KB CHRRAM
  this.extRam = new Uint8Array(0x1000); // 0x5000-0x5fff

  this.chrPageTable = new Array(8);

  this.updateChrPhysMap = function() {
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
        this.chrPageTable[i] = { isRam: true, offset: (bank * 0x400) & 0xfff };
      } else {
        this.chrPageTable[i] = { isRam: false, offset: (bank * 0x400) & this.h.chrAnd };
      }
    }
  };

  var mmc3Reset = this.reset;
  this.reset = function(hard) {
    mmc3Reset.call(this, hard);
    this.chrRam.fill(0);
    this.extRam.fill(0);
    this.bankRegs[6] = 0;
    this.bankRegs[7] = 1;
    this.updateChrPhysMap();
  };
  this.reset(true);

  var mmc3Read = this.read;
  this.read = function(adr) {
    if (adr >= 0x5000 && adr < 0x6000) {
      return this.extRam[adr & 0xfff];
    }
    return mmc3Read.call(this, adr);
  };

  var mmc3Write = this.write;
  this.write = function(adr, value) {
    if (adr >= 0x5000 && adr < 0x6000) {
      this.extRam[adr & 0xfff] = value;
      return;
    }
    if ((adr & 0xE001) === 0x8001 && this.regSelect < 6) {
      let maxChr = (this.h.chrBanks ? this.h.chrBanks * 8 : 8);
      this.bankRegs[this.regSelect] = value % maxChr;
      this.updateChrPhysMap();
      return;
    }
    mmc3Write.call(this, adr, value);
  };

  this.getChrAdr = function(adr) {
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

  this.ppuRead = function(adr) {
    if (adr < 0x2000) {
      if ((this.lastRead & 0x1000) === 0 && (adr & 0x1000) > 0) this.clockIrq();
      this.lastRead = adr;
      let { idx, offset } = this.getChrAdr(adr);
      let entry = this.chrPageTable[idx];
      if (entry.isRam) {
        return this.chrRam[(entry.offset + offset) & 0xfff];
      } else {
        return this.chrRom[ ((entry.offset + offset) & this.h.chrAnd)];
      }
    } else {
      return this.ppuRam[this.getMirroringAdr(adr)];
    }
  };

  this.ppuWrite = function(adr, value) {
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
  this.ppuPeak = function(adr) {
    if (adr < 0x2000) {
      let { idx, offset } = this.getChrAdr(adr);
      let entry = this.chrPageTable[idx];
      if (entry.isRam) {
        return this.chrRam[(entry.offset + offset) & 0xfff];
      } else {
        return this.chrRom[ ((entry.offset + offset) & this.h.chrAnd)];
      }
    } else {
      return this.ppuRam[this.getMirroringAdr(adr)];
    }
  };


  this.getChrPageAndTile = function(ppuAddr) {
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

mappers[74] = Mapper74;