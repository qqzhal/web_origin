function Debugger(nes, ctx) {
  this.nes = nes;
  this.ctx = ctx;

  this.breakpoints = [];
  this.bpFired = false;

  this.frames = 0;

  this.updateLine = 120;
  this.updateAnd = 3;

  this.selectedView = 0;
  this.ramScroll = 0;
  this.disScroll = 0;

  // 新增：自定义updateLine
  this.customUpdateLine = 120;

  this.nes.onread = (a, v) => this.onread(a, v);
  this.nes.onwrite = (a, v) => this.onwrite(a, v);

  this.ramCdl = new Uint8Array(0x8000); // addresses $0-$7fff
  this.romCdl = undefined; // gets created by loadrom, addresses $8000-$ffff

  // 新增：调试控制状态
  this.isPaused = false;
  this.pauseOnStart = false;
  this.disasmStopRefresh = true; // 默认勾选
  this.runCount = 0; // 执行N条后暂停
  this.commentBreakKeywords = []; // 注释断点关键词

  // 新增：记录内存访问类型（0: 未访问, 1: 读取, 2: 写入, 3: 执行）
  this.ramAccessType = new Uint8Array(0x800); // 仅记录 $0000-$1FFF 的 RAM 区域

  // load rom, do reset, set up cdl
  this.loadRom = function (rom, callback) {
    // 支持异步loadRom（动态加载mapper）
    let self = this;
    let done = function (success) {
      if (success) {
        self.nes.reset(true);
        // reset breakpoints
        self.breakpoints = [];
        self.updateBreakpointList();
        // clear ram cdl
        for (let i = 0; i < 0x8000; i++) {
          self.ramCdl[i] = 0;
        }
        // set up rom cdl
        let prgSize = self.nes.mapper.h.banks * 0x4000;
        self.romCdl = new Uint8Array(prgSize);
        for (let i = 0; i < prgSize; i++) {
          self.romCdl[i] = 0;
        }
        if (callback) callback(true);
        return true;
      } else {
        if (callback) callback(false);
        return false;
      }
    };
    // 判断nes.loadRom是否支持回调（新版）
    if (this.nes.loadRom.length >= 2) {
      this.nes.loadRom(rom, done);
      // 返回undefined，实际完成后回调
      return;
    } else {
      // 兼容老接口
      let success = this.nes.loadRom(rom);
      return done(success);
    }
  }

  // 执行断点
  this.cycle = function () {
    this.nes.cycle();
    if (this.nes.cpu.cyclesLeft === 0 && !this.nes.inDma && (this.nes.cycles % 3) === 0) {
      let adr = this.nes.cpu.br[0];
      if (adr < 0x2000) {
        this.ramAccessType[adr & 0x7ff] = 3;
      }
      for (let breakpoint of this.breakpoints) {
        if (breakpoint.adr === adr && breakpoint.exec) {
          log(i18n('log.default.breakpoint_execute', { adr: this.nes.getWordRep(adr) }), "default");
          this.bpFired = true;
        }
      }
      // adr < $8000: set ram cdl, else set rom cdl
      if (adr < 0x8000) {
        this.ramCdl[adr] = 1;
      } else {
        // get the address in rom that is mapped here
        let prgAdr = this.nes.mapper.getRomAdr(adr);
        this.romCdl[prgAdr] = 1;
      }
    }
    let b = this.bpFired;
    this.bpFired = false;
    return b;
  }

  // runs a single instruction
  this.runInstruction = function () {
    setPausedState(true);
    do {
      this.cycle();
      if (this.checkCommentBreakpoint(this.nes.cpu.br[0])) {
        log("注释断点触发: " + this.nes.getWordRep(this.nes.cpu.br[0]), "default");
        this.isPaused = true;
        finished = true;
        break;
      }
      finished = (this.nes.cpu.cyclesLeft === 0 && !this.nes.inDma && (this.nes.cycles % 3) === 0);
    } while (!finished);
    this.isPaused = true;

    if (this.selectedView === 3) {
      this.drawDissasembly();
    } else {
      this.updateDebugView();
    }
    if (window.updatePauseBtnOverlayState) window.updatePauseBtnOverlayState();
  }

  // 新增：持续运行直到暂停/断点，并恢复主循环/音频
  this.runContinue = function () {
    setPausedState(false);
  }

  // returns false if we ran the whole frame, true if we broke at a breakpoint
  // in which case the emulator should pause itself
  this.runFrame = function () {
    this.frames++;
    let b, count = 0;

    do {
      if (this.isPaused) return true;

      b = this.cycle();
      count++;

      // 合并断点/注释断点/runCount 达到
      if (b || this.checkCommentBreakpoint(this.nes.cpu.br[0]) || (this.runCount > 0 && count >= this.runCount)) {
        setPausedState(true);
        this.runCount = 0;
        if (this.selectedView === 3) {
          this.drawDissasembly();
        } else {
          this.updateDebugView();
        }
        // 只在断点/注释断点时 log
        if (b) {
          log(i18n('log.default.breakpoint_execute', { adr: this.nes.getWordRep(this.nes.cpu.br[0]) }), "default");
        } else if (this.checkCommentBreakpoint(this.nes.cpu.br[0])) {
          log("注释断点触发: " + this.nes.getWordRep(this.nes.cpu.br[0]), "default");
        }
        if (window.updatePauseBtnOverlayState) window.updatePauseBtnOverlayState();
        return true;
      }

      // 在 runFrame 里
      if (this.nes.ppu.line === this.updateLine && this.nes.ppu.dot === 0 && (this.frames & this.updateAnd) === 0) {
        // 只有在未停止刷新且调试器界面显示时才刷新
        let wrapper = el("wrapper");
        let isWrapperVisible = wrapper && getComputedStyle(wrapper).display !== "none";
        if (isWrapperVisible) {
          this.updateDebugView();
        }
      }
    } while (!(this.nes.ppu.dot === 0 && this.nes.ppu.line === 240));

    return false;
  };
  this.addBreakpoint = function (adr, type) {
    let bp = this.breakpoints.find(bp => bp.adr === adr);
    if (!bp) {
      bp = { adr, read: false, write: false, exec: false };
      this.breakpoints.push(bp);
    }
    if (type === 0) bp.read = true;
    if (type === 1) bp.write = true;
    if (type === 2) bp.exec = true;
    this.updateBreakpointList();
  };
  // 新增：初始化调试界面
  this.initDebugUI = function () {
    // 只初始化一次
    if (this._uiInited) return;
    this._uiInited = true;

    // Dissasembly 视图容器
    let disasmDiv = document.createElement("div");
    disasmDiv.id = "disasm_view";
    disasmDiv.style.display = "none";
    disasmDiv.innerHTML = `<style>


#wrapper {
  position: fixed;
  top: 0;
  right: 0;
  background: #f8f8f8;
  box-shadow: 0 1px 4px #0001;
  z-index: 20020;
  display: inline-block;
  overflow: auto;
  border-radius: 0 0 0 18px;
  padding: 0.7em 1.2em 1.2em 1.2em;
  touch-action: none;
  user-select: none;
  width: auto;
  max-width: 98vw; /* 可选：限制最大宽度不超屏幕 */
  min-width: 0;
  min-height: 0;
}
#disasm_controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  font-family: monospace;
  font-size: 13px;
  margin-bottom: 6px;
  max-width: 460px;
  width: auto;
  box-sizing: border-box;
}
#disasm_controls label,
#disasm_controls input,
#disasm_controls button,
#disasm_controls select {
  font-family: inherit;
  font-size: inherit;
  margin: 0 2px 0 0;
  padding: 2px 4px;
  box-sizing: border-box;
}
#disasm_controls input[type="number"] {
  width: 48px;
}
#disasm_controls input[type="text"] {
  width: 60px;
  max-width: 80px;
}
#disasm_controls .wide {
  width: 120px;
  max-width: 140px;
}
#disasm_header {
  font-family: monospace;
  font-size: 14px;
  color: #888;
  margin: 0 0 2px 0;
  white-space: pre;
  user-select: none;
}
#disasm_pre {
  font-family: monospace;
  font-size: 14px;
  background: #fff;
  color: #222;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 6px 4px 6px 4px;
  margin: 0;
  min-width: 0;
  width: 100%;
  display: inline-block;
  max-height: 320px;
  overflow-x: auto;
  overflow-y: auto;
  white-space: pre;
  box-sizing: border-box;
}


#disasm_pre, #disasm_header {
  display: grid;
  grid-template-columns: 3ch 7ch 10ch 14ch 18ch 12ch;
  font-family: "Consolas", "Menlo", "Monaco", "Courier New", monospace;
}
.asm-prefix   { color: #888; }
.asm-addr     { color: #1e90ff; }
.asm-code     { color: #a0522d; }
.asm-ins      { color: #228b22; }
.asm-comment  { color: #b22222; }

@media (max-width: 600px) {
  #disasm_pre, #disasm_header {
    font-size: 12px;
    padding: 2px 1px 2px 1px;
    max-height: 45vh;
  }
  #disasm_controls {
    font-size: 12px;
    gap: 4px 6px;
  }
}
</style>
<div id="disasm_controls">
  <button id="btn_step">单步执行</button>
  <button id="btn_run">继续游戏</button>
  <button id="btn_pause">暂停游戏</button>
  <span style="flex-basis:100%;height:0"></span>
  <span>执行</span>
  <input id="run_n_count" type="number" min="1" value="10">
  <span>条指令后暂停</span>
  <button id="btn_run_n">确定</button>
  <span style="flex-basis:100%;height:0"></span>
  <span>PC为</span>
  <input id="bp_pc" type="text" maxlength="4">
  <span>暂停</span>
  <button id="btn_bp_pc">确定</button>
  <span style="flex-basis:100%;height:0"></span>
  <span>访问</span>
  <input id="bp_mem" type="text" maxlength="4">
  <span>内存地址时暂停</span>
  <button id="btn_bp_mem">确定</button>
  <span style="flex-basis:100%;height:0"></span>
  <span>注释含</span>
<input id="new_keyword" type="text" placeholder="添加关键词" style="width: 120px; margin-right: 8px;">
  <span>暂停</span>
      <button id="add_keyword_btn">添加</button>
</div>
<div id="disasm_cpu" style="font-family:monospace;margin-bottom:4px;"></div>
<div id="disasm_header"></div>
<pre id="disasm_pre"></pre>
<div style="margin-top:8px;">
  <label style="display:none;"><input type="checkbox" id="cb_pause_on_start">一开始暂停</label>
  <label style="margin-left:12px;"><input type="checkbox" id="cb_stop_refresh">停止刷新</label>
</div>
<div id="disasm_breakpoints" style="margin-top:8px;"></div>
<div id="br" style="display:none;">
  <p class="state">
    Address (hex): <input id="bpaddress" value="0" style="max-width:60px;">
    <select id="bptype">
      <option value="0">读取</option>
      <option value="1">写入</option>
      <option value="2">执行</option>
    </select>
    <button id="bpadd">添加断点</button>
  </p>
  <p id="breakpoints" class="state"></p>
`;

    el("wrapper").appendChild(disasmDiv);
    db.setView(3);//默认 显示 调试器

    // 拖动支持（PC/移动端）
    (function () {
      let wrapper = el("wrapper");
      let dragbar = document.getElementById("disasm_dragbar");
      let dragging = false, offsetX = 0, offsetY = 0, startX = 0, startY = 0, startLeft = 0, startTop = 0;
      if (!wrapper || !dragbar) return;
      function onDragStart(e) {
        dragging = true;
        wrapper.classList.add("dragging");
        if (e.type === "touchstart") {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        } else {
          startX = e.clientX;
          startY = e.clientY;
        }
        let rect = wrapper.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener("mousemove", onDragMove);
        document.addEventListener("mouseup", onDragEnd);
        document.addEventListener("touchmove", onDragMove, { passive: false });
        document.addEventListener("touchend", onDragEnd);
      }
      function onDragMove(e) {
        if (!dragging) return;
        let x, y;
        if (e.type === "touchmove") {
          x = e.touches[0].clientX;
          y = e.touches[0].clientY;
        } else {
          x = e.clientX;
          y = e.clientY;
        }
        let newLeft = startLeft + (x - startX);
        let newTop = startTop + (y - startY);
        // 限制在窗口内
        newLeft = Math.max(0, Math.min(window.innerWidth - wrapper.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - 40, newTop));
        wrapper.style.left = newLeft + "px";
        wrapper.style.top = newTop + "px";
        wrapper.style.right = "auto";
        wrapper.style.bottom = "auto";
        e.preventDefault && e.preventDefault();
      }
      function onDragEnd() {
        dragging = false;
        wrapper.classList.remove("dragging");
        document.removeEventListener("mousemove", onDragMove);
        document.removeEventListener("mouseup", onDragEnd);
        document.removeEventListener("touchmove", onDragMove);
        document.removeEventListener("touchend", onDragEnd);
      }
      dragbar.addEventListener("mousedown", onDragStart);
      dragbar.addEventListener("touchstart", onDragStart, { passive: false });
    })();

    // 事件绑定
    el("btn_pause").onclick = () => setPausedState(true);
    el("btn_run").onclick = () => setPausedState(false);
    el("btn_step").onclick = () => this.runInstruction();

    el("btn_run_n").onclick = () => {
      this.runCount = parseInt(el("run_n_count").value) || 1;
      setPausedState(false);
    };

    el("btn_bp_pc").onclick = () => {
      let v = parseInt(el("bp_pc").value, 16);
      if (!isNaN(v)) this.addBreakpoint(v, 2);
    };
    el("btn_bp_mem").onclick = () => {
      let v = parseInt(el("bp_mem").value, 16); // 你的原始输入框id
      if (isNaN(v)) return;
      // 默认添加“读”类型（或你想要的类型，比如执行/写/读）
      let type = 1; // 0=读, 1=写, 2=执行
      this.addBreakpoint(v, type);
    };

    // 添加关键词按钮事件
    el("add_keyword_btn").onclick = () => {
      const input = el("new_keyword");
      const kw = input.value.trim().toUpperCase();
      if (kw && !this.commentBreakKeywords.includes(kw)) {
        this.commentBreakKeywords.push(kw);
        input.value = "";
        updateKeywordList();
      }
    };

    // 默认勾选“停止刷新”
    el("cb_stop_refresh").checked = true;
    this.disasmStopRefresh = true;

    el("cb_pause_on_start").onchange = (e) => { this.pauseOnStart = e.target.checked; };
    el("cb_stop_refresh").onchange = (e) => { this.disasmStopRefresh = e.target.checked; };

    el("updateLineInput").onchange = (e) => {
      this.customUpdateLine = parseInt(e.target.value) || 120;
      if (this.selectedView === 1) {
        this.updateLine = this.customUpdateLine;
      }
    };

    // 修复 Add breakpoint 按钮
    let bpAddBtn = el("bpadd");
    if (bpAddBtn) {
      bpAddBtn.onclick = () => {
        let adr = parseInt(el("bpaddress").value, 16);
        let t = parseInt(el("bptype").value, 10);
        if (!isNaN(adr) && !isNaN(t)) {
          this.addBreakpoint(adr, t);
        }
      };
    }



    // 添加注释断点关键词管理区域
    let keywordDiv = document.createElement("div");
    keywordDiv.id = "comment_keywords";
    keywordDiv.style.marginTop = "8px";
    keywordDiv.innerHTML = `
    <b>注释关键词:</b>
    <ul id="keyword_list" style="list-style: none; padding: 0; margin: 8px 0;"></ul>
  `;
    el("disasm_view").appendChild(keywordDiv);

    // 更新关键词列表显示
    const updateKeywordList = () => {
      const list = el("keyword_list");
      list.innerHTML = "";
      this.commentBreakKeywords.forEach((kw, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.gap = "8px";
        li.innerHTML = `
        <span>${kw}</span>
        <button data-idx="${idx}" style="color: red; cursor: pointer;">删除</button>
      `;
        list.appendChild(li);
      });

      // 删除关键词事件绑定
      list.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          const idx = +btn.dataset.idx;
          this.commentBreakKeywords.splice(idx, 1);
          updateKeywordList();
        };
      });
    };



    updateKeywordList();

    // 断点列表区域
    this.updateBreakpointList();
  };

  // 重写 setView 以切换显示
  this.setView = function (view) {
    if (this.selectedView === view) return; // 避免重复切换
    this.selectedView = view;

    // 隐藏所有信息显示
    const nametableTable = document.getElementById('nametableTable');
    const spriteTable = document.getElementById('spriteTable');
    if (nametableTable) nametableTable.style.display = 'none';
    if (spriteTable) spriteTable.style.display = 'none';

    // 只切换显示状态
    el("viewram").style.display = (view === 2) ? "block" : "none";
    el("doutput").style.display = (view === 0 || view === 1 || view === 4) ? "block" : "none";
    el("chrviewdiv").style.display = (view === 0) ? "block" : "none";
    let disasmDiv = el("disasm_view");
    if (disasmDiv) disasmDiv.style.display = (view === 3) ? "block" : "none";

    // 精灵选项显示
    const spriteChrOptions = el("spriteChrOptions");
    if (spriteChrOptions) spriteChrOptions.style.display = (view === 4) ? "block" : "none";

    // Nametable选项显示
    const nametableOptions = el("nametableOptions");
    if (nametableOptions) nametableOptions.style.display = (view === 1) ? "block" : "none";

    // 显示对应的表格
    if (view === 1 && nametableTable) {
      nametableTable.style.display = 'block';
    } else if (view === 4 && spriteTable) {
      spriteTable.style.display = 'block';
    }

    // 设置updateLine
    if (view === 1) {
      this.updateLine = this.customUpdateLine;
    } else {
      this.updateLine = 120;
    }

    // 只有切到反汇编才重置滚动
    if (view === 3) {
      this.disScroll = this.nes.cpu.br[0] - 16;
    }
    // 只刷新当前显示的内容
    if ((view === 3 && disasmDiv && disasmDiv.style.display === "block") ||
      (view === 2 && el("viewram").style.display === "block") ||
      ((view === 0 || view === 1 || view === 4) && el("doutput").style.display === "block")) {
      this.updateDebugView();
    }
  };

  this.changeScrollPos = function (add) {
    if (this.selectedView === 2) {
      let old = this.ramScroll;
      let r = this.ramScroll + add;
      r = r < 0 ? 0 : r;
      r = r > 0xfe0 ? 0xfe0 : r;
      this.ramScroll = r;
      if (r !== old) {
        this.updateDebugView();
      }
    } else {
      let old = this.disScroll;
      let r = this.disScroll + add;
      r = r < 0 ? 0 : r;
      this.disScroll = r;
      if (r !== old) {
        this.updateDebugView();
      }
    }
  }

  // 读断点
  this.onread = function (adr, val) {
    if (adr < 0x2000) {
      this.ramAccessType[adr & 0x7ff] = 1;
    }
    for (let breakpoint of this.breakpoints) {
      if (breakpoint.adr === adr && breakpoint.read) {
        log(i18n('log.default.breakpoint_read', { val: this.nes.getByteRep(val), adr: this.nes.getWordRep(adr) }), "default");
        this.bpFired = true;
      }
    }
  };
  // 写断点
  this.onwrite = function (adr, val) {
    if (adr < 0x2000) {
      this.ramAccessType[adr & 0x7ff] = 2;
    }
    for (let breakpoint of this.breakpoints) {
      if (breakpoint.adr === adr && breakpoint.write) {
        log(i18n('log.default.breakpoint_write', { val: this.nes.getByteRep(val), adr: this.nes.getWordRep(adr) }), "default");
        this.bpFired = true;
      }
    }
    if (adr < 0x8000) {
      this.ramCdl[adr] = 0;
    }
  };

  // 重写 updateDebugView 减少开销
  this.updateDebugView = function () {

    if (!this._uiInited) this.initDebugUI();

    // 判断 disasm_view 和 wrapper 是否显示
    let disasmDiv = el("disasm_view");
    let isDisasmVisible = disasmDiv && getComputedStyle(disasmDiv).display !== "none";
    // 判断 wrapper 是否显示
    let wrapper = el("wrapper");
    let isWrapperVisible = wrapper && getComputedStyle(wrapper).display !== "none";

    // 只检测断点，不刷新内容
    if (!isWrapperVisible || this.selectedView !== 3) {
      // 只检测断点命中（只检测执行断点）
      let pc = this.nes.cpu && this.nes.cpu.br ? this.nes.cpu.br[0] : 0;
      for (let bp of this.breakpoints) {
        if (bp.exec && bp.adr === pc) {
          log(`断点触发: ${this.nes.getWordRep(bp.adr)}`, "default");
          this.isPaused = true;
        }
      }
      // return;
    }

    // 只在 wrapper 显示时刷新
    if (!isWrapperVisible) return;

    //反汇编界面显示，刷新全部内容
    if (this.selectedView === 3) {
      if (this.disasmStopRefresh) return;
      this.drawDissasembly();
      return;
    }


    if (this.selectedView === 0) {

      el("doutput").width = 256;
      el("doutput").height = 160;
      el("doutput").style.width = "256px";
      el("doutput").style.height = "160px";

      window.drawPatternsPals(this.nes, this.ctx)

      adjustCanvasSize();
    } else if (this.selectedView === 1) {
      el("doutput").width = 512;
      el("doutput").height = 480;
      el("doutput").style.width = "512px";
      el("doutput").style.height = "480px";
      window.drawNametables(this.nes, this.ctx)
      adjustCanvasSize();

      // 更新固定信息显示
      if (window.updateFixedInfo) {
        window.updateFixedInfo();
      }
    } else if (this.selectedView === 4) {
      const zoomCheckbox = document.getElementById('spriteZoom2x');
      const zoom2x = zoomCheckbox && zoomCheckbox.checked;

      if (zoom2x) {
        el("doutput").width = 512;
        el("doutput").height = 480;
        el("doutput").style.width = "512px";
        el("doutput").style.height = "480px";
      } else {
        el("doutput").width = 256;
        el("doutput").height = 240;
        el("doutput").style.width = "256px";
        el("doutput").style.height = "240px";
      }

      window.drawSpritesForDebug(this.nes, this.ctx, el("doutput").width, el("doutput").height);
      adjustCanvasSize();

      // 更新固定信息显示
      if (window.updateFixedInfo) {
        window.updateFixedInfo();
      }
    } else if (this.selectedView === 2) {
      window.drawRam(this);
    }
  };


  // 新增：显示CPU寄存器状态（VirtuaNES-debug风格，直接读取CPU寄存器数组）
  this.drawCpuStatus = function () {
    let cpu = this.nes.cpu;
    // VirtuaNES-debug风格：直接读取cpu.r和cpu.br
    let a = (cpu && cpu.r && typeof cpu.r[0] === "number") ? cpu.r[0] : undefined;
    let x = (cpu && cpu.r && typeof cpu.r[1] === "number") ? cpu.r[1] : undefined;
    let y = (cpu && cpu.r && typeof cpu.r[2] === "number") ? cpu.r[2] : undefined;
    let s = (cpu && cpu.r && typeof cpu.r[3] === "number") ? cpu.r[3] : undefined;
    let pcval = (cpu && cpu.br && typeof cpu.br[0] === "number") ? cpu.br[0] : undefined;
    // flags
    let p = cpu ? cpu.getP(false) : 0;
    let safe = v => (typeof v === "number" && !isNaN(v)) ? this.nes.getByteRep(v) : "??";
    let safeWord = v => (typeof v === "number" && !isNaN(v)) ? this.nes.getWordRep(v) : "????";
    let flagStr = [
      (p & 0x80) ? "N1" : "N0",
      (p & 0x40) ? "V1" : "V0",
      (p & 0x20) ? "R1" : "R0",
      (p & 0x10) ? "B1" : "B0",
      (p & 0x08) ? "D1" : "D0",
      (p & 0x04) ? "I1" : "I0",
      (p & 0x02) ? "Z1" : "Z0",
      (p & 0x01) ? "C1" : "C0"
    ].join(" ");
    let sstr = `PC:${safeWord(pcval)} A:${safe(a)} X:${safe(x)} Y:${safe(y)}\r\nSP:${safe(s)} P[${flagStr}]`;
    el("disasm_cpu").style.whiteSpace = "pre"; // 新增：保证换行显示
    el("disasm_cpu").textContent = sstr.toUpperCase();
  };

  // 重写 drawDissasembly，VirtuaNES-debug风格，文本模式，带表头对齐
  this.drawDissasembly = function () {
    this.drawCpuStatus();
    // 表头
    let header = el("disasm_header");
    header.innerHTML = `<span class="asm-prefix">   </span>` +
      `<span class="asm-addr">地址</span> ` +
      `<span class="asm-code">机器码</span> ` +
      `<span class="asm-ins">ASM指令</span> ` +
      `<span class="asm-comment">注释</span> ` +
      `<span class="asm-static">静态地址</span>`;
    let pre = el("disasm_pre");
    if (!pre) return;
    // 反汇编窗口显示32行，PC指令在最后一行
    let pc = this.nes.cpu && this.nes.cpu.br ? this.nes.cpu.br[0] : 0;
    let linesTotal = 32;
    let adrList = [];
    let adr = pc;
    // 向上回溯31条指令
    for (let i = 0; i < linesTotal - 1; i++) {
      let found = false;
      for (let back = 3; back >= 1; back--) {
        let prev = (adr - back + 0x10000) & 0xFFFF;
        let op = this.nes.peak(prev);
        let oplen = this.opLengths[this.nes.cpu.addressingModes[op]];
        if (oplen === back) {
          adrList.unshift(prev);
          adr = prev;
          found = true;
          break;
        }
      }
      if (!found) {
        adr = (adr - 1 + 0x10000) & 0xFFFF;
        adrList.unshift(adr);
      }
    }
    adrList.push(pc);

    // 生成文本内容
    let lines = [];
    for (let i = 0; i < linesTotal; i++) {
      let adr = adrList[i];
      let op = this.nes.peak(adr);
      let oplen = this.opLengths[this.nes.cpu.addressingModes[op]];
      let isOpcode = (adr < 0x8000) ? this.ramCdl[adr] : this.romCdl[this.nes.mapper.getRomAdr(adr)];
      let pcNow = (adr === pc);
      let isBp = this.breakpoints.some(bp => bp.adr === adr && bp.t === 2);

      // 地址
      let addrStr = this.nes.getWordRep(adr).toUpperCase().padEnd(5, " ");
      // 机器码
      let codeArr = [];
      for (let j = 0; j < oplen; j++) {
        codeArr.push(this.nes.getByteRep(this.nes.peak((adr + j) & 0xFFFF)).toUpperCase());
      }
      let codeStr = codeArr.join(" ").padEnd(8, " ");
      // ASM指令
      let asmStr = isOpcode ? this.instrStr(adr).toUpperCase().padEnd(12, " ") : (".DB $" + this.nes.getByteRep(op).toUpperCase()).padEnd(12, " ");
      // 注释
      let commentStr = this.getVirtuaNESComment(adr, isOpcode);

      // 行前缀，始终3字符
      let prefix = "   ";
      if (pcNow && isBp) prefix = "*> ";
      else if (pcNow) prefix = ">  ";
      else if (isBp) prefix = " * ";
      else prefix = "   ";
      // 合成行，所有字段严格空格对齐
      let staticAddr = "-";
      if (adr >= 0x8000 && this.nes.mapper && typeof this.nes.mapper.getRomAdr === "function") {
        let romAddr = this.nes.mapper.getRomAdr(adr);
        // 加上 header.base 偏移，得到ROM文件真实偏移
        let fileAddr = (this.nes.mapper.h.base || 16) + romAddr;
        staticAddr = "0x" + fileAddr.toString(16).toUpperCase().padStart(6, "0");
      }
      let line = `<span class="asm-prefix">${prefix}</span>` +
        `<span class="asm-addr">${addrStr}</span>` +
        `<span class="asm-code">${codeStr}</span>` +
        `<span class="asm-ins">${asmStr}</span>` +
        `<span class="asm-comment">${commentStr}</span>` +
        `<span class="asm-static">${staticAddr}</span>`;
      lines.push(line);
    }
    pre.innerHTML = lines.join("");



    // 滚动到最下
    pre.scrollTop = pre.scrollHeight;
  };

  // VirtuaNES风格注释，尽量解读为赋值/跳转/比较等
  this.getVirtuaNESComment = function (adr, isOpcode) {
    if (!isOpcode) return "";
    let op = this.nes.peak(adr);
    let mode = this.nes.cpu.addressingModes[op];
    let opName = this.opNames[op];
    let i1 = this.nes.peak((adr + 1) & 0xffff);
    let i2 = i1 | (this.nes.peak((adr + 2) & 0xffff) << 8);

    // 赋值类
    if (opName === "lda") {
      if (mode === 1) return `A=${this.nes.getByteRep(i1)}`;
      if (mode === 2) return `A=[00${this.nes.getByteRep(i1)}]`;
      if (mode === 7) return `A=[${this.nes.getWordRep(i2)}]`;
      if (mode === 3) return `A=[00${this.nes.getByteRep(i1)}+X]`;
      if (mode === 4) return `A=[00${this.nes.getByteRep(i1)}+Y]`;
      if (mode === 8) return `A=[${this.nes.getWordRep(i2)}+X]`;
      if (mode === 9) return `A=[${this.nes.getWordRep(i2)}+Y]`;
      if (mode === 5) return `A=[(${this.nes.getByteRep(i1)}+X)]`;
      if (mode === 6) return `A=[(${this.nes.getByteRep(i1)})+Y]`;
      if (mode === 11) return `A=[(${this.nes.getWordRep(i2)})]`;
    }
    if (opName === "sta") {
      if (mode === 2) return `[00${this.nes.getByteRep(i1)}]=A`;
      if (mode === 7) return `[${this.nes.getWordRep(i2)}]=A`;
      if (mode === 3) return `[00${this.nes.getByteRep(i1)}+X]=A`;
      if (mode === 4) return `[00${this.nes.getByteRep(i1)}+Y]=A`;
      if (mode === 8) return `[${this.nes.getWordRep(i2)}+X]=A`;
      if (mode === 9) return `[${this.nes.getWordRep(i2)}+Y]=A`;
      if (mode === 5) return `[(${this.nes.getByteRep(i1)}+X)]=A`;
      if (mode === 6) return `[(${this.nes.getByteRep(i1)})+Y]=A`;
      if (mode === 11) return `[(${this.nes.getWordRep(i2)})]=A`;
    }
    if (opName === "ldx") {
      if (mode === 1) return `X=${this.nes.getByteRep(i1)}`;
      if (mode === 2) return `X=[00${this.nes.getByteRep(i1)}]`;
      if (mode === 7) return `X=[${this.nes.getWordRep(i2)}]`;
      if (mode === 4) return `X=[00${this.nes.getByteRep(i1)}+Y]`;
      if (mode === 9) return `X=[${this.nes.getWordRep(i2)}+Y]`;
    }
    if (opName === "ldy") {
      if (mode === 1) return `Y=${this.nes.getByteRep(i1)}`;
      if (mode === 2) return `Y=[00${this.nes.getByteRep(i1)}]`;
      if (mode === 7) return `Y=[${this.nes.getWordRep(i2)}]`;
      if (mode === 3) return `Y=[00${this.nes.getByteRep(i1)}+X]`;
      if (mode === 8) return `Y=[${this.nes.getWordRep(i2)}+X]`;
    }
    if (opName === "stx") {
      if (mode === 2) return `[00${this.nes.getByteRep(i1)}]=X`;
      if (mode === 7) return `[${this.nes.getWordRep(i2)}]=X`;
      if (mode === 4) return `[00${this.nes.getByteRep(i1)}+Y]=X`;
    }
    if (opName === "sty") {
      if (mode === 2) return `[00${this.nes.getByteRep(i1)}]=Y`;
      if (mode === 7) return `[${this.nes.getWordRep(i2)}]=Y`;
      if (mode === 3) return `[00${this.nes.getByteRep(i1)}+X]=Y`;
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

    // 比较/跳转
    if (opName === "cmp" && mode === 1) return `A与${this.nes.getByteRep(i1)}比较`;
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
      return `C=0?跳转${this.nes.getWordRep(target)}`;
    }
    if (opName === "bcs") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `C=1?跳转${this.nes.getWordRep(target)}`;
    }
    if (opName === "beq") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `Z=1?跳转${this.nes.getWordRep(target)}`;
    }
    if (opName === "bne") {
      let rel = i1 > 0x7f ? i1 - 0x100 : i1;
      let target = (adr + 2 + rel) & 0xFFFF;
      return `Z=0?跳转${this.nes.getWordRep(target)}`;
    }
    if (opName === "jsr") return `调用${this.nes.getWordRep(i2)}`;
    if (opName === "jmp") return `跳转${this.nes.getWordRep(i2)}`;
    if (opName === "rts") return "子程序返回";
    if (opName === "rti") return "中断返回";

    // 其它
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
  };

  this.instrStr = function (adr) {
    let pc = adr;
    let opcode = this.nes.peak(pc);
    let i1 = this.nes.peak((pc + 1) & 0xffff);
    let i2 = i1 | (this.nes.peak((pc + 2) & 0xffff) << 8);
    let adrMode = this.nes.cpu.addressingModes[opcode];
    let opName = this.opNames[opcode];
    let relVal = i1 > 0x7f ? i1 - 0x100 : i1;
    relVal += pc + 2;
    switch (adrMode) {
      case 0: return `${opName}`;
      case 1: return `${opName} #$${this.nes.getByteRep(i1)}`;
      case 2: return `${opName} $${this.nes.getByteRep(i1)}`;
      case 3: return `${opName} $${this.nes.getByteRep(i1)},x`;
      case 4: return `${opName} $${this.nes.getByteRep(i1)},y`;
      case 5: return `${opName} ($${this.nes.getByteRep(i1)},x)`;
      case 6: return `${opName} ($${this.nes.getByteRep(i1)}),y`;
      case 7: return `${opName} $${this.nes.getWordRep(i2)}`;
      case 8: return `${opName} $${this.nes.getWordRep(i2)},x`;
      case 9: return `${opName} $${this.nes.getWordRep(i2)},y`;
      case 10: return `?`; // apparently this ended up being skipped?
      case 11: return `${opName} ($${this.nes.getWordRep(i2)})`;
      case 12: return `${opName} $${this.nes.getWordRep(relVal)}`;
      case 13: return `${opName} ($${this.nes.getByteRep(i1)}),y`;
      case 14: return `${opName} $${this.nes.getWordRep(i2)},x`;
      case 15: return `${opName} $${this.nes.getWordRep(i2)},y`;
    }
  }

  this.opLengths = [1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 0, 3, 2, 2, 3, 3];

  this.opNames = [
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
  ];

  // 重写 updateBreakpointList，合并到 disasm_breakpoints
  this.updateBreakpointList = function () {
    let bl = el("disasm_breakpoints");
    if (!bl) return;
    bl.innerHTML = "<b>断点列表:</b><br>";
    this.breakpoints.forEach((bp, i) => {
      let line = document.createElement("div");
      line.style.display = "flex";
      line.style.alignItems = "center";
      line.style.gap = "6px";
      line.innerHTML =
        `<span>${this.nes.getWordRep(bp.adr)}</span>
        <label><input type="checkbox" ${bp.read ? "checked" : ""} data-type="read" data-idx="${i}">读</label>
        <label><input type="checkbox" ${bp.write ? "checked" : ""} data-type="write" data-idx="${i}">写</label>
        <label><input type="checkbox" ${bp.exec ? "checked" : ""} data-type="exec" data-idx="${i}">执行</label>
        <button data-idx="${i}">移除</button>`;
      bl.appendChild(line);
    });

    // 事件绑定
    bl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = (e) => {
        let idx = +cb.dataset.idx, type = cb.dataset.type;
        let bp = this.breakpoints[idx];
        bp[type] = cb.checked;
        // 如果全部取消则移除
        if (!bp.read && !bp.write && !bp.exec) {
          this.breakpoints.splice(idx, 1);
        }
        this.updateBreakpointList();
      };
    });
    bl.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        let idx = +btn.dataset.idx;
        this.breakpoints.splice(idx, 1);
        this.updateBreakpointList();
      };
    });
  };

  // 新增：注释断点检测
  this.checkCommentBreakpoint = function (adr) {
    if (!this.commentBreakKeywords.length) return false;
    let asm = this.instrStr(adr);
    let comment = this.getVirtuaNESComment(adr, true);
    let text = asm + " " + comment;
    return this.commentBreakKeywords.some(kw => text.includes(kw));
  };
}

