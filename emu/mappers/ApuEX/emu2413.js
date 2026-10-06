// emu2413 - YM2413 (OPLL) FM Sound Synthesizer Emulator
// Ported from C to JavaScript

var PI = 3.14159265358979;

// Constants
var OPLL_2413_TONE = 0;
var OPLL_VRC7_TONE = 1;

// Bit manipulation macros
var DB_MUTE = 48;
var DB_STEP = 0.375;
var DB_POS = (x) => (uint32)((x)/DB_STEP);
var DB_NEG = (x) => (uint32)(DB_MUTE+DB_MUTE+(x)/DB_STEP);

// Bits for liner value
var DB2LIN_AMP_BITS = 10;
var SLOT_AMP_BITS = DB2LIN_AMP_BITS;

// Bits for envelope phase incremental counter
var EG_DP_BITS = 22;
var EG_DP_WIDTH = (1<<EG_DP_BITS);

// Bits for Pitch and Amp modulator
var PM_PG_BITS = 8;
var PM_PG_WIDTH = (1<<PM_PG_BITS);
var PM_DP_BITS = 16;
var PM_DP_WIDTH = (1<<PM_DP_BITS);
var AM_PG_BITS = 8;
var AM_PG_WIDTH = (1<<AM_PG_BITS);
var AM_DP_BITS = 16;
var AM_DP_WIDTH = (1<<AM_DP_BITS);

// PM table is calcurated by PM_AMP * pow(2,PM_DEPTH*sin(x)/1200)
var PM_AMP_BITS = 8;
var PM_AMP = (1<<PM_AMP_BITS);

// PM speed(Hz) and depth(cent)
var PM_SPEED = 6.4;
var PM_DEPTH = 13.75;

// AM speed(Hz) and depth(dB)
var AM_SPEED = 3.7;
var AM_DEPTH = 4.8;
var AM_DEPTH_BITS = 8;

// Cut the lower b bit(s) off.
var HIGHBITS = (c, b) => ((c)>>(b));

// Leave the lower b bit(s).
var LOWBITS = (c, b) => ((c)&((1<<(b))-1));

// Expand x which is s bits to d bits.
var EXPAND_BITS = (x, s, d) => ((x)<<((d)-(s)));

// Expand x which is s bits to d bits and fill expanded bits '1'
var EXPAND_BITS_X = (x, s, d) => (((x)<<((d)-(s)))|((1<<((d)-(s)))-1));

// Adjust envelope speed which depends on sampling rate.
var rate_adjust = (x) => (uint32)((x)*clk/72/rate + 0.5); // +0.5 to round

// Phase Generator
var PG_BITS = 10;
var PG_WIDTH = (1<<PG_BITS);

// Envelope Generator
var EG_BITS = 16;
var EG_WIDTH = (1<<EG_BITS);
var TL_BITS = 6;
var TL_WIDTH = (1<<TL_BITS);

// EG step
var EG_STEP = 0.375;
var EG_MUTE = 1<<EG_BITS;

// Sustain Level Table
let dphaseSLTable = Array(16);

// DP
var DP_BITS = 19;
var DP_WIDTH = (1<<DP_BITS);
var DP_BASE_BITS = DP_BITS - PG_BITS;

// dB to Liner table
var DB2LIN_TABLE = new Array((DB_MUTE + DB_MUTE)*2);

// Liner to Log curve conversion table (for Attack rate).
var AR_ADJUST_TABLE = new Array(1<<EG_BITS);

// Definition of envelope mode
var SETTLE = 0;
var ATTACK = 1;
var DECAY = 2;
var SUSHOLD = 3;
var SUSTINE = 4;
var RELEASE = 5;
var FINISH = 6;

// Slot types
var MOD = 0;
var CAR = 1;

// Channel & Slot macros
var SLOT_BD1 = 12;
var SLOT_BD2 = 13;
var SLOT_HH = 14;
var SLOT_SD = 15;
var SLOT_TOM = 16;
var SLOT_CYM = 17;

// Global variables
let rate = 0;
let clk = 0;

// WaveTable for each envelope amp
let fullsintable = new Array(PG_WIDTH);
let halfsintable = new Array(PG_WIDTH);
let snaretable = new Array(PG_WIDTH);

let noiseAtable = [
  -1,1,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,
  -1,1,0,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0,-1,1,0,0
];

let noiseBtable = [-1,1,-1,1,0,0,0,0];

let waveform = [fullsintable, halfsintable, snaretable];

// LFO Table
let pmtable = new Array(PM_PG_WIDTH);
let amtable = new Array(AM_PG_WIDTH);

// Noise and LFO
let pm_dphase = 0;
let am_dphase = 0;

// Empty voice data
let null_patch = { TL: 0, FB: 0, EG: 0, ML: 0, AR: 0, DR: 0, SL: 0, RR: 0, KR: 0, KL: 0, AM: 0, PM: 0, WF: 0 };

// Basic voice Data
let default_patch = Array(19*2).fill().map(() => ({ ...null_patch }));

