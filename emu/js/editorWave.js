// 极简NSF音符编辑器，支持自动索引显示与循环/控制符插入，参考关于天2音乐修改.txt

(function() {
  let notes = [];
  let container = null;
  // NSF 04波段数据起始地址
  const NSF_BASE_ADDR = 0x10A0;

  // 控制符说明（参考txt）
  const ctrlCodeHelp = {
    "E0": "E0 XX：乐器代码，00-3F（可扩展），部分乐器效果相同。",
    "E1": "E1：意义不明，通常不用。",
    "E2": "E2 XX：音色代码，00/40/80/C0，40与C0效果相同，06/07通道无效。",
    "E3": "E3 XX：音量代码，00最大，0F最小，06通道无效。",
    "E4": "E4 XX：音量渐变，80-FF有效，需与E0配合，仅方波通道。",
    "E5": "E5 XX：音调微调，01-7F升高，81-FF降低。",
    "E6": "E6：意义不明。",
    "E7": "E7：意义不明。",
    "E8": "E8 XX XX：循环索引，返回到指定索引无限循环。",
    "E9": "E9 XX XX：循环索引，需EA结束。",
    "EA": "EA：E9循环结束。",
    "EB": "EB XX：循环次数，后接循环内容，以EC结束。",
    "EC": "EC：EB循环结束。",
    "ED": "ED XX：颤音，01-02，后接音符，EF结束。",
    "EE": "EE：意义不明。",
    "EF": "EF：颤音结束。",
    "F3": "F3：音量释放开始（通常ED-EF内）。",
    "F4": "F4：音量释放结束。",
    "F9": "F9：DPCM轻鼓点，后接10消除噪音。",
    "FA": "FA：DPCM重鼓点，后接10消除噪音。",
    "FB": "FB：DPCM鼓掌声，后接10消除噪音。"
  };

  function parseNsfText(text) {
    let arr = [];
    if (!text) return arr;
    let parts = text.trim().split(/\s+/);
    for (let i = 0; i < parts.length;) {
      let v = parts[i].toUpperCase();
      if (
        ["E8", "E9"].includes(v) && i + 2 < parts.length
      ) {
        arr.push({ note: `CTRL:${v}`, duration: parts[i + 1].toUpperCase() + " " + parts[i + 2].toUpperCase() });
        i += 3;
      } else if (
        ["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(v) && i + 1 < parts.length
      ) {
        arr.push({ note: `CTRL:${v}`, duration: parts[i + 1].toUpperCase() });
        i += 2;
      } else if (
        ["EC", "EA", "EF", "E1", "E6", "E7", "EE", "F3", "F4", "F9", "FA", "FB"].includes(v)
      ) {
        arr.push({ note: `CTRL:${v}`, duration: "" });
        i += 1;
      } else {
        // 普通音符
        let note = parseInt(parts[i], 16);
        let duration = (i + 1 < parts.length) ? parseInt(parts[i + 1], 16) : 0;
        arr.push({ note, duration });
        i += 2;
      }
    }
    return arr;
  }

  function toNsfText(arr) {
    let out = [];
    for (let n of arr) {
      if (typeof n.note === "string" && n.note.startsWith("CTRL:")) {
        let code = n.note.substr(5, 2).toUpperCase();
        if (["E8", "E9"].includes(code)) {
          let [hi, lo] = n.duration.split(" ");
          out.push(code, hi, lo);
        } else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(code)) {
          out.push(code, n.duration);
        } else if (["EC", "EA", "EF", "E1", "E6", "E7", "EE", "F3", "F4", "F9", "FA", "FB"].includes(code)) {
          out.push(code);
        }
      } else {
        out.push(
          n.note.toString(16).toUpperCase().padStart(2, "0"),
          n.duration.toString(16).toUpperCase().padStart(2, "0")
        );
      }
    }
    return out.join(" ");
  }
  function noteName(n) {
    if (n === 0x20) return "休止符";
    const names = [
      "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
    ];
    let octave = Math.floor(n / 12);
    let idx = n % 12;
    return names[idx] + octave;
  }
  // 计算每一行的偏移（字节数）
  function calcOffsets() {
    let offsets = [];
    let offset = 0;
    for (let i = 0; i < notes.length; i++) {
      offsets.push(offset);
      let n = notes[i];
      if (typeof n.note === "string" && n.note.startsWith("CTRL:")) {
        let code = n.note.substr(5, 2).toUpperCase();
        // 3字节控制符
        if (["E8", "E9"].includes(code)) offset += 3;
        // 2字节控制符
        else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(code)) offset += 2;
        // 1字节控制符
        else offset += 1;
      } else {
        offset += 2;
      }
    }
    return offsets;
  }
  // 插入控制代码（支持成对插入和默认参数）
  function insertCtrl(type, idx) {
    // type: 控制符字符串, idx: 目标行号（用于E8/E9索引）
    // 成对控制符及默认参数
    if (type === "E8") {
      // 无限循环，通常成对插入（如E8 XX XX在结尾）
      let offsets = calcOffsets();
      let addr = NSF_BASE_ADDR + offsets[idx];
      let addrHex = addr.toString(16).toUpperCase().padStart(4, "0");
      let hi = addrHex.slice(0, 2);
      let lo = addrHex.slice(2, 4);
      notes.push({ note: `CTRL:E8`, duration: `${hi} ${lo}` });
    } else if (type === "E9") {
      // E9 XX XX ... EA
      let offsets = calcOffsets();
      let addr = NSF_BASE_ADDR + offsets[idx];
      let addrHex = addr.toString(16).toUpperCase().padStart(4, "0");
      let hi = addrHex.slice(0, 2);
      let lo = addrHex.slice(2, 4);
      notes.push({ note: `CTRL:E9`, duration: `${hi} ${lo}` });
      // 自动补EA
      notes.push({ note: `CTRL:EA`, duration: "" });
    } else if (type === "EB") {
      // EB XX ... EC
      notes.push({ note: `CTRL:EB`, duration: "02" }); // 默认循环2次
      // 自动补EC
      notes.push({ note: `CTRL:EC`, duration: "" });
    } else if (type === "ED") {
      // ED XX ... EF
      notes.push({ note: `CTRL:ED`, duration: "01" }); // 默认颤音01
      // 自动补一个音符
      notes.push({ note: 0x0C, duration: 0x8A });
      // 自动补EF
      notes.push({ note: `CTRL:EF`, duration: "" });
    } else if (type === "E0") {
      notes.push({ note: `CTRL:E0`, duration: "14" }); // 默认乐器14
    } else if (type === "E2") {
      notes.push({ note: `CTRL:E2`, duration: "40" }); // 默认音色40
    } else if (type === "E3") {
      notes.push({ note: `CTRL:E3`, duration: "00" }); // 默认音量最大
    } else if (type === "E4") {
      notes.push({ note: `CTRL:E4`, duration: "80" }); // 默认渐变80
    } else if (type === "E5") {
      notes.push({ note: `CTRL:E5`, duration: "01" }); // 默认微调01
    } else if (["EC", "EA", "EF", "E1", "E6", "E7", "EE", "F3", "F4", "F9", "FA", "FB"].includes(type)) {
      notes.push({ note: `CTRL:${type}`, duration: "" });
    }
    render();
  }
  // 渲染
  function render(scrollTo, highlightRow) {
    if (!container) return;
    // 清空容器
    container.innerHTML = "";

    // 顶部按钮区（固定）
    let topBar = document.createElement("div");
    topBar.id = "ct2editdefbtn";
    topBar.innerHTML = `
      <button id="wave-import">导入</button>
      <button id="wave-export">导出</button>
      <button id="wave-clear">清空</button>
    `;
    container.appendChild(topBar);

    // 控制按钮区（固定，紧接顶部按钮下方）
    let ctrlBar = document.createElement("div");
    ctrlBar.id = "ct2editconbtn";
    ctrlBar.innerHTML = `
      <button id="wave-add">添加音符</button>
      <button id="wave-add-eb">插入EB循环(自动EC)</button>
      <button id="wave-add-e8">插入E8循环索引</button>
      <button id="wave-add-e9">插入E9循环索引(自动EA)</button>
      <button id="wave-add-ed">插入ED颤音(自动音符+EF)</button>
      <button id="wave-add-e0">E0乐器</button>
      <button id="wave-add-e2">E2音色</button>
      <button id="wave-add-e3">E3音量</button>
      <button id="wave-add-e4">E4渐变</button>
      <button id="wave-add-e5">E5微调</button>
      <button id="wave-add-ef">EF颤音结束</button>
      <button id="wave-add-ec">EC循环结束</button>
      <button id="wave-add-ea">EA循环结束</button>
      <button id="wave-add-f3">F3释放</button>
      <button id="wave-add-f4">F4释放结束</button>
      <button id="wave-add-f9">F9鼓点</button>
      <button id="wave-add-fa">FA重鼓</button>
      <button id="wave-add-fb">FB鼓掌</button>
<br><div id="wave-ctrlhelp" style="margin-top:8px;color:#FFD700;font-size:13px;min-height:18px;text-align:center;"></div>
    `;
    container.appendChild(ctrlBar);

    // 主内容区（表格+说明），滚动区
    let mainWrap = document.createElement("div");
    mainWrap.style.position = "absolute";
    mainWrap.style.top = "80px";
    mainWrap.style.left = "0";
    mainWrap.style.right = "0";
    mainWrap.style.bottom = "0";
    mainWrap.style.overflow = "auto";
    mainWrap.style.background = "#222";
    mainWrap.id = "wave-mainwrap";

    // 新增：表头添加“播放”列
    mainWrap.innerHTML = `
      <table id="wave-table" style="width:100%;border-collapse:collapse;background:#222;color:#fff;">
        <thead>
          <tr>
            <th style="width:36px;">#</th>
            <th style="width:120px;">音高/控制</th>
            <th style="width:80px;">音长/参数</th>
            <th style="width:120px;">索引</th>
            <th style="width:60px;">播放</th>
            <th style="width:180px;">操作</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;
    container.appendChild(mainWrap);

    // 多行选中支持
    let selectedRows = render.selectedRows || [];
    function selectRow(idx, e) {
      let trs = container.querySelectorAll("#wave-table tbody tr");
      if (e && (e.ctrlKey || e.metaKey)) {
        // 多选
        if (selectedRows.includes(idx)) {
          selectedRows = selectedRows.filter(i => i !== idx);
        } else {
          selectedRows.push(idx);
        }
      } else {
        selectedRows = [idx];
      }
      trs.forEach((tr, i) => {
        tr.style.background = selectedRows.includes(i) ? "#444" : "";
      });
      render.selectedRows = selectedRows;
    }

    let tbody = mainWrap.querySelector("#wave-table tbody");
    let offsets = calcOffsets();

    // 新增：播放单行音符/控制符（带合法性校验）
    function playSingleRow(idx) {
      let row = notes[idx];
      if (!row) return;

      // 头部数据可用默认或从主编辑器传递
      let head = "E2 40 E3 00 E0 14 8B";
      if (window.nsfEdit && window.nsfEdit.getCurrentHead) {
        let h = window.nsfEdit.getCurrentHead();
        if (h) head = h;
      }

      // 校验函数
      function showError(msg) {
        alert("播放校验失败: " + msg);
      }

      // 校验控制符参数合法性
      function validateCtrl(row, idx) {
        if (typeof row.note !== "string" || !row.note.startsWith("CTRL:")) return true;
        let code = row.note.substr(5, 2).toUpperCase();
        // E0/E2/E3/E4/E5/ED/EB 必须有参数
        if (["E0", "E2", "E3", "E4", "E5", "ED", "EB"].includes(code)) {
          if (!row.duration || !/^[0-9A-F]{2}$/i.test(row.duration)) {
            showError(code + " 缺少或参数格式错误，应为两位十六进制");
            return false;
          }
        }
        // E8/E9 必须有两个参数
        if (["E8", "E9"].includes(code)) {
          if (!row.duration || !/^[0-9A-F]{2} [0-9A-F]{2}$/i.test(row.duration)) {
            showError(code + " 缺少或参数格式错误，应为“XX XX”");
            return false;
          }
        }
        // E3 仅限00-0F
        if (code === "E3" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (isNaN(v) || v < 0x00 || v > 0x0F) {
            showError("E3 XX 音量参数仅允许00-0F");
            return false;
          }
        }
        // E2 仅限00/40/80/C0
        if (code === "E2" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (![0x00, 0x40, 0x80, 0xC0].includes(v)) {
            showError("E2 XX 音色参数仅允许00/40/80/C0");
            return false;
          }
        }
        // E5 00-FF, 01-7F升高, 81-FF降低
        if (code === "E5" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (isNaN(v) || v < 0x00 || v > 0xFF) {
            showError("E5 XX 微调参数仅允许00-FF");
            return false;
          }
        }
        // ED 01-02
        if (code === "ED" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (isNaN(v) || v < 0x01 || v > 0x02) {
            showError("ED XX 颤音参数仅允许01-02");
            return false;
          }
        }
        // E4 80-FF
        if (code === "E4" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (isNaN(v) || v < 0x80 || v > 0xFF) {
            showError("E4 XX 渐变参数仅允许80-FF");
            return false;
          }
        }
        // EB 01-FF
        if (code === "EB" && row.duration) {
          let v = parseInt(row.duration, 16);
          if (isNaN(v) || v < 0x01 || v > 0xFF) {
            showError("EB XX 循环次数仅允许01-FF");
            return false;
          }
        }
        // E8/E9 校验索引地址是否存在
        if (["E8", "E9"].includes(code) && row.duration) {
          let [hi, lo] = row.duration.split(" ");
          let targetAddr = parseInt(hi + lo, 16);
          let found = false;
          for (let i = 0; i < offsets.length; i++) {
            if ((NSF_BASE_ADDR + offsets[i]) === targetAddr) {
              found = true;
              break;
            }
          }
          if (!found) {
            showError(code + " 索引地址 " + hi + lo + " 未在当前数据中找到对应行");
            return false;
          }
        }
        // 其它控制符无需参数
        return true;
      }

      // 校验普通音符
      function validateNote(row) {
        if (typeof row.note === "number") {
         // if (isNaN(row.note) || row.note < 0x00 || row.note > 0x7B) {
           // showError("音符代码超出范围(00-7B)");
         //   return false;
        //  }
          if (typeof row.duration !== "number" || isNaN(row.duration) || row.duration < 0x01 || row.duration > 0xFF) {
            showError("音符长度必须为01-FF");
            return false;
          }
        }
        return true;
      }

      // 校验本行
      if (typeof row.note === "string" && row.note.startsWith("CTRL:")) {
        if (!validateCtrl(row, idx)) return;
      } else {
        if (!validateNote(row)) return;
      }

      // 3. 主体数据
      let bodyArr = [];
      // 如果是控制符且为循环/跳转，尝试补全循环段
      if (typeof row.note === "string" && row.note.startsWith("CTRL:")) {
        let code = row.note.substr(5, 2).toUpperCase();
        if (code === "E8" || code === "E9") {
          let [hi, lo] = row.duration.split(" ");
          let targetAddr = parseInt(hi + lo, 16);
          let targetIdx = -1;
          for (let i = 0; i < offsets.length; i++) {
            if ((NSF_BASE_ADDR + offsets[i]) === targetAddr) {
              targetIdx = i;
              break;
            }
          }
          if (targetIdx >= 0) {
            // 拼接目标段（简单起见，取目标行及其后若干行，遇到下一个循环/跳转控制符为止）
            let seg = [];
            for (let j = targetIdx; j < notes.length; j++) {
              let n = notes[j];
              if (j !== targetIdx && typeof n.note === "string" && n.note.startsWith("CTRL:") &&
                ["E8", "E9", "EB"].includes(n.note.substr(5, 2).toUpperCase())) break;
              // 校验目标段控制符
              if (typeof n.note === "string" && n.note.startsWith("CTRL:")) {
                if (!validateCtrl(n, j)) return;
                let c = n.note.substr(5, 2).toUpperCase();
                if (["E8", "E9"].includes(c)) {
                  let [h, l] = n.duration.split(" ");
                  seg.push(c, h, l);
                } else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(c)) {
                  seg.push(c, n.duration);
                } else {
                  seg.push(c);
                }
              } else {
                if (!validateNote(n)) return;
                seg.push(
                  n.note.toString(16).toUpperCase().padStart(2, "0"),
                  n.duration.toString(16).toUpperCase().padStart(2, "0")
                );
              }
            }
            bodyArr = seg;
          } else {
            // 找不到目标，单独播放本行
            bodyArr = [code, hi, lo];
          }
        } else {
          // 其它控制符，单独播放本行
          if (["E8", "E9"].includes(code)) {
            let [hi, lo] = row.duration.split(" ");
            bodyArr = [code, hi, lo];
          } else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(code)) {
            bodyArr = [code, row.duration];
          } else {
            bodyArr = [code];
          }
        }
      } else {
        // 普通音符，单独播放
        bodyArr = [
          row.note.toString(16).toUpperCase().padStart(2, "0"),
          row.duration.toString(16).toUpperCase().padStart(2, "0")
        ];
      }
      // 合成完整数据
      let nsfText = head + " " + bodyArr.join(" ");
      // 6. 调用主编辑器的buildNsfData逻辑生成NSF数据
      if (window.nsfEdit && window.nsfEdit.buildSingleNsfData) {
        let nsfData = window.nsfEdit.buildSingleNsfData(nsfText);
        if (nsfData && typeof window.loadRom === "function") {
          window.loadRom(nsfData, "single.nsf");
        }
      } else {
        
      }
    }

    for (let i = 0; i < notes.length; i++) {
      let n = notes[i];
      let tr = document.createElement("tr");
      // 序号
      let tdIdx = document.createElement("td");
      tdIdx.textContent = i + 1;
      tdIdx.style.textAlign = "center";
      tr.appendChild(tdIdx);

      // 音高/控制
      let tdNote = document.createElement("td");
      if (typeof n.note === "string" && n.note.startsWith("CTRL:")) {
        let code = n.note.substr(5, 2).toUpperCase();
        let label = code + (ctrlCodeHelp[code] ? ` <span title="${ctrlCodeHelp[code]}" style="color:#ff8;font-size:12px;">?</span>` : "");
        tdNote.innerHTML = `<span style="color:#ff8;">${label}</span>`;
      } else {
        let noteSel = document.createElement("select");
        for (let j = 0; j < 0x30; j++) {
          let opt = document.createElement("option");
          opt.value = j;
          opt.textContent = noteName(j);
          if (j === n.note) opt.selected = true;
          noteSel.appendChild(opt);
        }
        let restOpt = document.createElement("option");
        restOpt.value = 0x20;
        restOpt.textContent = "休止符";
        if (n.note === 0x20) restOpt.selected = true;
        noteSel.appendChild(restOpt);
        noteSel.onchange = () => {
          n.note = parseInt(noteSel.value, 10);
        };
        tdNote.appendChild(noteSel);
      }
      tr.appendChild(tdNote);

      // 音长/参数
      let tdDur = document.createElement("td");
      if (typeof n.note === "string" && n.note.startsWith("CTRL:")) {
        let code = n.note.substr(5, 2).toUpperCase();
        if (["E8", "E9"].includes(code)) {
          tdDur.innerHTML = `<input type="text" value="${n.duration}" style="width:60px;" readonly>`;
        } else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(code)) {
          let input = document.createElement("input");
          input.type = "text";
          input.value = n.duration;
          input.style.width = "40px";
          input.onchange = () => {
            n.duration = input.value;
          };
          tdDur.appendChild(input);
        } else {
          tdDur.textContent = "";
        }
      } else {
        let durInput = document.createElement("input");
        durInput.type = "text";
        durInput.value = n.duration.toString(16).toUpperCase();
        durInput.style.width = "40px";
        durInput.onchange = () => {
          let v = parseInt(durInput.value, 16);
          if (!isNaN(v) && v > 0 && v <= 255) n.duration = v;
          durInput.value = n.duration.toString(16).toUpperCase();
        };
        tdDur.appendChild(durInput);
      }
      tr.appendChild(tdDur);

      // 索引
      let tdAddr = document.createElement("td");
      let addr = NSF_BASE_ADDR + offsets[i];
      tdAddr.textContent = addr.toString(16).toUpperCase().padStart(4, "0");
      tdAddr.style.fontFamily = "monospace";
      tdAddr.style.fontSize = "13px";
      tdAddr.title = "本行在NSF数据中的索引";
      tr.appendChild(tdAddr);

      // 新增：播放按钮
      let tdPlay = document.createElement("td");
      let playBtn = document.createElement("button");
      playBtn.textContent = "▶";
      playBtn.title = "播放本行";
      playBtn.onclick = (e) => {
        e.stopPropagation();
        playSingleRow(i);
      };
      tdPlay.appendChild(playBtn);
      tr.appendChild(tdPlay);

      // 操作
      let tdOp = document.createElement("td");
      tdOp.style.textAlign = "center";
      // 上移
      let upBtn = document.createElement("button");
      upBtn.textContent = "↑";
      upBtn.disabled = i === 0;
      upBtn.onclick = (e) => {
        e.stopPropagation();
        let pos = getScrollPos();
        if (i > 0) {
          [notes[i - 1], notes[i]] = [notes[i], notes[i - 1]];
          render(pos, i - 1);
        }
      };
      tdOp.appendChild(upBtn);
      // 下移
      let downBtn = document.createElement("button");
      downBtn.textContent = "↓";
      downBtn.disabled = i === notes.length - 1;
      downBtn.onclick = (e) => {
        e.stopPropagation();
        let pos = getScrollPos();
        if (i < notes.length - 1) {
          [notes[i + 1], notes[i]] = [notes[i], notes[i + 1]];
          render(pos, i + 1);
        }
      };
      tdOp.appendChild(downBtn);
      // 删除
      let delBtn = document.createElement("button");
      delBtn.textContent = "删除";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        let pos = getScrollPos();
        notes.splice(i, 1);
        let nextSel = notes.length > 0 ? Math.max(0, i - 1) : null;
        render(pos, nextSel);
      };
      tdOp.appendChild(delBtn);
      // 复制索引
      let copyBtn = document.createElement("button");
      copyBtn.textContent = "复制索引";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(tdAddr.textContent);
        copyBtn.textContent = "已复制";
        setTimeout(() => (copyBtn.textContent = "复制索引"), 1000);
      };
      tdOp.appendChild(copyBtn);

      tr.onclick = (e) => {
        selectRow(i, e);
      };
      tr.appendChild(tdOp);
      tbody.appendChild(tr);
    }

    // 新增：批量播放按钮
    let batchPlayBtn = document.createElement("button");
    batchPlayBtn.textContent = "批量播放选中(ctrl+鼠标)";
    batchPlayBtn.style.margin = "8px 0 0 8px";
    batchPlayBtn.onclick = function () {
      if (!selectedRows.length) {
        alert("请先选中要播放的行（可按Ctrl多选）");
        return;
      }
      // 合成头部
      let head = "E2 40 E3 00 E0 14 8B";
      if (window.nsfEdit && window.nsfEdit.getCurrentHead) {
        let h = window.nsfEdit.getCurrentHead();
        if (h) head = h;
      }
      // 合成主体
      let bodyArr = [];
      for (let idx of selectedRows) {
        let row = notes[idx];
        // 校验同单行播放
        function showError(msg) {
          alert("播放校验失败: " + msg);
        }
        function validateCtrl(row, idx) {
          if (typeof row.note !== "string" || !row.note.startsWith("CTRL:")) return true;
          let code = row.note.substr(5, 2).toUpperCase();
          if (["E0", "E2", "E3", "E4", "E5", "ED", "EB"].includes(code)) {
            if (!row.duration || !/^[0-9A-F]{2}$/i.test(row.duration)) {
              showError(code + " 缺少或参数格式错误，应为两位十六进制");
              return false;
            }
          }
          if (["E8", "E9"].includes(code)) {
            if (!row.duration || !/^[0-9A-F]{2} [0-9A-F]{2}$/i.test(row.duration)) {
              showError(code + " 缺少或参数格式错误，应为“XX XX”");
              return false;
            }
          }
          if (code === "E3" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (isNaN(v) || v < 0x00 || v > 0x0F) {
              showError("E3 XX 音量参数仅允许00-0F");
              return false;
            }
          }
          if (code === "E2" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (![0x00, 0x40, 0x80, 0xC0].includes(v)) {
              showError("E2 XX 音色参数仅允许00/40/80/C0");
              return false;
            }
          }
          if (code === "E5" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (isNaN(v) || v < 0x00 || v > 0xFF) {
              showError("E5 XX 微调参数仅允许00-FF");
              return false;
            }
          }
          if (code === "ED" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (isNaN(v) || v < 0x01 || v > 0x02) {
              showError("ED XX 颤音参数仅允许01-02");
              return false;
            }
          }
          if (code === "E4" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (isNaN(v) || v < 0x80 || v > 0xFF) {
              showError("E4 XX 渐变参数仅允许80-FF");
              return false;
            }
          }
          if (code === "EB" && row.duration) {
            let v = parseInt(row.duration, 16);
            if (isNaN(v) || v < 0x01 || v > 0xFF) {
              showError("EB XX 循环次数仅允许01-FF");
              return false;
            }
          }
          if (["E8", "E9"].includes(code) && row.duration) {
            let [hi, lo] = row.duration.split(" ");
            let targetAddr = parseInt(hi + lo, 16);
            let found = false;
            let offsets = calcOffsets();
            for (let i = 0; i < offsets.length; i++) {
              if ((NSF_BASE_ADDR + offsets[i]) === targetAddr) {
                found = true;
                break;
              }
            }
            if (!found) {
              showError(code + " 索引地址 " + hi + lo + " 未在当前数据中找到对应行");
              return false;
            }
          }
          return true;
        }
        function validateNote(row) {
          if (typeof row.note === "number") {
            if (typeof row.duration !== "number" || isNaN(row.duration) || row.duration < 0x01 || row.duration > 0xFF) {
              showError("音符长度必须为01-FF");
              return false;
            }
          }
          return true;
        }
        if (typeof row.note === "string" && row.note.startsWith("CTRL:")) {
          if (!validateCtrl(row, idx)) return;
        } else {
          if (!validateNote(row)) return;
        }
        // 转为NSF文本
        if (typeof row.note === "string" && row.note.startsWith("CTRL:")) {
          let code = row.note.substr(5, 2).toUpperCase();
          if (["E8", "E9"].includes(code)) {
            let [hi, lo] = row.duration.split(" ");
            bodyArr.push(code, hi, lo);
          } else if (["EB", "ED", "E0", "E2", "E3", "E4", "E5"].includes(code)) {
            bodyArr.push(code, row.duration);
          } else {
            bodyArr.push(code);
          }
        } else {
          bodyArr.push(
            row.note.toString(16).toUpperCase().padStart(2, "0"),
            row.duration.toString(16).toUpperCase().padStart(2, "0")
          );
        }
      }
      let nsfText = head + " " + bodyArr.join(" ");
      if (window.nsfEdit && window.nsfEdit.buildSingleNsfData) {
        let nsfData = window.nsfEdit.buildSingleNsfData(nsfText);
        if (nsfData && typeof window.loadRom === "function") {
          window.loadRom(nsfData, "multi.nsf");
        }
      } else {
       
      }
    };

    // 挂到主内容区下方
    if (!container.querySelector("#wave-batchplay-btn")) {
      batchPlayBtn.id = "wave-batchplay-btn";
      container.appendChild(batchPlayBtn);
    }

    // 渲染后高亮指定行
    if (typeof highlightRow === "number" && highlightRow >= 0 && highlightRow < notes.length) {
      selectRow(highlightRow);
      // 滚动到该行
      setTimeout(() => {
        let trs = container.querySelectorAll("#wave-table tbody tr");
        if (trs[highlightRow]) {
          trs[highlightRow].scrollIntoView({ block: "nearest" });
        }
      }, 0);
    } else if (typeof scrollTo === "number") {
      scrollToPos(scrollTo);
    }

    // 滚动条位置获取
    function getScrollPos() {
      let mw = container.querySelector("#wave-mainwrap");
      return mw ? mw.scrollTop : 0;
    }

    // 插入操作：有选中行则插入选中行后，否则末尾，并高亮新行
    function insertAtSelected(obj) {
      let idx = typeof render.selectedRow === "number" && render.selectedRow >= 0 && render.selectedRow < notes.length
        ? render.selectedRow
        : null;
      if (idx == null) {
        notes.push(obj);
        render(undefined, notes.length - 1); // 高亮最后一行
      } else {
        notes.splice(idx + 1, 0, obj);
        render(undefined, idx + 1); // 高亮插入行
      }
    }

    // 事件
    container.querySelector("#wave-import").onclick = () => {
      let t = prompt("粘贴NSF音符文本（如 0C 8A 20 20 ...）");
      if (t != null) {
        notes = parseNsfText(t);
        render();
      }
    };
    container.querySelector("#wave-export").onclick = () => {
      let t = toNsfText(notes);
      prompt("复制NSF音符文本：", t);
    };
    container.querySelector("#wave-clear").onclick = () => {
      if (confirm("确定清空所有音符？")) {
        notes = [];
        render();
      }
    };
    container.querySelector("#wave-add").onclick = () => {
      insertAtSelected({ note: 0x0C, duration: 0x8A });
    };
    container.querySelector("#wave-add-eb").onclick = () => {
      insertAtSelected({ note: `CTRL:EB`, duration: "02" });
      insertAtSelected({ note: `CTRL:EC`, duration: "" });
      showHelp("EB");
    };
    container.querySelector("#wave-add-ec").onclick = () => {
      insertAtSelected({ note: `CTRL:EC`, duration: "" });
      showHelp("EC");
    };
    container.querySelector("#wave-add-e8").onclick = () => {
      let idx = prompt("循环跳转到哪一行？请输入行号（从1开始）");
      idx = parseInt(idx, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= notes.length) {
        alert("无效的行号");
        return;
      }
      let offsets = calcOffsets();
      let addr = NSF_BASE_ADDR + offsets[idx];
      let addrHex = addr.toString(16).toUpperCase().padStart(4, "0");
      let hi = addrHex.slice(0, 2);
      let lo = addrHex.slice(2, 4);
      insertAtSelected({ note: `CTRL:E8`, duration: `${hi} ${lo}` });
      showHelp("E8");
    };
    container.querySelector("#wave-add-e9").onclick = () => {
      let idx = prompt("循环跳转到哪一行？请输入行号（从1开始）");
      idx = parseInt(idx, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= notes.length) {
        alert("无效的行号");
        return;
      }
      let offsets = calcOffsets();
      let addr = NSF_BASE_ADDR + offsets[idx];
      let addrHex = addr.toString(16).toUpperCase().padStart(4, "0");
      let hi = addrHex.slice(0, 2);
      let lo = addrHex.slice(2, 4);
      insertAtSelected({ note: `CTRL:E9`, duration: `${hi} ${lo}` });
      insertAtSelected({ note: `CTRL:EA`, duration: "" });
      showHelp("E9");
    };
    container.querySelector("#wave-add-ed").onclick = () => {
      insertAtSelected({ note: `CTRL:ED`, duration: "01" });
      insertAtSelected({ note: 0x0C, duration: 0x8A });
      insertAtSelected({ note: `CTRL:EF`, duration: "" });
      showHelp("ED");
    };
    container.querySelector("#wave-add-e0").onclick = () => { insertAtSelected({ note: `CTRL:E0`, duration: "14" }); showHelp("E0"); };
    container.querySelector("#wave-add-e2").onclick = () => { insertAtSelected({ note: `CTRL:E2`, duration: "40" }); showHelp("E2"); };
    container.querySelector("#wave-add-e3").onclick = () => { insertAtSelected({ note: `CTRL:E3`, duration: "00" }); showHelp("E3"); };
    container.querySelector("#wave-add-e4").onclick = () => { insertAtSelected({ note: `CTRL:E4`, duration: "80" }); showHelp("E4"); };
    container.querySelector("#wave-add-e5").onclick = () => { insertAtSelected({ note: `CTRL:E5`, duration: "01" }); showHelp("E5"); };
    container.querySelector("#wave-add-ef").onclick = () => { insertAtSelected({ note: `CTRL:EF`, duration: "" }); showHelp("EF"); };
    container.querySelector("#wave-add-ec").onclick = () => { insertAtSelected({ note: `CTRL:EC`, duration: "" }); showHelp("EC"); };
    container.querySelector("#wave-add-ea").onclick = () => { insertAtSelected({ note: `CTRL:EA`, duration: "" }); showHelp("EA"); };
    container.querySelector("#wave-add-f3").onclick = () => { insertAtSelected({ note: `CTRL:F3`, duration: "" }); showHelp("F3"); };
    container.querySelector("#wave-add-f4").onclick = () => { insertAtSelected({ note: `CTRL:F4`, duration: "" }); showHelp("F4"); };
    container.querySelector("#wave-add-f9").onclick = () => { insertAtSelected({ note: `CTRL:F9`, duration: "" }); showHelp("F9"); };
    container.querySelector("#wave-add-fa").onclick = () => { insertAtSelected({ note: `CTRL:FA`, duration: "" }); showHelp("FA"); };
    container.querySelector("#wave-add-fb").onclick = () => { insertAtSelected({ note: `CTRL:FB`, duration: "" }); showHelp("FB"); };

    function showHelp(code) {
      let help = ctrlCodeHelp[code];
      if (help) container.querySelector("#wave-ctrlhelp").textContent = help;
    }
  }

  window.waveEditorSimple = {
    initEditor: function(containerId) {
      container = document.getElementById(containerId);
      if (!container) return;
      render();
    },
    getNsfText: function() {
      return toNsfText(notes);
    },
    setNsfText: function(text) {
      notes = parseNsfText(text);
      render();
    },
    getNotes: function() {
      return notes.map(n => ({ note: n.note, duration: n.duration }));
    },
    setNotes: function(arr) {
      notes = arr.map(n => ({ note: n.note, duration: n.duration }));
      render();
    },
    importData: function(text) {
      this.setNsfText(text);
    },
    exportToNsfText: function() {
      return this.getNsfText();
    }
  };

  window.waveEditor = window.waveEditorSimple;
})();