// 节流函数，避免resize高频调用
function throttle(fn, delay) {
  let last = 0, timer = null;
  return function (...args) {
    const now = Date.now();
    if (now - last < delay) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, delay);
    } else {
      last = now;
      fn.apply(this, args);
    }
  };
}

function adjustCanvasSize() {
  return;
  const canvas = document.getElementById('doutput');
  if (!canvas) return;
  // 画布原始尺寸
  const w = canvas.width;
  const h = canvas.height;
  // 最大宽高为面板宽高的90%
  const maxW = Math.floor(window.innerWidth * 0.9) - 32;
  const maxH = Math.floor(window.innerHeight * 0.9) - 32;
  const ratio = Math.min(maxW / w, maxH / h, 1);
  canvas.style.width = Math.floor(w * ratio) + 'px';
  canvas.style.height = Math.floor(h * ratio) + 'px';
}


// 在initDebugUI或drawDissasembly等渲染后调用
function adjustDebuggerPanel() {
  const panel = document.getElementById('disasm_view');
  if (!panel) return;
  // 最大宽高为窗口宽高的90%
  const maxW = Math.floor(window.innerWidth * 0.9);
  const maxH = Math.floor(window.innerHeight * 0.9);
  panel.style.maxWidth = maxW + 'px';
  panel.style.maxHeight = maxH + 'px';
  panel.style.overflow = 'auto';



  // 图片等比缩放
  const imgs = panel.querySelectorAll('img');
  imgs.forEach(img => {
    img.style.maxWidth = (maxW - 40) + 'px';
    img.style.maxHeight = (maxH - 120) + 'px';
    img.style.height = 'auto';
    img.style.width = 'auto';
    // 等比缩放
    if (img.naturalWidth > maxW - 40 || img.naturalHeight > maxH - 120) {
      const ratio = Math.min((maxW - 40) / img.naturalWidth, (maxH - 120) / img.naturalHeight);
      img.style.width = Math.floor(img.naturalWidth * ratio) + 'px';
      img.style.height = Math.floor(img.naturalHeight * ratio) + 'px';
    }
  });
}

// 初始化和窗口大小变化时都调用
window.addEventListener('resize', throttle(adjustDebuggerPanel, 1000));
// 在调试器渲染后调用一次
setTimeout(adjustDebuggerPanel, 0);