// Phase incr table for Attack
let dphaseARTable = Array(16).fill().map(() => Array(16));

// Phase incr table for Decay and Release
let dphaseDRTable = Array(16).fill().map(() => Array(16));

// KSL + TL Table
let tllTable = Array(4).fill().map(() =>
  Array(8).fill().map(() =>
    Array(1<<TL_BITS).fill().map(() =>
      Array(16).fill(0)
    )
  )
);

let rksTable = Array(2).fill().map(() =>
  Array(8).fill().map(() =>
    Array(2).fill(0)
  )
);

// Phase incr table for PG
let dphaseTable = Array(512).fill().map(() =>
  Array(8).fill().map(() =>
    Array(16).fill(0)
  )
);

// Utility functions
function Min(a, b) { return a < b ? a : b; }

// Table for AR to LogCurve.
function makeAdjustTable() {
  AR_ADJUST_TABLE[0] = (1<<EG_BITS);
  for (let i = 1; i < 128; i++)
    AR_ADJUST_TABLE[i] = (1<<EG_BITS) - 1 - (1<<EG_BITS) * Math.log(i) / Math.log(128);
}

// Table for dB(0 -- (1<<DB_BITS)) to Liner(0 -- DB2LIN_AMP_WIDTH)
function makeDB2LinTable() {
  for (let i = 0; i < DB_MUTE + DB_MUTE; i++) {
    DB2LIN_TABLE[i] = (1<<DB2LIN_AMP_BITS) * Math.pow(10, -i*DB_STEP/20);
    if (i >= DB_MUTE) DB2LIN_TABLE[i] = 0;
    DB2LIN_TABLE[i + DB_MUTE + DB_MUTE] = -DB2LIN_TABLE[i];
  }
}

// Liner(+0.0 - +1.0) to dB((1<<DB_BITS) - 1 -- 0)
function lin2db(d) {
  if (d == 0) return (DB_MUTE - 1);
  else return Min(-(DB_STEP * 20.0 * Math.log10(d)), DB_MUTE - 1);
}

// Sin Table
function makeSinTable() {
  for (let i = 0; i < PG_WIDTH/4; i++) {
    fullsintable[i] = lin2db(Math.sin(2.0*PI*i/PG_WIDTH));
    snaretable[i] = DB_STEP * 6.0;
  }

  for (let i = 0; i < PG_WIDTH/4; i++) {
    fullsintable[PG_WIDTH/2 - 1 - i] = fullsintable[i];
    snaretable[PG_WIDTH/2 - 1 - i] = snaretable[i];
  }

  for (let i = 0; i < PG_WIDTH/2; i++) {
    fullsintable[PG_WIDTH/2+i] = DB_MUTE + DB_MUTE + fullsintable[i];
    snaretable[PG_WIDTH/2+i] = DB_MUTE + DB_MUTE + snaretable[i];
  }

  for (let i = 0; i < PG_WIDTH/2; i++) halfsintable[i] = fullsintable[i];
  for (let i = PG_WIDTH/2; i < PG_WIDTH; i++) halfsintable[i] = fullsintable[0];

  for (let i = 0; i < 64; i++) {
    if (noiseAtable[i] > 0) noiseAtable[i] = DB_POS(0);
    else if (noiseAtable[i] < 0) noiseAtable[i] = DB_NEG(0);
    else noiseAtable[i] = DB_MUTE - 1;
  }

  for (let i = 0; i < 8; i++) {
    if (noiseBtable[i] > 0) noiseBtable[i] = DB_POS(0);
    else if (noiseBtable[i] < 0) noiseBtable[i] = DB_NEG(0);
    else noiseBtable[i] = DB_MUTE - 1;
  }
}

// Table for Pitch Modulator
function makePmTable() {
  for (let i = 0; i < PM_PG_WIDTH; i++)
    pmtable[i] = PM_AMP * Math.pow(2, PM_DEPTH * Math.sin(2.0*PI*i/PM_PG_WIDTH)/1200);
}

// Table for Amp Modulator
function makeAmTable() {
  for (let i = 0; i < AM_PG_WIDTH; i++)
    amtable[i] = AM_DEPTH/2/DB_STEP * (1.0 + Math.sin(2.0*PI*i/PM_PG_WIDTH));
}

// Phase increment counter table
function makeDphaseTable() {
  var mltable = [1,1*2,2*2,3*2,4*2,5*2,6*2,7*2,8*2,9*2,10*2,10*2,12*2,12*2,15*2,15*2];

  for (let fnum = 0; fnum < 512; fnum++)
    for (let block = 0; block < 8; block++)
      for (let ML = 0; ML < 16; ML++)
        dphaseTable[fnum][block][ML] = rate_adjust(((fnum * mltable[ML])<<block)>>(20-DP_BITS));
}

