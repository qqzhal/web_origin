// FDS (Famicom Disk System) Expansion Audio Chip
// Based on VirtuaNESex C++ implementation

class APU_FDS {
  constructor() {
    this.reset();
  }

  reset() {
    // Initialize FDS sound structure
    this.fds = {
      reg: new Uint8Array(0x80),

      // Volume Envelope
      volenv_mode: 0,
      volenv_gain: 0,
      volenv_decay: 0,
      volenv_phaseacc: 0,

      // Sweep Envelope
      swpenv_mode: 0,
      swpenv_gain: 0,
      swpenv_decay: 0,
      swpenv_phaseacc: 0,

      // Envelope unit
      envelope_enable: 0,
      envelope_speed: 0,

      // Master control
      wave_setup: 0,
      master_volume: 30,

      // Main unit
      main_wavetable: new Int8Array(64),
      main_enable: 0,
      main_frequency: 0,
      main_addr: 0,

      // Effector(LFO) unit
      lfo_wavetable: new Uint8Array(64),
      lfo_enable: 1, // 0:Enable 1:Wavetable setup
      lfo_frequency: 0,
      lfo_addr: 0,
      lfo_phaseacc: 0,

      // Sweep unit
      sweep_bias: 0,

      // Misc
      now_volume: 0,
      now_freq: 0,
      output: 0
    };

    // Sync version for CPU synchronization
    this.fds_sync = JSON.parse(JSON.stringify(this.fds));

    // Output buffer for LPF
    this.output_buf = new Int32Array(8);

    this.sampling_rate = 22050;
    this.cpu_clock = 1789772.5;
  }

  setup(fClock, nRate) {
    this.cpu_clock = fClock;
    this.sampling_rate = nRate;
  }

  writeSub(addr, data, ch, rate) {
    if (addr < 0x4040 || addr > 0x40BF) return;

    ch.reg[addr - 0x4040] = data;

    if (addr >= 0x4040 && addr <= 0x407F) {
      if (ch.wave_setup) {
        ch.main_wavetable[addr - 0x4040] = 0x20 - ((data & 0x3F) >>> 0);
      }
    } else {
      switch (addr) {
        case 0x4080: // Volume Envelope
          ch.volenv_mode = data >>> 6;
          if (data & 0x80) {
            ch.volenv_gain = data & 0x3F;
            if (!ch.main_addr) {
              ch.now_volume = (ch.volenv_gain < 0x21) ? ch.volenv_gain : 0x20;
            }
          }
          ch.volenv_decay = data & 0x3F;
          ch.volenv_phaseacc = (ch.envelope_speed * (ch.volenv_decay + 1) * rate) / (232.0 * 960.0);
          break;

        case 0x4082: // Main Frequency(Low)
          ch.main_frequency = (ch.main_frequency & ~0x00FF) | data;
          break;

        case 0x4083: // Main Frequency(High)
          ch.main_enable = (~data) & (1 << 7);
          ch.envelope_enable = (~data) & (1 << 6);
          if (!ch.main_enable) {
            ch.main_addr = 0;
            ch.now_volume = (ch.volenv_gain < 0x21) ? ch.volenv_gain : 0x20;
          }
          ch.main_frequency = (ch.main_frequency & 0x00FF) | (((data & 0x0F) << 8) >>> 0);
          break;

        case 0x4084: // Sweep Envelope
          ch.swpenv_mode = data >>> 6;
          if (data & 0x80) {
            ch.swpenv_gain = data & 0x3F;
          }
          ch.swpenv_decay = data & 0x3F;
          ch.swpenv_phaseacc = (ch.envelope_speed * (ch.swpenv_decay + 1) * rate) / (232.0 * 960.0);
          break;

        case 0x4085: // Sweep Bias
          if (data & 0x40) ch.sweep_bias = (data & 0x3F) - 0x40;
          else ch.sweep_bias = data & 0x3F;
          ch.lfo_addr = 0;
          break;

        case 0x4086: // Effector(LFO) Frequency(Low)
          ch.lfo_frequency = (ch.lfo_frequency & (~0x00FF)) | data;
          break;

        case 0x4087: // Effector(LFO) Frequency(High)
          ch.lfo_enable = (~data & 0x80) >>> 0;
          ch.lfo_frequency = (ch.lfo_frequency & 0x00FF) | (((data & 0x0F) << 8) >>> 0);
          break;

        case 0x4088: // Effector(LFO) wavetable
          if (!ch.lfo_enable) {
            // FIFO
            for (let i = 0; i < 31; i++) {
              ch.lfo_wavetable[i * 2 + 0] = ch.lfo_wavetable[(i + 1) * 2 + 0];
              ch.lfo_wavetable[i * 2 + 1] = ch.lfo_wavetable[(i + 1) * 2 + 1];
            }
            ch.lfo_wavetable[31 * 2 + 0] = data & 0x07;
            ch.lfo_wavetable[31 * 2 + 1] = data & 0x07;
          }
          break;

        case 0x4089: // Sound control
          {
            const tbl = [30, 20, 15, 12];
            ch.master_volume = tbl[data & 3];
            ch.wave_setup = data & 0x80;
          }
          break;

        case 0x408A: // Sound control 2
          ch.envelope_speed = data;
          break;

        default:
          break;
      }
    }
  }

