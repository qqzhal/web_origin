// 编辑模式核心逻辑
window.nsfEdit = (function () {
  let container = null;
  let switchToNsfMode = null;
  let nsfBuffer = null;
  let bandInputs = {}; // 04/05/06/07
  let playBtn = null;
  let baseToneSel = null;
  let initLenInput = null;
  let insertLenSel = null;
  let insertLenChk = null;
  let loopChk = null;
  let bandChk = {}; // 04/05/06/07
  let headInputs = {}; // 04/05/06/07
  let btnPanel = null;
  let currentBand = "04";

  // 读取lib/tempnsf.js中的tempnsf数组到内存
  async function loadBaseNsf() {
    if (nsfBuffer) return nsfBuffer;
    if (window.tempnsf && window.tempnsf.length > 0) {
      nsfBuffer = new Uint8Array(window.tempnsf);
      window.nsfBaseBuffer = nsfBuffer;
      return nsfBuffer;
    }
    alert("未找到 tempnsf 数据，请确保 lib/tempnsf.js 已正确加载。");
    throw new Error("no tempnsf data");
  }

  // 检查并自动取消空波段勾选
  function autoUncheckEmptyBands() {
    for (let band of ["04", "05", "06", "07"]) {
      let head = headInputs[band].value.trim();
      let body = bandInputs[band].value.trim();
      // 对于04波段始终保留；其它波段若主体数据为空则取消勾选
      if (band !== "04" && body === "") {
        bandChk[band].checked = false;
      }
    }
  }

  // 生成新的NSF数据（严格模拟C# button16_Click）
  function buildNsfData() {
    autoUncheckEmptyBands();
    let buf = new Uint8Array(nsfBuffer);
    let defaddr = 0x2090;
    // 清空 0x2080-0x407F
    let emptybtye = new Uint8Array(0x2000);
    emptybtye.fill(0xFF);
    buf.set(emptybtye, 0x2080);

    // 头部固定12字节，先全FF
    let onArr = [0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF];
    let bandOrder = ["04", "05", "06", "07"];
    let bandDataMap = {};
    let bandDataArr = {}; // 保存每个波段的最终数据（Uint8Array）
    // 统计每个波段是否有数据
    for (let i = 0; i < bandOrder.length; i++) {
      let band = bandOrder[i];
      let checked = bandChk[band].checked;
      let head = headInputs[band].value.trim();
      let body = bandInputs[band].value.trim();
      let hasData = checked && (head.length > 0 || body.length > 0);
      bandDataMap[band] = hasData;
      if (hasData) {
        // 头部+主体
        let ssss = (headInputs[band].value + " " + bandInputs[band].value).replace(/\r?\n/g, " ").replace(/ +/g, " ").trim();
        // 循环
        if (loopChk.checked) {
          ssss += " E8 10 A0";
          ssss = ssss.replace(/  +/g, " ");
        }
        if (ssss.endsWith(" ")) ssss = ssss.slice(0, -1);
        let stdb = ssss.split(" ");
        let DB = new Uint8Array(stdb.length);
        for (let j = 0; j < stdb.length; j++) DB[j] = parseInt(stdb[j], 16);
        bandDataArr[band] = DB;
      } else {
        bandDataArr[band] = null;
      }
    }
    // 必须至少有一个波段有数据
    if (!bandOrder.some(b => bandDataMap[b])) {
      alert("请勾选波段并输入数据!");
      return buf;
    }

    // 计算每个波段的实际数据起始地址
    let addrMap = {};
    let curAddr = defaddr;
    for (let i = 0; i < bandOrder.length; i++) {
      let band = bandOrder[i];
      if (bandDataMap[band]) {
        addrMap[band] = curAddr;
        curAddr += bandDataArr[band].length;
      } else {
        addrMap[band] = null;
      }
    }

    // 写头部索引
    for (let i = 0; i < bandOrder.length; i++) {
      let band = bandOrder[i];
      if (!bandDataMap[band]) {
        // 没有数据，直接写 FF FF FF
        onArr[i*3+0] = 0xFF;
        onArr[i*3+1] = 0xFF;
        onArr[i*3+2] = 0xFF;
        continue;
      }
      if (band === "04") {
        // 04波段索引固定
        onArr[0] = 0x04;
        onArr[1] = 0x10;
        onArr[2] = 0xA0;
      } else {
        // 其它波段索引=实际数据地址-0x2080
        let offset = addrMap[band] - 0x2080;
        let low = offset & 0xFF;
        let high = 0xA0 + ((offset >> 8) & 0xFF);
        onArr[i*3+0] = parseInt(band,16);
        onArr[i*3+1] = low;
        onArr[i*3+2] = high;
        // 数据结尾写跳转指针（如有需要）
        let DB = bandDataArr[band];
        if (DB.length >= 2) {
          DB[DB.length - 2] = low;
          DB[DB.length - 1] = high;
        }
      }
    }

    // 写入头部
    buf.set(onArr, 0x2080);

    // 写入各波段数据
    for (let i = 0; i < bandOrder.length; i++) {
      let band = bandOrder[i];
      if (bandDataMap[band]) {
        buf.set(bandDataArr[band], addrMap[band]);
      }
    }
    return buf;
  }

  // 新增：为波形编辑器提供单行播放的NSF数据生成方法
  function buildSingleNsfData(nsfText) {
    // nsfText: 头部+主体（如 "E2 40 E3 00 E0 14 8B 0C 8A"）
    // 生成一个最小NSF文件，仅含一个波段（04），其它波段全FF
    let base = window.tempnsf && window.tempnsf.length > 0 ? window.tempnsf : null;
    if (!base) {
      alert("未找到 tempnsf 数据，请确保 lib/tempnsf.js 已正确加载。");
      return null;
    }
    let buf = new Uint8Array(base);
    // 清空 0x2080-0x407F
    let emptybtye = new Uint8Array(0x2000);
    emptybtye.fill(0xFF);
    buf.set(emptybtye, 0x2080);

    // 头部固定12字节，先全FF
    let onArr = [0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF, 0xFF,0xFF,0xFF];
    // 只写04波段
    onArr[0] = 0x04;
    onArr[1] = 0x10;
    onArr[2] = 0xA0;
    buf.set(onArr, 0x2080);

    // 主体数据
    let ssss = nsfText.replace(/\r?\n/g, " ").replace(/ +/g, " ").trim();
    let stdb = ssss.split(" ");
    let DB = new Uint8Array(stdb.length);
    for (let j = 0; j < stdb.length; j++) DB[j] = parseInt(stdb[j], 16);
    buf.set(DB, 0x2090);

    return buf;
  }

  // 按钮面板插入音符
  function insertNote(tag) {
    let tb = bandInputs[currentBand];
    let baseIdx = baseToneSel.selectedIndex;
    let note = "";
    if (insertLenChk.checked) {
      note += insertLenSel.value + " ";
      insertLenChk.checked = false;
    }
    note += baseIdx + tag + " ";
    if (insertLenChk.checked) {
      note += initLenInput.value + " ";
    }
    tb.value += note;
    tb.focus();
  }

  // 切换波段
  function switchBand(band) {
    currentBand = band;
    // 高亮tab
    for (let b of ["04", "05", "06", "07"]) {
      document.getElementById("ct2edit-tab-" + b).style.background = (b === band) ? "#333" : "#222";
    }
  }

  // 新增：动态加载 editorWave.js
  function ensureWaveEditorLoaded(callback) {
    if (window.waveEditor) {
      callback();
      return;
    }
    let script = document.createElement("script");
    script.src = "js/editorWave.js?v45";
    script.id = "ct2-editorWave-script";
    script.onload = function () {
      callback();
    };
    script.onerror = function () {
      alert("加载 editorWave.js 失败！");
    };
    document.body.appendChild(script);
  }

  function showEditUI(switchBack) {
    switchToNsfMode = switchBack;
    if (!container) {
      container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.background = "rgba(24,24,24,0.98)";
      container.style.zIndex = "1000";
      container.style.color = "#fff";
      container.style.fontFamily = "monospace";
      container.style.overflow = "auto";
      // 主体UI
      container.innerHTML = `
        <div style="margin:24px;max-width:1100px;">
          <h2>CT2音乐编辑器 <button id="ct2edit-back" style="float:right;">NSF模式</button></h2>
          <div style="margin-bottom:12px;">支持波段头部、主体数据、基调、初始音长、音长插入、循环、按钮面板等功能。</div>
          <div style="display:flex;gap:16px;">
            <div style="flex:1;">
              <div id="ct2edit-tabs" style="display:flex;gap:4px;margin-bottom:8px;"></div>
              <div id="ct2edit-bandarea"></div>
            </div>
            <div style="width:220px;">
              <div style="margin-bottom:8px;">
                <label>基调
                  <select id="ct2edit-basetone">
                    <option value="0">+00</option>
                    <option value="1">+10</option>
                    <option value="2">+20</option>
                    <option value="3">+30</option>
                    <option value="4">+40</option>
                    <option value="5">+50</option>
                    <option value="6">+60</option>
                  </select>
                </label>
              </div>
              <div style="margin-bottom:8px;">
                <label>初始音长 <input id="ct2edit-initlen" value="8B" style="width:40px;text-align:center;"></label>
              </div>
              <div style="margin-bottom:8px;">
                <label><input type="checkbox" id="ct2edit-insertlen-chk">插入音长</label>
                <select id="ct2edit-insertlen" style="width:60px;">
                  ${Array.from({length: 0x2F}, (_,i)=> (0x80+i).toString(16).toUpperCase().padStart(2,"0")).map(x=>`<option value="${x}">${x}</option>`).join("")}
                </select>
              </div>
              <div style="margin-bottom:8px;">
                <label><input type="checkbox" id="ct2edit-loop" checked>循环播放</label>
              </div>
              <div style="margin-bottom:8px;">
                <label><input type="checkbox" id="ct2edit-bandchk-04" checked>04</label>
                <label><input type="checkbox" id="ct2edit-bandchk-05" checked>05</label>
                <label><input type="checkbox" id="ct2edit-bandchk-06" checked>06</label>
                <label><input type="checkbox" id="ct2edit-bandchk-07" checked>07</label>
              </div>
              <div style="margin-bottom:8px;">
                <button id="ct2edit-play" style="font-size:18px;width:100%;">生成并播放</button>
              </div>
              <div id="ct2edit-btnpanel"></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      // 新增：首次进入编辑模式时预填波段04的数据
      if (!container.getAttribute("data-init")) {
        setTimeout(() => {
          if (bandInputs["04"] && bandInputs["04"].value.trim() === "") {
            bandInputs["04"].value = "0C 8A 20 20 1B 8F 20 8A 1B 20 1B 8F 20 98 22 8A 1B 1B 19 95 1B 8A 19 1B 19 95 1B 98 20 8F 19 20 24 22 20 99 24 0C 8F 25 24 8A 22 20 8F 0C 8A 20 20 1B 8F 20 8A 1B 20 1B 8F 20 98 22 8A 1B 1B 19 95 1B 8A 19 1B 19 95 1B 98 20 8F 19 20 24 22 20 99 20 0C 8F 19 1B 1C 20 20 20 20 20 2C 19 1B 20 20 20 22 22 2C 17 19 1B 1B 1B 1B 1B 1C 17 19 1B 1B 1B 20 20 2C 20 22 24 24 24 19 20 2C 20 24 24 24 19 20 2C 20 22 24 24 24 24 2C 20 22 95 22 24 0C 90 17 8E 25 E0 14 99 24 8E 0C 8F 25 90 24 92 22 8E 0C 8F 20 8F 22 8F 24 9A 20 90 19 20 9A 27 90 20 24 9A 24 90 0C 17 8E 25 E0 14 99 24 8E 0C 8F 25 90 24 93 22 8F 0C 91 20 91 22 8F 24 9A 29 8F 24 19 9A 20 8F 22 9A 20";
          }
        }, 0);
        container.setAttribute("data-init", "true");
      }

      // 波段tab和输入区
      let tabs = container.querySelector("#ct2edit-tabs");
      let bandarea = container.querySelector("#ct2edit-bandarea");
      for (let band of ["04", "05", "06", "07"]) {
        let tab = document.createElement("button");
        tab.id = "ct2edit-tab-" + band;
        tab.textContent = "波段" + band;
        tab.style.background = band === "04" ? "#333" : "#222";
        tab.style.color = "#fff";
        tab.style.border = "none";
        tab.style.padding = "6px 16px";
        tab.style.cursor = "pointer";
        tab.onclick = () => switchBand(band);
        tabs.appendChild(tab);

        let bandDiv = document.createElement("div");
        bandDiv.id = "ct2edit-banddiv-" + band;
        bandDiv.style.display = band === "04" ? "" : "none";
        bandDiv.innerHTML = `
          <div style="margin-bottom:4px;">
            <label>头部数据</label>
            <input id="ct2edit-head-${band}" value="E2 40 E3 00 E0 14 8B" style="width:320px;">
          </div>
          <div>
            <label>主体数据</label>
            <textarea id="ct2edit-bandinput-${band}" style="width:98%;height:80px;background:#222;color:#fff;"></textarea>
          </div>
        `;
        bandarea.appendChild(bandDiv);

        bandInputs[band] = bandDiv.querySelector(`#ct2edit-bandinput-${band}`);
        headInputs[band] = bandDiv.querySelector(`#ct2edit-head-${band}`);
      }

      // 切换tab
      for (let band of ["04", "05", "06", "07"]) {
        document.getElementById("ct2edit-tab-" + band).onclick = () => {
          for (let b of ["04", "05", "06", "07"]) {
            document.getElementById("ct2edit-banddiv-" + b).style.display = (b === band) ? "" : "none";
          }
          switchBand(band);
        };
      }

      // 右侧控件
      baseToneSel = container.querySelector("#ct2edit-basetone");
      initLenInput = container.querySelector("#ct2edit-initlen");
      insertLenSel = container.querySelector("#ct2edit-insertlen");
      insertLenChk = container.querySelector("#ct2edit-insertlen-chk");
      loopChk = container.querySelector("#ct2edit-loop");
      playBtn = container.querySelector("#ct2edit-play");
      btnPanel = container.querySelector("#ct2edit-btnpanel");
      for (let band of ["04", "05", "06", "07"]) {
        bandChk[band] = container.querySelector(`#ct2edit-bandchk-${band}`);
      }

      // 按钮面板
      btnPanel.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          <button data-tag="0">C(1)</button>
          <button data-tag="1">C#(#1/b2)</button>
          <button data-tag="2">D(2)</button>
          <button data-tag="3">D#(#2/b3)</button>
          <button data-tag="4">E(3)</button>
          <button data-tag="5">F(4)</button>
          <button data-tag="6">F#(#4/b5)</button>
          <button data-tag="7">G(5)</button>
          <button data-tag="8">G#(#5/b6)</button>
          <button data-tag="9">A(6)</button>
          <button data-tag="A">A#(#6/b7)</button>
          <button data-tag="B">B(7)</button>
          <button data-tag="C">休止符C</button>
          <button data-tag="D">休止符D</button>
        </div>
        <div style="margin-top:8px;">
          <label>插入控制代码：</label>
          <select id="ct2edit-ctrlcode">
            <option value="">选择控制代码</option>
            <option value="E0 XX">E0 XX (乐器代码)</option>
            <option value="E2 XX">E2 XX (音色代码)</option>
            <option value="E3 XX">E3 XX (音量代码)</option>
            <option value="E5 XX">E5 XX (音调微调)</option>
            <option value="EB XX">EB XX (循环次数)</option>
            <option value="EC">EC (循环结束)</option>
            <option value="E8 XX XX">E8 XX XX (循环索引)</option>
            <option value="E9 XX XX">E9 XX XX (循环索引)</option>
            <option value="EA">EA (循环结束)</option>
            <option value="ED XX">ED XX (颤音)</option>
            <option value="EF">EF (颤音结束)</option>
            <option value="F9">F9 (DPCM轻鼓点)</option>
            <option value="FA">FA (DPCM重鼓点)</option>
          </select>
          <button id="ct2edit-insertctrl">插入</button>
        </div>
        <div id="ct2edit-ctrlhelp" style="margin-top:4px;color:#ff8;font-size:13px;min-height:18px;"></div>
      `;
      btnPanel.querySelectorAll("button[data-tag]").forEach(btn => {
        btn.onclick = () => insertNote(btn.getAttribute("data-tag"));
      });

      // 控制代码说明
      const ctrlCodeHelp = {
        "E0": "E0 XX：乐器代码，00-3F（可扩展），部分乐器效果相同。",
        "E2": "E2 XX：音色代码，00/40/80/C0，40与C0效果相同，06/07通道无效。",
        "E3": "E3 XX：音量代码，00最大，0F最小，06通道无效。",
        "E5": "E5 XX：音调微调，01-7F升高，81-FF降低。",
        "EB": "EB XX：循环次数，后接循环内容，以EC结束。",
        "EC": "EC：循环结束。",
        "E8": "E8 XX XX：循环索引，返回到指定索引无限循环。",
        "E9": "E9 XX XX：循环索引，需EA结束。",
        "EA": "EA：E9循环结束。",
        "ED": "ED XX：颤音，01-02，后接音符，EF结束。",
        "EF": "EF：颤音结束。",
        "F9": "F9：DPCM轻鼓点，后接10消除噪音。",
        "FA": "FA：DPCM重鼓点，后接10消除噪音。"
      };

      // 控制代码插入
      btnPanel.querySelector("#ct2edit-insertctrl").onclick = function() {
        let sel = btnPanel.querySelector("#ct2edit-ctrlcode");
        let val = sel.value;
        if (!val) return;
        let tb = bandInputs[currentBand];
        let insert = val.replace(/XX/g, "00");
        // 插入到光标处
        if (tb.setRangeText) {
          let start = tb.selectionStart, end = tb.selectionEnd;
          tb.setRangeText(insert + " ", start, end, "end");
        } else {
          tb.value += insert + " ";
        }
        tb.focus();
        // 显示说明
        let code = val.split(" ")[0];
        btnPanel.querySelector("#ct2edit-ctrlhelp").textContent = ctrlCodeHelp[code] || "";
      };

      // 控制代码说明悬浮
      btnPanel.querySelector("#ct2edit-ctrlcode").onchange = function() {
        let val = this.value;
        let code = val.split(" ")[0];
        btnPanel.querySelector("#ct2edit-ctrlhelp").textContent = ctrlCodeHelp[code] || "";
      };

      // 主体数据输入区高亮/提示控制代码
      for (let band of ["04", "05", "06", "07"]) {
        let textarea = bandInputs[band];
        textarea.oninput = function() {
          // 简单高亮：检测E0/E2/E3/E5/EB/EC/E8/E9/EA/ED/EF/F9/FA等
          // 可扩展为更复杂的语法高亮
          let val = textarea.value;
          let html = val.replace(/(E0|E2|E3|E5|EB|EC|E8|E9|EA|ED|EF|F9|FA)( [0-9A-F]{2})?/gi, function(m) {
            return `<span style="color:#ff8;" title="${ctrlCodeHelp[m.substr(0,2).toUpperCase()]||''}">${m}</span>`;
          });
          // 仅做预览，不改变原内容
          let previewId = "ct2edit-preview-" + band;
          let preview = document.getElementById(previewId);
          if (!preview) {
            preview = document.createElement("div");
            preview.id = previewId;
            preview.style.background = "#222";
            preview.style.color = "#fff";
            preview.style.fontSize = "13px";
            preview.style.marginTop = "2px";
            preview.style.whiteSpace = "pre-wrap";
            textarea.parentNode.appendChild(preview);
          }
          preview.innerHTML = html;
        };
      }

      // 绑定“生成并播放”
      playBtn.onclick = function () {
        let nsfData = buildNsfData();
        if (typeof window.loadRom === "function") {
          window.loadRom(nsfData, "edit.nsf");
          // 不关闭浮动层
          // 播放时如NSF处于暂停状态，自动恢复播放
          setTimeout(() => {
            if (window.nsfPaused && window.nsfAudioHandler && typeof window.nsfAudioHandler.start === "function") {
              window.nsfAudioHandler.start();
              window.nsfPaused = false;
              if (typeof window.nsfLoopId === "number" && typeof window.nsfUpdate === "function") {
                window.nsfLoopId = requestAnimationFrame(window.nsfUpdate);
              }
            }
          }, 200);
        } else {
          alert("NSF播放功能未实现");
        }
      };

      // 新增：生成并下载按钮
      let downloadBtn = document.createElement("button");
      downloadBtn.id = "ct2edit-download";
      downloadBtn.textContent = "生成并下载";
      downloadBtn.style.fontSize = "18px";
      downloadBtn.style.width = "100%";
      downloadBtn.style.marginTop = "6px";
      playBtn.parentNode.appendChild(downloadBtn);

      downloadBtn.onclick = function () {
        let nsfData = buildNsfData();
        let blob = new Blob([nsfData], { type: "application/octet-stream" });
        let url = URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "edit.nsf";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      };

      // 新增：波形编辑按钮
      let waveBtn = document.createElement("button");
      waveBtn.id = "ct2edit-wave";
      waveBtn.textContent = "波形编辑";
      waveBtn.style.fontSize = "18px";
      waveBtn.style.width = "100%";
      waveBtn.style.marginTop = "6px";
      btnPanel.appendChild(waveBtn);
      waveBtn.onclick = function () {
        ensureWaveEditorLoaded(() => {
          let waveContainer = document.getElementById("ct2edit-wave-container");
          if (!waveContainer) {
            waveContainer = document.createElement("div");
            waveContainer.id = "ct2edit-wave-container";
            waveContainer.style.position = "fixed";
            waveContainer.style.left = "50%";
            waveContainer.style.top = "2%";
            waveContainer.style.transform = "translateX(-50%)";
            waveContainer.style.width = "1020px";
            waveContainer.style.height = "540px";
            waveContainer.style.background = "#222";
            waveContainer.style.border = "2px solid #333";
            waveContainer.style.zIndex = "1200";
            waveContainer.style.overflow = "auto";

            // 顶部操作区（不随滚动，单独div包裹）
            let topBarWrap = document.createElement("div");
            topBarWrap.style.position = "absolute";
            topBarWrap.style.top = "0";
            topBarWrap.style.left = "0";
            topBarWrap.style.width = "100%";
            topBarWrap.style.zIndex = "10";
            topBarWrap.style.pointerEvents = "none"; // 让子元素可点

            let topBar = document.createElement("div");
            topBar.style.background = "#222";
            topBar.style.display = "flex";
            topBar.style.justifyContent = "flex-start";
            topBar.style.alignItems = "center";
            topBar.style.gap = "12px";
            topBar.style.padding = "8px 16px";
            topBar.style.pointerEvents = "auto";

            // 关闭按钮
            let closeBtn = document.createElement("button");
            closeBtn.textContent = "关闭波形编辑";
            closeBtn.onclick = function () {
              waveContainer.style.display = "none";
            };
            // 导入按钮
            let importBtn = document.createElement("button");
            importBtn.textContent = "导入波形编辑数据";
            importBtn.onclick = function () {
              let exportText = window.waveEditor.exportToNsfText();
              if (bandInputs["04"]) {
                bandInputs["04"].value = exportText;
              }
              waveContainer.style.display = "none";
            };
            // 说明
            let tip = document.createElement("span");
            tip.textContent = "编辑完成后点击“导入波形编辑数据”即可同步到主编辑区";
            tip.style.color = "#FFD700";
            tip.style.fontSize = "14px";
            tip.style.marginLeft = "16px";
            topBar.appendChild(closeBtn);
            topBar.appendChild(importBtn);
            topBar.appendChild(tip);
            topBarWrap.appendChild(topBar);
            waveContainer.appendChild(topBarWrap);

            // 编辑器容器外再包一层，避免按钮随内容滚动
            let editorWrap = document.createElement("div");
            editorWrap.style.position = "absolute";
            editorWrap.style.top = "56px";
            editorWrap.style.left = "0";
            editorWrap.style.right = "0";
            editorWrap.style.bottom = "0";
            editorWrap.style.overflow = "auto";
            editorWrap.style.height = "calc(100% - 56px)";
            let editorDiv = document.createElement("div");
            editorDiv.id = "wave-editor-div";
            editorDiv.style.display = "flex";
            editorDiv.style.justifyContent = "center";
            editorWrap.appendChild(editorDiv);
            waveContainer.appendChild(editorWrap);

            document.body.appendChild(waveContainer);
          }

          // 传递数据前，格式化为两位16进制，支持控制符
          if (bandInputs["04"]) {
            let raw = bandInputs["04"].value.trim().replace(/\s+/g, " ");
            let arr = raw.split(" ").filter(x => x.length > 0);
            let fixed = [];
            for (let i = 0; i < arr.length;) {
              let v = arr[i].toUpperCase();
              // 检查控制符
              if (
                ["E8", "E9"].includes(v) && i + 2 < arr.length
              ) {
                fixed.push(v, arr[i + 1].toUpperCase().padStart(2, "0"), arr[i + 2].toUpperCase().padStart(2, "0"));
                i += 3;
              } else if (
                ["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(v) && i + 1 < arr.length
              ) {
                fixed.push(v, arr[i + 1].toUpperCase().padStart(2, "0"));
                i += 2;
              } else if (
                ["EC", "EA", "EF", "E1", "E6", "E7", "EE", "F3", "F4", "F9", "FA", "FB"].includes(v)
              ) {
                fixed.push(v);
                i += 1;
              } else {
                // 普通音符
                fixed.push(v.padStart(2, "0"));
                if (i + 1 < arr.length) fixed.push(arr[i + 1].toUpperCase().padStart(2, "0"));
                i += 2;
              }
            }
            window.waveEditor.initEditor("wave-editor-div");
            window.waveEditor.importData(fixed.join(" "));
          }
          waveContainer.style.display = "block";
        });
      };

      // 返回按钮
      container.querySelector("#ct2edit-back").onclick = function () {
        hideEditUI();
        if (switchToNsfMode) switchToNsfMode();
      };
    }
    container.style.display = "";

    // 动态加载 lib/tempnsf.js
    function ensureTempNsfLoaded(callback) {
      if (window.tempnsf && window.tempnsf.length > 0) {
        callback();
        return;
      }
      if (document.getElementById("ct2-tempnsf-script")) {
        let check = setInterval(() => {
          if (window.tempnsf && window.tempnsf.length > 0) {
            clearInterval(check);
            callback();
          }
        }, 50);
        return;
      }
      let script = document.createElement("script");
      script.src = "lib/tempnsf.js";
      script.id = "ct2-tempnsf-script";
      script.onload = function () {
        callback();
      };
      script.onerror = function () {
        alert("加载 lib/tempnsf.js 失败！");
      };
      document.body.appendChild(script);
    }

    ensureTempNsfLoaded(() => {
      loadBaseNsf();
    });
  }

  function hideEditUI() {
    if (container) container.style.display = "none";
  }

  // 先定义返回对象
  const nsfEditApi = {
    showEditUI,
    hideEditUI
  };

  // 挂载给外部调用（如 editorWave.js）
  nsfEditApi.buildSingleNsfData = buildSingleNsfData;
  nsfEditApi.getCurrentHead = function() {
    if (headInputs && headInputs["04"]) return headInputs["04"].value.trim();
    return "";
  };

  return nsfEditApi;
})();