function makeTllTable() {
  var dB2 = (x) => (x)*2;

  var kltable = [
    dB2(0.000),dB2(9.000),dB2(12.000),dB2(13.875),dB2(15.000),dB2(16.125),dB2(16.875),dB2(17.625),
    dB2(18.000),dB2(18.750),dB2(19.125),dB2(19.500),dB2(19.875),dB2(20.250),dB2(20.625),dB2(21.000)
  ];

  for (let KL = 0; KL < 4; KL++)
    for (let block = 0; block < 8; block++)
      for (let TL = 0; TL < 64; TL++)
        for (let fnum = 0; fnum < 16; fnum++) {
          if (KL == 0) {
            tllTable[KL][block][TL][fnum] = TL << (EG_DP_BITS - EG_BITS);
          } else {
            let tmp = kltable[fnum] - dB2(3.000) * (7 - block);
            if (tmp <= 0)
              tllTable[KL][block][TL][fnum] = TL << (EG_DP_BITS - EG_BITS);
            else
              tllTable[KL][block][TL][fnum] = ((tmp>>(3-KL))/EG_STEP) + (TL << (EG_DP_BITS - EG_BITS));
          }
        }
}

// Rate Table for Attack
function makeDphaseARTable() {
  for (let AR = 0; AR < 16; AR++)
    for (let Rks = 0; Rks < 16; Rks++) {
      let RM = AR + (Rks>>2);
      if (RM > 15) RM = 15;
      let RL = Rks & 3;
      switch (AR) {
        case 0:
          dphaseARTable[AR][Rks] = 0;
          break;
        case 15:
          dphaseARTable[AR][Rks] = EG_DP_WIDTH;
          break;
        default:
          dphaseARTable[AR][Rks] = rate_adjust((3 * (RL + 4) << (RM + 1)));
          break;
      }
    }
}

// Rate Table for Decay
function makeDphaseDRTable() {
  for (let DR = 0; DR < 16; DR++)
    for (let Rks = 0; Rks < 16; Rks++) {
      let RM = DR + (Rks>>2);
      let RL = Rks & 3;
      if (RM > 15) RM = 15;
      switch (DR) {
        case 0:
          dphaseDRTable[DR][Rks] = 0;
          break;
        default:
          dphaseDRTable[DR][Rks] = rate_adjust((RL + 4) << (RM - 1));
          break;
      }
    }
}

function makeRksTable() {
  for (let fnum8 = 0; fnum8 < 2; fnum8++)
    for (let block = 0; block < 8; block++)
      for (let KR = 0; KR < 2; KR++) {
        if (KR != 0)
          rksTable[fnum8][block][KR] = (block << 1) + fnum8;
        else
          rksTable[fnum8][block][KR] = block >> 1;
      }
}

function makeDphaseSLTable() {
  for (let i = 0; i < 16; i++) {
    dphaseSLTable[i] = (i == 15) ? EG_DP_WIDTH : ((i + 1) << (EG_DP_BITS - 4));
  }
}

// Utility functions
function uint32(x) { return x >>> 0; }

function dump2patch(dump, patch) {
  patch.AM = (dump[0]>>7)&1;
  patch.PM = (dump[0]>>6)&1;
  patch.EG = (dump[0]>>5)&1;
  patch.KR = (dump[0]>>4)&1;
  patch.ML = (dump[0])&15;
  patch.KL = (dump[2]>>6)&3;
  patch.TL = (dump[2])&63;
  patch.FB = (dump[3])&7;
  patch.WF = (dump[3]>>3)&1;
  patch.AR = (dump[4]>>4)&15;
  patch.DR = (dump[4])&15;
  patch.SL = (dump[6]>>4)&15;
  patch.RR = (dump[6])&15;
}

function makeDefaultPatch() {
  // Load default patches from vrc7tone.h and 2413tone.h
  var vrc7tone = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x33, 0x01, 0x09, 0x0e, 0x94, 0x90, 0x40, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x13, 0x41, 0x0f, 0x0d, 0xce, 0xd3, 0x43, 0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x12, 0x1b, 0x06, 0xff, 0xd2, 0x00, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x61, 0x61, 0x1b, 0x07, 0xaf, 0x63, 0x20, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x22, 0x21, 0x1e, 0x06, 0xf0, 0x76, 0x08, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x66, 0x21, 0x15, 0x00, 0x93, 0x94, 0x20, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x21, 0x61, 0x1c, 0x07, 0x82, 0x81, 0x10, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x23, 0x21, 0x20, 0x1f, 0xc0, 0x71, 0x07, 0x47, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x25, 0x31, 0x26, 0x05, 0x64, 0x41, 0x18, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x17, 0x21, 0x28, 0x07, 0xff, 0x83, 0x02, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x97, 0x81, 0x25, 0x07, 0xcf, 0xc8, 0x02, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x21, 0x21, 0x54, 0x0f, 0x80, 0x7f, 0x07, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x01, 0x56, 0x03, 0xd3, 0xb2, 0x43, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x31, 0x21, 0x0c, 0x03, 0x82, 0xc0, 0x40, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x21, 0x01, 0x0c, 0x03, 0xd4, 0xd3, 0x40, 0x84, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x04, 0x21, 0x28, 0x00, 0xdf, 0xf8, 0xff, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x23, 0x22, 0x00, 0x00, 0xa8, 0xf8, 0xf8, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x25, 0x18, 0x00, 0x00, 0xf8, 0xa9, 0xf8, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ];

  for (let i = 0; i < 19; i++) {
    var offset = i * 16;
    dump2patch(vrc7tone.slice(offset, offset + 16), default_patch[i*2]);
    dump2patch(vrc7tone.slice(offset, offset + 16), default_patch[i*2+1]);
  }
}

