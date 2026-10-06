// VRC6 (Konami VRC6) Expansion Audio Chip
// Based on VirtuaNESex implementation

class APU_VRC6 {
  constructor() {
    this.reset();
  }

  reset() {
    this.pulseA = {
      enabled: false,
      duty: 0,
      volume: 0,
      timer: 0,
      dutyIndex: 0,
      phase: 0.0
    };
    this.pulseB = {
      enabled: false,
      duty: 0,
      volume: 0,
      timer: 0,
      dutyIndex: 0,
      phase: 0.0
    };
    this.saw = {
      enabled: false,
      volume: 0,
      timer: 0,
      accumulator: 0,
      phase: 0.0
    };
  }

  write(adr, value) {
    // VRC6 registers: 0x9000-0x9002 (pulseA), 0xA000-0xA002 (pulseB), 0xB000-0xB002 (saw)
    const group = (adr & 0xF000) >>> 12;
    const reg = adr & 0xF;

    let ch = null;
    if (group === 9) ch = this.pulseA;
    else if (group === 0xA) ch = this.pulseB;
    else if (group === 0xB) ch = this.saw;

    if (ch) {
      if (group === 0xB) {
        // Saw control register (0xB000)
        ch.enabled = (value & 0x80) !== 0;
        ch.volume = (value >> 4) & 0x0F; // 4-bit volume for saw
      } else {
        // Pulse channels
        if (reg === 0) {
          // Control register (0x9000/0xA000)
          ch.volume = (value >> 4) & 0x0F; // 4-bit volume
          ch.duty = value & 0x0F; // 4-bit duty cycle
        } else if (reg === 1) {
          // Low 8 bits of frequency (0x9001/0xA001)
          ch.timer = (ch.timer & 0xF00) | value;
        } else if (reg === 2) {
          // High 4 bits of frequency + enable (0x9002/0xA002)
          ch.timer = (ch.timer & 0xFF) | ((value & 0x0F) << 8);
          ch.enabled = (value & 0x80) !== 0;
          ch.dutyIndex = 0;
          ch.phase = 0.0;
        }
      }
    }
  }

  // Generate audio output for one sample
  process() {
    let output = 0;

    // Process pulse channels
    [this.pulseA, this.pulseB].forEach(pulse => {
      if (!pulse.enabled || pulse.volume === 0) return;

      const period = (pulse.timer + 1) * 16;
      if (period < 2) return;

      pulse.phase += 1 / period;
      if (pulse.phase >= 1.0) {
        pulse.phase -= 1.0;
        pulse.dutyIndex = (pulse.dutyIndex + 1) & 7;
      }

      // VRC6 duty table - complete 16 duty cycles matching hardware
      const dutyTable = [
        [0,0,0,0,0,0,0,1], // 0: 12.5%
        [0,0,0,0,0,0,1,1], // 1: 25%
        [0,0,0,0,1,1,1,1], // 2: 50%
        [1,1,1,1,1,1,0,0], // 3: 25% inverted
        [1,1,1,1,1,1,1,0], // 4: 87.5%
        [1,1,1,1,1,1,1,1], // 5: 100%
        [1,1,1,1,0,0,0,0], // 6: 50% inverted
        [0,0,0,0,0,0,0,0], // 7: 0%
        [1,0,0,0,0,0,0,0], // 8: 12.5% inverted
        [1,1,0,0,0,0,0,0], // 9: 25% inverted
        [1,1,1,0,0,0,0,0], // 10: 37.5%
        [1,1,1,1,0,0,0,0], // 11: 50% inverted alt
        [1,1,1,1,1,0,0,0], // 12: 62.5%
        [1,1,1,1,1,1,0,0], // 13: 75%
        [1,1,1,1,1,1,1,0], // 14: 87.5% alt
        [0,1,1,1,1,1,1,1]  // 15: 87.5% inverted
      ];

      const dutyOut = dutyTable[pulse.duty] ? dutyTable[pulse.duty][pulse.dutyIndex] : 0;
      if (dutyOut) {
        output += pulse.volume;
      }
    });

    // Process saw channel
    if (this.saw.enabled && this.saw.volume > 0) {
      const period = (this.saw.timer + 1) * 14;
      if (period >= 1) {
        this.saw.phase += 1 / period;
        let steps = 0;
        while (this.saw.phase >= 1.0) {
          this.saw.phase -= 1.0;
          steps++;
        }
        if (steps > 0) {
          this.saw.accumulator = (this.saw.accumulator + this.saw.volume * steps) & 0xFF;
        }
        output += (this.saw.accumulator >>> 4) & 0x0F;
      }
    }

    return output;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_VRC6;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_VRC6 = APU_VRC6;
}