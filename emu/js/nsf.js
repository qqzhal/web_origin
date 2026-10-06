function NsfPlayer() {

  this.cpu = new Cpu(this);
  this.apu = new Apu(this);

  this.ram = new Uint8Array(0x800);

  // internally used
  this.callArea = new Uint8Array(0x10);

  this.totalSongs = 0;
  this.startSong = 0;
  this.tags = {
    name: "",
    artist: "",
    copyright: ""
  }

  this.playReturned = true;

  this.frameIrqWanted = false;
  this.dmcIrqWanted = false;

  // this.mapper = new NsfMapper(this);

  // 新增：ROM读取统计
  this.romReadStat = {}; // {addr: count}

  // 新增：全局内存访问统计（只初始化一次）
  this.enableMemoryStats = false; // 性能优化：默认禁用内存统计以提高低端设备性能
  this.ramReadStat = new Uint8Array(0x10000);
  this.ramWriteStat = new Uint8Array(0x10000);
  this.ramExecStat = new Uint8Array(0x10000);

  this.loadNsf = function(nsf) {
    // Ensure nsf is a Uint8Array
    if (!(nsf instanceof Uint8Array)) {
      nsf = new Uint8Array(nsf);
    }
    if(nsf.length < 0x80) {
      log("Invalid NSF loaded");
      return false;
    }
    if(
      nsf[0] !== 0x4e || nsf[1] !== 0x45 || nsf[2] !== 0x53 ||
      nsf[3] !== 0x4d || nsf[4] !== 0x1a
    ) {
      log("Invalid NSF loaded");
      return false;
    }
    if(nsf[5] !== 1 && nsf[5] !== 2) {
      log("Unknown NSF version: " + nsf[5]);
      return false;
    }
    this.totalSongs = nsf[6];
    this.startSong = nsf[7];
    let loadAdr = nsf[8] | (nsf[9] << 8);
    if(loadAdr < 0x8000) {
      log("Load address less than 0x8000 is not supported");
      return false;
    }
    let initAdr = nsf[0xa] | (nsf[0xb] << 8);
    let playAdr = nsf[0xc] | (nsf[0xd] << 8);
    this.tags = {
      name: "",
      artist: "",
      copyright: ""
    }
    for(let i = 0; i < 32; i++) {
      if(nsf[0xe + i] === 0) {
        break;
      }
      this.tags.name += String.fromCharCode(nsf[0xe + i]);
    }
    for(let i = 0; i < 32; i++) {
      if(nsf[0x2e + i] === 0) {
        break;
      }
      this.tags.artist += String.fromCharCode(nsf[0x2e + i]);
    }
    for(let i = 0; i < 32; i++) {
      if(nsf[0x4e + i] === 0) {
        break;
      }
      this.tags.copyright += String.fromCharCode(nsf[0x4e + i]);
    }
    
    // parse play speed and PAL/NTSC settings
    let ntscPlaySpeed = nsf[0x6a] | (nsf[0x6b] << 8);
    let palPlaySpeed = nsf[0x6c] | (nsf[0x6d] << 8);
    let controlByte = nsf[0x7a] || 0;
    // VirtuaNESex ignores non-standard bits in control byte
    controlByte &= 0x03; // Only keep NTSC/PAL and bank switching disable bits
    
    // bit 0 of control byte: 0=PAL, 1=NTSC
    this.isNtsc = (controlByte & 0x01) !== 0;
    // bit 1 of control byte: disable bank switching during init if set
    this.disableBankSwitchingInit = (controlByte & 0x02) !== 0;
    
    // use appropriate play speed based on NTSC/PAL setting
    this.playSpeed = this.isNtsc ? ntscPlaySpeed : palPlaySpeed;
    // default to 16639 (NTSC) or 19997 (PAL) if not specified
    if(this.playSpeed === 0) {
      this.playSpeed = this.isNtsc ? 16639 : 19997;
    }
    
    let initBanks = [0, 0, 0, 0, 0, 0, 0, 0];
    let total = 0;
    for(let i = 0; i < 8; i++) {
      initBanks[i] = nsf[0x70 + i];
      total += nsf[0x70 + i];
    }
    banking = total > 0;
    // parse extra chips flags (NSF header byte 0x7B)
    let extraChips = nsf[0x7b] || 0;
    // VirtuaNESex only supports known expansion chips, ignore unknown bits
    extraChips &= 0x3F; // Only keep bits 0-5 (VRC6, VRC7, FDS, MMC5, N106, FME7)
    // bits: 0=VRC6, 1=VRC7, 2=FDS, 3=MMC5, 4=Namco163, 5=Sunsoft5B (best-effort)
    this.extraChips = {
      vrc6: (extraChips & 0x01) !== 0,
      vrc7: (extraChips & 0x02) !== 0,
      fds:  (extraChips & 0x04) !== 0,
      mmc5: (extraChips & 0x08) !== 0,
      namco: (extraChips & 0x10) !== 0,
      sunsoft5b: (extraChips & 0x20) !== 0
    };

    // parse NSF v2 extended data length (bytes 0x7E-0x7F)
    let extendedDataLength = 0;
    if (nsf[5] === 2) {
      extendedDataLength = nsf[0x7e] | (nsf[0x7f] << 8);
    }

    // VirtuaNESex容错：自动补齐PRG数据到4KB对齐
    // For this problematic file, include extended data as part of PRG
    let prgStart = 0x80; // include extended data
    let prgLen = nsf.length - prgStart;
    let prgPadLen = ((prgLen + 0xFFF) & ~0xFFF); // 4KB对齐
    let prgData = new Uint8Array(prgPadLen);
    prgData.fill(0);
    prgData.set(nsf.subarray(prgStart, nsf.length), 0);

    // 传递补齐后的 prgData 给 NsfMapper
    this.mapper = new NsfMapper(prgData, loadAdr, banking, initBanks, 0);

    // inform APU about extra chips so it can enable handlers
    if (this.apu) {
      this.apu._nsfExtraChips = this.extraChips;
      this.apu.isNtsc = true; // Always use NTSC timing for APU
      // Set buffer size to match NTSC
      this.apu.bufferSizeOverride = 29781;
      
      // Initialize expansion sound chips matching VNES behavior
      if (this.extraChips.vrc6) {
        this.apu.selectExSound(1); // VRC6
      }
      if (this.extraChips.vrc7) {
        this.apu.selectExSound(2); // VRC7
      }
      if (this.extraChips.fds) {
        this.apu.selectExSound(4); // FDS
      }
      if (this.extraChips.mmc5) {
        this.apu.selectExSound(8); // MMC5
      }
      if (this.extraChips.namco) {
        this.apu.selectExSound(16); // N106
      }
      if (this.extraChips.sunsoft5b) {
        this.apu.selectExSound(32); // FME7
      }
    }
    // set up the call area
    this.callArea[0] = 0x20; // JSR
    this.callArea[1] = initAdr & 0xff;
    this.callArea[2] = initAdr >> 8;
    this.callArea[3] = 0xea // NOP
    this.callArea[4] = 0xea // NOP
    this.callArea[5] = 0xea // NOP
    this.callArea[6] = 0xea // NOP
    this.callArea[7] = 0xea // NOP
    this.callArea[8] = 0x20; // JSR
    this.callArea[9] = playAdr & 0xff;
    this.callArea[0xa] = playAdr >> 8;
    this.callArea[0xb] = 0xea // NOP
    this.callArea[0xc] = 0xea // NOP
    this.callArea[0xd] = 0xea // NOP
    this.callArea[0xe] = 0xea // NOP
    this.callArea[0xf] = 0xea // NOP

    this.playSong(this.startSong);
    //log("Loaded NSF file");
    return true;
  }

  this.playSong = function(songNum) {
    // 清除颜色状态
    if (this.ramReadStat) this.ramReadStat.fill(0);
    if (this.ramWriteStat) this.ramWriteStat.fill(0);
    if (this.ramExecStat) this.ramExecStat.fill(0);

    // also acts as a reset
    for(let i = 0; i < this.ram.length; i++) {
      this.ram[i] = 0;
    }
    this.playReturned = true;
    // Ensure buffer size matches NTSC
    this.apu.bufferSizeOverride = 29781;
    this.apu.reset();
    this.cpu.reset();
    this.mapper.reset();
    this.frameIrqWanted = false;
    this.dmcIrqWanted = false;
    for(let i = 0x4000; i <= 0x4013; i++) {
      this.apu.write(i, 0);
    }
    this.apu.write(0x4015, 0);
    this.apu.write(0x4015, 0xf);
    this.apu.write(0x4017, 0x40);

    // run the init routine
    this.cpu.br[0] = 0x3ff0;
    this.cpu.r[0] = songNum - 1;
    this.cpu.r[1] = 0;
    // don't allow init to take more than 200 frames (reduced for low-end devices)
    let cycleCount = 0;
    let finished = false;
    let maxCycles = 29780 * 200; // Reduced from 400 to 200 frames for better performance
    while(cycleCount < maxCycles) {
      window._nsfCpuFetch = true;
      this.cpu.cycle();
      window._nsfCpuFetch = false;
      this.apu.cycle();
      if(this.cpu.br[0] === 0x3ff5) {
        // we are in the nops after the init-routine, it finished
        finished = true;
        break;
      }
      cycleCount++;
    }
    if(!finished) {
      log("Init did not finish within 200 frames, PC=" + this.cpu.br[0].toString(16) + ", continuing anyway");
      // Don't fail, just continue - some NSF files have long init routines
    }
  }

  this.runFrame = function() {
    // run the cpu until either a frame has passed, or the play-routine returned
    if(this.playReturned) {
      this.cpu.br[0] = 0x3ff8;
    }
    this.playReturned = false;
    let cycleCount = 0;
    // Always use NTSC timing: 29780 cycles per frame
    let cyclesPerFrame = 29780;
    while(cycleCount < cyclesPerFrame) {
      this.cpu.irqWanted = this.dmcIrqWanted || this.frameIrqWanted;
      if(!this.playReturned) {
        window._nsfCpuFetch = true;
        this.cpu.cycle();
        window._nsfCpuFetch = false;
      }
      this.apu.cycle();
      if(this.cpu.br[0] === 0x3ffd) {
        // we are in the nops after the play-routine, it finished
        this.playReturned = true;
      }
      cycleCount++;
    }
  }

  this.getSamples = function(data, count) {
    // apu returns samples based on the play speed timing
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

  this.read = function(adr) {
    adr &= 0xffff;

    if(adr < 0x2000) {
      // ram
      // 新增：统计RAM读取（仅在启用时）
      if (this.enableMemoryStats && this.ramReadStat && this.ramReadStat.length === 0x10000) {
        this.ramReadStat[adr] = 1;
        if (window._nsfCpuFetch && this.ramExecStat && this.ramExecStat.length === 0x10000) {
          this.ramExecStat[adr] = 1;
        }
      }
      return this.ram[adr & 0x7ff];
    }
    if(adr < 0x3ff0) {
      // ppu ports, not readable in NSF
      return 0;
    }
    if(adr < 0x4000) {
      // special call area used internally by player
      return this.callArea[adr & 0xf];
    }
    if(adr < 0x4020) {
      // apu/misc ports
      if(adr === 0x4014) {
        return 0; // not readable
      }
      if(adr === 0x4016 || adr === 0x4017) {
        return 0; // not readable in NSF
      }
      return this.apu.read(adr);
    }
    return this.mapper.read(adr);
  }

  this.write = function(adr, value) {
    adr &= 0xffff;

    if(adr < 0x2000) {
      // ram
      // 新增：统计RAM写入（仅在启用时）
      if (this.enableMemoryStats && this.ramWriteStat && this.ramWriteStat.length === 0x10000) {
        this.ramWriteStat[adr] = 1;
      }
      this.ram[adr & 0x7ff] = value;
      return;
    }
    if(adr < 0x4000) {
      // ppu ports, not writable in NSF
      return;
    }
    if(adr < 0x4020) {
      // apu/misc ports
      if(adr === 0x4014 || adr === 0x4016) {
        // not writable in NSF
        return;
      }
      this.apu.write(adr, value);
      return;
    }
    this.mapper.write(adr, value);
  }

  // 新增：导出ROM读取统计结果
  this.dumpRomReadStat = function(minCount = 100) {
    // 返回被频繁读取的ROM地址区间
    let arr = [];
    for (let k in this.romReadStat) {
      if (this.romReadStat[k] >= minCount) {
        arr.push({ addr: parseInt(k), count: this.romReadStat[k] });
      }
    }
    arr.sort((a, b) => a.addr - b.addr);
    return arr;
  }

}

// 暴露NsfPlayer构造函数给全局作用域
window.NsfPlayer = NsfPlayer;
