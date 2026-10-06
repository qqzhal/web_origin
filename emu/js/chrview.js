// patterns+调色板显示
window.drawPatternsPals = function (nes, ctx) {
  // 256x160: 上128像素为pattern table，下32像素为调色板
  let imgData = ctx.createImageData(256, 160);

  // 左侧 pattern table
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      window.drawTile(nes, imgData, x * 8, y * 8, y * 16 + x, 0);
    }
  }
  // 右侧 pattern table
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
      window.drawTile(nes, imgData, 128 + x * 8, y * 8, 256 + y * 16 + x, 0);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // 绘制调色板（主调色板和精灵调色板）
  for (let i = 0; i < 16; i++) {
    let col = nes.ppu.nesPal[nes.ppu.readPalette(i) & 0x3f];
    ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 1)`;
    ctx.fillRect(i * 16, 128, 16, 16);
    col = nes.ppu.nesPal[nes.ppu.readPalette(i + 16) & 0x3f];
    ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 1)`;
    ctx.fillRect(i * 16, 144, 16, 16);
  }
};

// nametable显示
window.drawNametables = function (nes, ctx) {
  // 512x480: 四个命名表，每个256x240，排列成2x2
  let imgData = ctx.createImageData(512, 480);
  for (let nt = 0; nt < 4; nt++) {
    // nt: 0=左上, 1=右上, 2=左下, 3=右下
    let baseX = (nt & 1) * 256;
    let baseY = (nt >> 1) * 240;
    let ntBase = 0x2000 + nt * 0x400;
    let attBase = 0x23C0 + nt * 0x400;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 32; x++) {
        let tileNumAdr = ntBase + (y << 5) + x;
        let tileNum = nes.mapper.ppuPeak(tileNumAdr);
        let attAdr = attBase + ((y >> 2) << 3) + (x >> 2);
        let atr = nes.mapper.ppuPeak(attAdr);
        // 计算属性表
        let shift = ((y & 0x2) << 1) | (x & 0x2);
        atr = (atr >> shift) & 0x3;
        window.drawTile(nes, imgData, baseX + x * 8, baseY + y * 8, tileNum + (nes.ppu.bgPatternBase === 0 ? 0 : 256), atr);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
};
// 通用绘制tile函数
window.drawTile = function (nes, imgData, x, y, num, col) {
  for (let i = 0; i < 8; i++) {
    let lp = nes.mapper.ppuPeak(num * 16 + i);
    let hp = nes.mapper.ppuPeak(num * 16 + i + 8);
    for (let j = 0; j < 8; j++) {
      let shift = 7 - j;
      let pixel = (lp >> shift) & 1;
      pixel |= ((hp >> shift) & 1) << 1;
      let pind = pixel === 0 ? 0 : col * 4 + pixel;
      let color = nes.ppu.nesPal[nes.ppu.readPalette(pind) & 0x3f];
      let index = ((y + i) * imgData.width + (x + j)) * 4;
      imgData.data[index] = color[0];
      imgData.data[index + 1] = color[1];
      imgData.data[index + 2] = color[2];
      imgData.data[index + 3] = 255;
    }
  }
};

// 精灵绘制相关代码（从 bg_sprite_viewer.js 转移）
let preferPpuBanksGlobal = undefined;

// 检测 PPU 内部数据与 CHR ROM 在每个 1KB 页面上的不同，返回一个长度为 8 的布尔数组，true 表示该页应优先使用 PPU
function detectChrDifferences(ppu, mapper) {
  const res = new Array(8).fill(false);
  if (!ppu) return res;
  try {
    const ram = window.nes && window.nes.ram ? window.nes.ram : null;
    const rom = mapper && mapper.chrRom ? mapper.chrRom : null;
    const numRomBanks = rom ? Math.floor(rom.length / 0x400) : 0;
    for (let bank = 0; bank < 8; bank++) {
      // choose a few offsets to sample
      const sampleOffsets = [0, 8, 16, 32, 64];
      let differs = false;
      for (let s = 0; s < sampleOffsets.length; s++) {
        const off = sampleOffsets[s];
        const ppuAddr = bank * 0x400 + off;
        let pval = null;
        try { pval = readPPU(ppuAddr); } catch(e) { pval = null; }
        // determine mapped rom base using mapper.chrBank or CPU RAM $0490
        let bankVal = null;
        if (mapper && mapper.chrBank && typeof mapper.chrBank[bank] !== 'undefined') bankVal = mapper.chrBank[bank];
        else bankVal = 0;
        if (rom && typeof bankVal === 'number') {
          const masked = numRomBanks ? (bankVal % numRomBanks) : bankVal;
          const rIdx = masked * 0x400 + off;
          let rval = null;
          if (rIdx >= 0 && rIdx < rom.length) rval = rom[rIdx];
          if (pval !== null && rval !== null && pval !== rval) { differs = true; break; }
        }
      }
      res[bank] = differs;
    }
  } catch(e) {}
  return res;
}

// helper: read PPU memory preferring mapper.ppuPeak (like chrview) then fallback to ppu.readInternal
function readPPU(addr) {
  try {
    const mapper = window.nes && window.nes.mapper;
    const ppu = window.nes && window.nes.ppu;
    if (mapper && typeof mapper.ppuPeak === 'function') {
      try { return mapper.ppuPeak(addr & 0x3fff); } catch(e) {}
    }
    if (ppu && typeof ppu.readInternal === 'function') {
      try { return ppu.readInternal(addr & 0x3fff); } catch(e) {}
    }
  } catch(e) {}
  return 0;
}

// Safe mapper/PPU peek used by embedded chrview drawing (tries mapper.ppuPeak, falls back to ppu.readInternal)
function mapperPpuPeak(nesObj, addr) {
  try {
    if (nesObj && nesObj.mapper && typeof nesObj.mapper.ppuPeak === 'function') {
      return nesObj.mapper.ppuPeak(addr & 0x3fff);
    }
    if (nesObj && nesObj.ppu && typeof nesObj.ppu.readInternal === 'function') {
      return nesObj.ppu.readInternal(addr & 0x3fff);
    }
  } catch(e) {}
  return 0;
}

// decide per-1KB bank whether to use PPU or ROM as source
// returns true to use PPU, false to use ROM
// Decide per-1KB bank whether to use PPU or ROM as source. Accept an explicit chrMode (from selector).
function usePpuForBank(bank, chrMode) {
  const mode = chrMode || 'auto';
  const mapper = window.nes && window.nes.mapper;
  const ppu = window.nes && window.nes.ppu;
  // explicit modes
  if (mode === 'ppu') return true;
  if (mode === 'rom') return false;
  if (mode === 'ram') return false; // RAM-only mode: renderer will use RAM mapping
  // auto: consult preferPpuBanksGlobal (set in updateViewer by detectChrDifferences).
  // If detection says PPU differs for this 1KB bank, prefer PPU; otherwise prefer ROM fallback.
  try {
    if (Array.isArray(preferPpuBanksGlobal) && typeof preferPpuBanksGlobal[bank] !== 'undefined') {
      return !!preferPpuBanksGlobal[bank];
    }
  } catch(e) {}
  // default to prefer PPU when unsure
  return true;
}

// 根据 chrSourceSelect 和 preferPpuBanksGlobal 决定如何读取 CHR 行字节
// readTilePlanes(chrAddr, py, isSprite) — isSprite true uses spriteChrSourceSelect, false uses bgChrSourceSelect
function readTilePlanes(chrAddr, py, isSprite) {
  const ppu = window.nes && window.nes.ppu;
  const mapper = window.nes && window.nes.mapper;
  let plane0, plane1;
  if (!ppu) return {plane0:0, plane1:0};
  // Determine bank and whether we should read from PPU for this whole 1KB bank
  const bank = (chrAddr >> 10) & 7;
  const offset = chrAddr & 0x3FF;
  // determine selected mode based on whether this read is for sprite or background
  let sel = null;
  try {
    if (isSprite) sel = document.getElementById('spriteChrSourceSelect');
    if (!sel) sel = document.getElementById('bgChrSourceSelect');
  } catch(e) { sel = null; }
  const chrMode = (sel && sel.value) || 'auto';
  const usePpu = usePpuForBank(bank, chrMode);

  if (!usePpu && mapper && mapper.chrRom) {
    // try ROM for whole bank
    let bankVal = 0;
    if (mapper && mapper.chrBank && typeof mapper.chrBank[bank] !== 'undefined') bankVal = mapper.chrBank[bank];
    else {
      // fallback: support explicit 'ram' selection on bg/sprite selectors to read CPU RAM $0490..,
      // otherwise default to 0.
      // determine if ROM bankVal should be taken from CPU RAM $0490 based on the appropriate selector
      let selMode = 'auto';
      try {
        const sp = document.getElementById('spriteChrSourceSelect');
        const bg = document.getElementById('bgChrSourceSelect');
        if (isSprite && sp) selMode = sp.value;
        else if (bg) selMode = bg.value;
      } catch(e) { selMode = 'auto'; }
      if (selMode === 'ram' && window.nes && window.nes.ram) {
        bankVal = window.nes.ram[0x490 + bank] || 0;
      } else {
        bankVal = 0;
      }
    }
    const numBanks = Math.max(1, Math.floor(mapper.chrRom.length / 0x400));
    const maskedBank = (typeof bankVal === 'number') ? (bankVal % numBanks) : 0;
    const baseIdx = maskedBank * 0x400 + offset;
    const idx0 = baseIdx + py;
    const idx1 = baseIdx + py + 8;
    if (idx0 >= 0 && idx1 >= 0 && idx1 < mapper.chrRom.length) {
      plane0 = mapper.chrRom[idx0];
      plane1 = mapper.chrRom[idx1];
      return {plane0, plane1};
    }
    // if ROM read invalid, fallback to PPU
    try { plane0 = readPPU(chrAddr + py); plane1 = readPPU(chrAddr + py + 8); } catch(e) { plane0 = 0; plane1 = 0; }
    return {plane0, plane1};
  }

  // else read from PPU
  try { plane0 = readPPU(chrAddr + py); plane1 = readPPU(chrAddr + py + 8); } catch(e) { plane0 = 0; plane1 = 0; }
  return {plane0, plane1};
}

// 获取精灵数量
function getSpriteCount() {
  if (!window.nes || !window.nes.ppu) return 0;
  const oam = window.nes.ppu.oamRam;
  let count = 0;
  for (let i = 0; i < 64; i++) {
    if (oam[i * 4] < 240) count++; // Y < 240 表示可见
  }
  return count;
}

// 绘制精灵
function drawSprites(ctx, canvasWidth, canvasHeight) {
  if (!ctx || !window.nes || !window.nes.ppu) return;

  const ppu = window.nes.ppu;
  const oam = ppu.oamRam;

  // 清空画布，使用画布内部像素尺寸
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const composite = document.getElementById('compositeSprites') && document.getElementById('compositeSprites').checked;
  // 绘制精灵（支持8x8和8x16）
  if (composite) {
    renderSpritesComposite(ctx, oam, ppu, canvasWidth, canvasHeight);
    return;
  }
  const legacy = document.getElementById('legacyDraw') && document.getElementById('legacyDraw').checked;
  if (legacy) {
    // legacy simple draw: original behavior before we added reverse/priority handling
    for (let i = 0; i < 64; i++) {
      const y = oam[i * 4];
      const tile = oam[i * 4 + 1];
      const attr = oam[i * 4 + 2];
      const x = oam[i * 4 + 3];

      if (y >= 240) continue;
      const flipH = (attr & 0x40) !== 0;
      const flipV = (attr & 0x80) !== 0;
      const palette = (attr & 3) + 4;
      if (ppu.spriteHeight === 8) {
        let chrAddr = (ppu.spritePatternBase || 0) + tile * 16;
        drawTileFromChrAddr(ctx, chrAddr, x, y, palette, flipH, flipV, false, canvasWidth, canvasHeight);
      } else {
        const topTile = tile & 0xFE;
        const bankBase = (tile & 0x01) ? 0x1000 : 0x0000;
        const topChrAddr = bankBase + (topTile * 16);
        if (!flipV) {
          drawTileFromChrAddr(ctx, topChrAddr, x, y, palette, flipH, false, false, canvasWidth, canvasHeight);
          drawTileFromChrAddr(ctx, topChrAddr + 16, x, y + 8, palette, flipH, false, false, canvasWidth, canvasHeight);
        } else {
          drawTileFromChrAddr(ctx, topChrAddr + 16, x, y, palette, flipH, true, false, canvasWidth, canvasHeight);
          drawTileFromChrAddr(ctx, topChrAddr, x, y + 8, palette, flipH, true, false, canvasWidth, canvasHeight);
        }
      }
    }
    return;
  }
  const reverse = document.getElementById('reverseOAM') && document.getElementById('reverseOAM').checked;
  const respectPriority = document.getElementById('respectPriority') && document.getElementById('respectPriority').checked;
  const drawSpriteBorders = document.getElementById('drawSpriteBorders') && document.getElementById('drawSpriteBorders').checked;
  const indices = reverse ? Array.from({length:64},(_,k)=>63-k) : Array.from({length:64},(_,k)=>k);
  for (let idx = 0; idx < indices.length; idx++) {
    const i = indices[idx];
    const y = oam[i * 4];
    const tile = oam[i * 4 + 1];
    const attr = oam[i * 4 + 2];
    const x = oam[i * 4 + 3];

    if (y >= 240) continue; // 不可见

    const flipH = (attr & 0x40) !== 0;
    const flipV = (attr & 0x80) !== 0;
    const palette = (attr & 3) + 4; // 精灵调色板 4-7

    // determine per-sprite priority behavior
    const priorityBehind = respectPriority && ((attr & 0x20) !== 0);
    if (ppu.spriteHeight === 8) {
      // 8x8 sprite: 直接按 PPU spritePatternBase + tile*16
      let chrAddr = (ppu.spritePatternBase || 0) + tile * 16;
      drawTileFromChrAddr(ctx, chrAddr, x, y, palette, flipH, flipV, priorityBehind, canvasWidth, canvasHeight);

      // 绘制边框
      if (drawSpriteBorders) {
        drawSpriteBorder(ctx, x, y, 8, 8);
      }
    } else {
      // 8x16 sprite: tile 的最低位选择 0x0000/0x1000 bank, tile & ~1 为顶部
      const topTile = tile & 0xFE;
      const bankBase = (tile & 0x01) ? 0x1000 : 0x0000;
      const topChrAddr = bankBase + (topTile * 16);

      if (!flipV) {
        // 正常顺序：top 然后 bottom
        drawTileFromChrAddr(ctx, topChrAddr, x, y, palette, flipH, false, priorityBehind, canvasWidth, canvasHeight);
        drawTileFromChrAddr(ctx, topChrAddr + 16, x, y + 8, palette, flipH, false, priorityBehind, canvasWidth, canvasHeight);

        // 绘制边框
        if (drawSpriteBorders) {
          drawSpriteBorder(ctx, x, y, 8, 16);
        }
      } else {
        // 垂直翻转：bottom 在上面并且每块内部也要垂直翻转
        drawTileFromChrAddr(ctx, topChrAddr + 16, x, y, palette, flipH, true, priorityBehind, canvasWidth, canvasHeight);
        drawTileFromChrAddr(ctx, topChrAddr, x, y + 8, palette, flipH, true, priorityBehind, canvasWidth, canvasHeight);

        // 绘制边框
        if (drawSpriteBorders) {
          drawSpriteBorder(ctx, x, y, 8, 16);
        }
      }
    }
  }
}

// 从 CHR 地址绘制单个 8x8 块（不负责 8x16 的上下两块组合）
function drawTileFromChrAddr(ctx, chrAddr, x, y, palette, flipH = false, flipV = false, priorityBehind = false, canvasWidth, canvasHeight) {
  if (!window.nes || !window.nes.ppu) return;
  const ppu = window.nes.ppu;
  if (!ppu.nesPal) return;

  for (let py = 0; py < 8; py++) {
    const { plane0, plane1 } = readTilePlanes(chrAddr, py, true);

    for (let px = 0; px < 8; px++) {
      const bit0 = (plane0 >> (7 - px)) & 1;
      const bit1 = (plane1 >> (7 - px)) & 1;
      const colorIndex = bit0 | (bit1 << 1);
      if (colorIndex === 0) continue;
      const paletteIndex = palette * 4 + colorIndex;
      const nesColor = ppu.readPalette(paletteIndex) & 0x3f;
      const rgb = ppu.nesPal[nesColor];
      if (!rgb) continue;

      const drawPX = flipH ? 7 - px : px;
      const drawPY = flipV ? 7 - py : py;
      const realX = (x + drawPX);
      const realY = (y + drawPY);

      if (realX < 0 || realY < 0 || realX >= canvasWidth || realY >= canvasHeight) continue;

      if (priorityBehind) {
        // For simplicity, since no bg canvas, just draw
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(realX, realY, 1, 1);
      } else {
        ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
        ctx.fillRect(realX, realY, 1, 1);
      }
    }
  }
}

// 绘制精灵边框
function drawSpriteBorder(ctx, x, y, width, height) {
  ctx.strokeStyle = '#FF0000'; // 红色边框
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

// Composite 渲染：把所有 sprite 渲染到临时缓冲，并根据 priority/flip/palette/CHR 组合后再绘制到屏幕
function renderSpritesComposite(ctx, oam, ppu, canvasWidth, canvasHeight) {
  const tmp = ctx.createImageData(canvasWidth, canvasHeight);
  const data = tmp.data;

  const reverse = document.getElementById('reverseOAM') && document.getElementById('reverseOAM').checked;
  const indices = reverse ? Array.from({length:64},(_,k)=>63-k) : Array.from({length:64},(_,k)=>k);

  // helper: set pixel in tmp at (sx,sy) with rgb and alpha
  function setPixel(sx, sy, r,g,b,a) {
    if (sx<0||sy<0||sx>=canvasWidth||sy>=canvasHeight) return;
    const idx = (sy*canvasWidth + sx)*4;
    data[idx]=r; data[idx+1]=g; data[idx+2]=b; data[idx+3]=a;
  }

  function getPixelAlpha(sx, sy) {
    if (sx<0||sy<0||sx>=canvasWidth||sy>=canvasHeight) return 0;
    return data[(sy*canvasWidth + sx)*4 + 3];
  }

  // draw one tile into tmp, similar to drawTileFromChrAddr but writing into tmp buffer with alpha
  function drawTileToTmp(chrAddr, tx, ty, palette, flipH, flipV, priorityBehind) {
      for (let py=0;py<8;py++){
        let plane0, plane1;
        // read pattern bytes using unified readTilePlanes
        const planes = readTilePlanes(chrAddr, py, true);
        plane0 = planes.plane0; plane1 = planes.plane1;
        for (let px=0;px<8;px++){
          const bit0 = (plane0 >> (7-px)) &1;
          const bit1 = (plane1 >> (7-px)) &1;
          const colorIndex = bit0 | (bit1<<1);
          if (colorIndex===0) continue;
          const paletteIndex = palette*4 + colorIndex;
          const nesColor = ppu.readPalette(paletteIndex) & 0x3F;
          const rgb = ppu.nesPal[nesColor];
          if (!rgb) continue;
          const drawPX = flipH ? 7-px : px;
          const drawPY = flipV ? 7-py : py;
          const sx = tx + drawPX;
          const sy = ty + drawPY;
          // per-pixel priority handling: if behind and tmp already has opaque at that pixel, skip
          if (priorityBehind) {
            const bgAlpha = getPixelAlpha(sx, sy); // tmp currently contains previous sprites
            if (bgAlpha !== 0) continue;
          }
          setPixel(sx, sy, rgb[0], rgb[1], rgb[2], 255);
        }
      }
  }

  // iterate sprites and draw
  for (let s=0;s<indices.length;s++){
    const i = indices[s];
    const y = oam[i*4]; if (y>=240) continue;
    const tile = oam[i*4+1]; const attr = oam[i*4+2]; const x = oam[i*4+3];
    const flipH = (attr & 0x40) !==0; const flipV = (attr & 0x80) !==0; const palette = (attr &3)+4;
    const priorityBehind = ((attr & 0x20) !==0);
    if (ppu.spriteHeight === 8) {
      const chrAddr = (ppu.spritePatternBase||0) + tile*16;
      drawTileToTmp(chrAddr, x, y, palette, flipH, flipV, priorityBehind);
    } else {
      const topTile = tile & 0xFE; const bankBase = (tile & 0x01) ? 0x1000 : 0x0000;
      const topChrAddr = bankBase + topTile*16;
      drawTileToTmp(topChrAddr, x, y, palette, flipH, false, priorityBehind);
      drawTileToTmp(topChrAddr+16, x, y+8, palette, flipH, false, priorityBehind);
    }
  }

  // finally blit tmp to ctx
  ctx.putImageData(tmp, 0, 0);
}

// 精灵绘制函数，供调试器调用
window.drawSpritesForDebug = function(nes, ctx, canvasWidth, canvasHeight) {
  preferPpuBanksGlobal = detectChrDifferences(nes.ppu, nes.mapper);
  drawSprites(ctx, canvasWidth, canvasHeight);
};

// 绑定精灵CHR选择器事件
document.addEventListener('DOMContentLoaded', function() {
  const spriteChrSourceSelect = document.getElementById('spriteChrSourceSelect');
  if (spriteChrSourceSelect) {
    spriteChrSourceSelect.addEventListener('change', function() {
      if (window.db && window.db.selectedView === 4) {
        window.db.updateDebugView();
      }
    });
  }
  const checkboxes = ['reverseOAM', 'respectPriority', 'legacyDraw', 'compositeSprites', 'spriteZoom2x', 'drawSpriteBorders'];
  checkboxes.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function() {
        if (window.db && window.db.selectedView === 4) {
          window.db.updateDebugView();
        }
      });
    }
  });
});

