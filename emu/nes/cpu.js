Cpu = (function () {
  //adressing modes
  const IMP = 0; // also accumulator-mode
  const IMM = 1;
  const ZP = 2;
  const ZPX = 3;
  const ZPY = 4;
  const IZX = 5;
  const IZY = 6;
  const ABS = 7;
  const ABX = 8;
  const ABY = 9;
  const IND = 11;
  const REL = 12;
  const IZYr = 13; // for read instructions, with optional extra cycle
  const ABXr = 14; // RMW and writes always have the extra cycle
  const ABYr = 15;

  // register indexes in arrays
  const A = 0;
  const X = 1;
  const Y = 2;
  const SP = 3;
  const PC = 0;

  return function (mem) {
    // registers
    this.r = new Uint8Array(4);
    this.br = new Uint16Array(1);

    // memory handler
    this.mem = mem;

    // 新增：暴露irqType
    this.irqType = mem.irqType || null;

    // wrap mem.read to prevent undefined
    this.safeRead = function (addr) {
      let v = this.mem.read ? this.mem.read(addr) : 0;
      return (typeof v === "number" && !isNaN(v)) ? v & 0xFF : 0;
    }

    // wrap mem.write to prevent exceptions
    this.safeWrite = function (addr, value) {
      if (this.mem.write) {
        try {
          this.mem.write(addr, value & 0xFF);
        } catch (e) {
          // ignore write exceptions
        }
      }
    }

    this.reset = function () {
      this.r[A] = 0;
      this.r[X] = 0;
      this.r[Y] = 0;
      this.r[SP] = 0xfd;
      if (this.mem.read) {
        this.br[PC] = this.safeRead(0xfffc) | (this.safeRead(0xfffd) << 8);
      } else {
        // if the read function in the mem-handler has not been defined yet
        this.br[PC] = 0;
      }

      // flags
      this.n = false;
      this.v = false;
      this.d = false;
      this.i = true;
      this.z = false;
      this.c = false;

      // interrupt wanted
      this.irqWanted = false;
      this.nmiWanted = false;

      // cycles left
      this.cyclesLeft = 7;
    }
    this.reset();
    this.saveVars = [
      "r", "br", "n", "v", "d", "i", "z", "c", "irqWanted", "nmiWanted",
      "cyclesLeft"
    ];

    // instruction maps

    this.addressingModes = [
      //x0 x1   x2   x3   x4   x5   x6   x7   x8   x9   xa   xb   xc   xd   xe   xf
      IMP, IZX, IMP, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //0x
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //1x
      ABS, IZX, IMP, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //2x
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //3x
      IMP, IZX, IMP, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //4x
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //5x
      IMP, IZX, IMP, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, IND, ABS, ABS, ABS, //6x
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //7x
      IMM, IZX, IMM, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //8x
      REL, IZY, IMP, IZY, ZPX, ZPX, ZPY, ZPY, IMP, ABY, IMP, ABY, ABX, ABX, ABY, ABY, //9x
      IMM, IZX, IMM, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //ax
      REL, IZYr, IMP, IZYr, ZPX, ZPX, ZPY, ZPY, IMP, ABYr, IMP, ABYr, ABXr, ABXr, ABYr, ABYr,//bx
      IMM, IZX, IMM, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //cx
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //dx
      IMM, IZX, IMM, IZX, ZP, ZP, ZP, ZP, IMP, IMM, IMP, IMM, ABS, ABS, ABS, ABS, //ex
      REL, IZYr, IMP, IZY, ZPX, ZPX, ZPX, ZPX, IMP, ABYr, IMP, ABY, ABXr, ABXr, ABX, ABX, //fx
    ];

    this.cycles = [
      //0x1 x2 x3 x4 x5 x6 x7 x8 x9 xa xb xc xd xe xf
      7, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6, //0x
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //1x
      6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6, //2x
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //3x
      6, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6, //4x
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //5x
      6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6, //6x
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //7x
      2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, //8x
      2, 6, 2, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5, //9x
      2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, //ax
      2, 5, 2, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, //bx
      2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, //cx
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //dx
      2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, //ex
      2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, //fx
    ]

    // function table is at bottom

    this.cycle = function () {
      if (this.cyclesLeft === 0) {
        // read the instruction byte and get the info
        let instr = this.safeRead(this.br[PC]++);
        let mode = this.addressingModes[instr];
        this.cyclesLeft = this.cycles[instr];
        // test for wanting an interrupt
        if (this.nmiWanted || (this.irqWanted && !this.i)) {
          // we want a interrupt, so push a special instuction type in instr
          this.br[PC]--;
          if (this.nmiWanted) {
            this.nmiWanted = false;
            instr = 0x100; // NMI
          } else {
            instr = 0x101; // IRQ
          }
          mode = IMP;
          this.cyclesLeft = 7;
        }
        // get the effective address, and execute the instruction
        let eff = this.getAdr(mode);
        // prevent illegal instructions from crashing
        if (typeof this.functions[instr] === "function") {
          this.functions[instr].call(this, eff, instr);
        } else {
          this.uni(eff, instr);
        }
      }
      this.cyclesLeft--;
    }

    // create a P value from the flags
    this.getP = function (bFlag) {
      let value = 0;

      value |= this.n ? 0x80 : 0;
      value |= this.v ? 0x40 : 0;
      value |= this.d ? 0x08 : 0;
      value |= this.i ? 0x04 : 0;
      value |= this.z ? 0x02 : 0;
      value |= this.c ? 0x01 : 0;
      value |= 0x20; // bit 5 is always set
      value |= bFlag ? 0x10 : 0;

      return value;
    }

    // set the flags according to a P value
    this.setP = function (value) {
      this.n = (value & 0x80) > 0;
      this.v = (value & 0x40) > 0;
      this.d = (value & 0x08) > 0;
      this.i = (value & 0x04) > 0;
      this.z = (value & 0x02) > 0;
      this.c = (value & 0x01) > 0;
    }

    // set Z (zero flag) and N (overflow flag) according to the value
    this.setZandN = function (value) {
      value &= 0xff;
      this.z = value === 0;
      this.n = value > 0x7f;
    }

    // get a singed value (-128 - 127) out of a unsigned one (0 - 255)
    this.getSigned = function (value) {
      if (value > 127) {
        return -(256 - value);
      }
      return value;
    }

    this.doBranch = function (test, rel) {
      if (test) {
        // taken branch: 1 extra cycle
        this.cyclesLeft++;
        if ((this.br[PC] >> 8) !== ((this.br[PC] + rel) >> 8)) {
          // taken branch across page: another extra cycle
          this.cyclesLeft++;
        }
        this.br[PC] += rel;
      }
    }

    // after fetching the instruction byte, this gets the address to affect
    // pc is pointing to byte after instruction byte
    this.getAdr = function (mode) {
      switch (mode) {
        case IMP: {
          // implied, wont use an address
          return 0;
        }
        case IMM: {
          // immediate
          return this.br[PC]++;
        }
        case ZP: {
          // zero page
          return this.safeRead(this.br[PC]++);
        }
        case ZPX: {
          // zero page, indexed by x
          let adr = this.safeRead(this.br[PC]++);
          return (adr + this.r[X]) & 0xff;
        }
        case ZPY: {
          // zero page, indexed by y
          let adr = this.safeRead(this.br[PC]++);
          return (adr + this.r[Y]) & 0xff;
        }
        case IZX: {
          // zero page, indexed indirect by x
          let adr = (this.safeRead(this.br[PC]++) + this.r[X]) & 0xff;
          return this.safeRead(adr) | (this.safeRead((adr + 1) & 0xff) << 8);
        }
        case IZY: {
          // zero page, indirect indexed by y (for RMW and writes)
          let adr = this.safeRead(this.br[PC]++);
          let radr = this.safeRead(adr) | (this.safeRead((adr + 1) & 0xff) << 8);
          return (radr + this.r[Y]) & 0xffff;
        }
        case IZYr: {
          // zero page, indirect indexed by y (for reads)
          let adr = this.safeRead(this.br[PC]++);
          let radr = this.safeRead(adr) | (this.safeRead((adr + 1) & 0xff) << 8);
          if ((radr >> 8) < ((radr + this.r[Y]) >> 8)) {
            this.cyclesLeft++;
          }
          return (radr + this.r[Y]) & 0xffff;
        }
        case ABS: {
          // absolute
          let adr = this.safeRead(this.br[PC]++);
          adr |= (this.safeRead(this.br[PC]++) << 8);
          return adr;
        }
        case ABX: {
          // absolute, indexed by x (for RMW and writes)
          let adr = this.safeRead(this.br[PC]++);
          adr |= (this.safeRead(this.br[PC]++) << 8);
          return (adr + this.r[X]) & 0xffff;
        }
        case ABXr: {
          // absolute, indexed by x (for reads)
          let adr = this.safeRead(this.br[PC]++);
          adr |= (this.safeRead(this.br[PC]++) << 8);
          if ((adr >> 8) < ((adr + this.r[X]) >> 8)) {
            this.cyclesLeft++;
          }
          return (adr + this.r[X]) & 0xffff;
        }
        case ABY: {
          // absolute, indexed by y (for RMW and writes)
          let adr = this.safeRead(this.br[PC]++);
          adr |= (this.safeRead(this.br[PC]++) << 8);
          return (adr + this.r[Y]) & 0xffff;
        }
        case ABYr: {
          // absolute, indexed by y (for reads)
          let adr = this.safeRead(this.br[PC]++);
          adr |= (this.safeRead(this.br[PC]++) << 8);
          if ((adr >> 8) < ((adr + this.r[Y]) >> 8)) {
            this.cyclesLeft++;
          }
          return (adr + this.r[Y]) & 0xffff;
        }
        case IND: {
          // indirect, doesn't loop pages properly
          let adrl = this.safeRead(this.br[PC]++);
          let adrh = this.safeRead(this.br[PC]++);
          let radr = this.safeRead(adrl | (adrh << 8));
          radr |= (this.safeRead(((adrl + 1) & 0xff) | (adrh << 8))) << 8;
          return radr;
        }
        case REL: {
          // relative to PC, for branches
          let rel = this.safeRead(this.br[PC]++);
          return this.getSigned(rel);
        }
      }
    }

    // instruction functions

    this.uni = function (adr, num) {
      // 未实现指令：直接NOP，兼容VirtuaNES等
      // log("unimplemented instruction " + this.mem.getByteRep(num));
      // 什么都不做，继续执行
    }

    this.ora = function (adr) {
      // ORs A with the value, set Z and N
      this.r[A] |= this.safeRead(adr);
      this.setZandN(this.r[A]);
    }

    this.and = function (adr) {
      // ANDs A with the value, set Z and N
      this.r[A] &= this.safeRead(adr);
      this.setZandN(this.r[A]);
    }

    this.eor = function (adr) {
      // XORs A with the value, set Z and N
      this.r[A] ^= this.safeRead(adr);
      this.setZandN(this.r[A]);
    }

    this.adc = function (adr) {
      // adds the value + C to A, set C, V, Z and N
      let value = this.safeRead(adr);
      let result = this.r[A] + value + (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.v = (
        (this.r[A] & 0x80) === (value & 0x80) &&
        (value & 0x80) !== (result & 0x80)
      );
      this.r[A] = result;
      this.setZandN(this.r[A]);
    }

    this.sbc = function (adr) {
      // subtracts the value + !C from A, set C, V, Z and N
      let value = this.safeRead(adr) ^ 0xff;
      let result = this.r[A] + value + (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.v = (
        (this.r[A] & 0x80) === (value & 0x80) &&
        (value & 0x80) !== (result & 0x80)
      );
      this.r[A] = result;
      this.setZandN(this.r[A]);
    }

    this.cmp = function (adr) {
      // sets C, Z and N according to what A - value would do
      let value = this.safeRead(adr) ^ 0xff;
      let result = this.r[A] + value + 1;
      this.c = result > 0xff;
      this.setZandN(result & 0xff);
    }

    this.cpx = function (adr) {
      // sets C, Z and N according to what X - value would do
      let value = this.safeRead(adr) ^ 0xff;
      let result = this.r[X] + value + 1;
      this.c = result > 0xff;
      this.setZandN(result & 0xff);
    }

    this.cpy = function (adr) {
      // sets C, Z and N according to what Y - value would do
      let value = this.safeRead(adr) ^ 0xff;
      let result = this.r[Y] + value + 1;
      this.c = result > 0xff;
      this.setZandN(result & 0xff);
    }

    this.dec = function (adr) {
      // decrements a memory location, set Z and N
      let result = (this.safeRead(adr) - 1) & 0xff;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.dex = function (adr) {
      // decrements X, set Z and N
      this.r[X]--;
      this.setZandN(this.r[X]);
    }

    this.dey = function (adr) {
      // decrements Y, set Z and N
      this.r[Y]--;
      this.setZandN(this.r[Y]);
    }

    this.inc = function (adr) {
      // increments a memory location, set Z and N
      let result = (this.safeRead(adr) + 1) & 0xff;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.inx = function (adr) {
      // increments X, set Z and N
      this.r[X]++;
      this.setZandN(this.r[X]);
    }

    this.iny = function (adr) {
      // increments Y, set Z and N
      this.r[Y]++;
      this.setZandN(this.r[Y]);
    }

    this.asla = function (adr) {
      // shifts A left 1, set C, Z and N
      let result = this.r[A] << 1;
      this.c = result > 0xff;
      this.setZandN(result);
      this.r[A] = result;
    }

    this.asl = function (adr) {
      // shifts a memory location left 1, set C, Z and N
      let result = this.safeRead(adr) << 1;
      this.c = result > 0xff;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.rola = function (adr) {
      // rolls A left 1, rolls C in, set C, Z and N
      let result = (this.r[A] << 1) | (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.setZandN(result);
      this.r[A] = result;
    }

    this.rol = function (adr) {
      // rolls a memory location left 1, rolls C in, set C, Z and N
      let result = (this.safeRead(adr) << 1) | (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.lsra = function (adr) {
      // shifts A right 1, set C, Z and N
      let carry = this.r[A] & 0x1;
      let result = this.r[A] >> 1;
      this.c = carry > 0;
      this.setZandN(result);
      this.r[A] = result;
    }

    this.lsr = function (adr) {
      // shifts a memory location right 1, set C, Z and N
      let value = this.safeRead(adr);
      let carry = value & 0x1;
      let result = value >> 1;
      this.c = carry > 0;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.rora = function (adr) {
      // rolls A right 1, rolls C in, set C, Z and N
      let carry = this.r[A] & 0x1;
      let result = (this.r[A] >> 1) | ((this.c ? 1 : 0) << 7);
      this.c = carry > 0;
      this.setZandN(result);
      this.r[A] = result;
    }

    this.ror = function (adr) {
      // rolls a memory location right 1, rolls C in, set C, Z and N
      let value = this.safeRead(adr);
      let carry = value & 0x1;
      let result = (value >> 1) | ((this.c ? 1 : 0) << 7);
      this.c = carry > 0;
      this.setZandN(result);
      this.safeWrite(adr, result);
    }

    this.lda = function (adr) {
      // loads a value in a, sets Z and N
      this.r[A] = this.safeRead(adr);
      this.setZandN(this.r[A]);
      // 新增：统计ROM读取（仅ROM区，且nsfPlayer存在）
      if (typeof nsfPlayer !== "undefined" && nsfPlayer && typeof nsfLoaded !== "undefined" && nsfLoaded === true && typeof nsfPaused !== "undefined" && nsfPaused === false && adr >= 0x8000 && adr < 0x10000 && nsfPlayer.romReadStat) {
        nsfPlayer.romReadStat[adr] = (nsfPlayer.romReadStat[adr] || 0) + 1;
      }
      // 
    }

    this.sta = function (adr) {
      // stores a to a memory location
      this.safeWrite(adr, this.r[A]);
    }

    this.ldx = function (adr) {
      // loads x value in a, sets Z and N
      this.r[X] = this.safeRead(adr);
      this.setZandN(this.r[X]);
      // 新增：统计ROM读取（仅ROM区，且nsfPlayer存在）
      if (typeof nsfPlayer !== "undefined" && nsfPlayer && typeof nsfLoaded !== "undefined" && nsfLoaded === true && typeof nsfPaused !== "undefined" && nsfPaused === false && adr >= 0x8000 && adr < 0x10000 && nsfPlayer.romReadStat) {
        nsfPlayer.romReadStat[adr] = (nsfPlayer.romReadStat[adr] || 0) + 1;
      }
    }

    this.stx = function (adr) {
      // stores x to a memory location
      this.safeWrite(adr, this.r[X]);
    }

    this.ldy = function (adr) {
      // loads a value in y, sets Z and N
      this.r[Y] = this.safeRead(adr);
      this.setZandN(this.r[Y]);
      // 新增：统计ROM读取（仅ROM区，且nsfPlayer存在）
      if (typeof nsfPlayer !== "undefined" && nsfPlayer && typeof nsfLoaded !== "undefined" && nsfLoaded === true && typeof nsfPaused !== "undefined" && nsfPaused === false && adr >= 0x8000 && adr < 0x10000 && nsfPlayer.romReadStat) {
        nsfPlayer.romReadStat[adr] = (nsfPlayer.romReadStat[adr] || 0) + 1;
      }
    }

    this.sty = function (adr) {
      // stores y to a memory location
      this.safeWrite(adr, this.r[Y]);
    }

    this.tax = function (adr) {
      // transfers a to x, sets Z and N
      this.r[X] = this.r[A];
      this.setZandN(this.r[X]);
    }

    this.txa = function (adr) {
      // transfers x to a, sets Z and N
      this.r[A] = this.r[X];
      this.setZandN(this.r[A]);
    }

    this.tay = function (adr) {
      // transfers a to y, sets Z and N
      this.r[Y] = this.r[A];
      this.setZandN(this.r[Y]);
    }

    this.tya = function (adr) {
      // transfers y to a, sets Z and N
      this.r[A] = this.r[Y];
      this.setZandN(this.r[A]);
    }

    this.tsx = function (adr) {
      // transfers the stack pointer to x, sets Z and N
      this.r[X] = this.r[SP];
      this.setZandN(this.r[X]);
    }

    this.txs = function (adr) {
      // transfers x to the stack pointer
      this.r[SP] = this.r[X];
    }

    this.pla = function (adr) {
      // pulls a from the stack, sets Z and N
      this.r[A] = this.safeRead(0x100 + ((++this.r[SP]) & 0xff));
      this.setZandN(this.r[A]);
    }

    this.pha = function (adr) {
      // pushes a to the stack
      this.safeWrite(0x100 + this.r[SP]--, this.r[A]);
    }

    this.plp = function (adr) {
      // pulls the flags from the stack
      this.setP(this.safeRead(0x100 + ((++this.r[SP]) & 0xff)));
    }

    this.php = function (adr) {
      // pushes the flags to the stack
      this.safeWrite(0x100 + this.r[SP]--, this.getP(true));
    }

    this.bpl = function (adr) {
      // branches if N is 0
      this.doBranch(!this.n, adr);
    }

    this.bmi = function (adr) {
      // branches if N is 1
      this.doBranch(this.n, adr);
    }

    this.bvc = function (adr) {
      // branches if V is 0
      this.doBranch(!this.v, adr);
    }

    this.bvs = function (adr) {
      // branches if V is 1
      this.doBranch(this.v, adr);
    }

    this.bcc = function (adr) {
      // branches if C is 0
      this.doBranch(!this.c, adr);
    }

    this.bcs = function (adr) {
      // branches if C is 1
      this.doBranch(this.c, adr);
    }

    this.bne = function (adr) {
      // branches if Z is 0
      this.doBranch(!this.z, adr);
    }

    this.beq = function (adr) {
      // branches if Z is 1
      this.doBranch(this.z, adr);
    }

    this.brk = function (adr) {
      // break to irq handler
      let pushPc = (this.br[PC] + 1) & 0xffff;
      this.safeWrite(0x100 + this.r[SP]--, pushPc >> 8);
      this.safeWrite(0x100 + this.r[SP]--, pushPc & 0xff);
      this.safeWrite(0x100 + this.r[SP]--, this.getP(true));
      this.i = true;
      this.br[PC] = this.safeRead(0xfffe) | (this.safeRead(0xffff) << 8);
    }

    this.rti = function (adr) {
      // return from interrupt
      this.setP(this.safeRead(0x100 + ((++this.r[SP]) & 0xff)));
      let pullPc = this.safeRead(0x100 + ((++this.r[SP]) & 0xff));
      pullPc |= (this.safeRead(0x100 + ((++this.r[SP]) & 0xff)) << 8);
      this.br[PC] = pullPc;
    }

    this.jsr = function (adr) {
      // jump to subroutine
      let pushPc = (this.br[PC] - 1) & 0xffff;
      this.safeWrite(0x100 + this.r[SP]--, pushPc >> 8);
      this.safeWrite(0x100 + this.r[SP]--, pushPc & 0xff);
      this.br[PC] = adr;
    }

    this.rts = function (adr) {
      // return from subroutine
      let pullPc = this.safeRead(0x100 + ((++this.r[SP]) & 0xff));
      pullPc |= (this.safeRead(0x100 + ((++this.r[SP]) & 0xff)) << 8);
      this.br[PC] = pullPc + 1;
    }

    this.jmp = function (adr) {
      // jump to address
      this.br[PC] = adr;
    }

    this.bit = function (adr) {
      // bit test A with value, set N to b7, V to b6 and Z to result
      let value = this.safeRead(adr);
      this.n = (value & 0x80) > 0;
      this.v = (value & 0x40) > 0;
      let res = this.r[A] & value;
      this.z = res === 0;
    }

    this.clc = function (adr) {
      // clear carry flag
      this.c = false;
    }

    this.sec = function (adr) {
      // set carry flag
      this.c = true;
    }

    this.cld = function (adr) {
      // clear decimal flag
      this.d = false;
    }

    this.sed = function (adr) {
      // set decimal flag
      this.d = true;
    }

    this.cli = function (adr) {
      // clear interrupt flag
      this.i = false;
    }

    this.sei = function (adr) {
      // set interrupt flag
      this.i = true;
    }

    this.clv = function (adr) {
      // clear overflow flag
      this.v = false;
    }

    this.nop = function (adr) {
      // no operation
    }

    this.irq = function (adr) {
      // handle irq interrupt
      let pushPc = this.br[PC];
      this.safeWrite(0x100 + this.r[SP]--, pushPc >> 8);
      this.safeWrite(0x100 + this.r[SP]--, pushPc & 0xff);
      this.safeWrite(0x100 + this.r[SP]--, this.getP(false));
      this.i = true;
      this.br[PC] = this.safeRead(0xfffe) | (this.safeRead(0xffff) << 8);
    }

    this.nmi = function (adr) {
      // handle nmi interrupt
      let pushPc = this.br[PC];
      this.safeWrite(0x100 + this.r[SP]--, pushPc >> 8);
      this.safeWrite(0x100 + this.r[SP]--, pushPc & 0xff);
      this.safeWrite(0x100 + this.r[SP]--, this.getP(false));
      this.i = true;
      this.br[PC] = this.safeRead(0xfffa) | (this.safeRead(0xfffb) << 8);
    }

    // undocumented opcodes

    this.kil = function (adr) {
      // stop the cpu
      this.cyclesLeft = 1; // consume one cycle
    }

    this.slo = function (adr) {
      // shifts a memory location left 1, ORs a with the result, sets N, Z and C
      let result = this.safeRead(adr) << 1;
      this.c = result > 0xff;
      this.safeWrite(adr, result);
      this.r[A] |= result;
      this.setZandN(this.r[A]);
    }

    this.rla = function (adr) {
      // rolls a memory location left 1, ANDs a with the result, sets N, Z and C
      let result = (this.safeRead(adr) << 1) | (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.safeWrite(adr, result);
      this.r[A] &= result;
      this.setZandN(this.r[A]);
    }

    this.sre = function (adr) {
      // shifts a memory location right 1, XORs A with the result, sets N, Z and C
      let value = this.safeRead(adr);
      let carry = value & 0x1;
      let result = value >> 1;
      this.c = carry > 0;
      this.safeWrite(adr, result);
      this.r[A] ^= result;
      this.setZandN(this.r[A]);
    }

    this.rra = function (adr) {
      // rolls a memory location right 1, adds the result to A, sets N, Z, C and V
      let value = this.safeRead(adr);
      let carry = value & 0x1;
      let result = (value >> 1) | ((this.c ? 1 : 0) << 7);
      this.safeWrite(adr, result);
      let addResult = this.r[A] + result + carry;
      this.c = addResult > 0xff;
      this.v = (
        (this.r[A] & 0x80) === (result & 0x80) &&
        (result & 0x80) !== (addResult & 0x80)
      );
      this.r[A] = addResult;
      this.setZandN(this.r[A]);
    }

    this.sax = function (adr) {
      // stores A ANDed with X to a memory location
      this.safeWrite(adr, this.r[A] & this.r[X]);
    }

    this.lax = function (adr) {
      // loads A and X with a value
      this.r[A] = this.safeRead(adr);
      this.r[X] = this.r[A];
      this.setZandN(this.r[X]);
    }

    this.dcp = function (adr) {
      // decrement a memory location, and sets C, Z and N to what A - result does
      let value = (this.safeRead(adr) - 1) & 0xff;
      this.safeWrite(adr, value);
      value ^= 0xff;
      let result = this.r[A] + value + 1;
      this.c = result > 0xff;
      this.setZandN(result & 0xff);
    }

    this.isc = function (adr) {
      // increments a memory location, and subtract it+!C from A, sets Z, N, V, C
      let value = (this.safeRead(adr) + 1) & 0xff;
      this.safeWrite(adr, value);
      value ^= 0xff;
      let result = this.r[A] + value + (this.c ? 1 : 0);
      this.c = result > 0xff;
      this.v = (
        (this.r[A] & 0x80) === (value & 0x80) &&
        (value & 0x80) !== (result & 0x80)
      );
      this.r[A] = result;
      this.setZandN(this.r[A]);
    }

    this.anc = function (adr) {
      // ANDs a with the value, sets Z and N, then sets C to N
      this.r[A] &= this.safeRead(adr);
      this.setZandN(this.r[A]);
      this.c = this.n;
    }

    this.alr = function (adr) {
      // ANDs a with the value, then shifts A right 1, sets C, Z and N
      this.r[A] &= this.safeRead(adr);
      let carry = this.r[A] & 0x1;
      let result = this.r[A] >> 1;
      this.c = carry > 0;
      this.setZandN(result);
      this.r[A] = result;
    }

    this.arr = function (adr) {
      // ANDs a with the value, then rolls A right 1, sets Z, N, C and V oddly
      this.r[A] &= this.safeRead(adr);
      let result = (this.r[A] >> 1) | ((this.c ? 1 : 0) << 7);
      this.setZandN(result);
      this.c = (result & 0x40) > 0;
      this.v = ((result & 0x40) ^ ((result & 0x20) << 1)) > 0;
      this.r[A] = result;
    }

    this.axs = function (adr) {
      // sets X to A ANDed with X minus the value, sets N, Z and C
      let value = this.safeRead(adr) ^ 0xff;
      let andedA = this.r[A] & this.r[X];
      let result = andedA + value + 1;
      this.c = result > 0xff;
      this.r[X] = result;
      this.setZandN(this.r[X]);
    }

    this.ane = function (adr) {
      // ANE #$??
      let value = this.safeRead(adr);
      this.r[A] = (this.r[A] | 0xEE) & this.r[X] & value;
      this.setZandN(this.r[A]);
    }

    this.asr = function (adr) {
      // ASR #$??
      let value = this.safeRead(adr);
      this.r[A] &= value;
      let carry = this.r[A] & 0x1;
      this.r[A] >>= 1;
      this.c = carry > 0;
      this.setZandN(this.r[A]);
    }

    this.las = function (adr) {
      // LAS $????,Y
      let value = this.safeRead(adr);
      this.r[A] = this.r[X] = this.r[SP] = this.r[SP] & value;
      this.setZandN(this.r[A]);
    }

    this.lxa = function (adr) {
      // LXA #$??
      let value = this.safeRead(adr);
      this.r[A] = this.r[X] = (this.r[A] | 0xEE) & value;
      this.setZandN(this.r[A]);
    }

    this.sbx = function (adr) {
      // SBX #$??
      let value = this.safeRead(adr);
      let temp = this.r[A] & this.r[X];
      let result = temp - value;
      this.c = result >= 0;
      this.r[X] = result & 0xff;
      this.setZandN(this.r[X]);
    }

    this.sha = function (adr) {
      // SHA $????,Y
      let value = this.r[A] & this.r[X] & ((adr >> 8) + 1);
      this.safeWrite(adr, value);
    }

    this.shs = function (adr) {
      // SHS $????,Y
      this.r[SP] = this.r[A] & this.r[X];
      let value = this.r[SP] & ((adr >> 8) + 1);
      this.safeWrite(adr, value);
    }

    this.shx = function (adr) {
      // SHX $????,Y
      let value = this.r[X] & ((adr >> 8) + 1);
      this.safeWrite(adr, value);
    }

    this.shy = function (adr) {
      // SHY $????,X
      let value = this.r[Y] & ((adr >> 8) + 1);
      this.safeWrite(adr, value);
    }

    this.dop = function (adr) {
      // Double NOP
    }

    this.dop3 = function (adr) {
      // Double NOP 3 cycles
    }

    this.dop4 = function (adr) {
      // Double NOP 4 cycles
    }

    this.top = function (adr) {
      // Triple NOP
    }

    this.jam = function (adr) {
      // JAM
      this.br[PC]--;
      // [调试钩子] 执行到非法停机指令=游戏代码跳飞的第一现场：
      // 记录 PC/寄存器和栈上残留的返回地址链，供定位跳飞来源。只记第一次。
      try {
        if (typeof window !== 'undefined' && window.__jamTrap === undefined) {
          const chain = [];
          let p = (this.r[3] + 1) & 0xff;
          for (let i = 0; i < 32; i++) {
            const lo = this.safeRead(0x0100 + p);
            const hi = this.safeRead(0x0100 + ((p + 1) & 0xff));
            chain.push((hi << 8) | lo);
            p = (p + 2) & 0xff;
          }
          window.__jamTrap = { // window.__jamTrap——包括 PC、A/X/Y/SP 和栈上 32 个残留返回地址（跳飞瞬间的调用链）。
            pc: this.br[PC],
            a: this.r[0], x: this.r[1], y: this.r[2], sp: this.r[3],
            stack: chain,
            time: new Date().toLocaleTimeString()
          };
        }
      } catch (e) { /* 忽略钩子异常，不影响模拟 */ }
    }

    this.uni = function (eff, instr) {
      // unimplemented instruction, do nothing
    }

    // function table
    this.functions = [
      //x0      x1        x2        x3        x4        x5        x6        x7        x8        x9        xa        xb        xc        xd        xe        xf
      this.brk, this.ora, this.jam, this.slo, this.dop3, this.ora, this.asl, this.slo, this.php, this.ora, this.asla, this.anc, this.top, this.ora, this.asl, this.slo, //0x
      this.bpl, this.ora, this.jam, this.slo, this.dop4, this.ora, this.asl, this.slo, this.clc, this.ora, this.nop, this.slo, this.top, this.ora, this.asl, this.slo, //1x
      this.jsr, this.and, this.jam, this.rla, this.bit, this.and, this.rol, this.rla, this.plp, this.and, this.rola, this.anc, this.bit, this.and, this.rol, this.rla, //2x
      this.bmi, this.and, this.jam, this.rla, this.dop4, this.and, this.rol, this.rla, this.sec, this.and, this.nop, this.rla, this.top, this.and, this.rol, this.rla, //3x
      this.rti, this.eor, this.jam, this.sre, this.dop3, this.eor, this.lsr, this.sre, this.pha, this.eor, this.lsra, this.asr, this.jmp, this.eor, this.lsr, this.sre, //4x
      this.bvc, this.eor, this.jam, this.sre, this.dop4, this.eor, this.lsr, this.sre, this.cli, this.eor, this.nop, this.sre, this.top, this.eor, this.lsr, this.sre, //5x
      this.rts, this.adc, this.jam, this.rra, this.dop3, this.adc, this.ror, this.rra, this.pla, this.adc, this.rora, this.arr, this.jmp, this.adc, this.ror, this.rra, //6x
      this.bvs, this.adc, this.jam, this.rra, this.dop4, this.adc, this.ror, this.rra, this.sei, this.adc, this.nop, this.rra, this.top, this.adc, this.ror, this.rra, //7x
      this.dop, this.sta, this.dop, this.sax, this.sty, this.sta, this.stx, this.sax, this.dey, this.dop, this.txa, this.ane, this.sty, this.sta, this.stx, this.sax, //8x
      this.bcc, this.sta, this.jam, this.uni, this.sty, this.sta, this.stx, this.sax, this.tya, this.sta, this.txs, this.shs, this.shy, this.sta, this.shx, this.sha, //9x
      this.ldy, this.lda, this.ldx, this.lax, this.ldy, this.lda, this.ldx, this.lax, this.tay, this.lda, this.tax, this.lxa, this.ldy, this.lda, this.ldx, this.lax, //ax
      this.bcs, this.lda, this.jam, this.lax, this.ldy, this.lda, this.ldx, this.lax, this.clv, this.lda, this.tsx, this.las, this.ldy, this.lda, this.ldx, this.lax, //bx
      this.cpy, this.cmp, this.dop, this.dcp, this.cpy, this.cmp, this.dec, this.dcp, this.iny, this.cmp, this.dex, this.sbx, this.cpy, this.cmp, this.dec, this.dcp, //cx
      this.bne, this.cmp, this.jam, this.dcp, this.dop4, this.cmp, this.dec, this.dcp, this.cld, this.cmp, this.nop, this.dcp, this.top, this.cmp, this.dec, this.dcp, //dx
      this.cpx, this.sbc, this.dop, this.isc, this.cpx, this.sbc, this.inc, this.isc, this.inx, this.sbc, this.nop, this.sbc, this.cpx, this.sbc, this.inc, this.isc, //ex
      this.beq, this.sbc, this.jam, this.isc, this.dop4, this.sbc, this.inc, this.isc, this.sed, this.sbc, this.nop, this.isc, this.top, this.sbc, this.inc, this.isc, //fx
      this.nmi, this.irq // 0x100: NMI, 0x101: IRQ
    ];

  }
})()