// Calculate envelope generator dphase
function calc_eg_dphase(slot) {
  switch (slot.eg_mode) {
    case ATTACK:
      return dphaseARTable[slot.patch.AR][slot.rks];
    case DECAY:
      return dphaseDRTable[slot.patch.DR][slot.rks];
    case SUSTINE:
      return dphaseDRTable[slot.patch.RR][slot.rks];
    case RELEASE:
      return dphaseDRTable[slot.patch.RR][slot.rks];
    case SETTLE:
      return dphaseDRTable[7][slot.rks];
    case FINISH:
      return 0;
    default:
      return 0;
  }
}

// Update noise generator
function update_noise(opll) {
  opll.whitenoise = (opll.noise_seed >> 7) & 1;
  opll.whitenoise |= (opll.whitenoise ^ 1) << 1;
  opll.whitenoise |= ((opll.noise_seed >> 10) & 1) << 2;
  opll.whitenoise |= ((opll.whitenoise >> 2) ^ 1) << 3;
  opll.whitenoise |= ((opll.noise_seed >> 12) & 1) << 4;
  opll.whitenoise |= ((opll.whitenoise >> 4) ^ 1) << 5;
  opll.whitenoise *= 2;

  opll.noise_seed = (opll.noise_seed << 1) | (opll.whitenoise & 1);

  opll.noiseA_phase += opll.noiseA_dphase;
  opll.noiseB_phase += opll.noiseB_dphase;

  opll.noiseA_phase &= (PG_WIDTH << 1) - 1;
  opll.noiseB_phase &= (PG_WIDTH << 1) - 1;

  opll.noiseA_idx = opll.noiseA_phase >> 1;
  opll.noiseB_idx = opll.noiseB_phase >> 1;
}

// Update AM/PM LFO
function update_ampm(opll) {
  opll.pm_phase += pm_dphase;
  opll.am_phase += am_dphase;

  opll.pm_phase &= (PM_DP_WIDTH - 1);
  opll.am_phase &= (AM_DP_WIDTH - 1);

  opll.lfo_pm = pmtable[opll.pm_phase >> (PM_DP_BITS - PM_PG_BITS)];
  opll.lfo_am = amtable[opll.am_phase >> (AM_DP_BITS - AM_PG_BITS)];
}

// Calculate envelope
function calc_envelope(slot) {
  let egout;

  slot.eg_dphase = calc_eg_dphase(slot);

  if (slot.eg_mode != ATTACK && (rate == 0 || slot.eg_dphase == 0)) {
    return slot.egout;
  }

  switch (slot.eg_mode) {
    case ATTACK:
      egout = slot.eg_phase + slot.eg_dphase;
      if (egout >= EG_DP_WIDTH) {
        egout = 0;
        slot.eg_mode = DECAY;
        slot.eg_phase = 0;
      } else {
        slot.eg_phase = egout;
      }
      break;

    case DECAY:
      egout = slot.eg_phase + slot.eg_dphase;
      if (egout >= dphaseSLTable[slot.patch.SL]) {
        slot.eg_mode = SUSTINE;
        slot.eg_phase = dphaseSLTable[slot.patch.SL];
      } else {
        slot.eg_phase = egout;
      }
      break;

    case SUSTINE:
    case RELEASE:
      egout = slot.eg_phase + slot.eg_dphase;
      if (egout >= EG_DP_WIDTH) {
        slot.eg_mode = FINISH;
        egout = EG_DP_WIDTH - 1;
      }
      slot.eg_phase = egout;
      break;

    case SETTLE:
      egout = slot.eg_phase + slot.eg_dphase;
      if (egout >= EG_DP_WIDTH) {
        slot.eg_mode = ATTACK;
        egout = EG_DP_WIDTH - 1;
      }
      slot.eg_phase = egout;
      break;

    case FINISH:
      egout = EG_DP_WIDTH - 1;
      break;

    default:
      egout = EG_DP_WIDTH - 1;
      break;
  }

  slot.egout = egout >> EG_DP_BITS;
  return slot.egout;
}

// Calculate phase
function calc_phase(slot) {
  if (slot.patch.PM) {
    slot.phase += (slot.dphase * slot.plfo_pm()) >> PM_AMP_BITS;
  } else {
    slot.phase += slot.dphase;
  }

  slot.phase &= (DP_WIDTH - 1);
  slot.pgout = slot.phase >> (DP_BITS - PG_BITS);
}