// 鼠标信息显示功能
let mouseInfoTimeout = null;

function initMouseInfo() {
  const canvas = document.getElementById('doutput');
  const wrapper = document.getElementById('wrapper');
  if (!canvas) {
    // 如果找不到 canvas，尝试回退绑定到 wrapper（有些情况下 canvas 可能被替换）
    if (wrapper) {
      wrapper.removeEventListener('pointermove', handleMouseMove);
      wrapper.removeEventListener('pointerleave', handleMouseLeave);
      wrapper.removeEventListener('click', handleMouseClick);
      wrapper.addEventListener('pointermove', handleMouseMove);
      wrapper.addEventListener('pointerleave', handleMouseLeave);
      wrapper.addEventListener('click', handleMouseClick);
      console.log('chrview: mouse handlers attached to wrapper fallback');
    }
    return;
  }

  // 移除可能已存在的监听，防止重复绑定
  canvas.removeEventListener('mousemove', handleMouseMove);
  canvas.removeEventListener('mouseleave', handleMouseLeave);
  canvas.removeEventListener('click', handleMouseClick);
  canvas.removeEventListener('pointermove', handleMouseMove);
  canvas.removeEventListener('pointerleave', handleMouseLeave);

  // 绑定 pointer 事件以提高兼容性，同时保留 mouse 事件
  canvas.addEventListener('pointermove', handleMouseMove);
  canvas.addEventListener('pointerleave', handleMouseLeave);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleMouseClick);
}

