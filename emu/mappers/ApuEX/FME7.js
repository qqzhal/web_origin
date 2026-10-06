// FME7 (Sunsoft 5B) Expansion Audio Chip
// Based on VirtuaNESex implementation

class APU_FME7 {
  constructor() {
    this.reset();
  }

  reset() {
    this.addr = 0;
    this.regs = new Uint8Array(16);

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < 3; i++) {
      this.channels[i] = {
        enabled: false,
        timer: 0,
        timerValue: 0,
        volume: 0,
        envelopeEnabled: false,
        output: 0
      };
    }

    // Initialize noise
    this.noise = {
      enabled: false,
      timer: 0,
      timerValue: 0,
      shiftReg: 0x4000, // 17-bit LFSR starting value
      output: 0
    };

    // Initialize envelope
    this.envelope = {
      period: 0,
      counter: 0,
      shape: 0,
      output: 15,
      hold: false,
      alternate: false,
      attack: false,
      continue: false
    };

    this.envelopeClockCounter = 0;
  }

  write(adr, value) {
    if (adr === 0xC000) {
      // Address port
      this.addr = value & 0x0F;
    } else if (adr === 0xE000) {
      // Data port
      this.regs[this.addr] = value;
      this.updateChannel(this.addr, value);
    }
  }

  updateChannel(reg, value) {
    if (reg >= 0x00 && reg <= 0x05) {
      // Tone registers (low 8 bits for channels A/B/C, high 4 bits for channels A/B/C)
      const ch = Math.floor(reg / 2);
      if (reg % 2 === 0) {
        // Low 8 bits
        this.channels[ch].timer = (this.channels[ch].timer & 0xF00) | value;
        this.channels[ch].timerValue = this.channels[ch].timer;
      } else {
        // High 4 bits
        this.channels[ch].timer = (this.channels[ch].timer & 0xFF) | ((value & 0x0F) << 8);
        this.channels[ch].timerValue = this.channels[ch].timer;
      }
    } else if (reg === 0x06) {
      // Noise tone
      this.noise.timer = value & 0x1F;
      this.noise.timerValue = this.noise.timer;
    } else if (reg === 0x07) {
      // Noise/tone enable (inverted: 0=enable, 1=disable)
      for (let i = 0; i < 3; i++) {
        this.channels[i].enabled = (value & (1 << i)) === 0;
      }
      this.noise.enabled = (value & 0x08) === 0;
    } else if (reg >= 0x08 && reg <= 0x0A) {
      // Volume/envelope control for channels A/B/C
      const ch = reg - 0x08;
      this.channels[ch].volume = value & 0x0F;
      this.channels[ch].envelopeEnabled = (value & 0x10) !== 0;
    } else if (reg === 0x0B) {
      // Envelope period low 8 bits
      this.envelope.period = (this.envelope.period & 0xFF00) | value;
    } else if (reg === 0x0C) {
      // Envelope period high 8 bits
      this.envelope.period = (this.envelope.period & 0xFF) | (value << 8);
    } else if (reg === 0x0D) {
      // Envelope shape
      this.envelope.shape = value & 0x0F;
      this.envelope.hold = (value & 0x01) !== 0;
      this.envelope.alternate = (value & 0x02) !== 0;
      this.envelope.attack = (value & 0x04) !== 0;
      this.envelope.continue = (value & 0x08) !== 0;
      this.envelope.counter = 0;
      this.envelope.output = this.envelope.attack ? 0 : 15;
    }
  }

  updateEnvelope() {
    const effectivePeriod = this.envelope.period === 0 ? 1 : this.envelope.period;

    this.envelope.counter++;
    if (this.envelope.counter >= effectivePeriod) {
      this.envelope.counter = 0;

      let step = this.envelope.output;

      switch (this.envelope.shape & 0x03) {
        case 0: // \___
          if (step < 15) {
            step++;
          } else if (!this.envelope.hold) {
            step = this.envelope.continue ? 0 : 15;
          }
          break;
        case 1: // /___
          if (step > 0) {
            step--;
          } else if (!this.envelope.hold) {
            step = this.envelope.continue ? 15 : 0;
          }
          break;
        case 2: // \-__
          if (step < 15) {
            step++;
          } else {
            step = this.envelope.continue ? 0 : 15;
          }
          break;
        case 3: // \/
          if (this.envelope.attack) {
            if (step < 15) step++;
            else step = this.envelope.alternate ? 15 : 0;
          } else {
            if (step > 0) step--;
            else step = this.envelope.alternate ? 0 : 15;
          }
          this.envelope.attack = !this.envelope.attack;
          break;
      }

      this.envelope.output = step;
    }
  }

  // Generate audio output for one sample
  process() {
    let output = 0;

    // Update envelope at CPU/16 rate
    this.envelopeClockCounter++;
    if (this.envelopeClockCounter >= 16) {
      this.envelopeClockCounter = 0;
      this.updateEnvelope();
    }

    // Process 3 pulse channels
    for (let i = 0; i < 3; i++) {
      const ch = this.channels[i];
      if (ch.enabled) {
        if (ch.timer > 0) {
          ch.timerValue--;
          if (ch.timerValue <= 0) {
            ch.timerValue = ch.timer;
            ch.output ^= 1; // Toggle square wave (50% duty cycle)
          }
        }

        const volume = ch.envelopeEnabled ? this.envelope.output : ch.volume;
        if (ch.output && volume > 0) {
          output += volume;
        }
      }
    }

    // Process noise channel
    if (this.noise.enabled) {
      if (this.noise.timer > 0) {
        this.noise.timerValue--;
        if (this.noise.timerValue <= 0) {
          this.noise.timerValue = this.noise.timer;
          // Update noise LFSR (17-bit with taps at bits 0 and 2)
          const bit0 = this.noise.shiftReg & 1;
          const bit2 = (this.noise.shiftReg >> 2) & 1;
          const feedback = bit0 ^ bit2;
          this.noise.shiftReg = (this.noise.shiftReg >> 1) | (feedback << 16);
          this.noise.output = bit0;
        }
      }

      const noiseVol = this.channels[2].envelopeEnabled ? this.envelope.output : this.channels[2].volume;
      if (this.noise.output && noiseVol > 0) {
        output += noiseVol;
      }
    }

    // FME7 has 4 channels total (3 pulse + 1 noise), normalize
    return output / 60; // Max 60 (15 * 4), normalize to 0-1 range
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_FME7;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_FME7 = APU_FME7;
}