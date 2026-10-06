// 完全重构：采用纯块级流式布局，保证响应式且内容完整显示，无横向滚动条

// 缓存DOM元素引用，避免重复查询
const DOM_CACHE = {
  viewer: null,
  output: null,
  fakeHeightDiv: null,
  ramtype: null,
  prepage: null,
  nexpage: null
};

// 获取或缓存DOM元素
function getCachedElement(id) {
  if (!DOM_CACHE[id]) {
    DOM_CACHE[id] = document.getElementById(id);
  }
  return DOM_CACHE[id];
}

// 节流函数，避免频繁事件触发
function throttle(func, delay) {
  let timeoutId;
  let lastExecTime = 0;
  return function (...args) {
    const currentTime = Date.now();
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}

// 辅助函数提升到外部，避免每次 drawMemView 重复定义
function fillLineContent(pre, line, idx, highlight) {
  pre.innerHTML = '';
  const addrMatch = line.match(/^(0x[0-9A-F]+: )/i);
  const addr = addrMatch ? addrMatch[1] : '';
  const data = addrMatch ? line.replace(addrMatch[1], '') : line;

  const addrSpan = document.createElement('span');
  addrSpan.textContent = addr.padEnd(10, ' ');
  addrSpan.style.color = '#6cf';

  const dataSpan = document.createElement('span');
  dataSpan.innerHTML = data;
  dataSpan.setAttribute('data-addr', addr);

  // 高亮处理
  if (highlight && Array.isArray(highlight)) {
    const hl = highlight.find(h => h.line === idx);
    if (hl) {
      dataSpan.style.background = hl.color;
    } else {
      dataSpan.style.background = '';
    }
  } else {
    dataSpan.style.background = '';
  }

  pre.appendChild(addrSpan);
  pre.appendChild(dataSpan);
}

let _ramview_initialized = false;
let _ramview_lineHeight = 18;

function drawMemView({
  lines = [],
  highlight = null,
  scrollTop = 0
}) {
  // RAM 热图依赖 ramAccessType 访问记录：仅在面板可见时开启（面板关闭时会复位）。
  // 面板关闭时的暂停刷新不置位，避免恢复运行后残留慢路径。
  if (window.db && window.db._isDebugUIVisible && window.db._isDebugUIVisible()) window.db.trackAccess = true;
  const viewer = getCachedElement('memory-viewer');
  const output = getCachedElement('dtextoutput');
  const fakeHeightDiv = getCachedElement('memory-fake-height');

  // 保证 fakeHeightDiv 在 viewer 内部
  if (fakeHeightDiv.parentNode !== viewer) {
    viewer.insertBefore(fakeHeightDiv, output);
  }

  // 只在首次初始化时设置样式
  if (!_ramview_initialized) {
    output.style.position = 'absolute';
    output.style.left = '0';
    output.style.width = '100%';
    output.style.boxSizing = 'border-box';
    output.style.whiteSpace = 'normal';
    output.style.wordBreak = 'break-all';
    output.style.display = 'block';
    output.style.fontFamily = 'monospace';
    output.style.fontSize = '14px';
    output.style.background = 'transparent';
    output.style.padding = '0';
    output.style.margin = '0';
    viewer.style.overflowX = 'auto';
    viewer.style.width = '';
    viewer.style.minWidth = '';
    viewer.style.maxWidth = '';
    _ramview_initialized = true;
  }

  // lineHeight 只在必要时重新计算
  if (!output.firstChild || !output.firstChild.offsetHeight) {
    const temp = document.createElement('div');
    temp.style.visibility = 'hidden';
    temp.style.position = 'absolute';
    temp.style.fontFamily = 'monospace';
    temp.style.fontSize = '14px';
    temp.textContent = '0x000000: 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F';
    output.appendChild(temp);
    _ramview_lineHeight = temp.offsetHeight || 18;
    output.removeChild(temp);
  } else {
    _ramview_lineHeight = output.firstChild.offsetHeight || 18;
  }

  // 计算总行数
  let totalLines = lines.length;

  // 设置撑高度
  fakeHeightDiv.style.height = (totalLines * _ramview_lineHeight) + 'px';

  // 虚拟滚动：只渲染可视区域及缓冲区
  const viewerHeight = viewer.clientHeight;
  const bufferLines = 10;
  const firstVisibleLine = Math.max(0, Math.floor(scrollTop / _ramview_lineHeight) - bufferLines);
  const visibleLineCount = Math.ceil(viewerHeight / _ramview_lineHeight) + bufferLines * 2;
  const lastVisibleLine = Math.min(totalLines, firstVisibleLine + visibleLineCount);

  // output 定位
  output.style.top = (firstVisibleLine * _ramview_lineHeight) + 'px';

  // 只更新变动行的 DOM
  const existLineMap = new Map();
  for (let i = 0; i < output.children.length; i++) {
    const el = output.children[i];
    const lineIdx = parseInt(el.getAttribute('data-line'), 10);
    existLineMap.set(lineIdx, el);
  }
  const keepLineSet = new Set();

  let childIdx = 0;
  for (let idx = firstVisibleLine; idx < lastVisibleLine; idx++) {
    const line = lines[idx];
    let lineEl = existLineMap.get(idx);

    if (!lineEl) {
      lineEl = document.createElement('pre');
      lineEl.setAttribute('data-line', idx);
      lineEl.style.margin = '0';
      lineEl.style.padding = '0 0.2em';
      lineEl.style.display = 'block';
      lineEl.style.fontFamily = 'inherit';
      lineEl.style.fontSize = 'inherit';
      lineEl.style.background = 'transparent';
      lineEl.style.whiteSpace = 'pre';
      lineEl.style.wordBreak = 'normal';
      fillLineContent(lineEl, line, idx, highlight);
      // 插入到正确位置
      let insertBefore = null;
      for (let i = childIdx; i < output.children.length; i++) {
        const childLineIdx = parseInt(output.children[i].getAttribute('data-line'), 10);
        if (childLineIdx > idx) {
          insertBefore = output.children[i];
          break;
        }
      }
      output.insertBefore(lineEl, insertBefore);
    } else {
      if (lineEl.dataset.cache !== line) {
        fillLineContent(lineEl, line, idx, highlight);
      }
    }
    lineEl.dataset.cache = line;
    keepLineSet.add(idx);
    childIdx++;
  }

  // 移除不在可见区的行（用 while 循环更高效）
  let i = 0;
  while (i < output.children.length) {
    const el = output.children[i];
    const lineIdx = parseInt(el.getAttribute('data-line'), 10);
    if (!keepLineSet.has(lineIdx)) {
      output.removeChild(el);
    } else {
      i++;
    }
  }
}

// 新增：各类型内存快照缓存
let lastRamSnapshot = null;
let lastRamLines = null;
let lastPpuSnapshot = null;
let lastPpuLines = null;
let lastNametableSnapshot = null;
let lastNametableLines = null;
let lastPaletteSnapshot = null;
let lastPaletteLines = null;
let lastOamSnapshot = null;
let lastOamLines = null;

// 新增：各类型内存逐行缓存
let lastRamLinesArr = null;
let lastPpuLinesArr = null;
let lastNametableLinesArr = null;
let lastPaletteLinesArr = null;
let lastOamLinesArr = null;

function getAllLines(db) {
  let lines = [];
  let addrWidth = 8;
  switch (ramviewtype) {
    case 0: // CPU内存
      addrWidth = 6;
      if (!lastRamLinesArr) lastRamLinesArr = [];
      lines = [];
      for (let r = 0; r < 0x10000 / 16; r++) {
        let addrBase = r * 16;
        let addrStr = "0x" + addrBase.toString(16).toUpperCase().padStart(addrWidth, "0") + ": ";
        let lineParts = [addrStr];
        for (let c = 0; c < 16; c++) {
          let addr = (addrBase + c) & 0xFFFF;
          let byteValue = db.nes.ram[addr & 0x7FF];
          let byteStr = db.nes.getByteRep(byteValue).toUpperCase();
          let color = "#FFFFFF";
          if (db.ramAccessType[addr & 0x7FF] === 1) color = "#00FF00";
          else if (db.ramAccessType[addr & 0x7FF] === 2) color = "#FF0000";
          else if (db.ramAccessType[addr & 0x7FF] === 3) color = "#808080";
          lineParts.push(`<span style="color:${color}" data-addr="${addr}" ondblclick="showBreakpointMenu(event.clientX, event.clientY, ${addr})" oncontextmenu="event.preventDefault(); showBreakpointMenu(event.clientX, event.clientY, ${addr})">${byteStr}</span>`);
        }
        let str = lineParts.join(' ');
        // 逐行对比
        if (lastRamLinesArr[r] !== str) {
          lastRamLinesArr[r] = str;
        }
        lines.push(lastRamLinesArr[r]);
      }
      break;
    case 1: // PPU内存
      addrWidth = 6;
      if (db && db.nes && db.nes.ppu) {
        let ppu = db.nes.ppu;
        if (!lastPpuLinesArr) lastPpuLinesArr = [];
        lines = [];
        for (let i = 0; i < 0x4000; i += 16) {
          let addrStr = "0x" + i.toString(16).toUpperCase().padStart(addrWidth - 2, "0") + ": ";
          let lineParts = [addrStr];
          for (let j = 0; j < 16; j++) {
            let addr = i + j;
            let byteValue = ppu.peakram(addr);
            let byteStr = db.nes.getByteRep(byteValue).toUpperCase();
            lineParts.push(`<span data-addr="${addr}">${byteStr}</span>`);
          }
          let line = lineParts.join(' ');
          let idx = i / 16;
          if (lastPpuLinesArr[idx] !== line) {
            lastPpuLinesArr[idx] = line;
          }
          lines.push(lastPpuLinesArr[idx]);
        }
      }
      break;
    case 2: // PRGROM
      if (!cachedPRGROM) {
        addrWidth = 7;
        if (db && db.nes && db.nes.mapper) {
          let prg = db.nes.mapper.prgRom || db.nes.mapper.prgRam;
          if (prg) {
            cachedPRGROM = [];
            for (let i = 0; i < prg.length; i += 16) {
              let addrStr = "0x" + i.toString(16).toUpperCase().padStart(addrWidth - 2, "0") + ": ";
              let lineParts = [addrStr];
              for (let j = 0; j < 16 && (i + j) < prg.length; j++) {
                let byteValue = prg[i + j];
                let byteStr = db.nes.getByteRep(byteValue).toUpperCase();
                lineParts.push(`<span data-addr="${i + j}">${byteStr}</span>`);
              }
              cachedPRGROM.push(lineParts.join(' '));
            }
          } else {
            cachedPRGROM = ["无 PRGROM/PRGRAM 数据"];
          }
        }
      }
      lines = cachedPRGROM || [];
      break;
    case 3: // CHRROM
      if (!cachedCHRROM) {
        addrWidth = 7;
        if (db && db.nes && db.nes.mapper) {
          let chr = db.nes.mapper.chrRom || db.nes.mapper.chrRam;
          if (chr) {
            cachedCHRROM = [];
            for (let i = 0; i < chr.length; i += 16) {
              let addrStr = "0x" + i.toString(16).toUpperCase().padStart(addrWidth - 2, "0") + ": ";
              let lineParts = [addrStr];
              for (let j = 0; j < 16 && (i + j) < chr.length; j++) {
                let byteValue = chr[i + j];
                let byteStr = db.nes.getByteRep(byteValue).toUpperCase();
                lineParts.push(`<span data-addr="${i + j}">${byteStr}</span>`);
              }
              cachedCHRROM.push(lineParts.join(' '));
            }
          } else {
            cachedCHRROM = ["无 CHRROM/CHRRAM 数据"];
          }
        }
      }
      lines = cachedCHRROM || [];
      break;
    case 4: // 命名表Ram
      addrWidth = 6;
      if (db && db.nes && db.nes.mapper && typeof db.nes.mapper.ppuPeak === "function") {
        if (!lastNametableLinesArr) lastNametableLinesArr = [];
        lines = [];
        for (let i = 0x2000; i < 0x3000; i += 16) {
          let addrStr = "0x" + (i - 0x2000).toString(16).toUpperCase().padStart(addrWidth - 2, "0") + ": ";
          let lineParts = [addrStr];
          for (let j = 0; j < 16; j++) {
            lineParts.push(db.nes.getByteRep(db.nes.mapper.ppuPeak(i + j)).toUpperCase());
          }
          let line = lineParts.join(' ');
          let idx = (i - 0x2000) / 16;
          if (lastNametableLinesArr[idx] !== line) {
            lastNametableLinesArr[idx] = line;
          }
          lines.push(lastNametableLinesArr[idx]);
        }
      }
      break;
    case 5: // 调色板
      addrWidth = 8;
      if (db && db.nes && db.nes.ppu && db.nes.ppu.paletteRam) {
        let pal = db.nes.ppu.paletteRam;
        if (!lastPaletteLinesArr) lastPaletteLinesArr = [];
        lines = [];
        let lineParts = [];
        for (let j = 0; j < 16 && j < pal.length; j++) {
          lineParts.push(db.nes.getByteRep(pal[j]));
        }
        let line = lineParts.join(' ');
        if (lastPaletteLinesArr[0] !== line) {
          lastPaletteLinesArr[0] = line;
        }
        lines.push(lastPaletteLinesArr[0]);
      }
      break;
    case 6: // 精灵Ram
      addrWidth = 6;
      if (db && db.nes && db.nes.ppu && db.nes.ppu.oamRam) {
        let oam = db.nes.ppu.oamRam;
        if (!lastOamLinesArr) lastOamLinesArr = [];
        lines = [];
        for (let i = 0; i < oam.length; i += 16) {
          let addrStr = "0x" + i.toString(16).toUpperCase().padStart(addrWidth - 2, "0") + ": ";
          let lineParts = [addrStr];
          for (let j = 0; j < 16 && (i + j) < oam.length; j++) {
            lineParts.push(db.nes.getByteRep(oam[i + j]));
          }
          let line = lineParts.join(' ');
          let idx = i / 16;
          if (lastOamLinesArr[idx] !== line) {
            lastOamLinesArr[idx] = line;
          }
          lines.push(lastOamLinesArr[idx]);
        }
      }
      break;
    default:
      lines = ['0x000000: ' + '00 '.repeat(16).trim()];
      break;
  }
  return lines;
}

// 缓存 PRGROM 和 CHRROM 的内容
let cachedPRGROM = null;
let cachedCHRROM = null;

// 主渲染入口
window.drawRam = function (db) {
  // 生成所有行
  const lines = getAllLines(db);
  // 不再自动滚动到顶部
  const viewer = getCachedElement('memory-viewer');
  drawMemView({ lines, scrollTop: viewer.scrollTop });
};

// 滚动事件：虚拟滚动，使用节流优化性能
(function() {
  const viewer = getCachedElement('memory-viewer');
  let linesCache = null;
  const throttledScrollHandler = throttle(function () {
    if (!linesCache) linesCache = getAllLines(db);
    // 修正：获取最新 scrollTop
    drawMemView({
      lines: linesCache,
      scrollTop: viewer.scrollTop
    });
  }, 16); // 约60fps

  viewer.onscroll = throttledScrollHandler;

  // 切换类型/刷新时重置缓存
  window._resetLinesCache = () => {
    linesCache = null;
    lastRamSnapshot = null;
    lastRamLines = null;
    lastPpuSnapshot = null;
    lastPpuLines = null;
    lastNametableSnapshot = null;
    lastNametableLines = null;
    lastPaletteSnapshot = null;
    lastPaletteLines = null;
    lastOamSnapshot = null;
    lastOamLines = null;
    lastRamLinesArr = null;
    lastPpuLinesArr = null;
    lastNametableLinesArr = null;
    lastPaletteLinesArr = null;
    lastOamLinesArr = null;
  };
})();

// 当加载新 ROM 时，清空缓存
function resetRomCache() {
  cachedPRGROM = null;
  cachedCHRROM = null;
  window._resetLinesCache && window._resetLinesCache();
}

document.getElementById('ramtype').onchange = function () {
  ramviewtype = parseInt(this.value);
  ramBasePos = 0;
  resetRomCache();
  // 切换类型时滚动到顶部
  const viewer = getCachedElement('memory-viewer');
  viewer.scrollTop = 0;
  window.drawRam(db);
};

document.getElementById('prepage').onclick = function () {
  // 虚拟滚动模式下，直接滚动
  const viewer = getCachedElement('memory-viewer');
  viewer.scrollTop = Math.max(viewer.scrollTop - viewer.clientHeight, 0);
};

document.getElementById('nexpage').onclick = function () {
  const viewer = getCachedElement('memory-viewer');
  const lines = getAllLines(db);
  const lineHeight = 18;
  const maxScroll = Math.max(0, lines.length * lineHeight - viewer.clientHeight);
  viewer.scrollTop = Math.min(viewer.scrollTop + viewer.clientHeight, maxScroll);
};

function getMaxLines() {
  // 已不再需要，保留兼容
  return 0;
}

var ramviewtype = 0;
var ramBasePos = 0;
const RAM_WINDOW_LINES = 64;

// 内存使用监控和自动清理
let memoryWarningShown = false;
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB 缓存上限

function getCacheSize() {
  let size = 0;
  // 估算数组缓存大小
  [lastRamLinesArr, lastPpuLinesArr, lastNametableLinesArr, lastPaletteLinesArr, lastOamLinesArr].forEach(arr => {
    if (arr) {
      arr.forEach(str => {
        if (str) size += str.length * 2; // 粗略估算字符串大小
      });
    }
  });
  return size;
}

function checkMemoryUsage() {
  const cacheSize = getCacheSize();
  if (cacheSize > MAX_CACHE_SIZE && !memoryWarningShown) {
    console.warn(`内存查看器缓存过大: ${(cacheSize / 1024 / 1024).toFixed(1)}MB，建议刷新页面`);
    memoryWarningShown = true;
  } else if (cacheSize < MAX_CACHE_SIZE * 0.8) {
    memoryWarningShown = false;
  }
}

// 定期检查内存使用
setInterval(checkMemoryUsage, 30000); // 每30秒检查一次

// 显示断点菜单
function showBreakpointMenu(x, y, addr) {
  // 移除已有菜单
  const existingMenu = document.getElementById('breakpoint-menu');
  if (existingMenu) existingMenu.remove();

  // 创建菜单容器
  const menu = document.createElement('div');
  menu.id = 'breakpoint-menu';
  menu.style.position = 'absolute';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.background = '#333';
  menu.style.color = '#fff';
  menu.style.padding = '10px';
  menu.style.borderRadius = '5px';
  menu.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5)';
  menu.style.zIndex = '10000';

  // 添加断点类型选择
  const select = document.createElement('select');
  select.style.marginRight = '10px';
  ['读取', '写入', '执行'].forEach((type, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = type;
    select.appendChild(option);
  });
  menu.appendChild(select);

  // 添加断点按钮
  const addButton = document.createElement('button');
  addButton.textContent = '添加断点';
  addButton.style.marginRight = '10px';
  addButton.onclick = function () {
    const typeInt = parseInt(select.value, 10);
    db.addBreakpoint(addr, typeInt);
    log(`已添加断点: 地址 0x${addr.toString(16).toUpperCase()} 类型 ${['读取', '写入', '执行'][typeInt]}`, "breakpoint");
    menu.remove();
  };
  menu.appendChild(addButton);

  // 取消按钮
  const cancelButton = document.createElement('button');
  cancelButton.textContent = '取消';
  cancelButton.onclick = function () {
    menu.remove();
  };
  menu.appendChild(cancelButton);

  // 添加菜单到页面
  document.body.appendChild(menu);
}