function handleMouseMove(e) {
  if (!window.nes || !window.db) return;

  const selectedView = window.db.selectedView;
  if (selectedView !== 1 && selectedView !== 4) return; // 只处理 nametable 和 sprite 视图

  // 调试：输出触发信息与可能的覆盖元素
  if (window.__CHRVIEW_DEBUG) {
    try {
      const topEl = document.elementFromPoint(e.clientX, e.clientY);
      console.log(`chrview move debug: view=${selectedView} client=(${e.clientX},${e.clientY}) target=${e.target && e.target.id} topEl=${topEl && topEl.id} tag=${topEl && topEl.tagName}`);
    } catch (err) { console.log('chrview move debug: elementFromPoint failed', err); }
  }

  // 优先使用真正的 canvas 元素来计算坐标比例，防止事件绑定到 wrapper 等导致 e.target.width 为 undefined
  const canvas = document.getElementById('doutput');
  const el = canvas || e.currentTarget || e.target;
  const rect = el.getBoundingClientRect();
  let internalW = (canvas && typeof canvas.width === 'number') ? canvas.width : null;
  let internalH = (canvas && typeof canvas.height === 'number') ? canvas.height : null;
  // 如果没有 canvas，则根据当前视图推断逻辑内部像素尺寸
  if (internalW === null || internalH === null) {
    if (selectedView === 1) { internalW = 512; internalH = 480; }
    else if (selectedView === 4) {
      const zoomCheckbox = document.getElementById('spriteZoom2x');
      const zoom2x = zoomCheckbox && zoomCheckbox.checked;
      internalW = zoom2x ? 512 : 256;
      internalH = zoom2x ? 480 : 240;
    } else { internalW = rect.width; internalH = rect.height; }
  }
  const scaleX = internalW / rect.width || 1;
  const scaleY = internalH / rect.height || 1;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // 调试输出：在控制台显示计算后的坐标（可在浏览器控制台查看）
  if (window.__CHRVIEW_DEBUG) console.log(`chrview click view=${selectedView} x=${x.toFixed(2)} y=${y.toFixed(2)} rect=${rect.width}x${rect.height} internal=${internalW}x${internalH}`);

  // 显示鼠标悬停的Tile ID，使用窗口坐标系
  showTileHoverInfo(e.clientX, e.clientY, x, y, selectedView);

  // 清除之前的定时器
  if (mouseInfoTimeout) {
    clearTimeout(mouseInfoTimeout);
  }

  // 鼠标移动时不清除表格数据，只更新悬停显示
  mouseInfoTimeout = setTimeout(() => {
    // 这里可以添加其他实时更新逻辑，但不清除表格
  }, 50);
}

