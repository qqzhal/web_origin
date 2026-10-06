function NsfMapper(data, loadAdr, banked, banks, extendedDataLength = 0) {

  this.banked = banked;
  this.origBanks = banks;
  this.loadAdr = loadAdr;
  this.banks = new Uint8Array(8);
  this.data = data;
  this.extendedDataLength = extendedDataLength;
  this.romData = undefined; // will be set up when resetting
  this.maxBanks = 1;

  this.prgRam = new Uint8Array(0x2000);

  this.reset = function () {
    for (let i = 0; i < this.prgRam.length; i++) {
      this.prgRam[i] = 0;
    }
    for (let i = 0; i < 8; i++) {
      this.banks[i] = this.origBanks[i];
    }
    if (this.banked) {
      this.loadAdr &= 0xfff;
      let dataOffset = 0; // data is already PRG data
      let totalData = (this.data.length - dataOffset) + this.loadAdr;
      this.maxBanks = Math.ceil(totalData / 0x1000);
      this.romData = new Uint8Array(this.maxBanks * 0x1000);
      // fill the romdata
      for (let i = this.loadAdr; i < this.romData.length; i++) {
        if (dataOffset + (i - this.loadAdr) >= this.data.length) {
          // we reached the end of the file
          break;
        }
        this.romData[i] = this.data[dataOffset + (i - this.loadAdr)];
      }
    } else {
      this.romData = new Uint8Array(0x8000);
      // fill the romdata
      let dataOffset = 0; // data is already PRG data
      for (let i = this.loadAdr; i < 0x10000; i++) {
        if (dataOffset + (i - this.loadAdr) >= this.data.length) {
          // we reached the end of the file
          break;
        }
        this.romData[i - 0x8000] = this.data[dataOffset + (i - this.loadAdr)];
      }
    }
  }
  this.reset();

  this.read = function (adr) {
    // 内存断点支持
    if (window.nsfDebugger && Array.isArray(nsfDebugger._memBreakpoints) && nsfDebugger._memBreakpoints.length) {
      if (nsfDebugger._memBreakpoints.includes(adr)) {
        // 只在未命中过时设置
        if (!window._nsfMemBreakHit) {
          window._nsfMemBreakHit = true;
          window._nsfMemBreakAddr = adr;
        }
      }
    }
    // 新增：记录RAM读取
    if (nsfPlayer && nsfPlayer.ramReadStat && adr < 0x10000) {
      nsfPlayer.ramReadStat[adr] = 1;
    }
    // 新增：记录RAM执行（取指令时，需CPU配合。这里假设所有read都可能是取指令）
    if (nsfPlayer && nsfPlayer.ramExecStat && adr < 0x10000 && window._nsfCpuFetch) {
      nsfPlayer.ramExecStat[adr] = 1;
    }
    if (adr < 0x6000) {
      return 0;
    }
    if (adr < 0x8000) {
      return this.prgRam[adr & 0x1fff];
    }
    if (this.banked) {
      let bankNum = (adr >> 12) - 8;
      return this.romData[this.banks[bankNum] * 0x1000 + (adr & 0xfff)];
    } else {
      return this.romData[adr & 0x7fff];
    }
  }

  this.write = function (adr, val) {
    // 内存断点支持
    if (window.nsfDebugger && Array.isArray(nsfDebugger._memBreakpoints) && nsfDebugger._memBreakpoints.length) {
      if (nsfDebugger._memBreakpoints.includes(adr)) {
        if (!window._nsfMemBreakHit) {
          window._nsfMemBreakHit = true;
          window._nsfMemBreakAddr = adr;
        }
      }
    }
    // 新增：记录RAM写入
    if (nsfPlayer && nsfPlayer.ramWriteStat && adr < 0x10000) {
      nsfPlayer.ramWriteStat[adr] = 1;
    }
    if (adr < 0x5ff8) {
      return;
    }
    if (adr < 0x6000) {
      this.banks[adr - 0x5ff8] = val % this.maxBanks;
      return;
    }
    if (adr < 0x8000) {
      this.prgRam[adr & 0x1fff] = val;
      return;
    }
    // ROM not writable for normal banks - but some NSF music code writes to
    // expansion sound registers mapped into the CPU space (e.g. VRC6 at
    // $9000-$9002/$A000-$A002/$B000-$B002, FME7 at $C000/$E000). Forward those to the APU's exWrite
    // so expansion sound can be produced.
    try {
      // mask similar to mapper implementation: check addr & 0xF003
      const m = adr & 0xF003;
      if (
        m === 0x9000 || m === 0x9001 || m === 0x9002 ||
        m === 0xA000 || m === 0xA001 || m === 0xA002 ||
        m === 0xB000 || m === 0xB001 || m === 0xB002
      ) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
      // FME7 (Sunsoft 5B) addresses
      if (adr === 0xC000 || adr === 0xE000) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
      // FDS (Famicom Disk System) addresses
      if (adr >= 0x4040 && adr <= 0x4092) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
      // MMC5 addresses
      if (adr >= 0x5000 && adr <= 0x5015) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
      // VRC7 addresses
      if (adr === 0x9010 || adr === 0x9030) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
      // N106 (Namco 163) addresses
      if (adr === 0xF800 || adr === 0x4800) {
        if (typeof nsfPlayer !== 'undefined' && nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.exWrite === 'function') {
          nsfPlayer.apu.exWrite(adr, val);
          return;
        }
      }
    } catch (e) {
      // defensive: ignore and fallthrough
    }

    // rom not writable
    return;
  }
}

// 在 nsf.js 里 NsfPlayer 构造函数内加：
if (typeof this.ramReadStat === "undefined") this.ramReadStat = new Uint8Array(0x10000);
if (typeof this.ramWriteStat === "undefined") this.ramWriteStat = new Uint8Array(0x10000);
if (typeof this.ramExecStat === "undefined") this.ramExecStat = new Uint8Array(0x10000);