// Calculate slot carrier
function calc_slot_car(slot, fm) {
  calc_envelope(slot);
  calc_phase(slot);

  slot.output[0] = slot.output[1];
  slot.output[1] = slot.output[2];

  let fm_in = fm + slot.feedback;
  fm_in &= (PG_WIDTH - 1);

  let index = slot.sintbl[fm_in] + slot.egout + slot.tll + slot.volume;
  if (index >= DB2LIN_TABLE.length) index = DB2LIN_TABLE.length - 1;
  slot.output[2] = DB2LIN_TABLE[index];

  slot.feedback = (slot.output[2] + slot.output[1]) >> 1;
  if (slot.patch.WF) {
    slot.feedback = (slot.feedback * slot.patch.FB) >> 3;
  } else {
    slot.feedback = 0;
  }
}

// Calculate slot modulator
function calc_slot_mod(slot) {
  calc_envelope(slot);
  calc_phase(slot);

  slot.output[0] = slot.output[1];
  slot.output[1] = slot.output[2];
  slot.output[2] = slot.output[3];
  slot.output[3] = slot.output[4];

  let index = slot.sintbl[slot.pgout] + slot.egout + slot.tll + slot.volume;
  if (index >= DB2LIN_TABLE.length) index = DB2LIN_TABLE.length - 1;
  slot.output[4] = DB2LIN_TABLE[index];

  slot.feedback = (slot.output[4] + slot.output[3] + slot.output[2] + slot.output[1]) >> 2;
  if (slot.patch.WF) {
    slot.feedback = (slot.feedback * slot.patch.FB) >> 3;
  } else {
    slot.feedback = 0;
  }
}

// Initialize tables
function OPLL_init(c, r) {
  makePmTable();
  makeAmTable();
  makeDB2LinTable();
  makeAdjustTable();
  makeTllTable();
  makeRksTable();
  makeDphaseTable();
  makeDphaseSLTable();
  makeSinTable();
  makeDefaultPatch();
  OPLL_setClock(c, r);
}

function OPLL_close() {
  // Nothing to do in JS
}

// OPLL class
class OPLL {
  constructor() {
    this.adr = 0;
    this.output = [0, 0];
    this.reg = new Array(0x40).fill(0);
    this.slot_on_flag = new Array(18).fill(0);
    this.rythm_mode = 0;
    this.pm_phase = 0;
    this.lfo_pm = 0;
    this.am_phase = 0;
    this.lfo_am = 0;
    this.noise_seed = 0xffff;
    this.whitenoise = 0;
    this.noiseA = 0;
    this.noiseB = 0;
    this.noiseA_phase = 0;
    this.noiseB_phase = 0;
    this.noiseA_idx = 0;
    this.noiseB_idx = 0;
    this.noiseA_dphase = 0;
    this.noiseB_dphase = 0;
    this.ch = new Array(9);
    this.slot = new Array(18);
    this.patch = new Array(19*2);
    this.patch_update = [0, 0];
    this.mask = 0;
    this.masterVolume = 32;

    // Initialize patches
    for (let i = 0; i < 19*2; i++) {
      this.patch[i] = { ...null_patch };
    }

    // Initialize channels and slots
    for (let i = 0; i < 9; i++) {
      var mod = {
        patch: this.patch[i*2],  // Point to default patch
        type: MOD,
        feedback: 0,
        output: [0, 0, 0, 0, 0],
        sintbl: waveform[0],
        phase: 0,
        dphase: 0,
        pgout: 0,
        fnum: 0,
        block: 0,
        volume: 0,
        sustine: 0,
        tll: 0,
        rks: 0,
        eg_mode: SETTLE,
        eg_phase: EG_DP_WIDTH,
        eg_dphase: 0,
        egout: 0,
        plfo_pm: null,
        plfo_am: null
      };

      var car = {
        patch: this.patch[i*2+1],  // Point to default patch
        type: CAR,
        feedback: 0,
        output: [0, 0, 0, 0, 0],
        sintbl: waveform[0],
        phase: 0,
        dphase: 0,
        pgout: 0,
        fnum: 0,
        block: 0,
        volume: 0,
        sustine: 0,
        tll: 0,
        rks: 0,
        eg_mode: SETTLE,
        eg_phase: EG_DP_WIDTH,
        eg_dphase: 0,
        egout: 0,
        plfo_pm: null,
        plfo_am: null
      };

      this.ch[i] = {
        patch_number: 0,
        key_status: 0,
        mod: mod,
        car: car
      };

      this.slot[i*2] = mod;
      this.slot[i*2+1] = car;
    }

    // Set LFO references
    for (let i = 0; i < 18; i++) {
      this.slot[i].plfo_am = () => this.lfo_am;
      this.slot[i].plfo_pm = () => this.lfo_pm;
    }

    this.reset();
  }