  write(addr, data) {
    this.writeSub(addr, data, this.fds, this.sampling_rate);
  }

  read(addr) {
    let data = addr >>> 8;

    if (addr >= 0x4040 && addr <= 0x407F) {
      data = this.fds.main_wavetable[addr & 0x3F] | 0x40;
    } else if (addr === 0x4090) {
      data = (this.fds.volenv_gain & 0x3F) | 0x40;
    } else if (addr === 0x4092) {
      data = (this.fds.swpenv_gain & 0x3F) | 0x40;
    }

    return data;
  }

  process(channel) {
    const fds = this.fds;

    // Envelope unit
    if (fds.envelope_enable && fds.envelope_speed) {
      // Volume envelope
      if (fds.volenv_mode < 2) {
        const decay = ((fds.envelope_speed * (fds.volenv_decay + 1) * this.sampling_rate) / (232.0 * 960.0));
        fds.volenv_phaseacc -= 1.0;
        while (fds.volenv_phaseacc < 0.0) {
          fds.volenv_phaseacc += decay;

          if (fds.volenv_mode === 0) {
            if (fds.volenv_gain) fds.volenv_gain--;
          } else if (fds.volenv_mode === 1) {
            if (fds.volenv_gain < 0x20) fds.volenv_gain++;
          }
        }
      }

      // Sweep envelope
      if (fds.swpenv_mode < 2) {
        const decay = ((fds.envelope_speed * (fds.swpenv_decay + 1) * this.sampling_rate) / (232.0 * 960.0));
        fds.swpenv_phaseacc -= 1.0;
        while (fds.swpenv_phaseacc < 0.0) {
          fds.swpenv_phaseacc += decay;

          if (fds.swpenv_mode === 0) {
            if (fds.swpenv_gain) fds.swpenv_gain--;
          } else if (fds.swpenv_mode === 1) {
            if (fds.swpenv_gain < 0x20) fds.swpenv_gain++;
          }
        }
      }
    }

    // Effector(LFO) unit
    let sub_freq = 0;
    if (fds.lfo_enable && fds.envelope_speed && fds.lfo_frequency) {
      const tbl = [0, 1, 2, 4, 0, -4, -2, -1];

      fds.lfo_phaseacc -= (this.cpu_clock * fds.lfo_frequency) / 65536.0;
      while (fds.lfo_phaseacc < 0.0) {
        fds.lfo_phaseacc += this.sampling_rate;

        if (fds.lfo_wavetable[fds.lfo_addr] === 4)
          fds.sweep_bias = 0;
        else
          fds.sweep_bias += tbl[fds.lfo_wavetable[fds.lfo_addr]];

        fds.lfo_addr = (fds.lfo_addr + 1) & 63;
      }

      if (fds.sweep_bias > 63)
        fds.sweep_bias -= 128;
      else if (fds.sweep_bias < -64)
        fds.sweep_bias += 128;

      let sub_multi = fds.sweep_bias * fds.swpenv_gain;

      if (sub_multi & 0x0F) {
        sub_multi = (sub_multi / 16) | 0;
        if (fds.sweep_bias >= 0)
          sub_multi += 2;
        else
          sub_multi -= 1;
      } else {
        sub_multi = (sub_multi / 16) | 0;
      }

      if (sub_multi > 193)
        sub_multi -= 258;
      if (sub_multi < -64)
        sub_multi += 256;

      sub_freq = (fds.main_frequency * sub_multi) / 64;
    }

    // Main unit
    let output = 0;
    if (fds.main_enable && fds.main_frequency && !fds.wave_setup) {
      const freq = (fds.main_frequency + sub_freq) * this.cpu_clock / 65536.0;
      const main_addr_old = fds.main_addr;

      fds.main_addr = (fds.main_addr + freq + 64 * this.sampling_rate) % (64 * this.sampling_rate);

      if (main_addr_old > fds.main_addr)
        fds.now_volume = (fds.volenv_gain < 0x21) ? fds.volenv_gain : 0x20;

      output = fds.main_wavetable[(fds.main_addr / this.sampling_rate) & 0x3F] * 8 * fds.now_volume * fds.master_volume / 30;

      if (fds.now_volume)
        fds.now_freq = freq * 4;
      else
        fds.now_freq = 0;
    } else {
      fds.now_freq = 0;
      output = 0;
    }

    // LPF
    output = (this.output_buf[0] * 2 + output) / 3;
    this.output_buf[0] = output;

    fds.output = output;
    return fds.output;
  }