function handleMouseLeave() {
  if (mouseInfoTimeout) {
    clearTimeout(mouseInfoTimeout);
  }
  hideTileHoverInfo();
}

// 全局变量跟踪选择状态
let selectedNametableTile = null; // {x, y} 或 null
let selectedSpriteIndex = null; // sprite index 或 null

function handleMouseClick(e) {
  if (!window.nes || !window.db) return;

  const selectedView = window.db.selectedView;
  if (selectedView !== 1 && selectedView !== 4) return;

  // 调试：记录事件触发与覆盖元素
  if (window.__CHRVIEW_DEBUG) {
    try {
      const topEl = document.elementFromPoint(e.clientX, e.clientY);
      console.log(`chrview click debug: view=${selectedView} client=(${e.clientX},${e.clientY}) target=${e.target && e.target.id} topEl=${topEl && topEl.id} tag=${topEl && topEl.tagName}`);
    } catch (err) { console.log('chrview click debug: elementFromPoint failed', err); }
  }

  // 同上：优先使用 canvas 的内部尺寸
  const canvas = document.getElementById('doutput');
  const el = canvas || e.currentTarget || e.target;
  const rect = el.getBoundingClientRect();
  let internalW = (canvas && typeof canvas.width === 'number') ? canvas.width : null;
  let internalH = (canvas && typeof canvas.height === 'number') ? canvas.height : null;
  if (internalW === null || internalH === null) {
    if (selectedView === 1) { internalW = 512; internalH = 480; }
    else if (selectedView === 4) {
      const zoomCheckbox = document.getElementById('spriteZoom2x');
      const zoom2x = zoomCheckbox && zoomCheckbox.checked;
      internalW = zoom2x ? 512 : 256;
      internalH = zoom2x ? 480 : 240;
    } else { internalW = rect.width; internalH = rect.height; }
  }
  const scaleX = internalW / rect.width || 1;
  const scaleY = internalH / rect.height || 1;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (selectedView === 1) {
    // Nametable 视图：点击更新表格
    const ntWidth = 512;
    const ntHeight = 480;

    if (x >= 0 && x < ntWidth && y >= 0 && y < ntHeight) {
      // 点击在有效区域内，更新选择
      selectedNametableTile = {x: Math.floor(x), y: Math.floor(y)};
      updateNametableTable(x, y);
    } else {
      // 点击在空白区域，清除选择
      selectedNametableTile = null;
      clearNametableTable();
    }
  } else if (selectedView === 4) {
    // Sprite 视图：点击更新表格
    const nes = window.nes;
    const oam = nes.ppu.oamRam;
    const spriteHeight = nes.ppu.spriteHeight || 8;

    // 检查是否启用了2x缩放
    const zoomCheckbox = document.getElementById('spriteZoom2x');
    const zoom2x = zoomCheckbox && zoomCheckbox.checked;
    const checkX = zoom2x ? x / 2 : x;
    const checkY = zoom2x ? y / 2 : y;

    // 检查是否在精灵上
    let foundSprite = -1;
    for (let i = 0; i < 64; i++) {
      const spriteY = oam[i * 4];
      const spriteX = oam[i * 4 + 3];

      if (spriteY >= 240) continue;

      const spriteWidth = 8;
      if (checkX >= spriteX && checkX < spriteX + spriteWidth && checkY >= spriteY && checkY < spriteY + spriteHeight) {
        foundSprite = i;
        break;
      }
    }

    if (foundSprite !== -1) {
      // 点击在精灵上，更新选择
      selectedSpriteIndex = foundSprite;
      updateSpriteTable(x, y);
    } else {
      // 点击在空白区域，清除选择
      selectedSpriteIndex = null;
      clearSpriteTable();
    }
  }
}