  reset() {
    this.adr = 0;
    this.output[0] = 0;
    this.output[1] = 0;
    this.pm_phase = 0;
    this.am_phase = 0;
    this.noise_seed = 0xffff;
    this.whitenoise = 0;
    this.noiseA = 0;
    this.noiseB = 0;
    this.noiseA_phase = 0;
    this.noiseB_phase = 0;
    this.noiseA_idx = 0;
    this.noiseB_idx = 0;
    this.noiseA_dphase = 0;
    this.noiseB_dphase = 0;

    for (let i = 0; i < 9; i++) {
      this.ch[i].patch_number = 0;
      this.ch[i].key_status = 0;
    }

    for (let i = 0; i < 18; i++) {
      var slot = this.slot[i];
      slot.sintbl = waveform[0];
      slot.phase = 0;
      slot.dphase = 0;
      slot.output = [0, 0, 0, 0, 0];
      slot.feedback = 0;
      slot.eg_mode = SETTLE;
      slot.eg_phase = EG_DP_WIDTH;
      slot.eg_dphase = 0;
      slot.rks = 0;
      slot.tll = 0;
      slot.sustine = 0;
      slot.fnum = 0;
      slot.block = 0;
      slot.volume = 0;
      slot.pgout = 0;
      slot.egout = 0;
    }

    for (let i = 0; i < 0x40; i++) this.reg[i] = 0;
  }

  reset_patch(type) {
    for (let i = 0; i < 19*2; i++) {
      this.patch[i] = { ...default_patch[type % 19][i % 2] };
    }
  }

  setClock(c, r) {
    clk = c;
    rate = r;
    makeDphaseTable();
    makeDphaseARTable();
    makeDphaseDRTable();
    pm_dphase = rate_adjust(PM_SPEED * PM_DP_WIDTH / (clk/72));
    am_dphase = rate_adjust(AM_SPEED * AM_DP_WIDTH / (clk/72));
  }

  writeReg(reg, data) {
    var slot = this.slot;
    var ch = this.ch;

    this.reg[reg] = data;

    var ch_num = reg >> 4; // Channel number
    var reg_type = reg & 0x0F; // Register type within channel

    switch (reg_type) {
      case 0x0: // AM/VIB/EG/KSR/MULTI (MOD)
        if (!slot[ch_num * 2].patch) {
          slot[ch_num * 2].patch = { ...this.patch[ch[ch_num].patch_number * 2] };
        }
        slot[ch_num * 2].patch.AM = (data >> 7) & 1;
        slot[ch_num * 2].patch.PM = (data >> 6) & 1;
        slot[ch_num * 2].patch.EG = (data >> 5) & 1;
        slot[ch_num * 2].patch.KR = (data >> 4) & 1;
        slot[ch_num * 2].patch.ML = data & 15;
        break;

      case 0x1: // AM/VIB/EG/KSR/MULTI (CAR)
        if (!slot[ch_num * 2 + 1].patch) {
          slot[ch_num * 2 + 1].patch = { ...this.patch[ch[ch_num].patch_number * 2 + 1] };
        }
        slot[ch_num * 2 + 1].patch.AM = (data >> 7) & 1;
        slot[ch_num * 2 + 1].patch.PM = (data >> 6) & 1;
        slot[ch_num * 2 + 1].patch.EG = (data >> 5) & 1;
        slot[ch_num * 2 + 1].patch.KR = (data >> 4) & 1;
        slot[ch_num * 2 + 1].patch.ML = data & 15;
        break;

      case 0x2: // KSL/TL (MOD)
        var fnum_idx_mod = ch[ch_num].fnum ? (ch[ch_num].fnum >> 4) : 0;
        slot[ch_num * 2].tll = tllTable[data >> 6][ch[ch_num].block][data & 0x3f][fnum_idx_mod];
        break;

      case 0x3: // KSL/TL (CAR)
        var fnum_idx_car = ch[ch_num].fnum ? (ch[ch_num].fnum >> 4) : 0;
        slot[ch_num * 2 + 1].tll = tllTable[data >> 6][ch[ch_num].block][data & 0x3f][fnum_idx_car];
        break;

      case 0x4: // AR/DR (MOD)
        slot[ch_num * 2].patch.AR = data >> 4;
        slot[ch_num * 2].patch.DR = data & 15;
        break;

      case 0x5: // AR/DR (CAR)
        slot[ch_num * 2 + 1].patch.AR = data >> 4;
        slot[ch_num * 2 + 1].patch.DR = data & 15;
        break;

      case 0x6: // SL/RR (MOD)
        slot[ch_num * 2].patch.SL = data >> 4;
        slot[ch_num * 2].patch.RR = data & 15;
        break;

      case 0x7: // SL/RR (CAR)
        slot[ch_num * 2 + 1].patch.SL = data >> 4;
        slot[ch_num * 2 + 1].patch.RR = data & 15;
        break;

      case 0x8: // F-NUMBER low
        ch[ch_num].fnum = (ch[ch_num].fnum & 0x100) | data;
        slot[ch_num * 2].fnum = ch[ch_num].fnum;
        slot[ch_num * 2 + 1].fnum = ch[ch_num].fnum;
        break;

      case 0x9: // SUS/KEY-ON/BLOCK/F-NUMBER high
        ch[ch_num].block = (data >> 1) & 7;
        ch[ch_num].key_status = data & 1;
        ch[ch_num].fnum = (data & 0x10) ? (ch[ch_num].fnum | 0x100) : (ch[ch_num].fnum & 0xFF);
        slot[ch_num * 2].block = ch[ch_num].block;
        slot[ch_num * 2 + 1].block = ch[ch_num].block;
        slot[ch_num * 2].fnum = ch[ch_num].fnum;
        slot[ch_num * 2 + 1].fnum = ch[ch_num].fnum;
        slot[ch_num * 2].sustine = (data >> 5) & 1;
        slot[ch_num * 2 + 1].sustine = (data >> 5) & 1;

        // Update dphase
        slot[ch_num * 2].dphase = dphaseTable[ch[ch_num].fnum][ch[ch_num].block][slot[ch_num * 2].patch.ML];
        slot[ch_num * 2 + 1].dphase = dphaseTable[ch[ch_num].fnum][ch[ch_num].block][slot[ch_num * 2 + 1].patch.ML];

        // Update rks
        slot[ch_num * 2].rks = rksTable[ch[ch_num].fnum >> 8][ch[ch_num].block][slot[ch_num * 2].patch.KR];
        slot[ch_num * 2 + 1].rks = rksTable[ch[ch_num].fnum >> 8][ch[ch_num].block][slot[ch_num * 2 + 1].patch.KR];

        // Key on/off
        if (ch[ch_num].key_status) {
          slot[ch_num * 2].eg_mode = ATTACK;
          slot[ch_num * 2 + 1].eg_mode = ATTACK;
          slot[ch_num * 2].eg_phase = EG_DP_WIDTH;
          slot[ch_num * 2 + 1].eg_phase = EG_DP_WIDTH;
        } else {
          if (slot[ch_num * 2].eg_mode == ATTACK || slot[ch_num * 2].eg_mode == DECAY) {
            slot[ch_num * 2].eg_mode = RELEASE;
          }
          if (slot[ch_num * 2 + 1].eg_mode == ATTACK || slot[ch_num * 2 + 1].eg_mode == DECAY) {
            slot[ch_num * 2 + 1].eg_mode = RELEASE;
          }
        }
        break;

      case 0xA: // FB/CONNECT
        slot[ch_num * 2 + 1].patch.FB = data >> 1;
        slot[ch_num * 2 + 1].patch.WF = data & 1;
        break;

      case 0xB: // VOLUME
        slot[ch_num * 2 + 1].volume = data & 15;
        break;

      case 0xC: // INST select
        ch[ch_num].patch_number = data & 15;
        break;

      case 0xD: // Rhythm control
        if (ch_num == 0) {
          this.rythm_mode = data & 32;
          if (this.rythm_mode) {
            for (let i = 6; i < 9; i++) {
              ch[i].patch_number = 16 + (i - 6);
            }
          }
        }
        break;
    }
  }

