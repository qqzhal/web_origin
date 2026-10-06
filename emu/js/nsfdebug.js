// NSF调试器（简化版，依赖nsfPlayer）

window.nsfDebugger = {
  _panel: null,
  _breakpoints: [],
  _memBreakpoints: [],
  _condBreakpoints: [], // 条件断点表达式数组
  _instrExecStat: {},   // 指令执行统计
  _disasmBase: 0,       // 反汇编起始地址
  _interval: null,
  _running: false,
  _opNames: [
    "brk", "ora", "kil", "slo", "nop", "ora", "asl", "slo", "php", "ora", "asl", "anc", "nop", "ora", "asl", "slo", //0x
    "bpl", "ora", "kil", "slo", "nop", "ora", "asl", "slo", "clc", "ora", "nop", "slo", "nop", "ora", "asl", "slo", //1x
    "jsr", "and", "kil", "rla", "bit", "and", "rol", "rla", "plp", "and", "rol", "anc", "bit", "and", "rol", "rla", //2x
    "bmi", "and", "kil", "rla", "nop", "and", "rol", "rla", "sec", "and", "nop", "rla", "nop", "and", "rol", "rla", //3x
    "rti", "eor", "kil", "sre", "nop", "eor", "lsr", "sre", "pha", "eor", "lsr", "alr", "jmp", "eor", "lsr", "sre", //4x
    "bvc", "eor", "kil", "sre", "nop", "eor", "lsr", "sre", "cli", "eor", "nop", "sre", "nop", "eor", "lsr", "sre", //5x
    "rts", "adc", "kil", "rra", "nop", "adc", "ror", "rra", "pla", "adc", "ror", "arr", "jmp", "adc", "ror", "rra", //6x
    "bvs", "adc", "kil", "rra", "nop", "adc", "ror", "rra", "sei", "adc", "nop", "rra", "nop", "adc", "ror", "rra", //7x
    "nop", "sta", "nop", "sax", "sty", "sta", "stx", "sax", "dey", "nop", "txa", "uni", "sty", "sta", "stx", "sax", //8x
    "bcc", "sta", "kil", "uni", "sty", "sta", "stx", "sax", "tya", "sta", "txs", "uni", "uni", "sta", "uni", "uni", //9x
    "ldy", "lda", "ldx", "lax", "ldy", "lda", "ldx", "lax", "tay", "lda", "tax", "uni", "ldy", "lda", "ldx", "lax", //ax
    "bcs", "lda", "kil", "lax", "ldy", "lda", "ldx", "lax", "clv", "lda", "tsx", "uni", "ldy", "lda", "ldx", "lax", //bx
    "cpy", "cmp", "nop", "dcp", "cpy", "cmp", "dec", "dcp", "iny", "cmp", "dex", "axs", "cpy", "cmp", "dec", "dcp", //cx
    "bne", "cmp", "kil", "dcp", "nop", "cmp", "dec", "dcp", "cld", "cmp", "nop", "dcp", "nop", "cmp", "dec", "dcp", //dx
    "cpx", "sbc", "nop", "isc", "cpx", "sbc", "inc", "isc", "inx", "sbc", "nop", "sbc", "cpx", "sbc", "inc", "isc", //ex
    "beq", "sbc", "kil", "isc", "nop", "sbc", "inc", "isc", "sed", "sbc", "nop", "isc", "nop", "sbc", "inc", "isc", //fx
  ],
  _opLengths: [1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 0, 3, 2, 2, 3, 3],
  _addressingModes: null,
  init: function (panel) {
    this._panel = panel;
    panel.innerHTML = `<div style="color:#FFD700;">
      <div style="margin-bottom:6px;">
        <button id="nsfdbg-step">单步</button>
        <button id="nsfdbg-run">运行</button>
        <button id="nsfdbg-pause">暂停</button>
        <span id="nsfdbg-bplist" style="margin-left:8px;font-size:12px;color:#FFD700;"></span>
        <span style="margin-left:18px;">内存断点:</span>
        <input id="nsfdbg-membp" type="text" style="width:60px;" maxlength="4">
        <button id="nsfdbg-addmembp">添加</button>
        <span id="nsfdbg-membplist" style="margin-left:8px;font-size:12px;color:#FFD700;"></span>
      </div>
      <div style="margin-bottom:6px;">
        <span>反汇编跳转:</span>
        <input id="nsfdbg-disjmp" type="text" style="width:70px;" maxlength="6" placeholder="地址">
        <button id="nsfdbg-disjmp-btn">跳转</button>
        <button id="nsfdbg-export-disasm" style="margin-left:12px;">导出反汇编</button>
      </div>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;min-width:220px;">
          <b>APU寄存器</b>
          <pre id="nsfdbg-apu" style="background:#222;color:#5fcf5b;padding:4px 8px;font-size:13px;border-radius:4px;margin-bottom:6px;"></pre>
        </div>
        <div style="flex:1;min-width:180px;">
          <b>CPU寄存器</b>
          <pre id="nsfdbg-cpu" style="background:#222;color:#FFD700;padding:4px 8px;font-size:13px;border-radius:4px;margin-bottom:6px;"></pre>
        </div>
      </div>
      <div style="margin-top:0px;">
        <b>内存 (0x0000-0xFFFF)</b>
        <span style="font-size:12px;margin-left:8px;">
          <span style="color:#5fcf5b;">绿色=读</span>
          <span style="color:#FFA500;margin-left:8px;">橙色=写</span>
          <span style="color:#FF5555;margin-left:8px;">红色=执行</span>
        </span>
        <pre id="nsfdbg-ram" style="background:#222;color:#FFD700;padding:4px 8px;font-size:13px;border-radius:4px;max-height:120px;overflow:auto;"></pre>
      </div>
      <div style="margin-top:8px;">
        <div style="font-family:monospace;font-size:13px;display:grid;grid-template-columns:3ch 7ch 10ch 14ch 18ch 12ch;">
          <span>标</span><span>地址</span><span>机器码</span><span>指令</span><span>注释</span><span>静态地址</span>
        </div>
        <pre id="nsfdbg-disasm" style="background:#222;color:#FFD700;padding:4px 8px;font-size:13px;font-family:monospace;border-radius:4px;max-height:220px;overflow:auto;"></pre>
      </div>
      <div style="margin-top:8px;">
        <b>内存断点列表:</b>
        <span id="nsfdbg-membp-list"></span>
      </div>
    </div>`;
    panel.querySelector("#nsfdbg-step").onclick = () => this.step();
    panel.querySelector("#nsfdbg-run").onclick = () => this.run();
    panel.querySelector("#nsfdbg-pause").onclick = () => this.pause();

    panel.querySelector("#nsfdbg-addmembp").onclick = () => {
      let v = panel.querySelector("#nsfdbg-membp").value.trim();
      if (/^[0-9a-fA-F]{1,4}$/.test(v)) {
        let addr = parseInt(v, 16);
        if (!this._memBreakpoints.includes(addr)) this._memBreakpoints.push(addr);
        this.updateMemBpList();
      }
    };
    panel.querySelector("#nsfdbg-disjmp-btn").onclick = () => {
      let v = panel.querySelector("#nsfdbg-disjmp").value.trim();
      let addr = parseInt(v, 16);
      if (!isNaN(addr) && addr >= 0 && addr <= 0xFFFF) {
        this._disasmBase = addr;
        this.refresh();
      }
    };
    panel.querySelector("#nsfdbg-export-disasm").onclick = () => {
      let lines = this._getDisasmLines(0x8000, 0x10000);
      let blob = new Blob([lines.join("\n")], { type: "text/plain" });
      let url = URL.createObjectURL(blob);
      let a = document.createElement("a");
      a.href = url;
      a.download = "nsf_disasm.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    this.updateMemBpList();
    this.refresh();

    if (!this._interval && !nsfPaused) {
      this.run();
    }
  },
  updateList: function (selector, arr, renderFn) {
    let el = this._panel.querySelector(selector);
    if (!el) return;
    el.innerHTML = arr.map((item, i) => renderFn(item, i)).join("");
    el.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        let idx = +btn.dataset.idx;
        arr.splice(idx, 1);
        this.refresh();
      };
    });
    // 支持点击跳转
    el.querySelectorAll(".nsfdbg-jump").forEach(span => {
      span.onclick = () => {
        let addr = parseInt(span.dataset.addr);
        if (!isNaN(addr)) {
          // 跳转到目标地址，PC在32行最后一行
          this._disasmBase = addr;
          this.refresh();
        }
      };
    });
  },

  updateMemBpList: function () {

    // 兼容原有内存断点详细列表
    let listEl = this._panel.querySelector("#nsfdbg-membp-list");
    if (listEl) {
      listEl.innerHTML = this._memBreakpoints.map((a, i) =>
        `<span style="margin-right:8px;">
          <span class="nsfdbg-jump" data-addr="${a}" style="cursor:pointer;text-decoration:underline;color:#FFD700;">${a.toString(16).toUpperCase().padStart(4, "0")}</span>
          <button data-idx="${i}" style="color:red;">删除</button>
        </span>`
      ).join("");
      listEl.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          let idx = +btn.dataset.idx;
          this._memBreakpoints.splice(idx, 1);
          this.updateMemBpList();
        };
      });
      listEl.querySelectorAll(".nsfdbg-jump").forEach(span => {
        span.onclick = () => {
          let addr = parseInt(span.dataset.addr);
          if (!isNaN(addr)) {
            this._disasmBase = addr;
            this.refresh();
          }
        };
      });
    }
  },
  refresh: function () {
    if (!nsfPlayer) return;
    let cpu = nsfPlayer?.cpu;
    if (!cpu) return;
    let cpuStr = `A:${cpu.r[0].toString(16).padStart(2, "0").toUpperCase()} X:${cpu.r[1].toString(16).padStart(2, "0").toUpperCase()} Y:${cpu.r[2].toString(16).toUpperCase()}\n`;
    cpuStr += `SP:${cpu.r[3].toString(16).padStart(2, "0").toUpperCase()} PC:${cpu.br[0].toString(16).padStart(4, "0").toUpperCase()}\n`;
    cpuStr += `N:${cpu.n ? 1 : 0} V:${cpu.v ? 1 : 0} D:${cpu.d ? 1 : 0} I:${cpu.i ? 1 : 0} Z:${cpu.z ? 1 : 0} C:${cpu.c ? 1 : 0}`;
    this._panel.querySelector("#nsfdbg-cpu").textContent = cpuStr;
    let apu = nsfPlayer?.apu;
    let apuStr = "";
    if (apu) {
      apuStr += `Pulse1: Timer=${apu.p1Timer} Vol=${apu.p1Volume} Cnt=${apu.p1Counter} Freq=${apu.p1Timer > 7 ? (1789773 / (16 * (apu.p1Timer + 1))).toFixed(1) : "-"}\n`;
      apuStr += `Pulse2: Timer=${apu.p2Timer} Vol=${apu.p2Volume} Cnt=${apu.p2Counter} Freq=${apu.p2Timer > 7 ? (1789773 / (16 * (apu.p2Timer + 1))).toFixed(1) : "-"}\n`;
      apuStr += `Triangle: Timer=${apu.triTimer} Cnt=${apu.triCounter} Freq=${apu.triTimer > 7 ? (1789773 / (32 * (apu.triTimer + 1))).toFixed(1) : "-"}\n`;
      apuStr += `Noise: Timer=${apu.noiseTimer} Vol=${apu.noiseVolume} Cnt=${apu.noiseCounter}\n`;
      apuStr += `DMC: Addr=$${(apu.dmcAddress || 0).toString(16).padStart(4, "0").toUpperCase()} BytesLeft=${apu.dmcBytesLeft}\n`;
    }
    this._panel.querySelector("#nsfdbg-apu").textContent = apuStr;



    // 分块渲染RAM和反汇编
    if (window.nsfDebugPL) {
      window.nsfDebugPL.renderRam(this._panel, nsfPlayer);
      // 停止刷新时不刷新反汇编
      if (this._stopRefresh) return;
      // 跟随PC自动滚动
      let base, scrollToPc = false;
      if (typeof this._disasmBase === "number" && this._disasmBase >= 0 && this._disasmBase <= 0xFFFF) {
        // 跳转/单步/断点命中时，PC在最后一行
        base = this._disasmBase;
        scrollToPc = true;
      } else {
        // 普通刷新时，PC在最后一行
        base = cpu.br[0];
        scrollToPc = true;
      }
      window.nsfDebugPL.renderDisasm(this._panel, nsfPlayer, this._opNames, this._opLengths, this._addressingModes, this._instrStr.bind(this), this._getVirtuaNESComment.bind(this), base, scrollToPc);
    }
  },
  _instrStr: function (adr, op, mode) {
    let opName = this._opNames[op] || "???";
    let i1 = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
    let i2 = i1 | (nsfPlayer.mapper.read((adr + 2) & 0xFFFF) << 8);
    let relVal = i1 > 0x7f ? i1 - 0x100 : i1;
    relVal += adr + 2;
    switch (mode) {
      case 0: return `${opName}`;
      case 1: return `${opName} #$${i1.toString(16).padStart(2, "0").toUpperCase()}`;
      case 2: return `${opName} $${i1.toString(16).padStart(2, "0").toUpperCase()}`;
      case 3: return `${opName} $${i1.toString(16).padStart(2, "0").toUpperCase()},x`;
      case 4: return `${opName} $${i1.toString(16).padStart(2, "0").toUpperCase()},y`;
      case 5: return `${opName} ($${i1.toString(16).padStart(2, "0").toUpperCase()},x)`;
      case 6: return `${opName} ($${i1.toString(16).padStart(2, "0").toUpperCase()}),y`;
      case 7: return `${opName} $${i2.toString(16).padStart(4, "0").toUpperCase()}`;
      case 8: return `${opName} $${i2.toString(16).padStart(4, "0").toUpperCase()},x`;
      case 9: return `${opName} $${i2.toString(16).padStart(4, "0").toUpperCase()},y`;
      case 10: return `?`;
      case 11: return `${opName} ($${i2.toString(16).padStart(4, "0").toUpperCase()})`;
      case 12: return `${opName} $${(relVal & 0xFFFF).toString(16).padStart(4, "0").toUpperCase()}`;
      case 13: return `${opName} ($${i1.toString(16).padStart(2, "0").toUpperCase()}),y`;
      case 14: return `${opName} $${i2.toString(16).padStart(4, "0").toUpperCase()},x`;
      case 15: return `${opName} $${i2.toString(16).padStart(4, "0").toUpperCase()},y`;
      default: return opName;
    }
  },
  _getVirtuaNESComment: function (adr, op, mode) {
    let opName = this._opNames[op] || "???";
    let i1 = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
    let i2 = i1 | (nsfPlayer.mapper.read((adr + 2) & 0xFFFF) << 8);
    if (opName === "lda") {
      if (mode === 1) return `A=${i1.toString(16).toUpperCase().padStart(2, "0")}`;
      if (mode === 2) return `A=[00${i1.toString(16).toUpperCase()}]`;
      if (mode === 7) return `A=[${i2.toString(16).toUpperCase().padStart(4, "0")}]`;
      if (mode === 3) return `A=[00${i1.toString(16).toUpperCase()}+X]`;
      if (mode === 4) return `A=[00${i1.toString(16).toUpperCase()}+Y]`;
      if (mode === 8) return `A=[${i2.toString(16).toUpperCase().padStart(4, "0")}+X]`;
      if (mode === 9) return `A=[${i2.toString(16).toUpperCase().padStart(4, "0")}+Y]`;
      if (mode === 5) return `A=[(${i1.toString(16).toUpperCase()}+X)]`;
      if (mode === 6) return `A=[(${i1.toString(16).toUpperCase()})+Y]`;
      if (mode === 11) return `A=[(${i2.toString(16).toUpperCase().padStart(4, "0")})]`;
    }
    if (opName === "sta") {
      if (mode === 2) return `[00${i1.toString(16).toUpperCase()}]=A`;
      if (mode === 7) return `[${i2.toString(16).toUpperCase().padStart(4, "0")}]=A`;
      if (mode === 3) return `[00${i1.toString(16).toUpperCase()}+X]=A`;
      if (mode === 4) return `[00${i1.toString(16).toUpperCase()}+Y]=A`;
      if (mode === 8) return `[${i2.toString(16).toUpperCase().padStart(4, "0")}+X]=A`;
      if (mode === 9) return `[${i2.toString(16).toUpperCase().padStart(4, "0")}+Y]=A`;
      if (mode === 5) return `[(${i1.toString(16).toUpperCase()}+X)]=A`;
      if (mode === 6) return `[(${i1.toString(16).toUpperCase()})+Y]=A`;
      if (mode === 11) return `[(${i2.toString(16).toUpperCase().padStart(4, "0")})]=A`;
    }
    if (opName === "ldx") {
      if (mode === 1) return `X=${i1.toString(16).toUpperCase()}`;
      if (mode === 2) return `X=[00${i1.toString(16).toUpperCase()}]`;
      if (mode === 7) return `X=[${i2.toString(16).toUpperCase().padStart(4, "0")}]`;
      if (mode === 4) return `X=[00${i1.toString(16).toUpperCase()}+Y]`;
      if (mode === 9) return `X=[${i2.toString(16).toUpperCase().padStart(4, "0")}+Y]`;
    }
    if (opName === "ldy") {
      if (mode === 1) return `Y=${i1.toString(16).toUpperCase()}`;
      if (mode === 2) return `Y=[00${i1.toString(16).toUpperCase()}]`;
      if (mode === 7) return `Y=[${i2.toString(16).toUpperCase().padStart(4, "0")}]`;
      if (mode === 3) return `Y=[00${i1.toString(16).toUpperCase()}+X]`;
      if (mode === 8) return `Y=[${i2.toString(16).toUpperCase().padStart(4, "0")}+X]`;
    }
    if (opName === "stx") {
      if (mode === 2) return `[00${i1.toString(16).toUpperCase()}]=X`;
      if (mode === 7) return `[${i2.toString(16).toUpperCase().padStart(4, "0")}]=X`;
      if (mode === 4) return `[00${i1.toString(16).toUpperCase()}+Y]=X`;
    }
    if (opName === "sty") {
      if (mode === 2) return `[00${i1.toString(16).toUpperCase()}]=Y`;
      if (mode === 7) return `[${i2.toString(16).toUpperCase().padStart(4, "0")}]=Y`;
      if (mode === 3) return `[00${i1.toString(16).toUpperCase()}+X]=Y`;
    }
    if (opName === "tax") return "X=A";
    if (opName === "txa") return "A=X";
    if (opName === "tay") return "Y=A";
    if (opName === "tya") return "A=Y";
    if (opName === "tsx") return "X=SP";
    if (opName === "txs") return "SP=X";
    if (opName === "inx") return "X=X+1";
    if (opName === "iny") return "Y=Y+1";
    if (opName === "dex") return "X=X-1";
    if (opName === "dey") return "Y=Y-1";
    if (opName === "inc") return "[mem]=[mem]+1";
    if (opName === "dec") return "[mem]=[mem]-1";
    if (opName === "cmp" && mode === 1) return `A与${i1.toString(16).toUpperCase()}比较`;
    if (opName === "cmp") return "A与M比较";
    if (opName === "cpx") return "X与M比较";
    if (opName === "cpy") return "Y与M比较";
    if (opName === "bpl") return "N=0?跳转";
    if (opName === "bmi") return "N=1?跳转";
    if (opName === "bvc") return "V=0?跳转";
    if (opName === "bvs") return "V=1?跳转";
    if (opName === "bcc") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `C=0?跳转${target.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (opName === "bcs") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `C=1?跳转${target.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (opName === "beq") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `Z=1?跳转${target.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (opName === "bne") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `Z=0?跳转${target.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (opName === "jsr") return `调用${i2.toString(16).toUpperCase().padStart(4, "0")}`;
    if (opName === "jmp") return `跳转${i2.toString(16).toUpperCase().padStart(4, "0")}`;
    if (opName === "rts") return "子程序返回";
    if (opName === "rti") return "中断返回";
    if (opName === "php") return "P→栈";
    if (opName === "plp") return "P=栈顶";
    if (opName === "pha") return "A→栈";
    if (opName === "pla") return "A=栈顶";
    if (opName === "clc") return "C=0";
    if (opName === "sec") return "C=1";
    if (opName === "cld") return "D=0";
    if (opName === "sed") return "D=1";
    if (opName === "cli") return "I=0";
    if (opName === "sei") return "I=1";
    if (opName === "clv") return "V=0";
    if (opName === "adc") return "A=A+M+C";
    if (opName === "sbc") return "A=A-M-C";
    if (opName === "and") return "A=A&M";
    if (opName === "ora") return "A=A|M";
    if (opName === "eor") return "A=A^M";
    if (opName === "nop") return "无操作";
    if (opName === "brk") return "中断";
    if (opName === "kil") return "非法指令";
    if (opName === "slo") return "非法指令";
    if (opName === "rla") return "非法指令";
    if (opName === "sre") return "非法指令";
    if (opName === "rra") return "非法指令";
    if (opName === "sax") return "非法指令";
    if (opName === "lax") return "非法指令";
    if (opName === "dcp") return "非法指令";
    if (opName === "isc") return "非法指令";
    if (opName === "arr") return "非法指令";
    if (opName === "anc") return "非法指令";
    if (opName === "alr") return "非法指令";
    if (opName === "axs") return "非法指令";
    if (opName === "ahx") return "非法指令";
    if (opName === "shx") return "非法指令";
    if (opName === "shy") return "非法指令";
    if (opName === "tas") return "非法指令";
    if (opName === "xaa") return "非法指令";
    if (opName === "las") return "非法指令";
    if (opName === "isb") return "非法指令";
    if (opName === "jam") return "非法指令";
    if (opName === "uni") return "未定义指令";
    return "";
  },
  _checkBreak: function (cpu) {
    if (this._breakpoints.length && this._breakpoints.includes(cpu.br[0])) return true;
    for (let expr of this._condBreakpoints) {
      try {
        let ctx = {
          PC: cpu.br[0], A: cpu.r[0], X: cpu.r[1], Y: cpu.r[2], SP: cpu.r[3],
          N: cpu.n ? 1 : 0, V: cpu.v ? 1 : 0, D: cpu.d ? 1 : 0, I: cpu.i ? 1 : 0, Z: cpu.z ? 1 : 0, C: cpu.c ? 1 : 0
        };
        if (Function) {
          let fn = Function(...Object.keys(ctx), "return (" + expr.replace(/=/g, "==") + ");");
          if (fn(...Object.values(ctx))) return true;
        }
      } catch (e) { }
    }
    return false;
  },
  step: function () {
    if (!nsfPlayer) return;
    nsfPaused = true;
    let cpu = nsfPlayer.cpu;
    let apu = nsfPlayer.apu;
    let prevPC = cpu.br[0];
    let finished = false;
    let count = 0;
    if (cpu.cyclesLeft === 0) {
      this._statInstr(cpu);
      cpu.cycle();
      apu.cycle && apu.cycle();
      count++;
    }
    do {
      this._statInstr(cpu);
      cpu.cycle();
      apu.cycle && apu.cycle();
      count++;
      finished = (cpu.cyclesLeft === 0 && (!nsfPlayer.inDma) && ((typeof nsfPlayer.cycles === "undefined") || (nsfPlayer.cycles % 3 === 0)));
      if (finished) break;
      if (count > 1000) break;
    } while (true);
    if (cpu.br[0] === prevPC) {
      let op = nsfPlayer.mapper.read(prevPC);
      let opname = this._opNames[op];
      if (opname === "kil" || opname === "jam") {
        cpu.br[0] = (cpu.br[0] + 1) & 0xFFFF;
      }
    }
    // 单步后自动跳转到PC，PC在32行最后一行
    this._disasmBase = nsfPlayer.cpu.br[0];
    this.refresh();
  },
  run: function () {
    if (!nsfLoaded) return;
    this.pause();
    nsfPaused = false;
    this._running = true;
    if (typeof nsfAudioHandler !== "undefined" && nsfAudioHandler) nsfAudioHandler.start();
    if (typeof nsfLoopId !== "undefined") {
      if (!nsfLoopId) nsfLoopId = requestAnimationFrame(nsfUpdate);
    }
    this._interval = setInterval(() => {
      if (!this._running) return;
      let cpu = nsfPlayer.cpu;
      let apu = nsfPlayer.apu;
      let pc = cpu.br[0];
      if (this._checkBreak(cpu)) {
        this.pause();
        this.refresh();
        return;
      }
      if (this._memBreakpoints.length && window._nsfMemBreakHit) {
        let memBreakAddr = window._nsfMemBreakAddr;
        this.pause();
        if (typeof memBreakAddr === "number") {
          cpu.br[0] = memBreakAddr & 0xFFFF;
        }
        this.refresh();
        window._nsfMemBreakHit = undefined;
        return;
      }
      let finished = false;
      let count = 0;
      do {
        this._statInstr(cpu);
        cpu.cycle();
        apu.cycle && apu.cycle();
        count++;
        finished = (cpu.cyclesLeft === 0 && (!nsfPlayer.inDma));
        if (finished) break;
        if (count > 1000) break;
      } while (true);
      this.refresh();
    }, 20);
  },
  pause: function () {
    this._running = false;
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    nsfPaused = true;
    if (typeof nsfLoopId !== "undefined" && nsfLoopId) {
      cancelAnimationFrame(nsfLoopId);
      nsfLoopId = 0;
    }
    if (typeof nsfAudioHandler !== "undefined" && nsfAudioHandler) nsfAudioHandler.stop();
  },
  _statInstr: function (cpu) {
    let pc = cpu.br[0];
    let op = nsfPlayer.mapper.read(pc);
    let opname = this._opNames[op] || ("op" + op.toString(16));
    this._instrExecStat[opname] = (this._instrExecStat[opname] || 0) + 1;
  },
  _getDisasmLines: function (start, end) {
    let lines = [];
    let cpu = nsfPlayer.cpu;
    let addrModes = this._addressingModes || (cpu.addressingModes ? cpu.addressingModes : []);
    for (let adr = start; adr < end;) {
      let op = nsfPlayer.mapper.read(adr);
      let opstr = op.toString(16).padStart(2, "0").toUpperCase();
      let mode = addrModes[op] || 0;
      let oplen = this._opLengths[mode] || 1;
      let codeArr = [];
      for (let j = 0; j < oplen; j++) {
        let b = nsfPlayer.mapper.read((adr + j) & 0xFFFF);
        codeArr.push(b.toString(16).padStart(2, "0").toUpperCase());
      }
      let codeStr = codeArr.join(" ");
      let asmStr = this._instrStr(adr, op, mode);
      let commentStr = this._getVirtuaNESComment(adr, op, mode);
      lines.push(`${adr.toString(16).padStart(4, "0").toUpperCase()}  ${codeStr.padEnd(8)}  ${asmStr.padEnd(14)}  ; ${commentStr}`);
      adr += oplen;
    }
    return lines;
  }
};