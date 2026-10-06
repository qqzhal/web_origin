function Apu(nes) {

  // memory handler
  this.nes = nes;
  this.isNtsc = true; // default to NTSC

  // Volume shifts matching VirtuaNESex
  this.RECTANGLE_VOL_SHIFT = 8;
  this.TRIANGLE_VOL_SHIFT = 9;
  this.NOISE_VOL_SHIFT = 8;
  this.DPCM_VOL_SHIFT = 8;

  // duty cycles
  this.dutyCycles = [
    [0, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 1, 1, 1, 1, 1]
  ];
  // legth counter load values
  this.lengthLoadValues = [
    10, 254, 20, 2,  40, 4,  80, 6,  160, 8,  60, 10, 14, 12, 26, 14,
    12, 16,  24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
  ];
  // tiangle steps
  this.triangleSteps = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5,  4,  3,  2,  1,  0,
    0,  1,  2,  3,  4,  5,  6, 7, 8, 9, 10, 11, 12, 13, 14, 15
  ];
  // noise timer values
  this.noiseLoadValues = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
  ];
  // dmc timer value
  this.dmcLoadValues = [
    428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
  ]

  // channel outputs
  this.output = new Float64Array(29781);

  this.reset = function() {
    // Adjust output buffer size based on NTSC/PAL mode or override
    let bufferSize = this.bufferSizeOverride || (this.isNtsc ? 29781 : 33248); // NTSC: ~29780.5, PAL: ~33247.5
    if (this.output.length !== bufferSize) {
      this.output = new Float64Array(bufferSize);
    }
    for(let i = 0; i < this.output.length; i++) {
      this.output[i] = 0;
    }

    this.outputOffset = 0;

    this.frameCounter = 0;

    this.interruptInhibit = false;
    this.step5Mode = false;

    this.enableNoise = false;
    this.enableTriangle = false;
    this.enablePulse2 = false;
    this.enablePulse1 = false;

    // pulse 1
    this.p1Timer = 0;
    this.p1TimerValue = 0;
    this.p1Duty = 0;
    this.p1DutyIndex = 0;
    this.p1Output = 0;
    this.p1CounterHalt = false;
    this.p1Counter = 0;
    this.p1Volume = 0;
    this.p1ConstantVolume = false;
    this.p1Decay = 0;
    this.p1EnvelopeCounter = 0;
    this.p1EnvelopeStart = false;
    this.p1SweepEnabled = false;
    this.p1SweepPeriod = 0;
    this.p1SweepNegate = false;
    this.p1SweepShift = 0;
    this.p1SweepTimer = 0;
    this.p1SweepTarget = 0;
    this.p1SweepMuting = true;
    this.p1SweepReload = false;

    // pulse 2
    this.p2Timer = 0;
    this.p2TimerValue = 0;
    this.p2Duty = 0;
    this.p2DutyIndex = 0;
    this.p2Output = 0;
    this.p2CounterHalt = false;
    this.p2Counter = 0;
    this.p2Volume = 0;
    this.p2ConstantVolume = false;
    this.p2Decay = 0;
    this.p2EnvelopeCounter = 0;
    this.p2EnvelopeStart = false;
    this.p2SweepEnabled = false;
    this.p2SweepPeriod = 0;
    this.p2SweepNegate = false;
    this.p2SweepShift = 0;
    this.p2SweepTimer = 0;
    this.p2SweepTarget = 0;
    this.p2SweepMuting = true;
    this.p2SweepReload = false;

    // triangle
    this.triTimer = 0;
    this.triTimerValue = 0;
    this.triStepIndex = 0;
    this.triOutput = 0;
    this.triCounterHalt = false;
    this.triCounter = 0;
    this.triLinearCounter = 0;
    this.triReloadLinear = false;
    this.triLinearReload = 0;

    // noise
    this.noiseTimer = 0;
    this.noiseTimerValue = 0;
    this.noiseShift = 1;
    this.noiseTonal = false;
    this.noiseOutput = 0;
    this.noiseCounterHalt = false;
    this.noiseCounter = 0;
    this.noiseVolume = 0;
    this.noiseConstantVolume = false;
    this.noiseDecay = 0;
    this.noiseEnvelopeCounter = 0;
    this.noiseEnvelopeStart = false;

    // dmc
    this.dmcInterrupt = false;
    this.dmcLoop = false;
    this.dmcTimer = 0;
    this.dmcTimerValue = 0;
    this.dmcOutput = 0;
    this.dmcSampleAddress = 0xc000;
    this.dmcAddress = 0xc000;
    this.dmcSample = 0;
    this.dmcSampleLength = 0;
    this.dmcSampleEmpty = true;
    this.dmcBytesLeft = 0;
    this.dmcShifter = 0;
    this.dmcBitsLeft = 8;
    this.dmcSilent = true;

    this.vrc6PulseMixFactor = 0x0F0 / 32768.0; // RECTANGLE_VOL / 32768
  this.vrc6SawMixFactor = 0x0F0 / 32768.0;   // RECTANGLE_VOL / 32768

  // Sampling / filter state
  // We approximate the APU sample rate from output buffer size and frame rate
  let framesPerSec = this.isNtsc ? 60.0 : 50.0;
  this.sampleRate = bufferSize * framesPerSec; // approximate sample rate

  // High-pass (DC blocker) one-pole state
  this.hpfPrevIn = 0.0;
  this.hpfPrevOut = 0.0;
  this.hpfCutoffHz = 40.0; // 40Hz cutoff by default

  // One-pole low-pass filter state (single-stage per channel mix)
  this.lpfState = 0.0;
  this.lpfType = 1; // Default to Type 1 (light)

    // Mix factors for expansion chips matching VirtuaNESex volumes
    this.vrc7MixFactor = 0x130 / 32768.0; // VRC7_VOL / 32768
    this.fme7MixFactor = 0x130 / 32768.0; // FME7_VOL / 32768
    this.fdsMixFactor = 0x0F0 / 32768.0; // FDS_VOL / 32768
    this.mmc5MixFactor = 0x0F0 / 32768.0; // MMC5_VOL / 32768
    this.n106MixFactor = 0x088 / 32768.0; // N106_VOL / 32768

    // If extra-chip state exists (e.g. after we've initialized ex later),
    // clear it on reset so switching tracks or stopping playback doesn't
    // leave lingering sound from expansion channels.
    if (this.ex) {
      try {
        this.ex.enabled = false;
        if (this.ex.vrc6) {
          const p = this.ex.vrc6;
          function _clearPulse(ch) {
            if (!ch) return;
            ch.duty = 0;
            ch.dutyIndex = 0;
            ch.timer = 0;
            ch.timerValue = 0;
            ch.phase = 0;
            ch.enabled = false;
            ch.volume = 0;
            ch.output = 0;
            if (typeof ch.accumulator !== 'undefined') ch.accumulator = 0;
          }
          _clearPulse(p.pulseA);
          _clearPulse(p.pulseB);
          if (p.saw) {
            p.saw.accumulator = 0;
            p.saw.phase = 0;
            p.saw.timer = 0;
            p.saw.timerValue = 0;
            p.saw.enabled = false;
            p.saw.volume = 0;
            p.saw.output = 0;
          }
        }
        if (this.ex.mmc5) {
          const m = this.ex.mmc5;
          function _clearM(ch) {
            if (!ch) return;
            ch.duty = 0;
            ch.dutyIndex = 0;
            ch.timer = 0;
            ch.timerValue = 0;
            ch.phase = 0;
            ch.enabled = false;
            ch.volume = 0;
            ch.output = 0;
          }
          _clearM(m.p1);
          _clearM(m.p2);
          if (m.pcm) {
            m.pcm.dac = 0;
            m.pcm.enabled = false;
            m.pcm.irqEnabled = false;
            m.pcm.irqPending = false;
          }
        }
        if (this.ex.vrc7) {
          const v = this.ex.vrc7;
          v.addr = 0;
          v.regs.fill(0);
          v.channels.forEach(ch => {
            ch.phase = 0;
            ch.output = 0;
            ch.enabled = false;
            ch.fnum = 0;
            ch.block = 0;
            ch.volume = 15;
          });
        }
        if (this.ex.fme7) {
          const f = this.ex.fme7;
          f.addr = 0;
          f.regs.fill(0);
          f.channels.forEach(ch => {
            ch.timer = 0;
            ch.timerValue = 0;
            ch.volume = 15;
            ch.envelopeEnabled = false;
            ch.output = 0;
            ch.enabled = false;
          });
          f.noise.timer = 0;
          f.noise.timerValue = 0;
          f.noise.shiftReg = 1;
          f.noise.output = 0;
          f.noise.enabled = false;
          f.envelope.period = 0;
          f.envelope.counter = 0;
          f.envelope.shape = 0;
          f.envelope.output = 0;
          f.envelope.hold = false;
          f.envelope.alternate = false;
          f.envelope.attack = false;
          f.envelope.continue = false;
          f.envelopeClockCounter = 0;
        }
      } catch (e) {
        // don't let clearing interfere with reset if ex isn't fully formed yet
      }
    }

  }
  this.reset();
  this.saveVars = [
    "frameCounter", "interruptInhibit", "step5Mode", "enableNoise",
    "enableTriangle", "enablePulse2", "enablePulse1", "p1Timer", "p1TimerValue",
    "p1Duty", "p1DutyIndex", "p1Output", "p1CounterHalt", "p1Counter",
    "p1Volume", "p1ConstantVolume", "p1Decay", "p1EnvelopeCounter",
    "p1EnvelopeStart", "p1SweepEnabled", "p1SweepPeriod", "p1SweepNegate",
    "p1SweepShift", "p1SweepTimer", "p1SweepTarget", "p1SweepMuting",
    "p1SweepReload", "p2Timer", "p2TimerValue", "p2Duty", "p2DutyIndex",
    "p2Output", "p2CounterHalt", "p2Counter", "p2Volume", "p2ConstantVolume",
    "p2Decay", "p2EnvelopeCounter", "p2EnvelopeStart", "p2SweepEnabled",
    "p2SweepPeriod", "p2SweepNegate", "p2SweepShift", "p2SweepTimer",
    "p2SweepTarget", "p2SweepMuting", "p2SweepReload", "triTimer",
    "triTimerValue", "triStepIndex", "triOutput", "triCounterHalt",
    "triCounter", "triLinearCounter", "triReloadLinear", "triLinearReload",
    "noiseTimer", "noiseTimerValue", "noiseShift", "noiseTonal", "noiseOutput",
    "noiseCounterHalt", "noiseCounter", "noiseVolume", "noiseConstantVolume",
    "noiseDecay", "noiseEnvelopeCounter", "noiseEnvelopeStart", "dmcInterrupt",
    "dmcLoop", "dmcTimer", "dmcTimerValue", "dmcOutput", "dmcSampleAddress",
    "dmcAddress", "dmcSample", "dmcSampleLength", "dmcSampleEmpty",
    "dmcBytesLeft", "dmcShifter", "dmcBitsLeft", "dmcSilent"
  ];
  // save extra chip state too
  this.saveVars.push("ex");

  // Custom save method to handle non-serializable functions
  this.getSaveState = function() {
    let state = {};
    // Save all regular variables
    for (let varName of this.saveVars) {
      if (varName === "ex") {
        // Create a serializable copy of ex object without functions
        state.ex = this.createSerializableExState();
      } else {
        state[varName] = this[varName];
      }
    }
    return state;
  };

  // Create a serializable copy of ex object (removes functions)
  this.createSerializableExState = function() {
    let exState = {
      enabled: this.ex.enabled,
      _nsfExtraChips: this._nsfExtraChips
    };

    // Copy serializable data from each expansion chip
    if (this.ex.vrc6) {
      exState.vrc6 = {
        pulseA: { ...this.ex.vrc6.pulseA },
        pulseB: { ...this.ex.vrc6.pulseB },
        saw: { ...this.ex.vrc6.saw }
      };
    }

    if (this.ex.mmc5) {
      exState.mmc5 = {
        p1: { ...this.ex.mmc5.p1 },
        p2: { ...this.ex.mmc5.p2 },
        pcm: { ...this.ex.mmc5.pcm }
      };
    }

    if (this.ex.vrc7) {
      exState.vrc7 = {
        addr: this.ex.vrc7.addr,
        regs: new Uint8Array(this.ex.vrc7.regs),
        channels: this.ex.vrc7.channels.map(ch => ({
          fnum: ch.fnum,
          block: ch.block,
          volume: ch.volume,
          instrument: ch.instrument,
          enabled: ch.enabled,
          keyOn: ch.keyOn,
          modulators: ch.modulators.map(mod => ({
            multiple: mod.multiple,
            level: mod.level,
            attack: mod.attack,
            decay: mod.decay,
            sustain: mod.sustain,
            release: mod.release,
            keyScale: mod.keyScale,
            phase: mod.phase,
            output: mod.output,
            envelope: { ...mod.envelope }
          })),
          carriers: ch.carriers.map(car => ({
            multiple: car.multiple,
            level: car.level,
            attack: car.attack,
            decay: car.decay,
            sustain: car.sustain,
            release: car.release,
            keyScale: car.keyScale,
            phase: car.phase,
            output: car.output,
            envelope: { ...car.envelope },
            keyOn: car.keyOn
          })),
          feedback: ch.feedback
        }))
      };
    }

    if (this.ex.fme7) {
      exState.fme7 = {
        addr: this.ex.fme7.addr,
        regs: new Uint8Array(this.ex.fme7.regs),
        envelopeClockCounter: this.ex.fme7.envelopeClockCounter,
        channels: this.ex.fme7.channels.map(ch => ({
          timer: ch.timer,
          timerValue: ch.timerValue,
          volume: ch.volume,
          envelopeEnabled: ch.envelopeEnabled,
          output: ch.output,
          enabled: ch.enabled
        })),
        noise: {
          timer: this.ex.fme7.noise.timer,
          timerValue: this.ex.fme7.noise.timerValue,
          shiftReg: this.ex.fme7.noise.shiftReg,
          output: this.ex.fme7.noise.output,
          enabled: this.ex.fme7.noise.enabled
        },
        envelope: { ...this.ex.fme7.envelope }
      };
    }

    if (this.ex.n106) {
      exState.n106 = {
        ram: new Uint8Array(this.ex.n106.ram),
        addr: this.ex.n106.addr,
        channels: this.ex.n106.channels,
        ch: this.ex.n106.ch.map(ch => ({ ...ch }))
      };
    }

    if (this.ex.fds) {
      exState.fds = {
        waveRam: new Uint8Array(this.ex.fds.waveRam),
        modRam: new Uint8Array(this.ex.fds.modRam),
        volume: this.ex.fds.volume,
        modFreq: this.ex.fds.modFreq,
        modCounter: this.ex.fds.modCounter,
        wavePos: this.ex.fds.wavePos,
        modPos: this.ex.fds.modPos,
        masterVol: this.ex.fds.masterVol,
        enabled: this.ex.fds.enabled,
        output: this.ex.fds.output,
        freq: this.ex.fds.freq,
        modEnv: this.ex.fds.modEnv
      };
    }

    return exState;
  };

    // --- Extra sound chips state (NSF VRC6 partial support) ---
    this.ex = {
      enabled: false,
      // VRC6 channels: pulseA, pulseB, saw (approx)
      vrc6: {
        pulseA: { duty:0, timer:0, timerValue:0, enabled:false, output:0 },
        pulseB: { duty:0, timer:0, timerValue:0, enabled:false, output:0 },
        saw:    { phase:0, timer:0, timerValue:0, enabled:false, output:0 }
      }
    };

    // VRC6 specific duty table (8-step patterns).
    // Notes: exact VRC6 duty encoding is hardware-specific; this table provides
    // a richer set of 8-step waveforms than the simple binary fallback used before.
    // Extend duty table to 16 rows so we can use full 4-bit duty value from NSF/VRC6 writes.
    // These rows capture a variety of 8-step waveforms VRC6 can produce (approximations).
    this.vrc6DutyTable = [
      [1,0,0,0,0,0,0,0], // 0
      [1,1,0,0,0,0,0,0], // 1
      [1,1,1,1,0,0,0,0], // 2
      [1,1,1,1,1,1,1,1], // 3
      [0,1,1,1,1,1,1,0], // 4
      [0,1,1,0,0,1,1,0], // 5
      [1,0,1,0,1,0,1,0], // 6
      [0,0,1,1,1,1,0,0], // 7
      // additional entries to cover 8..15 (approximations / variants)
      [1,1,0,1,1,0,0,0], // 8
      [1,0,1,1,0,1,1,0], // 9
      [1,1,1,0,1,1,0,0], // 10
      [1,0,0,1,0,0,1,0], // 11
      [0,1,0,1,0,1,0,1], // 12
      [0,1,1,1,0,1,1,0], // 13
      [1,1,0,0,1,1,0,0], // 14
      [0,0,0,1,1,1,0,0]  // 15
    ];

    this.vrc6PulseMixFactor = 0x0F0 / 32768.0;
    this.vrc6SawMixFactor = 0x0F0 / 32768.0;
    this.n106MixFactor = 0.00752 * (0x088 / 0x0F0); // N106 channels scaled relative to rectangle channels

    // exRead: read from expansion registers (used by some mappers)
    this.exRead = function(adr) {
      // default behavior: no data
      return 0;
    };

    // Helper: set up VRC6 channel state
    function makeVrc6Pulse() {
      return { duty:0, dutyIndex:0, timer:0, timerValue:0, enabled:false, volume:15, output:0 };
    }

    // ensure vrc6 state exists
    if (!this.ex.vrc6.pulseA || !this.ex.vrc6.pulseB || !this.ex.vrc6.saw) {
      this.ex.vrc6.pulseA = makeVrc6Pulse();
      this.ex.vrc6.pulseB = makeVrc6Pulse();
      this.ex.vrc6.saw = { accumulator:0, step:0, timer:0, timerValue:0, enabled:false, output:0 };
    }

    // MMC5 pulse channels state (two pulses)
    if (!this.ex.mmc5) {
      this.ex.mmc5 = {
        p1: makeVrc6Pulse(),
        p2: makeVrc6Pulse(),
        pcm: { dac: 0, enabled: false, irqEnabled: false, irqPending: false }
      };
    }

    // FME7 (Sunsoft 5B) state
    if (!this.ex.fme7) {
      this.ex.fme7 = {
        addr: 0, // address register
        regs: new Uint8Array(0x10), // 16 registers
        envelopeClockCounter: 0, // Counter for envelope timing (CPU/16 rate)
        channels: Array(3).fill().map(() => ({
          timer: 0,
          timerValue: 0,
          volume: 15,
          envelopeEnabled: false,
          output: 0,
          enabled: true // Default to enabled for NSF compatibility
        })),
        noise: {
          timer: 0,
          timerValue: 0,
          shiftReg: 1,
          output: 0,
          enabled: true // Default to enabled for NSF compatibility
        },
        envelope: {
          period: 0,
          counter: 0,
          shape: 0,
          output: 0,
          hold: false,
          alternate: false,
          attack: false,
          continue: false
        }
      };
    }

    // VRC7 (Konami VRC7) FM synthesis state
    if (!this.ex.vrc7) {
      // Initialize VRC7 OPLL tables
      let sinTable = new Array(1024);
      let expTable = new Array(256);

      // Generate sine table (simplified)
      for (let i = 0; i < 1024; i++) {
        sinTable[i] = Math.sin((i * Math.PI) / 512);
      }

      // Generate exponential table (simplified)
      for (let i = 0; i < 256; i++) {
        expTable[i] = Math.pow(2, (i - 128) / 128) / 2;
      }

      // VRC7 instrument definitions (simplified, based on YM2413)
      let instruments = [
        // Custom instrument 0 (user-defined)
        { mod: { multiple: 0, level: 0, attack: 0, decay: 0, sustain: 0, release: 0, keyScale: 0 },
          car: { multiple: 0, level: 0, attack: 0, decay: 0, sustain: 0, release: 0, keyScale: 0 },
          modScale: 0, carScale: 0, feedback: 0 },
        // Instrument 1: Violin
        { mod: { multiple: 1, level: 63, attack: 15, decay: 5, sustain: 0, release: 5, keyScale: 0 },
          car: { multiple: 1, level: 0, attack: 15, decay: 7, sustain: 2, release: 3, keyScale: 0 },
          modScale: 0, carScale: 0, feedback: 7 },
        // Add more instruments as needed...
      ];

      this.ex.vrc7 = {
        addr: 0,
        regs: new Uint8Array(0x40), // 64 registers
        sinTable: sinTable,
        expTable: expTable,
        instruments: instruments,
        channels: Array(6).fill().map(() => ({
          fnum: 0,
          block: 0,
          volume: 15,
          instrument: 0,
          enabled: false,
          keyOn: false,
          modulators: Array(2).fill().map(() => ({
            multiple: 0,
            level: 0,
            attack: 0,
            decay: 0,
            sustain: 0,
            release: 0,
            keyScale: 0,
            phase: 0,
            output: 0,
            envelope: { level: 0, state: 0 }
          })),
          carriers: Array(2).fill().map(() => ({
            multiple: 0,
            level: 0,
            attack: 0,
            decay: 0,
            sustain: 0,
            release: 0,
            keyScale: 0,
            phase: 0,
            output: 0,
            envelope: { level: 0, state: 0 },
            keyOn: false
          })),
          feedback: 0
        }))
      };
    }

    // N106 (Namco 163) state
    if (!this.ex.n106) {
      this.ex.n106 = {
        ram: new Uint8Array(128),
        addr: 0,
        channels: 8,
        ch: Array(8).fill().map(() => ({
          freq: 0,
          phase: 0,
          length: 0,
          addr: 0,
          vol: 0,
          output: 0,
          enabled: true
        }))
      };
    }

    // FDS (Famicom Disk System) state
    if (!this.ex.fds) {
      this.ex.fds = {
        waveRam: new Uint8Array(64), // 64-byte wave RAM
        modRam: new Uint8Array(32),  // 32-byte modulation RAM
        volume: 0,      // Volume envelope
        modFreq: 0,     // Modulation frequency
        modCounter: 0,  // Modulation counter
        wavePos: 0,     // Wave position
        modPos: 0,      // Modulation position
        masterVol: 0,   // Master volume
        enabled: false,
        output: 0
      };
    }

    // exWrite: handle writes to expansion sound registers
    this.exWrite = function(adr, value) {
      // Normalize adr to 16-bit
      adr &= 0xFFFF;
      if (!this._nsfExtraChips) this._nsfExtraChips = {};

      // Load expansion chip modules if needed
      if (this._nsfExtraChips.vrc6 && !this.ex.vrc6) {
        if (typeof APU_VRC6 !== 'undefined') {
          this.ex.vrc6 = new APU_VRC6();
        }
      }
      if (this._nsfExtraChips.mmc5 && !this.ex.mmc5) {
        if (typeof APU_MMC5 !== 'undefined') {
          this.ex.mmc5 = new APU_MMC5();
        }
      }
      if (this._nsfExtraChips.vrc7 && !this.ex.vrc7) {
        if (typeof APU_VRC7 !== 'undefined') {
          this.ex.vrc7 = new APU_VRC7();
        }
      }
      if (this._nsfExtraChips.sunsoft5b && !this.ex.fme7) {
        if (typeof APU_FME7 !== 'undefined') {
          this.ex.fme7 = new APU_FME7();
        }
      }
      if (this._nsfExtraChips.namco && !this.ex.n106) {
        if (typeof APU_N106 !== 'undefined') {
          this.ex.n106 = new APU_N106();
        }
      }

      // --- VRC6 registers ---
      if (this._nsfExtraChips.vrc6 && this.ex.vrc6) {
        // VRC6 uses addresses 0x9000-0x9002, 0xA000-0xA002, 0xB000-0xB002
        if ((adr & 0xF000) === 0x9000 || (adr & 0xF000) === 0xA000 || (adr & 0xF000) === 0xB000) {
          let offset = adr & 0xF;
          if (offset <= 2) {
            this.ex.vrc6.write(adr, value);
            this.ex.enabled = true;
            return;
          }
        }
      }

      // --- MMC5 registers ---
      if (this._nsfExtraChips.mmc5 && this.ex.mmc5) {
        if (adr >= 0x5000 && adr <= 0x5015) {
          this.ex.mmc5.write(adr, value);
          this.ex.enabled = true;
          return;
        }
      }

      // --- VRC7 registers ---
      if (this._nsfExtraChips.vrc7 && this.ex.vrc7) {
        if (adr === 0x9010 || adr === 0x9030) {
          this.ex.vrc7.write(adr, value);
          this.ex.enabled = true;
          return;
        }
      }

      // --- FME7 registers ---
      if (this._nsfExtraChips.sunsoft5b && this.ex.fme7) {
        if (adr === 0xC000 || adr === 0xE000) {
          this.ex.fme7.write(adr, value);
          this.ex.enabled = true;
          return;
        }
      }

      // --- N106 registers ---
      if (this._nsfExtraChips.namco && this.ex.n106) {
        if (adr === 0xF800 || adr === 0x4800) {
          this.ex.n106.write(adr, value);
          this.ex.enabled = true;
          return;
        }
      }

      // --- FDS registers ---
      if (this._nsfExtraChips.fds && this.ex.fds) {
        if (adr >= 0x4040 && adr <= 0x4092) {
          this.ex.fds.write(adr, value);
          this.ex.enabled = true;
          return;
        }
      }
    };

    // (removed wrapper) extra-channel mixing will be inlined into the real this.cycle

  this.cycle = function() {
    if(
      (this.frameCounter === 29830 && !this.step5Mode) ||
      this.frameCounter === 37282
    ) {
      this.frameCounter = 0;
    }
    this.frameCounter++;

    this.handleFrameCounter();

    this.cycleTriangle();
    this.cyclePulse1();
    this.cyclePulse2();
    this.cycleNoise();
    this.cycleDmc();

    this.output[this.outputOffset++] = this.mix();
    // extra chip cycle: VRC6 simple emulation + MMC5 pulses mixed into output
    if (this.ex && this.ex.enabled) {
      // initialize temporary level vars to avoid ReferenceError
      let vrc6_p1_level = 0, vrc6_p2_level = 0, vrc6_saw_level = 0;
      let mmc5_p1_level = 0, mmc5_p2_level = 0, mmc5_pcm_level = 0;
      let vrc7_level = 0;
      let extraSum = 0;
      // VRC6 pulses and saw
      if (this._nsfExtraChips && this._nsfExtraChips.vrc6 && this.ex.vrc6) {
        let level = this.ex.vrc6.process();
        // VRC6 returns combined level, split it back (approximation)
        vrc6_p1_level = level * 0.4; // pulse A contribution
        vrc6_p2_level = level * 0.4; // pulse B contribution
        vrc6_saw_level = level * 0.2; // saw contribution
      }
      // MMC5 pulses
      if (this._nsfExtraChips && this._nsfExtraChips.mmc5 && this.ex.mmc5) {
        let level = this.ex.mmc5.process();
        mmc5_p1_level = level * 0.5; // pulse 1 contribution
        mmc5_p2_level = level * 0.5; // pulse 2 contribution
        // MMC5 PCM is handled separately in the module
      }
      // VRC7 FM synthesis
      if (this._nsfExtraChips && this._nsfExtraChips.vrc7 && this.ex.vrc7) {
        vrc7_level = this.ex.vrc7.process();
      }
      // FME7 (Sunsoft 5B)
      let fme7_level = 0;
      if (this._nsfExtraChips && this._nsfExtraChips.sunsoft5b && this.ex.fme7) {
        fme7_level = this.ex.fme7.process();
      }
      // N106 (Namco 163)
      let n106_level = 0;
      if (this._nsfExtraChips && this._nsfExtraChips.namco && this.ex.n106) {
        n106_level = this.ex.n106.process();
      }
      // FDS (Famicom Disk System)
      let fds_level = 0;
      if (this._nsfExtraChips && this._nsfExtraChips.fds && this.ex.fds) {
        fds_level = this.ex.fds.process();
      }
      // Now mix APU + expansion using new non-linear mixer, then apply simple one-pole LPF and HPF
      if (this.outputOffset > 0) {
        let idx = Math.max(0, this.outputOffset - 1);

        // Add expansion outputs into internal outputs in a simple additive way (approx)
        // Scale expansion channels to approximate NES channel ranges
        if (vrc6_p1_level) this.p1Output += vrc6_p1_level;
        if (vrc6_p2_level) this.p2Output += vrc6_p2_level;
        if (vrc6_saw_level) this.dmcOutput += vrc6_saw_level; // approximate into DMC slot
        if (mmc5_p1_level) this.p1Output += mmc5_p1_level * 0.8;
        if (mmc5_p2_level) this.p2Output += mmc5_p2_level * 0.8;
        if (vrc7_level) this.dmcOutput += vrc7_level * 0.5;
        if (fds_level) this.dmcOutput += fds_level * 0.5;
        if (n106_level) this.dmcOutput += n106_level * 0.5;
        if (fme7_level) this.dmcOutput += fme7_level * 0.6;

        // Use the non-linear mixer to get a combined level
        let mixed = this.mix(); // returns a positive loudness-like value

        // One-pole low-pass filter to smooth harsh high frequencies
        // cutoff depends on lpfType (1: gentle, 4: strong)
        let cutoffHz = 8000;
        switch (this.lpfType) {
          case 1: cutoffHz = 8000; break;
          case 2: cutoffHz = 6000; break;
          case 3: cutoffHz = 4000; break;
          case 4: cutoffHz = 2000; break;
        }
        let rc = 1.0 / (2 * Math.PI * cutoffHz);
        let dt = 1.0 / Math.max(22050, this.sampleRate || 44100);
        let alpha = dt / (rc + dt);
        this.lpfState = this.lpfState + alpha * (mixed - this.lpfState);

        // High-pass (simple DC blocker): y[n] = x[n] - x[n-1] + R*y[n-1]
        let R = Math.exp(-2 * Math.PI * this.hpfCutoffHz * dt);
        let hpfOut = this.lpfState - this.hpfPrevIn + R * this.hpfPrevOut;
        this.hpfPrevIn = this.lpfState;
        this.hpfPrevOut = hpfOut;

        // Normalize to -1..1 and clamp
        // The non-linear mix returns approx 0..160; scale down
        let finalOut = hpfOut / 160.0;
        this.output[idx] = Math.min(1, Math.max(-1, finalOut));

        // Remove expansion contributions added earlier to avoid permanent increase
        if (vrc6_p1_level) this.p1Output -= vrc6_p1_level;
        if (vrc6_p2_level) this.p2Output -= vrc6_p2_level;
        if (vrc6_saw_level) this.dmcOutput -= vrc6_saw_level;
        if (mmc5_p1_level) this.p1Output -= mmc5_p1_level * 0.8;
        if (mmc5_p2_level) this.p2Output -= mmc5_p2_level * 0.8;
        if (vrc7_level) this.dmcOutput -= vrc7_level * 0.5;
        if (fds_level) this.dmcOutput -= fds_level * 0.5;
        if (n106_level) this.dmcOutput -= n106_level * 0.5;
        if (fme7_level) this.dmcOutput -= fme7_level * 0.6;
      }
    }
    if(this.outputOffset === (this.isNtsc ? 29781 : 33248)) {
      // if we are going past the buffer (too many apu cycles per frame)
      this.outputOffset = this.isNtsc ? 29780 : 33247;
    }
  }

  this.cyclePulse1 = function() {
    if(this.p1TimerValue !== 0) {
      this.p1TimerValue--;
    } else {
      this.p1TimerValue = (this.p1Timer * 2) + 1;
      this.p1DutyIndex++;
      this.p1DutyIndex &= 0x7;
    }
    let output = this.dutyCycles[this.p1Duty][this.p1DutyIndex];
    if(output === 0 || this.p1SweepMuting || this.p1Counter === 0) {
      this.p1Output = 0;
    } else {
      this.p1Output = this.p1ConstantVolume ? this.p1Volume : this.p1Decay;
    }
  }

  this.cyclePulse2 = function() {
    if(this.p2TimerValue !== 0) {
      this.p2TimerValue--;
    } else {
      this.p2TimerValue = (this.p2Timer * 2) + 1;
      this.p2DutyIndex++;
      this.p2DutyIndex &= 0x7;
    }
    let output = this.dutyCycles[this.p2Duty][this.p2DutyIndex];
    if(output === 0 || this.p2SweepMuting || this.p2Counter === 0) {
      this.p2Output = 0;
    } else {
      this.p2Output = this.p2ConstantVolume ? this.p2Volume : this.p2Decay;
    }
  }

  this.cycleTriangle = function() {
    if(this.triTimerValue !== 0) {
      this.triTimerValue--;
    } else {
      this.triTimerValue = this.triTimer;
      if(this.triCounter !== 0 && this.triLinearCounter !== 0) {
        this.triOutput = this.triangleSteps[this.triStepIndex++];
        if(this.triTimer < 2) {
          // ultrasonic
          this.triOutput = 7.5;
        }
        this.triStepIndex &= 0x1f;
      }
    }
  }

  this.cycleNoise = function() {
    if(this.noiseTimerValue !== 0) {
      this.noiseTimerValue--;
    } else {
      this.noiseTimerValue = this.noiseTimer;
      let feedback = this.noiseShift & 0x1;
      if(this.noiseTonal) {
        feedback ^= (this.noiseShift & 0x40) >> 6;
      } else {
        feedback ^= (this.noiseShift & 0x2) >> 1;
      }
      this.noiseShift >>= 1;
      this.noiseShift |= feedback << 14;
    }
    if(this.noiseCounter === 0 || (this.noiseShift & 0x1) === 1) {
      this.noiseOutput = 0;
    } else {
      this.noiseOutput = (
        this.noiseConstantVolume ? this.noiseVolume : this.noiseDecay
      );
    }
  }

  this.cycleDmc = function() {
    if(this.dmcTimerValue !== 0) {
      this.dmcTimerValue--;
    } else {
      this.dmcTimerValue = this.dmcTimer;
      if(!this.dmcSilent) {
        if((this.dmcShifter & 0x1) === 0) {
          if(this.dmcOutput >= 2) {
            this.dmcOutput -= 2;
          }
        } else {
          if(this.dmcOutput <= 125) {
            this.dmcOutput += 2;
          }
        }
      }
      this.dmcShifter >>= 1;
      this.dmcBitsLeft--;
      if(this.dmcBitsLeft === 0) {
        this.dmcBitsLeft = 8;
        if(this.dmcSampleEmpty) {
          this.dmcSilent = true;
        } else {
          this.dmcSilent = false;
          this.dmcShifter = this.dmcSample;
          this.dmcSampleEmpty = true;
        }
      }
    }
    if(this.dmcBytesLeft > 0 && this.dmcSampleEmpty) {
      this.dmcSampleEmpty = false;
      this.dmcSample = this.nes.read(this.dmcAddress);
      this.dmcAddress++;
      if(this.dmcAddress === 0x10000) {
        this.dmcAddress = 0x8000;
      }
      this.dmcBytesLeft--;
      if(this.dmcBytesLeft === 0 && this.dmcLoop) {
        this.dmcBytesLeft = this.dmcSampleLength;
        this.dmcAddress = this.dmcSampleAddress;
      } else if(this.dmcBytesLeft === 0 && this.dmcInterrupt) {
        this.nes.dmcIrqWanted = true;
      }
    }
  }

  this.updateSweepP1 = function() {
    let change = this.p1Timer >> this.p1SweepShift;
    if(this.p1SweepNegate) {
      change = (-change) - 1;
    }
    this.p1SweepTarget = this.p1Timer + change;
    if(this.p1SweepTarget > 0x7ff || this.p1Timer < 8) {
      this.p1SweepMuting = true;
    } else {
      this.p1SweepMuting = false;
    }
  }

  this.updateSweepP2 = function() {
    let change = this.p2Timer >> this.p2SweepShift;
    if(this.p2SweepNegate) {
      change = (-change);
    }
    this.p2SweepTarget = this.p2Timer + change;
    if(this.p2SweepTarget > 0x7ff || this.p2Timer < 8) {
      this.p2SweepMuting = true;
    } else {
      this.p2SweepMuting = false;
    }
  }

  this.clockQuarter = function() {
    // handle triangle linear counter
    if(this.triReloadLinear) {
      this.triLinearCounter = this.triLinearReload;
    } else if(this.triLinearCounter !== 0) {
      this.triLinearCounter--;
    }
    if(!this.triCounterHalt) {
      this.triReloadLinear = false;
    }
    // handle envelopes
    if(!this.p1EnvelopeStart) {
      if(this.p1EnvelopeCounter !== 0) {
        this.p1EnvelopeCounter--;
      } else {
        this.p1EnvelopeCounter = this.p1Volume;
        if(this.p1Decay !== 0) {
          this.p1Decay--;
        } else {
          if(this.p1CounterHalt) {
            this.p1Decay = 15;
          }
        }
      }
    } else {
      this.p1EnvelopeStart = false;
      this.p1Decay = 15;
      this.p1EnvelopeCounter = this.p1Volume;
    }

    if(!this.p2EnvelopeStart) {
      if(this.p2EnvelopeCounter !== 0) {
        this.p2EnvelopeCounter--;
      } else {
        this.p2EnvelopeCounter = this.p2Volume;
        if(this.p2Decay !== 0) {
          this.p2Decay--;
        } else {
          if(this.p2CounterHalt) {
            this.p2Decay = 15;
          }
        }
      }
    } else {
      this.p2EnvelopeStart = false;
      this.p2Decay = 15;
      this.p2EnvelopeCounter = this.p2Volume;
    }

    if(!this.noiseEnvelopeStart) {
      if(this.noiseEnvelopeCounter !== 0) {
        this.noiseEnvelopeCounter--;
      } else {
        this.noiseEnvelopeCounter = this.noiseVolume;
        if(this.noiseDecay !== 0) {
          this.noiseDecay--;
        } else {
          if(this.noiseCounterHalt) {
            this.noiseDecay = 15;
          }
        }
      }
    } else {
      this.noiseEnvelopeStart = false;
      this.noiseDecay = 15;
      this.noiseEnvelopeCounter = this.noiseVolume;
    }
  }

  this.clockHalf = function() {
    // decrement length counters
    if(!this.p1CounterHalt && this.p1Counter !== 0) {
      this.p1Counter--;
    }
    if(!this.p2CounterHalt && this.p2Counter !== 0) {
      this.p2Counter--;
    }
    if(!this.triCounterHalt && this.triCounter !== 0) {
      this.triCounter--;
    }
    if(!this.noiseCounterHalt && this.noiseCounter !== 0) {
      this.noiseCounter--;
    }
    // handle sweeps
    if(
      this.p1SweepTimer === 0 && this.p1SweepEnabled &&
      !this.p1SweepMuting && this.p1SweepShift > 0
    ) {
      this.p1Timer = this.p1SweepTarget;
      this.updateSweepP1();
    }
    if(this.p1SweepTimer === 0 || this.p1SweepReload) {
      this.p1SweepTimer = this.p1SweepPeriod;
      this.p1SweepReload = false;
    } else {
      this.p1SweepTimer--;
    }

    if(
      this.p2SweepTimer === 0 && this.p2SweepEnabled &&
      !this.p2SweepMuting && this.p2SweepShift > 0
    ) {
      this.p2Timer = this.p2SweepTarget;
      this.updateSweepP2();
    }
    if(this.p2SweepTimer === 0 || this.p2SweepReload) {
      this.p2SweepTimer = this.p2SweepPeriod;
      this.p2SweepReload = false;
    } else {
      this.p2SweepTimer--;
    }
  }

  // Non-linear NES mixer approximation (common formula used in many emulators)
  this.mix = function() {
    // Sum raw channel levels (0-15 for pulse/triangle/noise, 0-127 for DMC)
    let pulse_sum = this.p1Output + this.p2Output; // 0..30
    let tri = this.triOutput; // ~0..15
    let noise = this.noiseOutput; // 0..15
    let dmc = this.dmcOutput; // 0..127

    // Pulse mixer (non-linear)
    let pulse_out = 0.0;
    if (pulse_sum > 0.0) pulse_out = 95.88 / ((8128.0 / pulse_sum) + 100.0);

    // TND mixer (triangle + noise + dmc)
    let tnd_in = (tri / 8227.0) + (noise / 12241.0) + (dmc / 22638.0);
    let tnd_out = 0.0;
    if (tnd_in > 0.0) tnd_out = 159.79 / ((1.0 / tnd_in) + 100.0);

    // Return combined level in approx 0..1 range (will be normalized later)
    return pulse_out + tnd_out;
  }

  this.handleFrameCounter = function() {
    // NTSC values: 7457, 14913, 22371, 29829, 37281
    // PAL values: 8313, 16627, 24939, 33252, 41565
    let step1 = this.isNtsc ? 7457 : 8313;
    let step2 = this.isNtsc ? 14913 : 16627;
    let step3 = this.isNtsc ? 22371 : 24939;
    let step4 = this.isNtsc ? 29829 : 33252;
    let step5 = this.isNtsc ? 37281 : 41565;

    if(this.frameCounter === step1) {
      this.clockQuarter();
    } else if(this.frameCounter === step2) {
      this.clockQuarter();
      this.clockHalf();
    } else if(this.frameCounter === step3) {
      this.clockQuarter();
    } else if(this.frameCounter === step4 && !this.step5Mode) {
      this.clockQuarter();
      this.clockHalf();
      if(!this.interruptInhibit) {
        this.nes.frameIrqWanted = true;
      }
    } else if(this.frameCounter === step5) {
      this.clockQuarter();
      this.clockHalf();
    }
  }

  this.getOutput = function() {
    let ret = [this.outputOffset, this.output];
    this.outputOffset = 0;
    return ret;
  }

  // Set low-pass filter type (1-4) matching VirtuaNESex
  this.setLPFType = function(type) {
    if (type >= 1 && type <= 4) {
      this.lpfType = type;
    }
  }

  // Set high-pass filter cutoff in Hz (default 40Hz)
  this.setHPFCutoff = function(hz) {
    if (typeof hz === 'number' && hz > 0) {
      this.hpfCutoffHz = hz;
    }
  }

  // Optionally override approximate sample rate used for filter calculations
  this.setSampleRate = function(sr) {
    if (typeof sr === 'number' && sr > 0) {
      this.sampleRate = sr;
    }
  }

  this.peak = function(adr) {
    if(adr === 0x4015) {
      let ret = 0;
      ret |= (this.p1Counter > 0) ? 0x1 : 0;
      ret |= (this.p2Counter > 0) ? 0x2 : 0;
      ret |= (this.triCounter > 0) ? 0x4 : 0;
      ret |= (this.noiseCounter > 0) ? 0x8 : 0;
      ret |= (this.dmcBytesLeft > 0) ? 0x10 : 0;
      ret |= this.nes.frameIrqWanted ? 0x40 : 0;
      ret |= this.nes.dmcIrqWanted ? 0x80 : 0;
      return ret;
    }
    return 0;
  }

  this.read = function(adr) {
    if(adr === 0x4015) {
      let ret = 0;
      ret |= (this.p1Counter > 0) ? 0x1 : 0;
      ret |= (this.p2Counter > 0) ? 0x2 : 0;
      ret |= (this.triCounter > 0) ? 0x4 : 0;
      ret |= (this.noiseCounter > 0) ? 0x8 : 0;
      ret |= (this.dmcBytesLeft > 0) ? 0x10 : 0;
      ret |= this.nes.frameIrqWanted ? 0x40 : 0;
      ret |= this.nes.dmcIrqWanted ? 0x80 : 0;
      this.nes.frameIrqWanted = false;
      return ret;
    }
    return 0;
  }

  this.write = function(adr, value) {
    switch(adr) {
      case 0x4000: {
        this.p1Duty = (value & 0xc0) >> 6;
        this.p1Volume = value & 0xf;
        this.p1CounterHalt = (value & 0x20) > 0;
        this.p1ConstantVolume = (value & 0x10) > 0;
        break;
      }
      case 0x4001: {
        this.p1SweepEnabled = (value & 0x80) > 0;
        this.p1SweepPeriod = (value & 0x70) >> 4;
        this.p1SweepNegate = (value & 0x08) > 0;
        this.p1SweepShift = value & 0x7;
        this.p1SweepReload = true;
        this.updateSweepP1();
        break;
      }
      case 0x4002: {
        this.p1Timer &= 0x700;
        this.p1Timer |= value;
        this.updateSweepP1();
        break;
      }
      case 0x4003: {
        this.p1Timer &= 0xff;
        this.p1Timer |= (value & 0x7) << 8;
        this.p1DutyIndex = 0;
        if(this.enablePulse1) {
          this.p1Counter = this.lengthLoadValues[(value & 0xf8) >> 3];
        }
        this.p1EnvelopeStart = true;
        this.updateSweepP1();
        break;
      }
      case 0x4004: {
        this.p2Duty = (value & 0xc0) >> 6;
        this.p2Volume = value & 0xf;
        this.p2CounterHalt = (value & 0x20) > 0;
        this.p2ConstantVolume = (value & 0x10) > 0;
        break;
      }
      case 0x4005: {
        this.p2SweepEnabled = (value & 0x80) > 0;
        this.p2SweepPeriod = (value & 0x70) >> 4;
        this.p2SweepNegate = (value & 0x08) > 0;
        this.p2SweepShift = value & 0x7;
        this.p2SweepReload = true;
        this.updateSweepP2();
        break;
      }
      case 0x4006: {
        this.p2Timer &= 0x700;
        this.p2Timer |= value;
        this.updateSweepP2();
        break;
      }
      case 0x4007: {
        this.p2Timer &= 0xff;
        this.p2Timer |= (value & 0x7) << 8;
        this.p2DutyIndex = 0;
        if(this.enablePulse2) {
          this.p2Counter = this.lengthLoadValues[(value & 0xf8) >> 3];
        }
        this.p2EnvelopeStart = true;
        this.updateSweepP2();
        break;
      }
      case 0x4008: {
        this.triCounterHalt = (value & 0x80) > 0;
        this.triLinearReload = value & 0x7f;

        // looks like this is a mistake in the nesdev wiki?
        // http://forums.nesdev.com/viewtopic.php?f=3&t=13767#p163155
        // doesn't do this, neither does Mesen,
        // and doing it breaks Super Mario Bros. 2's triangle between notes

        // this.triReloadLinear = true;
        break;
      }
      case 0x400a: {
        this.triTimer &= 0x700;
        this.triTimer |= value;
        break;
      }
      case 0x400b: {
        this.triTimer &= 0xff;
        this.triTimer |= (value & 0x7) << 8;
        if(this.enableTriangle) {
          this.triCounter = this.lengthLoadValues[(value & 0xf8) >> 3];
        }
        this.triReloadLinear = true;
        break;
      }
      case 0x400c: {
        this.noiseCounterHalt = (value & 0x20) > 0;
        this.noiseConstantVolume = (value & 0x10) > 0;
        this.noiseVolume = value & 0xf;
        break;
      }
      case 0x400e: {
        this.noiseTonal = (value & 0x80) > 0;
        this.noiseTimer = this.noiseLoadValues[value & 0xf] - 1;
        break;
      }
      case 0x400f: {
        if(this.enableNoise) {
          this.noiseCounter = this.lengthLoadValues[(value & 0xf8) >> 3];
        }
        this.noiseEnvelopeStart = true;
        break;
      }
      case 0x4010: {
        this.dmcInterrupt = (value & 0x80) > 0;
        this.dmcLoop = (value & 0x40) > 0;
        this.dmcTimer = this.dmcLoadValues[value & 0xf] - 1;
        if(!this.dmcInterrupt) {
          this.nes.dmcIrqWanted = false;
        }
        break;
      }
      case 0x4011: {
        this.dmcOutput = value & 0x7f;
        break;
      }
      case 0x4012: {
        this.dmcSampleAddress = 0xc000 | (value << 6);
        break;
      }
      case 0x4013: {
        this.dmcSampleLength = (value << 4) + 1;
        break;
      }
      case 0x4015: {
        this.enableNoise = (value & 0x08) > 0;
        this.enableTriangle = (value & 0x04) > 0;
        this.enablePulse2 = (value & 0x02) > 0;
        this.enablePulse1 = (value & 0x01) > 0;
        if(!this.enablePulse1) {
          this.p1Counter = 0;
        }
        if(!this.enablePulse2) {
          this.p2Counter = 0;
        }
        if(!this.enableTriangle) {
          this.triCounter = 0;
        }
        if(!this.enableNoise) {
          this.noiseCounter = 0;
        }
        if((value & 0x10) > 0) {
          if(this.dmcBytesLeft === 0) {
            this.dmcBytesLeft = this.dmcSampleLength;
            this.dmcAddress = this.dmcSampleAddress;
          }
        } else {
          this.dmcBytesLeft = 0;
        }
        this.nes.dmcIrqWanted = false;
        break;
      }
      case 0x4017: {
        this.step5Mode = (value & 0x80) > 0;
        this.interruptInhibit = (value & 0x40) > 0;
        if(this.interruptInhibit) {
          this.nes.frameIrqWanted = false;
        }
        this.frameCounter = 0;
        if(this.step5Mode) {
          this.clockQuarter();
          this.clockHalf();
        }
        break;
      }
      default: {
        // Handle expansion sound chip writes
        this.exWrite(adr, value);
        break;
      }
    }
  }

  // 新增：获取当前各通道的天2音符代码
  this.getCurrentNoteCodes = function() {
    // 返回 { pulse1: "xx", pulse2: "xx", triangle: "xx", noise: "xx" }
    // 注意：APU本身不区分滑音/颤音，只反映当前音高，滑音/颤音会导致音高在帧间连续变化
    function freqToCode(freq, isTriangle) {
      // 参考txt，音符范围00-0B ~ 70-7B，0C为休止符
      if (!freq || freq < 20) return "0C"; // 休止符
      // MIDI音高
      let midi = Math.round(69 + 12 * Math.log2(freq / 440));
      // MIDI 36 = C2 = 20（天2C2），所以减36
      let octave = Math.floor((midi - 36) / 12);
      let noteIdx = (midi - 36) % 12;
      if (octave < 0 || octave > 7 || noteIdx < 0 || noteIdx > 0x0B) return "0C";
      let code = ((octave << 4) | noteIdx) & 0x7F;
      return code.toString(16).toUpperCase().padStart(2, "0");
    }
    let p1 = (this.enablePulse1 && this.p1Counter > 0 && this.p1Timer > 7)
      ? freqToCode((this.isNtsc ? 1789773 : 1662607) / (16 * (this.p1Timer + 1)), false) : "0C";
    let p2 = (this.enablePulse2 && this.p2Counter > 0 && this.p2Timer > 7)
      ? freqToCode((this.isNtsc ? 1789773 : 1662607) / (16 * (this.p2Timer + 1)), false) : "0C";
    let tri = (this.enableTriangle && this.triCounter > 0 && this.triTimer > 7)
      ? freqToCode((this.isNtsc ? 1789773 : 1662607) / (32 * (this.triTimer + 1)), true) : "0C";
    let noise = (this.enableNoise && this.noiseCounter > 0)
      ? (this.noiseOutput > 0 ? (15 - (this.noiseOutput & 0xF)).toString(16).toUpperCase().padStart(2, "0") : "10")
      : "10";
    return { pulse1: p1, pulse2: p2, triangle: tri, noise: noise };
  }

  // SelectExSound method to match VNES MapperNSF.cpp behavior
  this.selectExSound = function(chip) {
    // Initialize _nsfExtraChips if not exists
    if (!this._nsfExtraChips) {
      this._nsfExtraChips = {};
    }

    // Enable the selected chip without resetting others
    switch(chip) {
      case 1: // VRC6
        this._nsfExtraChips.vrc6 = true;
        this.ex.enabled = true;
        break;
      case 2: // VRC7
        this._nsfExtraChips.vrc7 = true;
        this.ex.enabled = true;
        break;
      case 4: // FDS
        this._nsfExtraChips.fds = true;
        this.ex.enabled = true;
        // FDS specific initialization matching VNES
        this.exWrite(0x4080, 0x80); // FDS volume envelope
        this.exWrite(0x408A, 0xE8); // FDS master envelope
        break;
      case 8: // MMC5
        this._nsfExtraChips.mmc5 = true;
        this.ex.enabled = true;
        break;
      case 16: // N106
        this._nsfExtraChips.namco = true;
        this.ex.enabled = true;
        break;
      case 32: // FME7
        this._nsfExtraChips.sunsoft5b = true;
        this.ex.enabled = true;
        break;
    }

    // Set NTSC timing (always for NSF)
    this.isNtsc = true;

    // Frame IRQ mode (0 = 60Hz, 1 = 50Hz)
    this.step5Mode = false; // 60Hz for NTSC
  };

  // FDS methods
  if (this.ex.fds) {
    this.ex.fds.write = function(adr, value) {
      adr &= 0xFFFF;
      switch(adr) {
        case 0x4040: case 0x4041: case 0x4042: case 0x4043:
        case 0x4044: case 0x4045: case 0x4046: case 0x4047:
        case 0x4048: case 0x4049: case 0x404A: case 0x404B:
        case 0x404C: case 0x404D: case 0x404E: case 0x404F:
        case 0x4050: case 0x4051: case 0x4052: case 0x4053:
        case 0x4054: case 0x4055: case 0x4056: case 0x4057:
        case 0x4058: case 0x4059: case 0x405A: case 0x405B:
        case 0x405C: case 0x405D: case 0x405E: case 0x405F:
          // Wave RAM (64 bytes)
          this.waveRam[adr - 0x4040] = value & 0x3F;
          break;
        case 0x4080:
          // Volume envelope
          this.volume = value & 0x3F;
          break;
        case 0x4082:
          // Frequency low
          this.freq = (this.freq & 0xF00) | value;
          break;
        case 0x4083:
          // Frequency high and enable
          this.freq = (this.freq & 0xFF) | ((value & 0x0F) << 8);
          this.enabled = (value & 0x80) !== 0;
          break;
        case 0x4084:
          // Modulation envelope
          this.modEnv = value & 0x3F;
          break;
        case 0x4086:
          // Modulation frequency low
          this.modFreq = (this.modFreq & 0xF00) | value;
          break;
        case 0x4087:
          // Modulation frequency high
          this.modFreq = (this.modFreq & 0xFF) | ((value & 0x0F) << 8);
          break;
        case 0x4088: case 0x4089: case 0x408A: case 0x408B:
        case 0x408C: case 0x408D: case 0x408E: case 0x408F:
        case 0x4090: case 0x4091: case 0x4092: case 0x4093:
        case 0x4094: case 0x4095: case 0x4096: case 0x4097:
        case 0x4098: case 0x4099: case 0x409A: case 0x409B:
        case 0x409C: case 0x409D: case 0x409E: case 0x409F:
          // Modulation RAM (32 bytes)
          this.modRam[adr - 0x4088] = value & 0x07;
          break;
      }
    };

    this.ex.fds.process = function() {
      if (!this.enabled) return 0;

      // Simple FDS wave generation (simplified)
      this.wavePos = (this.wavePos + 1) % 64;
      let waveSample = this.waveRam[this.wavePos] & 0x3F;

      // Apply volume envelope
      let volume = this.volume & 0x3F;
      if (volume > 32) volume = 64 - volume; // Handle negative volumes

      // Convert to signed value and apply volume
      let output = ((waveSample - 32) * volume) / 32;

      return output;
    };
  }
}