  calc() {
    let mix = 0;

    update_ampm(this);
    update_noise(this);

    for (let i = 0; i < 9; i++) {
      if (this.rythm_mode && i >= 6) {
        // Rhythm mode - handle special channels
        switch (i) {
          case 6: // Bass drum
            calc_slot_car(this.slot[12], this.slot[13].feedback);
            calc_slot_mod(this.slot[13]);
            mix += (this.slot[12].output[2] + this.slot[13].output[4]) >> 1;
            break;
          case 7: // Snare drum
            this.slot[14].output[2] = snaretable[this.noiseA_idx] >> (DB2LIN_AMP_BITS + this.slot[14].egout + this.slot[14].tll + this.slot[14].volume);
            mix += this.slot[14].output[2];
            break;
          case 8: // Tom-tom and cymbal
            this.slot[15].output[2] = noiseAtable[this.noiseA_idx] >> (DB2LIN_AMP_BITS + this.slot[15].egout + this.slot[15].tll + this.slot[15].volume);
            this.slot[16].output[2] = noiseBtable[this.noiseB_idx] >> (DB2LIN_AMP_BITS + this.slot[16].egout + this.slot[16].tll + this.slot[16].volume);
            mix += (this.slot[15].output[2] + this.slot[16].output[2]) >> 1;
            break;
        }
      } else {
        // Normal FM synthesis
        calc_slot_mod(this.slot[i*2]);
        calc_slot_car(this.slot[i*2+1], this.slot[i*2].feedback);
        mix += this.slot[i*2+1].output[2];
      }
    }

    // Apply master volume and AM LFO
    mix = (mix * this.masterVolume) >> 4;
    if (this.lfo_am > 0) {
      mix = (mix * (AM_DEPTH - this.lfo_am)) >> AM_DEPTH_BITS;
    }

    return mix;
  }
}

function OPLL_new() {
  return new OPLL();
}

function OPLL_delete(opll) {
  // Nothing to do in JS
}

function OPLL_reset(opll) {
  opll.reset();
}

function OPLL_reset_patch(opll, type) {
  opll.reset_patch(type);
}

function OPLL_setClock(c, r) {
  clk = c;
  rate = r;
  makeDphaseTable();
  makeDphaseARTable();
  makeDphaseDRTable();
  pm_dphase = rate_adjust(PM_SPEED * PM_DP_WIDTH / (c/72));
  am_dphase = rate_adjust(AM_SPEED * AM_DP_WIDTH / (c/72));
}