// 显示鼠标悬停的Tile ID信息
function showTileHoverInfo(mouseX, mouseY, canvasX, canvasY, viewType) {
  const hoverDiv = document.getElementById('tileHoverInfo');
  if (!hoverDiv) return;

  let tileId = '';
  let info = '';

  if (viewType === 1) { // Nametable
    const nes = window.nes;
    if (!nes) return;

    const ntWidth = 512;
    const ntHeight = 480;

    if (canvasX >= 0 && canvasX < ntWidth && canvasY >= 0 && canvasY < ntHeight) {
      const ntIndex = Math.floor(canvasY / 240) * 2 + Math.floor(canvasX / 256);
      const localX = Math.floor(canvasX) % 256;
      const localY = Math.floor(canvasY) % 240;
      const tileX = Math.floor(localX / 8);
      const tileY = Math.floor(localY / 8);

      const ntBase = 0x2000 + ntIndex * 0x400;
      const tileNumAddr = ntBase + tileY * 32 + tileX;
      const tileNum = nes.mapper.ppuPeak(tileNumAddr);

      tileId = tileNum.toString(16).toUpperCase().padStart(2, '0');
      info = `Tile: $${tileId}`;
    }
  } else if (viewType === 4) { // Sprite
    const nes = window.nes;
    if (!nes) return;

    const oam = nes.ppu.oamRam;
    const spriteHeight = nes.ppu.spriteHeight || 8;

    // 检查是否启用了2x缩放
    const zoomCheckbox = document.getElementById('spriteZoom2x');
    const zoom2x = zoomCheckbox && zoomCheckbox.checked;
    const checkX = zoom2x ? canvasX / 2 : canvasX;
    const checkY = zoom2x ? canvasY / 2 : canvasY;

    for (let i = 0; i < 64; i++) {
      const spriteY = oam[i * 4];
      const spriteX = oam[i * 4 + 3];

      if (spriteY >= 240) continue;

      const spriteWidth = 8;
      if (checkX >= spriteX && checkX < spriteX + spriteWidth && checkY >= spriteY && checkY < spriteY + spriteHeight) {
        const tileNum = oam[i * 4 + 1];
        tileId = tileNum.toString(16).toUpperCase().padStart(2, '0');
        info = `Sprite ${i}: Tile $${tileId}`;
        break;
      }
    }
  }

  if (info) {
    hoverDiv.textContent = info;
    // 获取调试面板的边界矩形，计算相对于面板的坐标
    const wrapper = document.getElementById('wrapper');
    if (wrapper) {
      const wrapperRect = wrapper.getBoundingClientRect();
      const relativeX = mouseX - wrapperRect.left;
      const relativeY = mouseY - wrapperRect.top;
      // 直接使用相对于调试面板的坐标，跟随鼠标
      hoverDiv.style.left = `${relativeX + 10}px`;
      hoverDiv.style.top = `${relativeY + 10}px`;
    } else {
      // 备用方案：使用窗口坐标
      hoverDiv.style.left = `${mouseX + 10}px`;
      hoverDiv.style.top = `${mouseY + 10}px`;
    }
    hoverDiv.style.display = 'block';
  } else {
    hideTileHoverInfo();
  }
}

function hideTileHoverInfo() {
  const hoverDiv = document.getElementById('tileHoverInfo');
  if (hoverDiv) {
    hoverDiv.style.display = 'none';
  }
}

