// VRC7 (Konami VRC7) FM Synthesis Expansion Audio Chip
// Based on OPLL (YM2413) implementation using emu2413

class APU_VRC7 {
  constructor() {
    this.reset();
  }

  reset() {
    this.addr = 0;
    // Initialize emu2413 OPLL
    if (typeof window !== 'undefined' && window.emu2413) {
      // Browser environment
      window.emu2413.OPLL_init(3579545, 44100); // NES clock, 44.1kHz sample rate
      this.opll = window.emu2413.OPLL_new();
    } else if (typeof module !== 'undefined' && module.exports) {
      // Node.js environment
      try {
        const emu2413 = require('./emu2413.js');
        emu2413.OPLL_init(3579545, 44100); // NES clock, 44.1kHz sample rate
        this.opll = emu2413.OPLL_new();
      } catch (e) {
        console.warn('emu2413 not loaded:', e.message);
      }
    } else {
      console.warn('emu2413 not loaded');
    }
  }

  write(adr, value) {
    if (adr === 0x9010) {
      // Address port
      this.addr = value & 0x3F;
    } else if (adr === 0x9030) {
      // Data port - write to emu2413
      if (this.opll) {
        if (typeof window !== 'undefined' && window.emu2413) {
          window.emu2413.OPLL_writeReg(this.opll, this.addr, value);
        } else if (typeof module !== 'undefined' && module.exports) {
          const emu2413 = require('./emu2413.js');
          emu2413.OPLL_writeReg(this.opll, this.addr, value);
        }
      }
    }
  }

  // Generate audio output for one sample
  process() {
    if (this.opll) {
      if (typeof window !== 'undefined' && window.emu2413) {
        return window.emu2413.OPLL_calc(this.opll);
      } else if (typeof module !== 'undefined' && module.exports) {
        const emu2413 = require('./emu2413.js');
        return emu2413.OPLL_calc(this.opll);
      }
    }
    return 0;
  }
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.APU_VRC7 = APU_VRC7;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APU_VRC7;
}

// Set global variable for browser environment
if (typeof window !== 'undefined') {
  window.APU_VRC7 = APU_VRC7;
}