function OPLL_writeIO(opll, adr, val) {
  adr &= 0xff;
  if (adr == 0x7C) opll.adr = val;
  else if (adr == 0x7D) opll.writeReg(opll.adr, val);
}

function OPLL_writeReg(opll, reg, val) {
  opll.writeReg(reg, val);
}

function OPLL_calc(opll) {
  return opll.calc();
}

function OPLL_copyPatch(opll, num, patch) {
  opll.patch[num] = { ...patch };
}

function OPLL_forceRefresh(opll) {
  // Implementation needed
}

function OPLL_setMask(opll, mask) {
  var ret = opll.mask;
  opll.mask = mask;
  return ret;
}

function OPLL_toggleMask(opll, mask) {
  var ret = opll.mask;
  opll.mask ^= mask;
  return ret;
}

// emu2413 - YM2413 (OPLL) FM Sound Synthesizer Emulator
// Ported from C to JavaScript

var PI = 3.14159265358979;

// Constants
var OPLL_2413_TONE = 0;
var OPLL_VRC7_TONE = 1;

// Bit manipulation macros
var DB_MUTE = 48;
var DB_STEP = 0.375;
var DB_POS = (x) => (uint32)((x)/DB_STEP);
var DB_NEG = (x) => (uint32)(DB_MUTE+DB_MUTE+(x)/DB_STEP);

// Bits for liner value
var DB2LIN_AMP_BITS = 10;
var SLOT_AMP_BITS = DB2LIN_AMP_BITS;

// Bits for envelope phase incremental counter
var EG_DP_BITS = 22;
var EG_DP_WIDTH = (1<<EG_DP_BITS);

// Bits for Pitch and Amp modulator
var PM_PG_BITS = 8;
var PM_PG_WIDTH = (1<<PM_PG_BITS);
var PM_DP_BITS = 16;
var PM_DP_WIDTH = (1<<PM_DP_BITS);
var AM_PG_BITS = 8;
var AM_PG_WIDTH = (1<<AM_PG_BITS);
var AM_DP_BITS = 16;
var AM_DP_WIDTH = (1<<AM_DP_BITS);

// PM table is calcurated by PM_AMP * pow(2,PM_DEPTH*sin(x)/1200)
var PM_AMP_BITS = 8;
var PM_AMP = (1<<PM_AMP_BITS);

// PM speed(Hz) and depth(cent)
var PM_SPEED = 6.4;
var PM_DEPTH = 13.75;

// AM speed(Hz) and depth(dB)
var AM_SPEED = 3.7;
var AM_DEPTH = 4.8;
var AM_DEPTH_BITS = 8;

// Cut the lower b bit(s) off.
var HIGHBITS = (c, b) => ((c)>>(b));

// Leave the lower b bit(s).
var LOWBITS = (c, b) => ((c)&((1<<(b))-1));

// Expand x which is s bits to d bits.
var EXPAND_BITS = (x, s, d) => ((x)<<((d)-(s)));

// Expand x which is s bits to d bits and fill expanded bits '1'
var EXPAND_BITS_X = (x, s, d) => (((x)<<((d)-(s)))|((1<<((d)-(s)))-1));

// Adjust envelope speed which depends on sampling rate.
var rate_adjust = (x) => (uint32)((x)*clk/72/rate + 0.5); // +0.5 to round

// Phase Generator
var PG_BITS = 10;
var PG_WIDTH = (1<<PG_BITS);

// Envelope Generator
var EG_BITS = 16;
var EG_WIDTH = (1<<EG_BITS);
var TL_BITS = 6;
var TL_WIDTH = (1<<TL_BITS);

// EG step
var EG_STEP = 0.375;
var EG_MUTE = 1<<EG_BITS;


// Export for browser environment
if (typeof window !== 'undefined') {
  window.emu2413 = {
    OPLL_init,
    OPLL_close,
    OPLL_new,
    OPLL_delete,
    OPLL_reset,
    OPLL_reset_patch,
    OPLL_setClock,
    OPLL_writeIO,
    OPLL_writeReg,
    OPLL_calc,
    OPLL_copyPatch,
    OPLL_forceRefresh,
    OPLL_setMask,
    OPLL_toggleMask,
    OPLL_2413_TONE,
    OPLL_VRC7_TONE,
    // Export global tables for testing
    dphaseTable,
    default_patch
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OPLL_init,
    OPLL_close,
    OPLL_new,
    OPLL_delete,
    OPLL_reset,
    OPLL_reset_patch,
    OPLL_setClock,
    OPLL_writeIO,
    OPLL_writeReg,
    OPLL_calc,
    OPLL_copyPatch,
    OPLL_forceRefresh,
    OPLL_setMask,
    OPLL_toggleMask,
    OPLL_2413_TONE,
    OPLL_VRC7_TONE,
    // Export global tables for testing
    dphaseTable,
    default_patch
  };
}