// 更新Nametable表格
function updateNametableTable(x, y) {
  const nes = window.nes;
  if (!nes) return;

  const ntWidth = 512;
  const ntHeight = 480;
  const tileSize = 8;

  if (x < 0 || x >= ntWidth || y < 0 || y >= ntHeight) {
    // 清除表格
    clearNametableTable();
    return;
  }

  // 计算是哪个 nametable (0-3)
  const ntIndex = Math.floor(y / 240) * 2 + Math.floor(x / 256);
  const localX = Math.floor(x) % 256;
  const localY = Math.floor(y) % 240;

  // 计算 tile 坐标
  const tileX = Math.floor(localX / tileSize);
  const tileY = Math.floor(localY / tileSize);

  // 计算地址
  const ntBase = 0x2000 + ntIndex * 0x400;
  const tileNumAddr = ntBase + tileY * 32 + tileX;
  const attrAddr = ntBase + 0x3C0 + Math.floor(tileY / 4) * 8 + Math.floor(tileX / 4);

  // 读取数据
  const tileNum = nes.mapper.ppuPeak(tileNumAddr);
  const attrByte = nes.mapper.ppuPeak(attrAddr);

  // 计算属性
  const attrShift = ((tileY % 4) >> 1) * 4 + ((tileX % 4) >> 1) * 2;
  const paletteIndex = (attrByte >> attrShift) & 0x3;

  // 计算 CHR 地址
  const bgPatternBase = nes.ppu.bgPatternBase;
  const chrAddr = bgPatternBase + tileNum * 16;

  // 计算像素在 tile 内的坐标
  const pixelX = Math.floor(x) % tileSize;
  const pixelY = Math.floor(y) % tileSize;

  // 计算 CHR 页码
  const chrPage = Math.floor(chrAddr / 0x1000);

  // 计算背景基址
  const bgBase = bgPatternBase.toString(16).toUpperCase().padStart(4, '0');

  // 计算像素颜色
  let pixelColor = '-';
  try {
    const chr = nes.mapper.chrRom || nes.mapper.chrRam;
    if (chr && chrAddr + pixelY < chr.length) {
      const lp = chr[chrAddr + pixelY];
      const hp = chr[chrAddr + pixelY + 8];
      const bit0 = (lp >> (7 - pixelX)) & 1;
      const bit1 = (hp >> (7 - pixelX)) & 1;
      const colorIndex = bit0 | (bit1 << 1);
      if (colorIndex > 0) {
        const paletteAddr = paletteIndex * 4 + colorIndex;
        const nesColor = nes.ppu.readPalette(paletteAddr) & 0x3F;
        const rgb = nes.ppu.nesPal[nesColor];
        pixelColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      } else {
        pixelColor = '透明';
      }
    }
  } catch (e) {
    pixelColor = '-';
  }

  // 计算扫描线
  const scanline = Math.floor(y);

  // 获取PPU状态
  let ppuStatus = 0;
  try {
    ppuStatus = nes.ppu.read(2); // 读取PPU状态寄存器
  } catch (e) {
    ppuStatus = 0;
  }

  // 更新表格
  document.getElementById('nt-pos').textContent = `(${Math.floor(x)}, ${Math.floor(y)})`;
  document.getElementById('nt-index').textContent = `${ntIndex} (${ntIndex === 0 ? '左上' : ntIndex === 1 ? '右上' : ntIndex === 2 ? '左下' : '右下'})`;
  document.getElementById('nt-tile-coord').textContent = `(${tileX}, ${tileY})`;
  document.getElementById('nt-tile-addr').textContent = `$${tileNumAddr.toString(16).toUpperCase().padStart(4, '0')}`;
  document.getElementById('nt-tile-num').textContent = `$${tileNum.toString(16).toUpperCase().padStart(2, '0')} (${tileNum})`;
  document.getElementById('nt-attr-addr').textContent = `$${attrAddr.toString(16).toUpperCase().padStart(4, '0')}`;
  document.getElementById('nt-attr-byte').textContent = `$${attrByte.toString(16).toUpperCase().padStart(2, '0')}`;
  document.getElementById('nt-palette-idx').textContent = `${paletteIndex}`;
  document.getElementById('nt-chr-addr').textContent = `$${chrAddr.toString(16).toUpperCase().padStart(4, '0')}`;
  document.getElementById('nt-pixel-pos').textContent = `(${pixelX}, ${pixelY})`;
  document.getElementById('nt-tile-hex').textContent = `$${tileNum.toString(16).toUpperCase().padStart(2, '0')}`;
  document.getElementById('nt-chr-page').textContent = `${chrPage}`;
  document.getElementById('nt-bg-base').textContent = `$${bgBase}`;
  document.getElementById('nt-pixel-color').textContent = pixelColor;
  document.getElementById('nt-scanline').textContent = `${scanline}`;
  document.getElementById('nt-ppu-status').textContent = `$${ppuStatus.toString(16).toUpperCase().padStart(2, '0')}`;
}

// 清除Nametable表格
function clearNametableTable() {
  const fields = ['nt-pos', 'nt-index', 'nt-tile-coord', 'nt-tile-addr', 'nt-tile-num', 'nt-attr-addr', 'nt-attr-byte', 'nt-palette-idx', 'nt-chr-addr', 'nt-pixel-pos', 'nt-tile-hex', 'nt-chr-page', 'nt-bg-base', 'nt-pixel-color', 'nt-scanline', 'nt-ppu-status'];
  fields.forEach(id => {
    document.getElementById(id).textContent = '-';
  });
}