  // CPU synchronization methods
  syncWrite(addr, data) {
    this.writeSub(addr, data, this.fds_sync, this.cpu_clock);
  }

  syncRead(addr) {
    let data = addr >>> 8;

    if (addr >= 0x4040 && addr <= 0x407F) {
      data = this.fds_sync.main_wavetable[addr & 0x3F] | 0x40;
    } else if (addr === 0x4090) {
      data = (this.fds_sync.volenv_gain & 0x3F) | 0x40;
    } else if (addr === 0x4092) {
      data = (this.fds_sync.swpenv_gain & 0x3F) | 0x40;
    }

    return data;
  }

  sync(cycles) {
    const fds = this.fds_sync;

    // Envelope unit
    if (fds.envelope_enable && fds.envelope_speed) {
      // Volume envelope
      if (fds.volenv_mode < 2) {
        const decay = ((fds.envelope_speed * (fds.volenv_decay + 1) * this.cpu_clock) / (232.0 * 960.0));
        fds.volenv_phaseacc -= cycles;
        while (fds.volenv_phaseacc < 0.0) {
          fds.volenv_phaseacc += decay;

          if (fds.volenv_mode === 0) {
            if (fds.volenv_gain) fds.volenv_gain--;
          } else if (fds.volenv_mode === 1) {
            if (fds.volenv_gain < 0x20) fds.volenv_gain++;
          }
        }
      }

      // Sweep envelope
      if (fds.swpenv_mode < 2) {
        const decay = ((fds.envelope_speed * (fds.swpenv_decay + 1) * this.cpu_clock) / (232.0 * 960.0));
        fds.swpenv_phaseacc -= cycles;
        while (fds.swpenv_phaseacc < 0.0) {
          fds.swpenv_phaseacc += decay;

          if (fds.swpenv_mode === 0) {
            if (fds.swpenv_gain) fds.swpenv_gain--;
          } else if (fds.swpenv_mode === 1) {
            if (fds.swpenv_gain < 0x20) fds.swpenv_gain++;
          }
        }
      }
    }

    return false;
  }

  getFreq(channel) {
    return this.fds.now_freq;
  }

  getStateSize() {
    // Return size of both fds and fds_sync structures
    return 1024; // Approximate size
  }

  saveState() {
    // Return state data
    return {
      fds: JSON.parse(JSON.stringify(this.fds)),
      fds_sync: JSON.parse(JSON.stringify(this.fds_sync)),
      output_buf: Array.from(this.output_buf),
      sampling_rate: this.sampling_rate,
      cpu_clock: this.cpu_clock
    };
  }

  loadState(state) {
    this.fds = JSON.parse(JSON.stringify(state.fds));
    this.fds_sync = JSON.parse(JSON.stringify(state.fds_sync));
    this.output_buf = new Int32Array(state.output_buf);
    this.sampling_rate = state.sampling_rate;
    this.cpu_clock = state.cpu_clock;
  }
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.APU_FDS = APU_FDS;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_FDS;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_FDS = APU_FDS;
}