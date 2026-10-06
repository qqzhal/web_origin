// N106 (Namco 163) Expansion Audio Chip
// Based on VirtuaNESex C++ implementation

class APU_N106 {
  constructor() {
    this.reset();
  }

  reset() {
    this.tone = new Uint8Array(0x100); // Waveform data, 256 bytes
    this.address = 0;
    this.addrinc = 1;
    this.channel_use = 8;

    // Initialize channels
    this.op = [];
    for (let i = 0; i < 8; i++) {
      this.op[i] = {
        phaseacc: 0,
        freq: 0,
        phase: 0,
        tonelen: 0x10 << 18,
        output: 0,
        toneadr: 0,
        volupdate: 0,
        vol: 0,
        databuf: 0
      };
    }

    this.cpu_clock = 1789772.5; // APU_CLOCK
    this.cycle_rate = Math.floor(this.cpu_clock * 12.0 * (1 << 20) / (45.0 * 22050.0));
  }

  setup(fClock, nRate) {
    this.cpu_clock = fClock;
    this.cycle_rate = Math.floor(this.cpu_clock * 12.0 * (1 << 20) / (45.0 * nRate));
  }

  write(addr, data) {
    if (addr === 0x4800) {
      // Write to tone data
      this.tone[this.address * 2 + 0] = data & 0x0F;
      this.tone[this.address * 2 + 1] = data >> 4;

      if (this.address >= 0x40) {
        const no = (this.address - 0x40) >> 3;
        const ch = this.op[no];
        const reg = this.address & 7;

        switch (reg) {
          case 0x00:
            ch.freq = (ch.freq & ~0x000000FF) | data;
            break;
          case 0x02:
            ch.freq = (ch.freq & ~0x0000FF00) | (data << 8);
            break;
          case 0x04:
            ch.freq = (ch.freq & ~0x00030000) | ((data & 0x03) << 16);
            const tonelen = (0x20 - (data & 0x1C)) << 18;
            ch.databuf = (data & 0x1C) >> 2;
            if (ch.tonelen !== tonelen) {
              ch.tonelen = tonelen;
              ch.phase = 0;
            }
            break;
          case 0x06:
            ch.toneadr = data;
            break;
          case 0x07:
            ch.vol = data & 0x0F;
            ch.volupdate = 0xFF;
            if (no === 7) {
              this.channel_use = ((data >> 4) & 0x07) + 1;
            }
            break;
        }
      }

      if (this.addrinc) {
        this.address = (this.address + 1) & 0x7F;
      }
    } else if (addr === 0xF800) {
      this.address = data & 0x7F;
      this.addrinc = data & 0x80 ? 1 : 0;
    }
  }

  read(addr) {
    // Dummy read
    if (addr === 0x4800) {
      if (this.addrinc) {
        this.address = (this.address + 1) & 0x7F;
      }
    }
    return (addr >> 8) & 0xFF;
  }

  processChannel(channel) {
    if (channel >= (8 - this.channel_use) && channel < 8) {
      return this.channelRender(this.op[channel]);
    }
    return 0;
  }

  getFreq(channel) {
    if (channel < 8) {
      channel &= 7;
      if (channel < (8 - this.channel_use)) return 0;

      const ch = this.op[channel];
      if (!ch.freq || !ch.vol) return 0;
      const temp = this.channel_use * (8 - ch.databuf) * 4 * 45;
      if (!temp) return 0;
      return Math.floor(256.0 * this.cpu_clock * 12.0 * ch.freq / (0x40000 * temp));
    }
    return 0;
  }

  channelRender(ch) {
    const phasespd = this.channel_use << 20;

    ch.phaseacc -= this.cycle_rate;
    if (ch.phaseacc >= 0) {
      if (ch.volupdate) {
        let sample = (this.tone[((ch.phase >> 18) + ch.toneadr) & 0xFF] & 0xF);
        sample = sample < 8 ? sample : sample - 16; // signed 4-bit
        ch.output = Math.round((sample * ch.vol) / 15);
        ch.volupdate = 0;
      }
      return ch.output;
    }

    while (ch.phaseacc < 0) {
      ch.phaseacc += phasespd;
      ch.phase += ch.freq;
    }
    while (ch.tonelen && ch.phase >= ch.tonelen) {
      ch.phase -= ch.tonelen;
    }

    let sample = (this.tone[((ch.phase >> 18) + ch.toneadr) & 0xFF] & 0xF);
    sample = sample < 8 ? sample : sample - 16; // signed 4-bit
    ch.output = Math.round((sample * ch.vol) / 15);
    return ch.output;
  }

  // For compatibility, add a process method that sums all channels
  process() {
    return this.processAll();
  }

  processAll() {
    let output = 0;
    for (let i = 0; i < 8; i++) {
      output += this.processChannel(i);
    }
    return output;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_N106;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_N106 = APU_N106;
}