// 更新Sprite表格
function updateSpriteTable(x, y) {
  const nes = window.nes;
  if (!nes) return;

  const oam = nes.ppu.oamRam;
  const spriteHeight = nes.ppu.spriteHeight || 8;

  // 检查是否启用了2x缩放
  const zoomCheckbox = document.getElementById('spriteZoom2x');
  const zoom2x = zoomCheckbox && zoomCheckbox.checked;
  const checkX = zoom2x ? x / 2 : x;
  const checkY = zoom2x ? y / 2 : y;

  // 检查是否在精灵上
  let foundSprite = -1;
  for (let i = 0; i < 64; i++) {
    const spriteY = oam[i * 4];
    const spriteX = oam[i * 4 + 3];

    if (spriteY >= 240) continue;

    const spriteWidth = 8;
    if (checkX >= spriteX && checkX < spriteX + spriteWidth && checkY >= spriteY && checkY < spriteY + spriteHeight) {
      foundSprite = i;
      break;
    }
  }

  if (foundSprite === -1) {
    clearSpriteTable();
    return;
  }

  const spriteIndex = foundSprite;
  const spriteY = oam[spriteIndex * 4];
  const tileNum = oam[spriteIndex * 4 + 1];
  const attr = oam[spriteIndex * 4 + 2];
  const spriteX = oam[spriteIndex * 4 + 3];

  // 解析属性
  const palette = (attr & 0x3) + 4;
  const priority = (attr & 0x20) ? 'Behind BG' : 'Front';
  const flipH = (attr & 0x40) ? 'Yes' : 'No';
  const flipV = (attr & 0x80) ? 'Yes' : 'No';

  // 计算 CHR 地址
  let chrAddr;
  if (spriteHeight === 8) {
    chrAddr = (nes.ppu.spritePatternBase || 0) + tileNum * 16;
  } else {
    const topTile = tileNum & 0xFE;
    const bankBase = (tileNum & 0x01) ? 0x1000 : 0x0000;
    chrAddr = bankBase + topTile * 16;
  }

  // 计算像素在 tile 内的坐标
  const pixelX = Math.floor(checkX - spriteX);
  const pixelY = Math.floor(checkY - spriteY);

  // 计算OAM地址
  const oamAddr = spriteIndex * 4;

  // 计算精灵基址
  const spriteBase = (nes.ppu.spritePatternBase || 0).toString(16).toUpperCase().padStart(4, '0');

  // 检查是否在屏幕内
  const onScreen = spriteX < 256 && spriteY < 240 && spriteX + 8 > 0 && spriteY + spriteHeight > 0;

  // 计算像素颜色
  let pixelColor = '-';
  try {
    const chr = nes.mapper.chrRom || nes.mapper.chrRam;
    if (chr && chrAddr + pixelY < chr.length && pixelX >= 0 && pixelX < 8 && pixelY >= 0 && pixelY < 8) {
      const lp = chr[chrAddr + pixelY];
      const hp = chr[chrAddr + pixelY + 8];
      const bit0 = (lp >> (7 - pixelX)) & 1;
      const bit1 = (hp >> (7 - pixelX)) & 1;
      const colorIndex = bit0 | (bit1 << 1);
      if (colorIndex > 0) {
        const paletteAddr = palette * 4 + colorIndex;
        const nesColor = nes.ppu.readPalette(paletteAddr) & 0x3F;
        const rgb = nes.ppu.nesPal[nesColor];
        pixelColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      } else {
        pixelColor = '透明';
      }
    }
  } catch (e) {
    pixelColor = '-';
  }

  // 获取OAM数据
  const oamData = [spriteY, tileNum, attr, spriteX].map(v => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');

  // 计算精灵页码
  const spritePage = Math.floor(chrAddr / 0x1000);

  // 更新表格
  document.getElementById('spr-index').textContent = `${spriteIndex}`;
  document.getElementById('spr-pos').textContent = `(${spriteX}, ${spriteY}) - (${spriteX + 7}, ${spriteY + spriteHeight - 1})`;
  document.getElementById('spr-tile-num').textContent = `$${tileNum.toString(16).toUpperCase().padStart(2, '0')} (${tileNum})`;
  document.getElementById('spr-attr-byte').textContent = `$${attr.toString(16).toUpperCase().padStart(2, '0')}`;
  document.getElementById('spr-palette').textContent = `${palette - 4} (索引 ${palette})`;
  document.getElementById('spr-priority').textContent = `${priority}`;
  document.getElementById('spr-flip-h').textContent = `${flipH}`;
  document.getElementById('spr-flip-v').textContent = `${flipV}`;
  document.getElementById('spr-chr-addr').textContent = `$${chrAddr.toString(16).toUpperCase().padStart(4, '0')}`;
  document.getElementById('spr-pixel-pos').textContent = `(${pixelX}, ${pixelY})`;
  document.getElementById('spr-tile-hex').textContent = `$${tileNum.toString(16).toUpperCase().padStart(2, '0')}`;
  document.getElementById('spr-size').textContent = `${spriteHeight === 8 ? '8x8' : '8x16'}`;
  document.getElementById('spr-oam-addr').textContent = `$${oamAddr.toString(16).toUpperCase().padStart(3, '0')}`;
  document.getElementById('spr-base').textContent = `$${spriteBase}`;
  document.getElementById('spr-on-screen').textContent = onScreen ? '是' : '否';
  document.getElementById('spr-pixel-color').textContent = pixelColor;
  document.getElementById('spr-oam-data').textContent = oamData;
  document.getElementById('spr-page').textContent = `${spritePage}`;
}

// 清除Sprite表格
function clearSpriteTable() {
  const fields = ['spr-index', 'spr-pos', 'spr-tile-num', 'spr-attr-byte', 'spr-palette', 'spr-priority', 'spr-flip-h', 'spr-flip-v', 'spr-chr-addr', 'spr-pixel-pos', 'spr-tile-hex', 'spr-size', 'spr-oam-addr', 'spr-base', 'spr-on-screen', 'spr-pixel-color', 'spr-oam-data', 'spr-page'];
  fields.forEach(id => {
    document.getElementById(id).textContent = '-';
  });
}

// 更新固定显示的信息
function updateFixedInfo() {
  if (!window.nes || !window.db) return;

  const selectedView = window.db.selectedView;
  const nametableInfo = document.getElementById('nametableTable');
  const spriteInfo = document.getElementById('spriteTable');

  // 不再自动清除表格数据，让用户选择的数据保持显示
  // 只有在用户点击其他地方或明确重置时才清除
  if (selectedView === 1 && nametableInfo) {
    // Nametable 视图：确保表格显示
    nametableInfo.style.display = 'block';
  } else if (selectedView === 4 && spriteInfo) {
    // Sprite 视图：确保表格显示
    spriteInfo.style.display = 'block';
  }
}

// 将函数添加到 window 对象
window.updateFixedInfo = updateFixedInfo;



// 修改精灵绘制函数以支持放大
window.drawSpritesForDebug = function(nes, ctx, canvasWidth, canvasHeight) {
  preferPpuBanksGlobal = detectChrDifferences(nes.ppu, nes.mapper);

  const zoomCheckbox = document.getElementById('spriteZoom2x');
  const zoom2x = zoomCheckbox && zoomCheckbox.checked;

  if (zoom2x) {
    // 放大2倍时，调整画布尺寸
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth / 2;
    tempCanvas.height = canvasHeight / 2;
    const tempCtx = tempCanvas.getContext('2d');

    drawSprites(tempCtx, canvasWidth / 2, canvasHeight / 2);

    // 缩放绘制到目标画布
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, canvasWidth, canvasHeight);
  } else {
    drawSprites(ctx, canvasWidth, canvasHeight);
  }
};

// 初始化鼠标信息功能
document.addEventListener('DOMContentLoaded', function() {
  initMouseInfo();
});

