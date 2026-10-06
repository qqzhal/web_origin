// MMC5 (Nintendo MMC5) Expansion Audio Chip
// Based on VirtuaNESex implementation

class APU_MMC5 {
  constructor() {
    this.reset();
  }

  reset() {
    this.p1 = {
      enabled: false,
      duty: 0,
      volume: 0,
      timer: 0,
      dutyIndex: 0,
      timerValue: 0
    };
    this.p2 = {
      enabled: false,
      duty: 0,
      volume: 0,
      timer: 0,
      dutyIndex: 0,
      timerValue: 0
    };
    this.pcm = {
      enabled: false,
      dac: 0,
      irqEnabled: false
    };
  }

  write(adr, value) {
    // MMC5 registers: 0x5000-0x5007 (pulses), 0x5010-0x5015 (PCM)
    if (adr >= 0x5000 && adr <= 0x5007) {
      const r = adr - 0x5000;
      const ch = (r <= 2) ? this.p1 : this.p2;
      const sub = r % 3;

      if (sub === 0) {
        ch.duty = value & 0xF;
        ch.volume = (value >> 4) & 0x0F;
      } else if (sub === 1) {
        ch.timer = (ch.timer & 0x700) | value;
      } else if (sub === 2) {
        ch.timer = (ch.timer & 0xFF) | ((value & 0x07) << 8);
        ch.enabled = (value & 0x80) === 0;
      }
    } else if (adr === 0x5010) {
      this.pcm.irqEnabled = (value & 0x80) !== 0;
    } else if (adr === 0x5011) {
      this.pcm.dac = value & 0x7F;
    } else if (adr === 0x5015) {
      this.pcm.enabled = (value & 0x01) !== 0;
    }
  }

  // Generate audio output for one sample
  process() {
    let output = 0;

    // Process pulse channels
    [this.p1, this.p2].forEach(pulse => {
      if (!pulse.enabled || pulse.volume === 0) return;

      const period = (pulse.timer + 1) * 2;
      if (period <= 1) return;

      if (!pulse.timerValue) pulse.timerValue = period;
      pulse.timerValue--;

      if (pulse.timerValue <= 0) {
        pulse.timerValue += period;
        pulse.dutyIndex = (pulse.dutyIndex + 1) & 7;
      }

      const dutyOut = (pulse.dutyIndex & 1) ? 1 : 0;
      if (dutyOut) {
        output += Math.round((pulse.volume / 15) * 15);
      }
    });

    // Process PCM
    if (this.pcm.enabled) {
      output += (this.pcm.dac - 64) / 64; // Normalize to -1..1
    }

    return output;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_MMC5;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_MMC5 = APU_MMC5;
}