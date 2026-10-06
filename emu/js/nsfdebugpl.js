window.nsfDebugPL = {
  // 分块渲染RAM
  renderRam: function(panel, nsfPlayer) {
    let ram = nsfPlayer.ram;
    if (!ram || typeof ram.length !== "number") ram = new Uint8Array(0x10000);
    let ramEl = panel.querySelector("#nsfdbg-ram");
    if (!ramEl) return;

    let ramReadStat = nsfPlayer.ramReadStat;
    let ramWriteStat = nsfPlayer.ramWriteStat;
    let ramExecStat = nsfPlayer.ramExecStat;

    // 虚拟滚动参数
    let lineHeight = 18;
    let totalLines = 0x10000 / 0x10;
    let maxHeight = ramEl.offsetHeight || 120;
    let scrollTop = ramEl.scrollTop || 0;
    let linesPerPage = Math.ceil(maxHeight / lineHeight) + 2;
    let firstLine = Math.floor(scrollTop / lineHeight);
    let lastLine = Math.min(firstLine + linesPerPage, totalLines - 1);

    // 只渲染可见行
    let ramLines = [];
    for (let i = firstLine; i <= lastLine; i++) {
      let addr = i * 0x10;
      let line = `<span style="color:#FFD700;">$${addr.toString(16).padStart(4, "0").toUpperCase()}:</span> `;
      for (let j = 0; j < 0x10; j++) {
        let a = (addr + j) & 0xFFFF;
        let v = nsfPlayer.read(a);
        if (typeof v !== "number") v = 0;
        let color = "";
        if (ramExecStat[a]) color = "#FF5555";
        else if (ramWriteStat[a]) color = "#FFA500";
        else if (ramReadStat[a]) color = "#5fcf5b";
        else color = "#FFD700";
        line += `<span style="color:${color}">${v.toString(16).padStart(2, "0").toUpperCase()}</span> `;
      }
      ramLines.push(line);
    }
    let before = "";
    let after = "";
    if (firstLine > 0) before = `<div style="height:${firstLine * lineHeight}px"></div>`;
    if (lastLine < totalLines - 1) after = `<div style="height:${(totalLines - 1 - lastLine) * lineHeight}px"></div>`;
    let newRamHtml = before + ramLines.join("\n") + after;
    if (ramEl.innerHTML !== newRamHtml) {
      ramEl.innerHTML = newRamHtml;
    }
  },

  // 分块渲染反汇编
  renderDisasm: function(panel, nsfPlayer, opNames, opLengths, addressingModes, instrStrFn, commentFn, baseAddr, scrollToPc) {
    let cpu = nsfPlayer.cpu;
    let pc = cpu.br[0];
    let lines = [];
    let addrModes = addressingModes || (cpu.addressingModes ? cpu.addressingModes : []);
    let showLines = 32;
    // VirtuaNES风格：baseAddr/PC在最后一行
    let start;
    if (typeof baseAddr === "number" && baseAddr >= 0 && baseAddr <= 0xFFFF) {
      start = (baseAddr - (showLines - 1) + 0x10000) & 0xFFFF;
    } else {
      start = (pc - (showLines - 1) + 0x10000) & 0xFFFF;
    }
    let pcLineIdx = -1;
    for (let k = 0; k < showLines; k++) {
      let adr = (start + k) & 0xFFFF;
      let op = nsfPlayer.mapper.read(adr);
      let opstr = op.toString(16).padStart(2, "0").toUpperCase();
      let mark = (adr === pc) ? ">" : " ";
      let oplen = 1;
      let mode = addrModes[op] || 0;
      oplen = opLengths[mode] || 1;
      let codeArr = [];
      for (let j = 0; j < oplen; j++) {
        let b = nsfPlayer.mapper.read((adr + j) & 0xFFFF);
        codeArr.push(b.toString(16).padStart(2, "0").toUpperCase());
      }
      let codeStr = codeArr.join(" ").padEnd(8, " ");
      let asmStr = instrStrFn(adr, op, mode).padEnd(14, " ");
      let commentStr = commentFn(adr, op, mode).padEnd(12, " ");
      let staticAddr = "-";
      if (adr >= 0x8000 && nsfPlayer.mapper && nsfPlayer.mapper.romData) {
        let romAddr = adr - 0x8000;
        staticAddr = "0x" + romAddr.toString(16).toUpperCase().padStart(6, "0");
      }
      let readed = false;
      if (window.nsfPlayer && nsfPlayer.ramReadStat && adr < 0x10000) {
        readed = !!nsfPlayer.ramReadStat[adr];
      }
      let codeHtml = codeStr;
      if (readed) codeHtml = `<span style="color:#5fcf5b">${codeStr}</span>`;
      let lineHtml = `${mark.padEnd(2)}${adr.toString(16).padStart(4, "0").toUpperCase().padEnd(7)}${codeHtml.padEnd(10)}${asmStr.padEnd(14)}${commentStr.padEnd(18)}${staticAddr.padEnd(12)}`;
      if (adr === pc) {
        lineHtml = `<span style="background:#FFD700;color:#222;">${lineHtml}</span>`;
        pcLineIdx = k;
      }
      lines.push(lineHtml);
    }
    let disasmEl = panel.querySelector("#nsfdbg-disasm");
    if (disasmEl && disasmEl.innerHTML !== lines.join("\n")) {
      disasmEl.innerHTML = lines.join("\n");
      // 只有需要跳转时才滚动到底部
      if (scrollToPc) {
        setTimeout(() => {
          disasmEl.scrollTop = disasmEl.scrollHeight;
        }, 0);
      }
    }
  },

  // 数据分析相关方法
analyzeHotspots: function () {
    if (!nsfPlayer) return [];
    // 统计PC执行热点
    let execStat = nsfPlayer.ramExecStat || new Uint8Array(0x10000);
    let readStat = nsfPlayer.romReadStat || {};
    let codeHotspots = [];
    let dataHotspots = [];
    // 统计执行热点（代码区）
    let execCounts = {};
    for (let addr = 0x8000; addr < 0x10000; addr++) {
      if (execStat[addr]) {
        let base = addr & 0xFFF0;
        execCounts[base] = (execCounts[base] || 0) + 1;
      }
    }
    for (let base in execCounts) {
      if (execCounts[base] > 8) {
        codeHotspots.push({ start: parseInt(base), end: parseInt(base) + 0xF, type: "代码(循环?)", count: execCounts[base] });
      }
    }
    let threshold = window._nsfHotspotThreshold || 3;
    // 统计ROM读取热点（数据区）
    let addrs = Object.keys(readStat)
      .map(x => parseInt(x))
      .filter(a => a >= 0x8000 && a < 0x10000 && readStat[a] >= threshold);
    addrs.sort((a, b) => a - b);
    let ranges = [];
    let start = null, last = null;
    for (let i = 0; i < addrs.length; i++) {
      if (start === null) {
        start = last = addrs[i];
      } else if (addrs[i] === last + 1) {
        last = addrs[i];
      } else {
        ranges.push([start, last]);
        start = last = addrs[i];
      }
    }
    if (start !== null) ranges.push([start, last]);
    for (let [s, e] of ranges) {
      let len = e - s + 1;
      let type = "数据(音符/乐器/音量?)";
      if (len < 8) continue;
      dataHotspots.push({ start: s, end: e, type, count: len });
    }
    return { codeHotspots, dataHotspots };
  },
  showHotspotAnalysis: function () {
    // 自动更新定时器
    if (window._nsfHotspotAutoTimer) clearInterval(window._nsfHotspotAutoTimer);
    // 记录上次切歌
    if (typeof window._nsfHotspotLastSong === "undefined") window._nsfHotspotLastSong = nsfCurrentSong || 1;
    let dlg = document.createElement("div");
    dlg.style = "position:fixed;left:50vw;top:1px;width:90vw;max-width:480px;min-width:0;box-sizing:border-box;overflow:auto;background:#222;border:2px solid #FFD700;z-index:5000;box-shadow:0 8px 32px #000;border-radius:8px;padding:0 0 18px 0;color:#FFD700;font-size:15px;word-break:break-all;";
    dlg.innerHTML = `
<div id="nsf-hotspot-dragbar" style="position:sticky;top:0;z-index:10;cursor:move;user-select:none;background:#333;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
  <span style="font-size:16px;font-weight:bold;">数据分析</span>
  <span style="display:flex;align-items:center;gap:8px;">
    <label style="font-size:13px;user-select:none;">
      <button id="nsf-replaysong" style="vertical-align:middle;margin-right:2px;">重播</button>
    </label>
    <label style="font-size:13px;user-select:none;">
      <input type="checkbox" id="nsf-hotspot-resetonsong" style="vertical-align:middle;margin-right:2px;">
      切歌重置
    </label>
    <label style="font-size:13px;user-select:none;">
      <input type="checkbox" id="nsf-hotspot-crosssong" style="vertical-align:middle;margin-right:2px;">
      跨歌统计
    </label>
    <label style="font-size:13px;user-select:none;">
      <input type="checkbox" id="nsf-hotspot-autorefresh" style="vertical-align:middle;margin-right:2px;">
      自动更新
    </label>
    <button id="nsf-hotspot-export-json" style="background:#333;color:#FFD700;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">导出JSON</button>
    <button style="background:#333;color:#FFD700;border:none;padding:4px 16px;border-radius:4px;cursor:pointer;" onclick="this.parentNode.parentNode.parentNode.remove()">关闭</button>
  </span>
</div>
<div id="nsf-hotspot-tipbar" style="position:sticky;top:48px;z-index:9;background:#222;padding:6px 18px 6px 18px;border-bottom:1px solid #444;display:flex;align-items:center;gap:18px;">
  <span>
    <label style="font-size:13px;color:#FFD700;">校验阈值修改
      <input id="nsf-hotspot-threshold" type="number" min="1" max="32" value="1" style="width:38px;margin-left:2px;">(推荐1-5)
    </label>
    <button id="nsf-hotspot-help" style="margin-left:12px;background:#333;color:#FFD700;border:1px solid #FFD700;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:13px;">查看NSF数据分析说明</button>
  </span>
</div>
<div id="nsf-hotspot-crosssong-tip" style="display:none;padding:8px 18px 0 18px;color:#5fcf5b;font-size:13px;">
  当前为跨曲目统计，统计数据会累加所有曲目，适合全局分析。
</div>
<div id="nsf-hotspot-tabs" style="display:flex;gap:0;">
  <button class="nsf-hotspot-tab" data-tab="code" style="flex:1 1 0;background:#333;color:#FFD700;border:none;padding:8px 0;font-size:15px;cursor:pointer;border-radius:8px 8px 0 0;">代码执行热点</button>
  <button class="nsf-hotspot-tab" data-tab="data" style="flex:1 1 0;background:#222;color:#FFD700;border:none;padding:8px 0;font-size:15px;cursor:pointer;border-radius:8px 8px 0 0;">数据读取热点</button>
  <button class="nsf-hotspot-tab" data-tab="apu" style="flex:1 1 0;background:#222;color:#FFD700;border:none;padding:8px 0;font-size:15px;cursor:pointer;border-radius:8px 8px 0 0;">APU写入分析</button>
</div>
<div id="nsf-hotspot-content" style="padding:0 0 0 0;overflow:auto;"></div>`;
    document.body.appendChild(dlg);

    // --- 新增：自适应内容区高度 ---
    function adjustHotspotContentHeight() {
      // 计算各区域高度
      const winH = window.innerHeight;
      const dragbar = dlg.querySelector('#nsf-hotspot-dragbar');
      const tipbar = dlg.querySelector('#nsf-hotspot-tipbar');
      const tabs = dlg.querySelector('#nsf-hotspot-tabs');
      let used = 0;
      if (dragbar) used += dragbar.offsetHeight;
      if (tipbar) used += tipbar.offsetHeight;
      if (tabs) used += tabs.offsetHeight;
      // 其它padding和border
      used += 32; // 经验值，适配padding/border
      // 最大高度（不小于200）
      const maxH = Math.max(200, winH - used - 24);
      const content = dlg.querySelector('#nsf-hotspot-content');
      if (content) {
        content.style.maxHeight = maxH + "px";
        content.style.overflow = "auto";
      }
    }
    // 初始调整
    setTimeout(adjustHotspotContentHeight, 0);
    // 窗口变化时自适应
    window.addEventListener('resize', adjustHotspotContentHeight);

    // 定义全局阈值变量
    window._nsfHotspotThreshold = 1;
    // === 拖动功能修复 ===
    (function makeDraggable(layer, dragbar) {
      let dragging = false, offsetX = 0, offsetY = 0;
      dragbar.onmousedown = function (e) {
        // 新增：如果点击的是按钮、输入框等，不拖拽
        if (
          e.target.tagName === "BUTTON" ||
          e.target.tagName === "INPUT" ||
          e.target.tagName === "LABEL" ||
          e.target.closest("button") ||
          e.target.closest("input")
        ) return;
        dragging = true;
        let rect = layer.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.onmousemove = function (ev) {
          if (!dragging) return;
          layer.style.left = (ev.clientX - offsetX) + "px";
          layer.style.top = (ev.clientY - offsetY) + "px";
          layer.style.right = "";
          layer.style.bottom = "";
          layer.style.transform = "";
        };
        document.onmouseup = function () {
          dragging = false;
          document.onmousemove = null;
          document.onmouseup = null;
        };
        e.preventDefault();
      };
      // 移动端：用addEventListener防止passive问题
      let touchMoveHandler = function (ev) {
        if (!dragging || !ev.touches || ev.touches.length !== 1) return;
        let t = ev.touches[0];
        layer.style.left = (t.clientX - offsetX) + "px";
        layer.style.top = (t.clientY - offsetY) + "px";
        layer.style.right = "";
        layer.style.bottom = "";
        layer.style.transform = "";
        ev.preventDefault();
      };
      let touchEndHandler = function () {
        dragging = false;
        document.removeEventListener("touchmove", touchMoveHandler, { passive: false });
        document.removeEventListener("touchend", touchEndHandler, { passive: false });
      };
      dragbar.ontouchstart = function (e) {
        // 新增：如果触摸的是按钮、输入框等，不拖拽
        let t = e.target;
        if (
          t.tagName === "BUTTON" ||
          t.tagName === "INPUT" ||
          t.tagName === "LABEL" ||
          t.closest("button") ||
          t.closest("input")
        ) return;
        if (!e.touches || e.touches.length !== 1) return;
        dragging = true;
        let rect = layer.getBoundingClientRect();
        let touch = e.touches[0];
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
        document.addEventListener("touchmove", touchMoveHandler, { passive: false });
        document.addEventListener("touchend", touchEndHandler, { passive: false });
        e.preventDefault();
      };
    })(dlg, dlg.querySelector("#nsf-hotspot-dragbar"));
    // === 拖动功能修复结束 ===

    let tabState = "data";
    // 选项卡切换逻辑
    let tabBtns = dlg.querySelectorAll(".nsf-hotspot-tab");
    tabBtns.forEach(btn => {
      btn.onclick = function () {
        tabBtns.forEach(b => b.style.background = "#222");
        this.style.background = "#333";
        tabState = this.getAttribute("data-tab");
        render();
      };
    });


    // render函数每次都读取tabState的最新值
    function render() {
    if (!nsfLoaded) return;
      let res = window.nsfDebugPL.analyzeHotspots();
      let html = "";
      if (tabState === "code") {
        html += `<div style="padding:18px 18px 0 18px;"><b>代码执行热点(主循环/子循环):</b><br>`;
        if (res.codeHotspots.length === 0) html += "无明显热点<br>";
        res.codeHotspots.forEach(h => {
          html += `<span class="nsf-hotspot-jump" data-addr="${h.start}" style="color:#5fcf5b;cursor:pointer;text-decoration:underline;">$${h.start.toString(16).toUpperCase().padStart(4, "0")}</span> `;
          html += `[$${h.start.toString(16).toUpperCase().padStart(4, "0")}-` +
            `$${h.end.toString(16).toUpperCase().padStart(4, "0")}] ${h.type} (命中:${h.count})<br>`;
        });
        html += `</div>`;
      } else if (tabState === "data") {
        html += `<div style="padding:18px 18px 0 18px;"><b>数据读取热点(音符/乐器/音量表):</b><br>`;
        if (res.dataHotspots.length === 0) html += "无明显热点<br>";
        let apuWriteAddrs = window.nsfDebugPL._findApuWriteAddrs();
        let guessLabels = window.nsfDebugPL._guessDataHotspotType(res.dataHotspots, apuWriteAddrs);
        res.dataHotspots.forEach((h, idx) => {
          let label = guessLabels[idx] ? `【${guessLabels[idx]}】` : "";
          html += `<span class="nsf-hotspot-jump" data-addr="${h.start}" style="color:#5fcf5b;cursor:pointer;text-decoration:underline;">$${h.start.toString(16).toUpperCase().padStart(4, "0")}</span> `;
          html += `[$${h.start.toString(16).toUpperCase().padStart(4, "0")}-` +
            `$${h.end.toString(16).toUpperCase().padStart(4, "0")}] ${h.type}${label} (长度:${h.count})<br>`;
        });
        html += `</div>`;
      } else if (tabState === "apu") {
        let apuTable = window.nsfDebugPL._getApuWriteTable();
        html += `<div style="padding:18px 18px 0 18px;"><b>APU写入分析（含指令类型/寻址模式）</b><br>`;
        if (apuTable.length === 0) {
          html += "无APU写入分析数据";
        } else {
          html += `<table border="1" style="border-collapse:collapse;margin-top:8px;font-size:13px;color:#FFD700;background:#222;">
      <tr>
        <th>区间</th>
        <th>类型</th>
        <th>APU写入(寄存器:次数)</th>
        <th>指令类型</th>
        <th>寻址模式</th>
      </tr>`;
          apuTable.forEach(row => {
            // 取区间起始地址
            let addr = parseInt(row.range.match(/\$([0-9A-Fa-f]{4})/)[1], 16);
            html += `<tr>
        <td><span class="nsf-hotspot-jump" data-addr="${addr}" style="color:#5fcf5b;cursor:pointer;text-decoration:underline;">$${addr.toString(16).toUpperCase().padStart(4, "0")}</span> ${row.range}</td>
        <td>${row.type}</td>
        <td>${row.apuWrites || "-"}</td>
        <td>${row.instrs || "-"}</td>
        <td>${row.addrModes || "-"}</td>
      </tr>`;
          });
          html += `</table>`;
        }
        html += `</div>`;
      }
      let content = dlg.querySelector("#nsf-hotspot-content");
      if (content) content.innerHTML = html;
      // === 新增：点击跳转到调试器内存 ===
      setTimeout(() => {
        dlg.querySelectorAll('.nsf-hotspot-jump').forEach(span => {
          span.onclick = function () {
            let addr = parseInt(this.getAttribute('data-addr'));
            openNsfDebugger();
            // 查找调试器面板
            let dbgPanel = document.querySelector('#nsfdbg-ram');

            // 已存在则直接滚动
            if (dbgPanel) {
              let lineHeight = 18;
              let line = Math.floor(addr / 0x10);
              dbgPanel.scrollTop = line * lineHeight;
              dbgPanel.focus && dbgPanel.focus();
            }
          };
        });
      }, 0);

    }

    // 自动更新功能
    let autoChk = dlg.querySelector("#nsf-hotspot-autorefresh");
    autoChk.onchange = function () {
      if (autoChk.checked) {
        if (window._nsfHotspotAutoTimer) clearInterval(window._nsfHotspotAutoTimer);
        window._nsfHotspotAutoTimer = setInterval(() => {
          render();
        }, 1500);
      } else {
        if (window._nsfHotspotAutoTimer) clearInterval(window._nsfHotspotAutoTimer);
      }
    };
    autoChk.checked = true;
    autoChk.onchange(); // 立即启动自动刷新
    render();

    // 自动模拟点击“数据读取热点”tab
    dlg.querySelectorAll(".nsf-hotspot-tab");
    let dataBtn = Array.from(tabBtns).find(btn => btn.getAttribute("data-tab") === "data");
    if (dataBtn) dataBtn.click();

    let helpBtn = dlg.querySelector("#nsf-hotspot-help");
    if (helpBtn) {
      helpBtn.onclick = function () {
        // 如果已存在弹窗，先移除
        let old = document.getElementById("nsf-hotspot-help-popup");
        if (old) old.remove();
        // 创建弹窗
        let popup = document.createElement("div");
        popup.id = "nsf-hotspot-help-popup";
        popup.style = `
  position:fixed;left:50vw;top:20vh;transform:translate(-50%,0);
  background:#222;border:2px solid #FFD700;color:#FFD700;
  z-index:9999;box-shadow:0 8px 32px #000;border-radius:8px;
  padding:18px 12px 18px 12px;width:90vw;max-width:480px;min-width:0;box-sizing:border-box;font-size:15px;word-break:break-all;
`;
        popup.innerHTML = `
      <div style="margin-bottom:12px;line-height:1.7;">
        该功能用于分析NSF文件的热点数据<br>
        基本上1-3次音乐的播放就能推算出乐器/乐谱相关的数据<br>
        你可以尝试调整阈值，多播放几遍，数据读取热点将会自动合并<br>
        如果数据读取热点很相近,点击上方重播按钮基本可以合成相连数据。<br>
        你也可以点击数据前方的地址跳转到调试器对应内存区域<br>
        阈值太低会导致很多“偶然访问”也显示为热点，数据会变杂乱。<br>
        NSF音乐数据不分散的文件可以尝试调整到1(比如CT2)<br>
        解析NSF音乐数据再转换成CT2的格式是最稳定的方式。
      </div>
      <div style="text-align:right;">
        <button id="nsf-hotspot-help-close" style="background:#333;color:#FFD700;border:1px solid #FFD700;border-radius:4px;padding:4px 18px;cursor:pointer;">关闭</button>
      </div>
    `;
        document.body.appendChild(popup);
        document.getElementById("nsf-hotspot-help-close").onclick = function () {
          popup.remove();
        };
      };
    }

    // 跨曲目统计提示
    let crossTip = dlg.querySelector("#nsf-hotspot-crosssong-tip");
    let crossChk = dlg.querySelector("#nsf-hotspot-crosssong");
    function updateCrossTip() {
      if (crossChk.checked) crossTip.style.display = "";
      else crossTip.style.display = "none";
    }
    crossChk.onchange = function () {
      window._nsfHotspotCrossStatEnabled = crossChk.checked;
      updateCrossTip();
    };
    window._nsfHotspotCrossStatEnabled = crossChk.checked;
    updateCrossTip();

    // 跨曲目统计功能
    if (!window._nsfHotspotCrossStat) window._nsfHotspotCrossStat = {};
    crossChk.onchange = function () {
      window._nsfHotspotCrossStatEnabled = crossChk.checked;
    };
    window._nsfHotspotCrossStatEnabled = crossChk.checked;

    // 切歌时重置功能
    let resetChk = dlg.querySelector("#nsf-hotspot-resetonsong");
    resetChk.onchange = function () {
      window._nsfHotspotResetOnSong = resetChk.checked;
    };
    resetChk.checked = true;

    let replayBtn = dlg.querySelector("#nsf-replaysong");
    replayBtn.onclick = function () {
      if (typeof nsfPlayer !== "undefined" && typeof nsfCurrentSong !== "undefined") {
        nsfPlayer.playSong(nsfCurrentSong);
      }
    };

    window._nsfHotspotResetOnSong = resetChk.checked;
    window._nsfHotspotLastSong = nsfCurrentSong || 1;
    if (!window._nsfHotspotSongListener) {
      window._nsfHotspotSongListener = setInterval(() => {
        let curSong = nsfCurrentSong || 1;
        if (window._nsfHotspotResetOnSong && window._nsfHotspotLastSong !== curSong) {
          if (nsfPlayer && nsfPlayer.ramReadStat) nsfPlayer.ramReadStat.fill(0);
          if (nsfPlayer && nsfPlayer.ramWriteStat) nsfPlayer.ramWriteStat.fill(0);
          if (nsfPlayer && nsfPlayer.ramExecStat) nsfPlayer.ramExecStat.fill(0);
          if (nsfPlayer && nsfPlayer.romReadStat) nsfPlayer.romReadStat = {};
          window._nsfHotspotLastSong = curSong;
          render();
        } else {
          window._nsfHotspotLastSong = curSong;
        }
      }, 500);
    }

    // 跨曲目统计逻辑
    if (!window._nsfHotspotSongListener2) {
      window._nsfHotspotSongListener2 = setInterval(() => {
        let curSong = typeof nsfCurrentSong !== "undefined" ? nsfCurrentSong : 1;
        if (window._nsfHotspotCrossStatEnabled && window._nsfHotspotLastSong !== curSong) {
          if (nsfPlayer && nsfPlayer.romReadStat) {
            for (let k in nsfPlayer.romReadStat) {
              window._nsfHotspotCrossStat[k] = (window._nsfHotspotCrossStat[k] || 0) + nsfPlayer.romReadStat[k];
            }
          }
        }
      }, 500);
    }
    // 导出JSON
    dlg.querySelector("#nsf-hotspot-export-json").onclick = () => {
      let apuTable = this._getApuWriteTable(true);
      let blob = new Blob([JSON.stringify(apuTable, null, 2)], { type: "application/json" });
      let url = URL.createObjectURL(blob);
      let a = document.createElement("a");
      a.href = url;
      a.download = "nsf_apu_write_stat.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };


    //阈值输入框事件
    let thresholdInput = dlg.querySelector("#nsf-hotspot-threshold");
    if (thresholdInput) {
      thresholdInput.value = window._nsfHotspotThreshold || 3;
      thresholdInput.onchange = function () {
        let v = parseInt(this.value) || 3;
        if (v < 1) v = 1;
        if (v > 32) v = 32;
        window._nsfHotspotThreshold = v;
        render();
      };
    }

    render();
  },
  _findApuWriteAddrs: function () {
    if (!nsfPlayer || !nsfPlayer.mapper || !nsfPlayer.mapper.romData) return [];
    let rom = nsfPlayer.mapper.romData;
    let addrs = [];
    for (let adr = 0x8000; adr < 0x10000; adr++) {
      let op = nsfPlayer.mapper.read(adr);
      // 检查STA/STX/STY绝对寻址写APU
      if ([0x8D, 0x8E, 0x8C].includes(op)) {
        let lo = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
        let hi = nsfPlayer.mapper.read((adr + 2) & 0xFFFF);
        let addr = lo | (hi << 8);
        if (addr >= 0x4000 && addr <= 0x4017) {
          addrs.push({ code: adr, apu: addr });
        }
      }
      // 检查STA绝对,X
      if (op === 0x9D) {
        let lo = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
        let hi = nsfPlayer.mapper.read((adr + 2) & 0xFFFF);
        let addr = lo | (hi << 8);
        if (addr >= 0x4000 && addr <= 0x4017) {
          addrs.push({ code: adr, apu: addr, mode: "abs,X" });
        }
      }
      // 检查STA绝对,Y
      if (op === 0x99) {
        let lo = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
        let hi = nsfPlayer.mapper.read((adr + 2) & 0xFFFF);
        let addr = lo | (hi << 8);
        if (addr >= 0x4000 && addr <= 0x4017) {
          addrs.push({ code: adr, apu: addr, mode: "abs,Y" });
        }
      }
      // 检查STA (ind,X)
      if (op === 0x81) {
        let zp = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
        addrs.push({ code: adr, apu: null, mode: "(ind,X)", zp });
      }
      // 检查STA (ind),Y
      if (op === 0x91) {
        let zp = nsfPlayer.mapper.read((adr + 1) & 0xFFFF);
        addrs.push({ code: adr, apu: null, mode: "(ind),Y", zp });
      }
    }
    return addrs;
  },
  _getApuWriteTable: function (exportDetail = false) {
    let res = this.analyzeHotspots();
    let apuWriteAddrs = this._findApuWriteAddrs();
    let table = [];
    let dataHotspots = res.dataHotspots;
    for (let i = 0; i < dataHotspots.length; i++) {
      let h = dataHotspots[i];
      let apuWriteCount = {};
      let instrTypes = {};
      let addrModes = {};
      // 扩大回溯范围，支持更多寻址
      for (let j = 0; j < apuWriteAddrs.length; j++) {
        let codeAdr = apuWriteAddrs[j].code;
        let apu = apuWriteAddrs[j].apu;
        for (let k = -6; k <= 0; k++) {
          let op = nsfPlayer.mapper.read((codeAdr + k + 0x10000) & 0xFFFF);
          let addrMode = "";
          let addr = null;
          // 支持绝对、绝对X/Y、间接X/Y、零页、零页X/Y
          if (op === 0xAD) { addrMode = "绝对"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF) | (nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF) << 8); }
          else if (op === 0xBD) { addrMode = "绝对,X"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF) | (nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF) << 8); }
          else if (op === 0xB9) { addrMode = "绝对,Y"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF) | (nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF) << 8); }
          else if (op === 0xA1) { addrMode = "(间接,X)"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xB1) { addrMode = "(间接),Y"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xAE) { addrMode = "绝对"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF) | (nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF) << 8); }
          else if (op === 0xAC) { addrMode = "绝对"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF) | (nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF) << 8); }
          // 新增：零页、零页X/Y
          else if (op === 0xA5) { addrMode = "零页"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xB5) { addrMode = "零页,X"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xA6) { addrMode = "零页"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xB6) { addrMode = "零页,Y"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xA4) { addrMode = "零页"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          else if (op === 0xB4) { addrMode = "零页,X"; addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF); }
          // 只统计LDA/LDX/LDY等读取指令
          if ([0xAD, 0xAE, 0xAC, 0xBD, 0xB9, 0xA1, 0xB1, 0xA5, 0xB5, 0xA6, 0xB6, 0xA4, 0xB4].includes(op)) {
            // 零页寻址的addr要和热点区间做特殊判断
            let hit = false;
            if (addr !== null) {
              if (addr >= h.start && addr <= h.end) hit = true;
              // 零页间接的情况可选：可根据实际NSF曲目再扩展
            }
            if (hit) {
              instrTypes[op] = true;
              if (addrMode) addrModes[addrMode] = true;
              if (apu) apuWriteCount[apu] = (apuWriteCount[apu] || 0) + 1;
            }
          }
        }
      }
      let apuStr = Object.entries(apuWriteCount)
        .map(([apu, cnt]) => `$${(+apu).toString(16).toUpperCase().padStart(4, "0")}:${cnt}`)
        .join(" ");
      let instrStr = Object.keys(instrTypes).map(op => {
        if (op == 0xAD) return "LDA abs";
        if (op == 0xAE) return "LDX abs";
        if (op == 0xAC) return "LDY abs";
        if (op == 0xBD) return "LDA abs,X";
        if (op == 0xB9) return "LDA abs,Y";
        if (op == 0xA1) return "LDA (ind,X)";
        if (op == 0xB1) return "LDA (ind),Y";
        if (op == 0xA5) return "LDA zp";
        if (op == 0xB5) return "LDA zp,X";
        if (op == 0xA6) return "LDX zp";
        if (op == 0xB6) return "LDX zp,Y";
        if (op == 0xA4) return "LDY zp";
        if (op == 0xB4) return "LDY zp,X";
        return "未知";
      }).join(",");
      let addrModeStr = Object.keys(addrModes).join(",");
      let row = {
        range: `$${h.start.toString(16).toUpperCase().padStart(4, "0")}-` +
          `$${h.end.toString(16).toUpperCase().padStart(4, "0")}`,
        type: h.type,
        apuWrites: apuStr,
        instrs: instrStr,
        addrModes: addrModeStr
      };
      if (exportDetail) {
        row._apuWriteCount = apuWriteCount;
        row._instrTypes = instrTypes;
        row._addrModes = addrModes;
        row._start = h.start;
        row._end = h.end;
      }
      table.push(row);
    }
    return table;
  },
  _guessDataHotspotType: function (dataHotspots, apuWriteAddrs) {
    // 猜测数据热点类型（音符/乐器/音量等），结合APU写入指令和多种寻址模式
    let labels = [];
    for (let i = 0; i < dataHotspots.length; i++) {
      let h = dataHotspots[i];
      let apuTypes = {};
      let instrTypes = {};
      let addrModes = {};
      let apuWriteCount = {};
      for (let j = 0; j < apuWriteAddrs.length; j++) {
        let codeAdr = apuWriteAddrs[j].code;
        let apu = apuWriteAddrs[j].apu;
        // 回溯更多指令，支持多种寻址
        for (let k = -6; k <= 0; k++) {
          let op = nsfPlayer.mapper.read((codeAdr + k + 0x10000) & 0xFFFF);
          let addr = null;
          let addrMode = "";
          // 绝对、绝对X/Y
          if ([0xAD, 0xAE, 0xAC, 0xBD, 0xB9].includes(op)) {
            let lo = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF);
            let hi = nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF);
            addr = lo | (hi << 8);
            if (op === 0xAD) addrMode = "LDA abs";
            if (op === 0xAE) addrMode = "LDX abs";
            if (op === 0xAC) addrMode = "LDY abs";
            if (op === 0xBD) addrMode = "LDA abs,X";
            if (op === 0xB9) addrMode = "LDA abs,Y";
          }
          // 间接X/Y
          else if ([0xA1, 0xB1].includes(op)) {
            addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF);
            if (op === 0xA1) addrMode = "LDA (ind,X)";
            if (op === 0xB1) addrMode = "LDA (ind),Y";
          }
          // 绝对Y for LDX
          else if (op === 0xBE) {
            let lo = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF);
            let hi = nsfPlayer.mapper.read((codeAdr + k + 2) & 0xFFFF);
            addr = lo | (hi << 8);
            addrMode = "LDX abs,Y";
          }
          // 零页、零页X/Y
          else if ([0xA5, 0xB5, 0xA6, 0xB6, 0xA4, 0xB4].includes(op)) {
            addr = nsfPlayer.mapper.read((codeAdr + k + 1) & 0xFFFF);
            if (op === 0xA5) addrMode = "LDA zp";
            if (op === 0xB5) addrMode = "LDA zp,X";
            if (op === 0xA6) addrMode = "LDX zp";
            if (op === 0xB6) addrMode = "LDX zp,Y";
            if (op === 0xA4) addrMode = "LDY zp";
            if (op === 0xB4) addrMode = "LDY zp,X";
          }
          // 判断是否命中热点区间
          let hit = false;
          if (addr !== null) {
            if (addr >= h.start && addr <= h.end) hit = true;
          }
          if (hit) {
            instrTypes[op] = true;
            if (addrMode) addrModes[addrMode] = true;
            if (apu) apuWriteCount[apu] = (apuWriteCount[apu] || 0) + 1;
            // 根据APU寄存器猜测类型
            if ([0x4000, 0x4004].includes(apu)) apuTypes["音量"] = true;
            if ([0x4002, 0x4003, 0x4006, 0x4007, 0x4008, 0x400A, 0x400B].includes(apu)) apuTypes["音符"] = true;
            if ([0x4001, 0x4005, 0x4009, 0x400C, 0x4010].includes(apu)) apuTypes["乐器"] = true;
            if (![0x4000, 0x4001, 0x4002, 0x4003, 0x4004, 0x4005, 0x4006, 0x4007, 0x4008, 0x4009, 0x400A, 0x400B, 0x400C, 0x4010].includes(apu)) apuTypes["APU参数"] = true;
          }
        }
      }
      let label = "";
      if (Object.keys(apuTypes).length) {
        label = Object.keys(apuTypes).join("/");
        // 如果有多种寻址方式，且区间较长，推断为“表”
        if (Object.keys(addrModes).length > 1 && h.count > 8) label += "表";
        else label += "区";
      }
      if (Object.keys(apuWriteCount).length) {
        let apuStr = Object.entries(apuWriteCount)
          .map(([apu, cnt]) => `$${(+apu).toString(16).toUpperCase().padStart(4, "0")}:${cnt}`)
          .join(" ");
        label += ` [APU写:${apuStr}]`;
      }
      // 补充：如果寻址模式包含零页/间接，且区间较短，可能是“参数”或“指针”
      if (!label && Object.keys(addrModes).length) {
        if (Object.keys(addrModes).some(m => m.includes("zp") || m.includes("ind"))) {
          if (h.count <= 8) label = "参数/指针";
        }
      }
      labels.push(label);
    }
    return labels;
  }
};