// 假设每页显示 256x128（即 0x1000 字节，256 tiles），页码从 0 开始
const CHR_PAGE_SIZE = 0x1000; // 4KB per page
function drawChrPage(nes, ctx, pageId) {
  let imgData = ctx.createImageData(256, 128);
  let chr = nes.mapper.chrRom || nes.mapper.chrRam;
  if (!chr) return;
  let baseAddr = pageId * CHR_PAGE_SIZE;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let tileIndex = y * 16 + x;
      let tileAddr = baseAddr + tileIndex * 16;
      drawChrTile(chr, imgData, x * 8, y * 8, tileAddr, nes);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawChrTile(chr, imgData, x, y, addr, nes) {
  // 取当前调色板的 0F 07 28 39 号色
  const palIdx = [0x0F, 0x07, 0x28, 0x39];
  const pal = palIdx.map(idx => nes.ppu.nesPal[idx]);
  for (let i = 0; i < 8; i++) {
    let lp = chr[addr + i];
    let hp = chr[addr + i + 8];
    for (let j = 0; j < 8; j++) {
      let shift = 7 - j;
      let pixel = (lp >> shift) & 1;
      pixel |= ((hp >> shift) & 1) << 1;
      let color = pal[pixel];
      let index = ((y + i) * imgData.width + (x + j)) * 4;
      imgData.data[index] = color[0];
      imgData.data[index + 1] = color[1];
      imgData.data[index + 2] = color[2];
      imgData.data[index + 3] = 255;
    }
  }
}
// 绑定页码切换事件
document.getElementById('chapageID').onchange = function () {

  document.getElementById('chapage').width = 128; // 设置宽度
  document.getElementById('chapage').height = 128; // 设置高度
  let pageId = parseInt(this.value);
  let ctx = document.getElementById('chapage').getContext('2d');
  drawChrPage(nes, ctx, pageId);
};

// 初始化页码选项
function initChrPageSelector(nes) {
  let chrLen = nes.mapper.chrRom ? nes.mapper.chrRom.length : 0;
  let pageCount = Math.ceil(chrLen / CHR_PAGE_SIZE);
  let sel = document.getElementById('chapageID');
  sel.innerHTML = "";
  for (let i = 0; i < pageCount; i++) {
    let opt = document.createElement('option');
    opt.value = i;
    opt.text = "CHR页 " + i;
    sel.appendChild(opt);
  }
}

function getDynamicPalette(nes, isSpriteMode) {
  try {
    const baseAddr = isSpriteMode ? 0x10 : 0x00; // 精灵使用 $3F10-$3F1F，背景使用 $3F00-$3F0F
    const palette = [];
    for (let i = 0; i < 4; i++) {
      const colorIndex = nes.ppu.readPalette(baseAddr + i);
      palette.push(nes.ppu.nesPal[colorIndex & 0x3F]); // 获取实际颜色
    }
    //console.log(`成功获取动态调色板: ${palette.map(c => `rgb(${c[0]},${c[1]},${c[2]})`).join(", ")}`);
    return palette;
  } catch (error) {
    //console.error("获取动态调色板时发生异常:", error);
    return [[0, 0, 0], [255, 255, 255], [128, 128, 128], [64, 64, 64]]; // 返回默认调色板
  }
}

// 动态创建Nametable信息表格
function createNametableTable() {
  const container = document.getElementById('nametableOptions');
  if (!container) return;

  // 检查是否已经存在表格
  if (document.getElementById('nametableTable')) return;

  const table = document.createElement('table');
  table.id = 'nametableTable';
  table.style.cssText = 'margin-top: 8px; font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.7); color: #fff; border-collapse: collapse; width: 100%; max-width: 600px;';

  const tbody = document.createElement('tbody');

  // 定义表格行数据
  const rows = [
    ['位置', 'nt-pos', 'Nametable', 'nt-index'],
    ['Tile坐标', 'nt-tile-coord', '像素位置', 'nt-pixel-pos'],
    ['Tile编号', 'nt-tile-num', 'Tile ID (Hex)', 'nt-tile-hex'],
    ['Tile地址', 'nt-tile-addr', '属性地址', 'nt-attr-addr'],
    ['属性字节', 'nt-attr-byte', '调色板索引', 'nt-palette-idx'],
    ['CHR地址', 'nt-chr-addr', 'CHR页码', 'nt-chr-page'],
    ['背景基址', 'nt-bg-base', '像素颜色', 'nt-pixel-color'],
    ['扫描线', 'nt-scanline', 'PPU状态', 'nt-ppu-status']
  ];

  rows.forEach(rowData => {
    const tr = document.createElement('tr');

    // 第一列（标题）
    const td1 = document.createElement('td');
    td1.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.1);';
    td1.textContent = rowData[0];
    tr.appendChild(td1);

    // 第二列（值）
    const td2 = document.createElement('td');
    td2.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1);';
    td2.id = rowData[1];
    td2.textContent = '-';
    tr.appendChild(td2);

    // 第三列（标题）
    const td3 = document.createElement('td');
    td3.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.1);';
    td3.textContent = rowData[2];
    tr.appendChild(td3);

    // 第四列（值）
    const td4 = document.createElement('td');
    td4.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1);';
    td4.id = rowData[3];
    td4.textContent = '-';
    tr.appendChild(td4);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// 动态创建Sprite信息表格
function createSpriteTable() {
  const container = document.getElementById('spriteChrOptions');
  if (!container) return;

  // 检查是否已经存在表格
  if (document.getElementById('spriteTable')) return;

  const table = document.createElement('table');
  table.id = 'spriteTable';
  table.style.cssText = 'margin-top: 8px; font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.7); color: #fff; border-collapse: collapse; width: 100%; max-width: 600px;';

  const tbody = document.createElement('tbody');

  // 定义表格行数据
  const rows = [
    ['精灵索引', 'spr-index', '位置', 'spr-pos'],
    ['Tile编号', 'spr-tile-num', 'Tile ID (Hex)', 'spr-tile-hex'],
    ['属性字节', 'spr-attr-byte', '调色板', 'spr-palette'],
    ['优先级', 'spr-priority', '水平翻转', 'spr-flip-h'],
    ['垂直翻转', 'spr-flip-v', 'CHR地址', 'spr-chr-addr'],
    ['像素位置', 'spr-pixel-pos', '精灵大小', 'spr-size'],
    ['OAM地址', 'spr-oam-addr', '精灵基址', 'spr-base'],
    ['屏幕内', 'spr-on-screen', '像素颜色', 'spr-pixel-color'],
    ['OAM数据', 'spr-oam-data', '精灵页码', 'spr-page']
  ];

  rows.forEach(rowData => {
    const tr = document.createElement('tr');

    // 第一列（标题）
    const td1 = document.createElement('td');
    td1.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.1);';
    td1.textContent = rowData[0];
    tr.appendChild(td1);

    // 第二列（值）
    const td2 = document.createElement('td');
    td2.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1);';
    td2.id = rowData[1];
    td2.textContent = '-';
    tr.appendChild(td2);

    // 第三列（标题）
    const td3 = document.createElement('td');
    td3.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.1);';
    td3.textContent = rowData[2];
    tr.appendChild(td3);

    // 第四列（值）
    const td4 = document.createElement('td');
    td4.style.cssText = 'padding: 2px 4px; border: 1px solid rgba(255,255,255,0.1);';
    td4.id = rowData[3];
    td4.textContent = '-';
    tr.appendChild(td4);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// 初始化信息表格
function initInfoTables() {
  // 在适当的时机创建表格，比如页面加载后或调试面板显示时
  setTimeout(() => {
    createNametableTable();
    createSpriteTable();
  }, 100);
}

// 导出函数供外部调用
window.createNametableTable = createNametableTable;
window.createSpriteTable = createSpriteTable;
window.initInfoTables = initInfoTables;
