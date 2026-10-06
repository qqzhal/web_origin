// 多来源log浮层管理
const logToastMap = {};
let logToastOrder = [];

// log函数必须在logToastMap定义后声明
let logLastTime = 0;
function log(text, source = "default") {
  let now = Date.now();
  if (now - logLastTime < 30) return; // 30ms节流
  logLastTime = now;
  // 1. 获取或创建浮层
  let toast = logToastMap[source];
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'nes-toast';
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '9999';
    toast.style.background = 'rgba(30,60,200,0.92)';
    toast.style.color = '#fff';
    toast.style.padding = '5px 12px';
    toast.style.borderRadius = '6px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 2px 16px rgba(0,0,0,0.25)';
    toast.style.textShadow = '2px 2px 4px #000, 0 0 2px #fff';
    toast.style.opacity = '0';
    toast.style.pointerEvents = 'none';
    toast.style.transition = 'opacity 0.4s';
    toast.style.maxWidth = '98vw';
    toast.style.overflowWrap = 'break-word'; 
    var container = document.getElementById('fullscreenContainer') || document.body;
    container.appendChild(toast);
    logToastMap[source] = toast;
    logToastOrder.push(source);
  }

  // 2. 更新内容
  toast.textContent = text;
  toast.style.opacity = '1';

  // 3. 重新排列所有log浮层
  let baseBottom = 5;
  let curBottom = baseBottom;
  for (let i = 0; i < logToastOrder.length; i++) {
    let s = logToastOrder[i];
    let t = logToastMap[s];
    if (t) {
      t.style.bottom = curBottom + 'px';
      // 先让浮层可见，才能正确获取高度
      t.style.visibility = 'hidden';
      t.style.opacity = '1';
      // 强制触发重排
      let h = t.offsetHeight;
      t.style.visibility = '';
      // 间距 8px
      curBottom += h + 8;
    }
  }

  // 4. 清除旧定时器
  if (toast._timer) clearTimeout(toast._timer);

  // 5. 3秒后淡出并移除/补位
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      // 移除dom和map
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      delete logToastMap[source];
      let idx = logToastOrder.indexOf(source);
      if (idx !== -1) logToastOrder.splice(idx, 1);
      // 重新排列剩余log浮层
      for (let i = 0; i < logToastOrder.length; i++) {
        let s = logToastOrder[i];
        let t = logToastMap[s];
        if (t) t.style.bottom = (baseBottom + i * 30) + 'px';
      }
    }, 400);
  }, 3000);

  // 6. 追加到log区域
  el("log").innerHTML += text + "<br>";
  el("log").scrollTop = el("log").scrollHeight;
}


let nes = new Nes();
let audioHandler = new AudioHandler();
window.audioHandler = audioHandler; // 设置为全局变量
let paused = false;
let loaded = false;
let pausedInBg = false;
let loopId = 0;
let loadedName = "";

let dpr = window.devicePixelRatio || 1;
let c = el("output");
c.width = 256;
c.height = 240;
// 设置画布样式防止模糊
c.style.width = "256px";
c.style.height = "240px";
c.style.imageRendering = "pixelated";
c.style.imageRendering = "crisp-edges"; // 兼容部分浏览器
// Note: ctx will be initialized later in updateCtxAfterResize
let ctx = null;

// WebGL variables
let gl = null;
let glProgram = null;
let glTexture = null;
let glBuffer = null;
let glVertexShader = null;
let glFragmentShader = null;
let isWebGL = false;

// render backend: '2d' or 'webgl' - initialize from localStorage if available (仅 NES 使用)
try { window.renderBackend = localStorage.getItem('renderBackend') || '2d'; } catch (e) { window.renderBackend = '2d'; }

// internal buffer canvas (keeps logical NES pixels) used for DPR-aware drawImage path
let bufferCanvas = document.createElement('canvas');
bufferCanvas.width = 256;
bufferCanvas.height = 240;
let bufferCtx = bufferCanvas.getContext('2d');
let bufferImgData = bufferCtx.createImageData(256, 240);

// helpers: image-rendering compatibility fallback
function applyImageRenderingFallback(el, mode) {
  // mode: 'pixelated' | 'smooth'
  if (!el || !el.style) return;
  const pixelCandidates = ['pixelated', 'crisp-edges', '-webkit-crisp-edges', '-moz-crisp-edges', 'nearest-neighbor'];
  const smoothCandidates = ['auto', 'smooth', 'linear'];
  // try recommended value first, then fallbacks
  try {
    if (mode === 'smooth') {
      for (let v of smoothCandidates) {
        el.style.imageRendering = v;
      }
    } else {
      for (let v of pixelCandidates) {
        el.style.imageRendering = v;
      }
    }
  } catch (e) {
    // ignore
  }
}

// WebGL initialization
function initWebGL() {
  try {
    // Check if WebGL is supported
    const canvas = document.createElement('canvas');
    const testGl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!testGl) {
      console.log("WebGL not supported by browser, falling back to 2D");
      isWebGL = false;
      return false;
    }

    // 不开 preserveDrawingBuffer：它是移动端 tile GPU 的性能大敌（强制帧末写回 tile
    // 内存、增加带宽与功耗、触发降频）。截图功能改为读取前在同一任务内重绘一帧。
    gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) {
      console.log("Failed to get WebGL context from main canvas");
      isWebGL = false;
      return false;
    }

    // Check WebGL extensions and capabilities
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      // Removed console.log for vendor and renderer info
    }

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Fragment shader
    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `;

    // Create shaders
    glVertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(glVertexShader, vertexShaderSource);
    gl.compileShader(glVertexShader);
    if (!gl.getShaderParameter(glVertexShader, gl.COMPILE_STATUS)) {
      // Removed console.error for vertex shader compilation failure
      return false;
    }

    glFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(glFragmentShader, fragmentShaderSource);
    gl.compileShader(glFragmentShader);
    if (!gl.getShaderParameter(glFragmentShader, gl.COMPILE_STATUS)) {
      // Removed console.error for fragment shader compilation failure
      return false;
    }

    // Create program
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, glVertexShader);
    gl.attachShader(glProgram, glFragmentShader);
    gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
      // Removed console.error for program linking failure
      return false;
    }
    gl.useProgram(glProgram);

    // Create texture
    glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // Allocate texture storage once (so we can safely use texSubImage2D each frame)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 240, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Create buffer
    glBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    const vertices = new Float32Array([
      -1.0, -1.0, 0.0, 1.0,
       1.0, -1.0, 1.0, 1.0,
      -1.0,  1.0, 0.0, 0.0,
       1.0,  1.0, 1.0, 0.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Set up attributes
    const positionLocation = gl.getAttribLocation(glProgram, "a_position");
    const texCoordLocation = gl.getAttribLocation(glProgram, "a_texCoord");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

    // Set viewport
    gl.viewport(0, 0, c.width, c.height);

  // NOTE: do not overwrite global 2D `ctx` with the WebGL context.
  // Keep WebGL in `gl` and 2D context in `ctx` (updated elsewhere).

    isWebGL = true;
    //console.log("WebGL initialized successfully");
    // 更新滤镜选择状态
    updateFilterSelectState();
    return true;
  } catch (e) {
    //console.error("WebGL initialization failed:", e);
    isWebGL = false;
    // 更新滤镜选择状态
    updateFilterSelectState();
    return false;
  }
}

// WebGL 绘制一帧：滤镜/多缓冲开启时交给 FilterSystem，否则直接上传纹理绘制。
// draw() 与截图共用，保证两条路径的绘制逻辑一致。
function drawWebGLFrame() {
  if (window.FilterSystem && window.FilterSystem.multiBufferEnabled) {
    if (window.FilterSystem.renderWithMultiBuffering) window.FilterSystem.renderWithMultiBuffering();
    return;
  }
  if ((window.currentFilter === 'NSTC' || window.currentFilter === 'PAL') &&
      window.FilterSystem && window.FilterSystem.renderWithFilter) {
    window.FilterSystem.renderWithFilter();
    return;
  }
  gl.viewport(0, 0, c.width, c.height);
  gl.useProgram(glProgram);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imgData.data));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Function to get screenshot from WebGL canvas
function getWebGLScreenshot(canvas) {
  if (!gl || !isWebGL) return canvas.toDataURL("image/png");

  try {
    // 未开 preserveDrawingBuffer：读取像素前必须在同一任务内重绘当前帧，
    // 否则读到的缓冲内容是未定义的（表现为黑屏截图）
    drawWebGLFrame();
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip vertically because WebGL has origin at bottom left
    const flippedPixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIndex = (y * width + x) * 4;
        const dstIndex = ((height - 1 - y) * width + x) * 4;
        flippedPixels[dstIndex] = pixels[srcIndex];
        flippedPixels[dstIndex + 1] = pixels[srcIndex + 1];
        flippedPixels[dstIndex + 2] = pixels[srcIndex + 2];
        flippedPixels[dstIndex + 3] = pixels[srcIndex + 3];
      }
    }

    // Create a temporary 2D canvas to generate data URL
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(flippedPixels);
    ctx.putImageData(imageData, 0, 0);
    return tempCanvas.toDataURL('image/png');
  } catch (e) {
    console.error("Failed to get WebGL screenshot:", e);
    return "";
  }
}

// Global canvas context tracking
let canvasContextAcquired = false;
let canvasContextAcquiredAt = null;

function checkCanvasContext() {
  const c = el("output");
  if (!c) return false;

  try {
    const ctx = c.getContext("2d");
    if (ctx && !canvasContextAcquired) {
      canvasContextAcquired = true;
      canvasContextAcquiredAt = new Error().stack;
      // Removed console.log for canvas context acquisition
      return true;
    }
    return !!ctx;
  } catch (e) {
    return false;
  }
}

// Monkey patch getContext to track when it's called
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
  const result = originalGetContext.call(this, contextType, ...args);
  if (this.id === 'output' && result && !canvasContextAcquired) {
    canvasContextAcquired = true;
    canvasContextAcquiredAt = new Error().stack;
    // Removed console.log for context acquisition tracking
  }
  return result;
};


// load persisted settings
window.scalingMode = localStorage.getItem('scalingMode') || window.scalingMode || 'pixelated';
window.highDpiMode = (localStorage.getItem('highDpiMode') === '1');
// 画面设置（更多设置）：default=默认等比显示(256:240)；'crt43'=按4:3老电视比例显示。
{
  const _dm = localStorage.getItem('displayMode');
  window.displayMode = (_dm === 'crt43') ? 'crt43' : 'default';
}
// 显示240线设置：默认关闭。若开启，将在最终绘制到 canvas 时在上下各绘制8px黑条
// 默认关闭：如果 localStorage 中存在用户设置则以用户设置为准，否则默认关闭该视觉效果
{
  const _s = localStorage.getItem('show240Lines');
  window.show240Lines = (_s !== null) ? (_s === '1') : false;
}

// 滤镜设置：默认无滤镜
window.currentFilter = localStorage.getItem('currentFilter') || 'none';

let dc = el("doutput");
dc.width = 512;
dc.height = 480;
// 设置调试画布样式防止模糊
dc.style.width = "512px";
dc.style.height = "480px";
dc.style.imageRendering = "pixelated";
dc.style.imageRendering = "crisp-edges"; // 兼容部分浏览器
let dctx = dc.getContext("2d");

// 创建独立的 FPS overlay canvas，不影响主 canvas 的像素渲染
let fpsOverlay = null;
let fpsOverlayCtx = null;
function ensureFpsOverlay() {
  if (fpsOverlay && fpsOverlayCtx) return;
  const outputEl = el('output');
  if (!outputEl) return;
  // 创建 overlay canvas，并放在 output 的父容器中，与 output 绝对定位重叠
  fpsOverlay = document.createElement('canvas');
  fpsOverlay.id = 'fpsOverlay';
  fpsOverlay.style.position = 'absolute';
  fpsOverlay.style.left = '0';
  fpsOverlay.style.top = '0';
  fpsOverlay.style.pointerEvents = 'none';
  fpsOverlay.style.zIndex = '9998';
  // 放入与 output 相同的 offsetParent 以保证绝对定位对齐（更稳定）
  const container = outputEl.offsetParent || outputEl.parentElement || document.body;
  // 如果 offsetParent 与 output 的 parentElement 不同，append 到 offsetParent
  container.appendChild(fpsOverlay);
  fpsOverlayCtx = fpsOverlay.getContext('2d');
  updateFpsOverlaySize();
}

function updateFpsOverlaySize() {
  const outputEl = el('output');
  if (!outputEl || !fpsOverlay || !fpsOverlayCtx) return;
  // 以 CSS 尺寸为基准，按 devicePixelRatio 放大实际像素尺寸
  const cssW = parseFloat(getComputedStyle(outputEl).width) || outputEl.clientWidth;
  const cssH = parseFloat(getComputedStyle(outputEl).height) || outputEl.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  // 设置物理像素尺寸
  fpsOverlay.width = Math.max(1, Math.round(cssW * ratio));
  fpsOverlay.height = Math.max(1, Math.round(cssH * ratio));
  // CSS 尺寸保持与 output 一致
  fpsOverlay.style.width = cssW + 'px';
  fpsOverlay.style.height = cssH + 'px';
  // 将 context 缩放回 CSS 像素坐标系，之后可使用 CSS 像素为单位绘制文字以保证清晰
  fpsOverlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  // 将 overlay 放在 output 的 offsetParent 上，并使用 offsetLeft/offsetTop 对齐，
  // 这样在页面重排或 CSS 变更时更稳定（避免 getBoundingClientRect 与父元素不一致的问题）
  try {
    const refParent = outputEl.offsetParent || outputEl.parentElement || document.body;
    // 如果 overlay 尚未被附加到正确的容器，移动它
    if (fpsOverlay.parentElement !== refParent) {
      refParent.appendChild(fpsOverlay);
    }
    const offsetLeft = outputEl.offsetLeft || 0;
    const offsetTop = outputEl.offsetTop || 0;
    // Also compute bounding rects to detect CSS transforms/zoom which offsetLeft/Top won't reflect
    const outputRect = outputEl.getBoundingClientRect();
    const parentRect = (refParent.getBoundingClientRect && refParent.getBoundingClientRect()) || (outputEl.parentElement || document.body).getBoundingClientRect();
    const rectLeft = outputRect.left - parentRect.left;
    const rectTop = outputRect.top - parentRect.top;
    // If difference is significant (e.g. due to transform/scale), prefer rect-based values
    const useRect = Math.abs(rectLeft - offsetLeft) > 1 || Math.abs(rectTop - offsetTop) > 1;
    fpsOverlay.style.left = (useRect ? rectLeft : offsetLeft) + 'px';
    fpsOverlay.style.top = (useRect ? rectTop : offsetTop) + 'px';
  } catch (e) {
    // fallback to bounding rect if any computation fails
    const outputRect = outputEl.getBoundingClientRect();
    const parentRect = (outputEl.parentElement || document.body).getBoundingClientRect();
    const offsetLeft = outputRect.left - parentRect.left;
    const offsetTop = outputRect.top - parentRect.top;
    fpsOverlay.style.left = offsetLeft + 'px';
    fpsOverlay.style.top = offsetTop + 'px';
  }
}

// 全局缩放模式，默认 pixelated。可选值：'pixelated'|'smooth'|'integer'
window.scalingMode = window.scalingMode || 'pixelated';


// Expose debugger as global so other modules can reference window.db
window.db = new Debugger(nes, dctx);

let controlsP1 = {
  d: nes.INPUT.RIGHT,
  a: nes.INPUT.LEFT,
  s: nes.INPUT.DOWN,
  w: nes.INPUT.UP,
  f: nes.INPUT.START,
  g: nes.INPUT.SELECT, // ← 用 g 作为 SELECT
  k: nes.INPUT.B,
  j: nes.INPUT.A
}
let controlsP2 = {
  arrowright: nes.INPUT.RIGHT,
  arrowleft: nes.INPUT.LEFT,
  arrowdown: nes.INPUT.DOWN,
  arrowup: nes.INPUT.UP,
  num8: nes.INPUT.START,
  num7: nes.INPUT.SELECT,
  num5: nes.INPUT.B,
  num4: nes.INPUT.A
}


zip.workerScriptsPath = "lib/";
zip.useWebWorkers = false;

// 加速功能变量（支持小数倍速，如1.5）
window.turboSpeed = 1;
// 恢复上次使用的倍速（工具栏按钮 / 小键盘+- 都经由 setTurboSpeed 持久化）
try {
  const savedTurbo = parseFloat(localStorage.getItem('turboSpeed'));
  if (savedTurbo >= 0.25 && savedTurbo <= 8) window.turboSpeed = savedTurbo;
} catch (e) {}
window.setTurboSpeed = function (speed) {
  if (typeof speed === "boolean") {
    window.turboSpeed = speed ? 2 : 1;
  } else if (typeof speed === "number") {
    window.turboSpeed = speed;
  }
  try { localStorage.setItem('turboSpeed', String(window.turboSpeed)); } catch (e) {}
  // 可选：在UI上显示当前倍速
  if (document.getElementById('turboBtnLabel')) {
    document.getElementById('turboBtnLabel').textContent = window.turboSpeed + 'X';
  }
};

// NSF/NES模式切换支持
window.isNsfMode = false;

// 定义常用模拟器调色板，增加 default 选项
const NES_PALETTES = {
  default: {
    name: "PPU原生",
    data: [
      0x656565, 0x002D69, 0x131F7F, 0x3B1377, 0x600B63, 0x730A36, 0x710F07, 0x531900,
      0x2F2500, 0x0A3400, 0x003C00, 0x003D10, 0x003840, 0x000000, 0x000000, 0x000000,
      0xAEAEAE, 0x0C48EF, 0x444CEF, 0x8200F6, 0xB900B6, 0xE00858, 0xE01400, 0xC02D00,
      0x8B5000, 0x2D7400, 0x007C00, 0x007C44, 0x007288, 0x000000, 0x000000, 0x000000,
      0xFFFFFF, 0x3B82FF, 0x6F8AFF, 0xA366FF, 0xF249FF, 0xFF40A6, 0xFF5431, 0xFF6F00,
      0xC49300, 0x6BCB00, 0x26D700, 0x00D24D, 0x00C9AA, 0x393939, 0x000000, 0x000000,
      0xFFFFFF, 0xA6CEFF, 0xB3CFFF, 0xCABFFF, 0xF7B3FF, 0xFFB6D6, 0xFFC4B7, 0xFFCCAE,
      0xF7D8A5, 0xD7E895, 0xA6F7AF, 0xA2F2DA, 0xA0E8F2, 0xA0A0A0, 0x000000, 0x000000
    ]
  },
  fceux: {
    name: "FCEUX",
  data: [
    0x747474, 0x24188c, 0x0000a8, 0x44009c, 0x8c0074, 0xa80010, 0xa40000, 0x7c0800,
    0x402c00, 0x004400, 0x005000, 0x003c14, 0x183c5c, 0x000000, 0x000000, 0x000000,
    0xbcbcbc, 0x0070ec, 0x2038ec, 0x8000f0, 0xbc00bc, 0xe40058, 0xd82800, 0xc84c0c,
    0x887000, 0x009400, 0x00a800, 0x009038, 0x008088, 0x000000, 0x000000, 0x000000,
    0xfcfcfc, 0x3cbcfc, 0x5c94fc, 0xcc88fc, 0xf478fc, 0xfc74b4, 0xfc7460, 0xfc9838,
    0xf0bc3c, 0x80d010, 0x4cdc48, 0x58f898, 0x00e8d8, 0x787878, 0x000000, 0x000000,
    0xfcfcfc, 0xa8e4fc, 0xc4d4fc, 0xd4c8fc, 0xfcc4fc, 0xfcc4d8, 0xfcbcb0, 0xfcd8a8,
    0xfce4a0, 0xe0fca0, 0xa8f0bc, 0xb0fccc, 0x9cfcf0, 0xc4c4c4, 0x000000, 0x000000
  ]
  },
  mesen: {
    name: "Mesen",
  data: [
    0x666666, 0x002a88, 0x1412a7, 0x3b00a4, 0x5c007e, 0x6e0040, 0x6c0600, 0x561d00,
    0x333500, 0x0b4800, 0x005200, 0x004f08, 0x00404d, 0x000000, 0x000000, 0x000000,
    0xadadad, 0x155fd9, 0x4240ff, 0x7527fe, 0xa01acc, 0xb71e7b, 0xb53120, 0x994e00,
    0x6b6d00, 0x388700, 0x0c9300, 0x008f32, 0x007c8d, 0x000000, 0x000000, 0x000000,
    0xfffeff, 0x64b0ff, 0x9290ff, 0xc676ff, 0xf36aff, 0xfe6ecc, 0xfe8170, 0xea9e22,
    0xbcbe00, 0x88d800, 0x5ce430, 0x45e082, 0x48cdde, 0x4f4f4f, 0x000000, 0x000000,
    0xfffeff, 0xc0dfff, 0xd3d2ff, 0xe8c8ff, 0xfbc2ff, 0xfec4ea, 0xfeccc5, 0xf7d8a5,
    0xe4e594, 0xcfef96, 0xbdf4ab, 0xb3f3cc, 0xb5ebf2, 0xb8b8b8, 0x000000, 0x000000
  ]
  },
  virtuanes: {
    name: "VirtuaNES",
  data: [
    0x7f7f7f, 0x2000b0, 0x2800b8, 0x6010a0, 0x982078, 0xb01030, 0xa03000, 0x784000,
    0x485800, 0x386800, 0x386c00, 0x306040, 0x305080, 0x000000, 0x000000, 0x000000,
    0xbcbcbc, 0x4060f8, 0x4040ff, 0x9040f0, 0xd840c0, 0xd84060, 0xe05000, 0xc07000,
    0x888800, 0x50a000, 0x48a810, 0x48a068, 0x4090c0, 0x000000, 0x000000, 0x000000,
    0xffffff, 0x60a0ff, 0x5080ff, 0xa070ff, 0xf060ff, 0xff60b0, 0xff7830, 0xffa000,
    0xe8d020, 0x98e800, 0x70f040, 0x70e090, 0x60d0e0, 0x606060, 0x000000, 0x000000,
    0xffffff, 0x90d0ff, 0xa0b8ff, 0xc0b0ff, 0xe0b0ff, 0xffb8e8, 0xffc8b8, 0xffd8a0,
    0xfff090, 0xc8f080, 0xa0f0a0, 0xa0ffc8, 0xa0fff0, 0xa0a0a0, 0x000000, 0x000000
  ]
  },
  nestopia: {
    name: "Nestopia",
  data: [
    0x6d6d6d, 0x002492, 0x0000db, 0x6d49db, 0x92006d, 0xb6006d, 0xb62400, 0x924900,
    0x6d4900, 0x244900, 0x006d24, 0x009200, 0x004949, 0x000000, 0x000000, 0x000000,
    0xb6b6b6, 0x006ddb, 0x0049ff, 0x9200ff, 0xb600ff, 0xff0092, 0xff0000, 0xdb6d00,
    0x926d00, 0x249200, 0x009200, 0x00b66d, 0x009292, 0x242424, 0x000000, 0x000000,
    0xffffff, 0x6db6ff, 0x9292ff, 0xdb6dff, 0xff00ff, 0xff6dff, 0xff9200, 0xffb600,
    0xdbdb00, 0x6ddb00, 0x00ff00, 0x49ffdb, 0x00ffff, 0x494949, 0x000000, 0x000000,
    0xffffff, 0xb6dbff, 0xdbb6ff, 0xffb6ff, 0xff92ff, 0xffb6b6, 0xffdb92, 0xffff49,
    0xffff6d, 0xb6ff49, 0x92ff6d, 0x49ffdb, 0x92dbff, 0x929292, 0x000000, 0x000000
  ]
  }
};

// 动态填充调色板下拉框
function fillPaletteSelect() {
  const sel = document.getElementById('palettes');
  if (!sel) return;
  sel.innerHTML = '';
  Object.keys(NES_PALETTES).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = NES_PALETTES[key].name;
    sel.appendChild(opt);
  });
  // 默认选中：优先使用 localStorage 中保存的选择，其次使用 virtuanes
  try {
    const saved = localStorage.getItem('palette');
    sel.value = saved && NES_PALETTES[saved] ? saved : 'virtuanes';
  } catch (e) {
    sel.value = 'virtuanes';
  }
}

// 切换调色板事件
function setNesPaletteBySelect() {
  const sel = document.getElementById('palettes');
  if (!sel) return;
  const key = sel.value;
  if (NES_PALETTES[key] && nes && nes.ppu && nes.loadRom && typeof nes.ppu.setPalette === 'function') {
    nes.ppu.setPalette(NES_PALETTES[key].data);
    log(i18n('log.palette.loaded_palette', { name: NES_PALETTES[key].name }), "palette");
    try { localStorage.setItem('palette', key); } catch (e) {}
  }
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', function () {
  fillPaletteSelect();
  setNesPaletteBySelect();
  if (window.resizeCanvasToFitWindow) window.resizeCanvasToFitWindow();
  // 移除这里的updateCtxAfterResize调用，在window load事件中调用


  const sel = document.getElementById('palettes');
  if (sel) sel.onchange = setNesPaletteBySelect;

  // 绑定缩放模式选择控件（如果存在）
  const scalingSelect = document.getElementById('scalingModeSelect');
  if (scalingSelect) {
    scalingSelect.value = window.scalingMode || 'pixelated';
    scalingSelect.addEventListener('change', function () {
      window.scalingMode = this.value;
      try { localStorage.setItem('scalingMode', window.scalingMode); } catch (e) {}
      if (window.resizeCanvasToFitWindow) window.resizeCanvasToFitWindow();
      if (window.updateCtxAfterResize) window.updateCtxAfterResize();
    });
  }

  // 绑定滤镜选择控件
  if (window.FilterSystem && window.FilterSystem.initFilters) {
    window.FilterSystem.initFilters();
  }

  // 载入浮层逻辑：如果未加载游戏，显示 overlay；点击“载入游戏”会触发文件选择
  const loadOverlay = document.getElementById('loadOverlay');
  const loadOverlayText = document.getElementById('loadOverlayText');
  const loadOverlayAbout = document.getElementById('loadOverlayAbout');
  const romInput = document.getElementById('rom');
  function showLoadOverlay() {
    if (loadOverlay) loadOverlay.style.display = 'flex';
  }
  function hideLoadOverlay() {
    if (loadOverlay) loadOverlay.style.display = 'none';
  }
  // 引导浮层默认隐藏：熟悉模拟器无需"载入游戏/模拟器更新日志"引导。
  // 元素与 show/hide 逻辑均保留，要恢复引导改回：if (!loaded) showLoadOverlay(); else hideLoadOverlay();
  hideLoadOverlay();
  if (loadOverlayText && romInput) {
    loadOverlayText.addEventListener('click', function () {
      // 打开文件选择对话框
      romInput.click();
    });
  }

  // render backend radio binding (2d / webgl)
  try {
    window.renderBackend = localStorage.getItem('renderBackend') || '2d';
  } catch (e) { window.renderBackend = '2d'; }
  const rb2d = document.getElementById('rb2d');
  const rbwebgl = document.getElementById('rbwebgl');
  if (rb2d && rbwebgl) {
    try { if (window.renderBackend === 'webgl') rbwebgl.checked = true; else rb2d.checked = true; } catch(e){}
    rb2d.addEventListener('change', function () { if (this.checked) { window.renderBackend='2d'; try{localStorage.setItem('renderBackend','2d')}catch(e){} } });
    rbwebgl.addEventListener('change', function () { if (this.checked) { window.renderBackend='webgl'; try{localStorage.setItem('renderBackend','webgl')}catch(e){} } });
  }
  if (loadOverlayAbout) {
    loadOverlayAbout.addEventListener('click', function () {
      // 触发页面上关于 summary 的点击以展开“关于”面板
      const about = document.getElementById('aboutme');
      if (about) {
        // summary 元素可以通过 click 展开
        about.click();
      }
    });
  }

  const highDpiCheckbox = document.getElementById('highDpiCheckbox');
  if (highDpiCheckbox) {
    highDpiCheckbox.checked = !!window.highDpiMode;
    highDpiCheckbox.addEventListener('change', function () {
      window.highDpiMode = !!this.checked;
      try { localStorage.setItem('highDpiMode', this.checked ? '1' : '0'); } catch (e) {}
      if (window.resizeCanvasToFitWindow) window.resizeCanvasToFitWindow();
      if (window.updateCtxAfterResize) window.updateCtxAfterResize();
    });
  }

  // show240Checkbox: 在最终绘制到 output canvas 时，绘制上下各8px的黑条以模拟240线裁剪显示
  const show240Checkbox = document.getElementById('show240Checkbox');
  if (show240Checkbox) {
    show240Checkbox.checked = !!window.show240Lines;
    show240Checkbox.addEventListener('change', function () {
      window.show240Lines = !!this.checked;
      try { localStorage.setItem('show240Lines', this.checked ? '1' : '0'); } catch (e) {}
    });
  }

  // unlimitedSpritesCheckbox: 控制PPU精灵活动块数量限制
  const unlimitedSpritesCheckbox = document.getElementById('unlimitedSpritesCheckbox');
  if (unlimitedSpritesCheckbox) {
    // 默认状态为勾选（不限制活动块）
    const _u = localStorage.getItem('unlimitedSprites');
    window.unlimitedSprites = (_u !== null) ? (_u === '1') : true;
    unlimitedSpritesCheckbox.checked = !!window.unlimitedSprites;
    unlimitedSpritesCheckbox.addEventListener('change', function () {
      window.unlimitedSprites = !!this.checked;
      try { localStorage.setItem('unlimitedSprites', this.checked ? '1' : '0'); } catch (e) {}
    });
  }

  // 新增：点击 nesornsf 切换NSF/NES模式
  const nesornsf = document.getElementById('nesornsf');
  if (nesornsf) {
    nesornsf.style.cursor = "pointer";
    nesornsf.title = "点击切换NSF/NES模式";
    nesornsf.onclick = function (e) {
      // 如果点击的是关闭按钮，不切换模式
      if (e.target && e.target.id === "statusBarClose") return;
      stopnesnsf();
      // 切换模式
      if (window.isNsfMode) {
        window.isNsfMode = false;
        hideNsfUI();
        saveBatteryForRom();
        draw();
        // 更新提示文本为NES模式
        nesornsf.textContent = nesornsf.textContent.replace("NSF播放器", "NES模拟器");
      } else {
        window.isNsfMode = true;
        hideNesUiForNsf();
        showNsfUI();
        // 更新提示文本为NSF模式
        nesornsf.textContent = nesornsf.textContent.replace("NES模拟器", "NSF播放器");
      }
    };
  }
});

function stopnesnsf() {
  // 先销毁已有 NES/NSF 线程和资源
  // 停止 NES 主循环和音频
  if (typeof loopId !== "undefined" && loopId) {
    cancelAnimationFrame(loopId);
    loopId = 0;
  }
  if (typeof audioHandler !== "undefined" && audioHandler) {
    audioHandler.stop();
  }
  // 停止 NSF 主循环和音频
  if (typeof nsfLoopId !== "undefined" && nsfLoopId) {
    cancelAnimationFrame(nsfLoopId);
    nsfLoopId = 0;
  }
  if (typeof nsfAudioHandler !== "undefined" && nsfAudioHandler) {
    nsfAudioHandler.stop();
  }
  // 清理自动保存定时器
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  window.nsfPlayer = null;
  // 标记状态
  loaded = false;
  window.loaded = false;  // 重置全局变量
  paused = false;
  nsfLoaded = false;
  nsfPaused = false;
}

// 新增：统一zip解压方法，返回Promise
function extractRomFromZip(blob) {
  return new Promise((resolve, reject) => {
    zip.createReader(new zip.BlobReader(blob), function (reader) {
      reader.getEntries(function (entries) {
        if (!entries.length) {
          reject(i18n('log.zip.empty'));
          return;
        }
        let found = false;
        for (let i = 0; i < entries.length; i++) {
          let name = entries[i].filename;
          if (name.slice(-4).toLowerCase() === ".nes" || name.slice(-4).toLowerCase() === ".nsf") {
            found = true;
            entries[i].getData(new zip.BlobWriter(), function (blob) {
              let breader = new FileReader();
              breader.onload = function () {
                let rbuf = breader.result;
                let arr = new Uint8Array(rbuf);
                resolve({ arr, name });
                reader.close(function () { });
              };
              breader.readAsArrayBuffer(blob);
            }, function () { });
            break;
          }
        }
        if (!found) {
          reject(i18n('log.zip.no_nes'));
        }
      });
    }, function (err) {
      reject(i18n('log.zip.failed', { err }));
    });
  });
}

// 修改 loadRom 入口，支持 zip 自动解压
function loadRom(romOrArr, name) {
  // 在加载新ROM前清理所有WASM音频播放器，避免音频冲突
  if (typeof window.cleanupAllAudioPlayers === 'function') {
    window.cleanupAllAudioPlayers();
  }
  
  // 如果是 File/Blob 且是 zip，先解压
  if (typeof romOrArr === "object" && romOrArr instanceof Blob && name && name.slice(-4).toLowerCase() === ".zip") {
    extractRomFromZip(romOrArr).then(({ arr, name }) => {
      loadRom(arr, name);
    }).catch(err => {
      log(err, "zip");
    });
    return;
  }
  // 如果是 Uint8Array 且文件名是 zip，尝试转为 Blob 解压
  if (romOrArr instanceof Uint8Array && name && name.slice(-4).toLowerCase() === ".zip") {
    let blob = new Blob([romOrArr]);
    extractRomFromZip(blob).then(({ arr, name }) => {
      loadRom(arr, name);
    }).catch(err => {
      log(err, "zip");
    });
    return;
  }
  // NES 正常流程
  stopnesnsf();
  // 标记状态
  loaded = false;
  window.loaded = false;  // 重置全局变量
  paused = false;
  nsfLoaded = false;
  nsfPaused = false;

  // 检查NSF
  if (isNsfFile(name)) {
    // 切换到NSF模式
    hideNesUiForNsf();
    showNsfUI();
    // NSF强制 2D 渲染（仅运行期，不写入localStorage）
    window.isNsfMode = true;
    try { if (window.updateCtxAfterResize) window.updateCtxAfterResize(); } catch (e) {}
    if (!window.NsfPlayer) {
      log("未加载NSF支持脚本", "nsf");
      return;
    }
    nsfPlayer = new NsfPlayer();
    nsfAudioHandler = new AudioHandler();
    if (nsfPlayer.loadNsf(romOrArr)) {
      nsfLoaded = true;
      nsfPaused = false;
      nsfCurrentSong = nsfPlayer.startSong;
      nsfPlayer.playSong(nsfCurrentSong);
      nsfLoopId = requestAnimationFrame(nsfUpdate);
      nsfAudioHandler.start();
      updateNsfSongInfo();
      nsfDrawVisual();
      document.title = name;
      try { if (typeof hideLoadOverlay === 'function') hideLoadOverlay(); else { const lo = document.getElementById('loadOverlay'); if (lo) lo.style.display='none'; } } catch(e){}
    }
    return;
  }
  // NES 正常流程
  hideNsfUI();
  window.isNsfMode = false;
  try { if (window.updateCtxAfterResize) window.updateCtxAfterResize(); } catch (e) {}
  saveBatteryForRom();
  db.loadRom(romOrArr, function (success) {
    if (!success) return;
    let data = localStorage.getItem(name + "_battery");
    if (data) {
      let obj = JSON.parse(data);
      db.nes.setBattery(obj);
      log(i18n('log.save.loaded_battery'), "save");
    }
    if (!loaded && !paused) {
      loopId = requestAnimationFrame(update);
      audioHandler.start();
    }
    loaded = true;
    window.loaded = true;  // 设置全局变量供其他脚本访问
    loadedName = name;
    // 按游戏恢复"启用自定义音乐功能"开关（每个游戏各自记住，未记录的游戏默认关闭）
    if (typeof window.restoreCustomMusicEnabledForGame === 'function') {
      window.restoreCustomMusicEnabledForGame(name);
    }
    restoreGameSlot(name);
  try { if (typeof hideLoadOverlay === 'function') hideLoadOverlay(); else { const lo = document.getElementById('loadOverlay'); if (lo) lo.style.display='none'; } } catch(e){}

    // 游戏载入成功后直接隐藏 statusBar
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      statusBar.style.display = 'none';
    }

    // 确保toolbar按钮默认隐藏
    window.toolbarExpanded = false;
    if (window.renderTransparentOverlay) window.renderTransparentOverlay(false);

    setNesPaletteBySelect();
    db.updateDebugView();

    resetRomCache();
    initChrPageSelector(db.nes);
    let ctx = document.getElementById('chapage').getContext('2d');
    drawChrPage(db.nes, ctx, 0);
    document.title = loadedName;
    if (window.SaveManager && SaveManager.checkAutoSave) {
      // "更多设置-游戏开始载入自动存档"：ask=询问载入(默认) / auto=自动载入 / never=不载入
      let autoSaveLoadMode = 'ask';
      try { autoSaveLoadMode = localStorage.getItem('autoSaveLoadMode') || 'ask'; } catch (e) {}
      if (autoSaveLoadMode === 'never') {
        // 不载入：不询问也不自动载入，直接开始游戏
        startAutoSave();
      } else {
        setPausedState(true);
        SaveManager.checkAutoSave(function (err, record) {
          let hasSave = !err && record && record.romName === name && record.saveState;
          if (hasSave && autoSaveLoadMode === 'auto') {
            // 自动载入：跳过询问，直接加载自动存档
            try {
              if (window.nes && window.nes.setState(record.saveState)) {
                // 恢复自定义音乐状态
                if (record.customMusicState && window.customMusicMonitor) {
                  setTimeout(function () {
                    restoreCustomMusicState(record.customMusicState);
                  }, 100);
                }
                log("已自动载入自动存档", "save");
              } else {
                throw new Error("设置状态失败");
              }
            } catch (e) {
              console.error("自动载入存档失败:", e);
              log("自动载入自动存档失败", "save");
            }
            setPausedState(false);
            startAutoSave();
          } else if (hasSave) {
            // 询问载入：弹出提示由用户决定
            SaveManager.showAutoSavePrompt(record, function () {
              setPausedState(false);
              startAutoSave();
            });
          } else {
            setPausedState(false);
            startAutoSave();
          }
        });
      }
    } else {
      startAutoSave();
    }

    // 游戏加载成功后，再应用一次滤镜，避免页面初始化阶段重复日志
    try { if (window.FilterSystem) window.FilterSystem.applyFilter(); else if (typeof applyFilter === 'function') applyFilter(); } catch (e) {}
  });
}

// 兼容 window.loadRom
window.loadRom = loadRom;

// 修改 el("rom").onchange，直接传递 File/Blob 给 loadRom
el("rom").onchange = function (e) {
  audioHandler.resume();
  let file = e.target.files[0];
  let fileName = file.name;
  // 在上传区回显所选文件名
  let uploadArea = document.querySelector('.rom-upload-area');
  if (uploadArea) {
    uploadArea.classList.add('has-file');
    let titleEl = uploadArea.querySelector('.rom-upload-title');
    if (titleEl) titleEl.textContent = fileName;
  }
  // 直接传递 File/Blob 给 loadRom，内部自动判断 zip
  let freader = new FileReader();
  freader.onload = function () {
    let buf = freader.result;
    // zip 直接传 Blob，否则传 Uint8Array
    if (fileName.slice(-4).toLowerCase() === ".zip") {
      loadRom(file, fileName);
    } else {
      let arr = new Uint8Array(buf);
      loadRom(arr, fileName);
    }
  };
  freader.readAsArrayBuffer(file);
};

  // 当游戏加载成功后，loadRom 中会设置 loaded=true 并触发 update; 这里监听自定义事件或轮询 loaded
  // 我们在 loadRom 成功后的回调处也会 hideLoadOverlay（下面已在 loadRom 路径中处理）。

el("pause").onclick = function (e) {
  if (paused && loaded) {
    setPausedState(false);
  } else {
    setPausedState(true);
  }
}

el("reset").onclick = function (e) {
  // 在重置前清理所有WASM音频播放器，避免音频冲突
  if (typeof window.cleanupAllAudioPlayers === 'function') {
    window.cleanupAllAudioPlayers();
  }
  db.nes.reset(false);
  db.updateDebugView();
}

el("hardreset").onclick = function (e) {
  // 在硬重置前清理所有WASM音频播放器，避免音频冲突
  if (typeof window.cleanupAllAudioPlayers === 'function') {
    window.cleanupAllAudioPlayers();
  }
  db.nes.reset(true);
  db.updateDebugView();
}

document.onvisibilitychange = function (e) {
  if (document.hidden) {
    pausedInBg = false;
    if (!paused && loaded) {
      setPausedState(true);
      pausedInBg = true;
    }
  } else {
    if (pausedInBg && loaded) {
      setPausedState(false);
      pausedInBg = false;
    }
  }
}

window.onpagehide = function (e) {
  saveBatteryForRom();
}

let autoSaveTimer = null;

function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  // "更多设置-取消自动存档"勾选时不启动定时保存
  if (window.disableAutoSave) return;
  autoSaveTimer = setInterval(function () {
    if (loaded && !paused && window.nes) {
      let output = document.getElementById('output');
      let screenshot = isWebGL ? getWebGLScreenshot(output) : output.toDataURL("image/png");
      let timestamp = new Date().toLocaleString();

      if (window.SaveManager) {
        window.SaveManager.updateSaveSlot(window.SaveManager.AUTO_SAVE_SLOT, screenshot, timestamp, function (err, record) {
          if (err) {
          }
        });
      }
    }
  }, 7000);
}

// 运行中切换自动存档（更多设置勾选即时生效）：enabled=false 立即停止定时保存，
// true 时若游戏正在运行则恢复定时保存
window.setAutomaticSave = function (enabled) {
  if (!enabled) {
    if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
  } else if (loaded && !paused && !autoSaveTimer) {
    startAutoSave();
  }
};

function saveBatteryForRom() {
  if (loaded) {
    let data = db.nes.getBattery();
    if (data) {
      try {
        localStorage.setItem(loadedName + "_battery", JSON.stringify(data));
        log(i18n('log.save.saved_battery'), "save");
      } catch (e) {
        log(i18n('log.save.failed_save_battery', { err: e }), "save");
      }
    }
  }
}

function setPausedState(paused) {
  if (paused === window.paused) return;
  window.paused = paused;
  if (window.db) window.db.isPaused = paused;
  if (db) db.isPaused = paused;
  if (paused) {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    cancelAnimationFrame(loopId);
    audioHandler.stop();
    el("pause").innerText = "继续";
    log(i18n('log.pause.paused'), "pause");
    
    // 暂停外部NSF播放（如果正在播放）
    // 优先调用 customMusicPause（包含 GME 与 NSFs），回退到 nsfPauseToggle 以保持兼容
    try {
      if (typeof window.customMusicPause === 'function') {
        window.customMusicPause();
      } else if (window.nsfLoaded && !window.nsfPaused && typeof window.nsfPauseToggle === 'function') {
        window.nsfPauseToggle();
      }
    } catch (e) {
      console.warn('Error while pausing external music:', e);
    }
  } else {
    cancelAnimationFrame(loopId);
    loopId = requestAnimationFrame(update);
    audioHandler.start();
    el("pause").innerText = "暂停";
    log(i18n('log.pause.unpaused'), "pause");
    startAutoSave();
    
    // 恢复外部NSF播放（如果之前正在播放）
    // 优先调用 customMusicResume（包含 GME 与 NSFs），回退到 nsfPauseToggle 以保持兼容
    try {
      if (typeof window.customMusicResume === 'function') {
        window.customMusicResume();
      } else if (window.nsfLoaded && window.nsfPaused && typeof window.nsfPauseToggle === 'function') {
        window.nsfPauseToggle();
      }
    } catch (e) {
      console.warn('Error while resuming external music:', e);
    }
  }
  if (window.updatePauseBtnOverlayState) window.updatePauseBtnOverlayState();
}

window.pause = function () {
  setPausedState(true);
};
window.unpause = function () {
  setPausedState(false);
};

let lastFrameTime = performance.now();
let nesFrameResidue = 0;
let frameCounter = 0;
let turboAudioScratch = null;
function update() {
  let now = performance.now();
  let elapsed = now - lastFrameTime;
  // 如果elapsed太大（如切回前台），只累计最多200ms，避免卡死
  if (elapsed > 200) elapsed = 200;
  lastFrameTime = now;

  // turbo模式下加速：把倍率并入帧时间计算，支持小数倍速（如1.5x），
  // 通过帧时间残差平滑累积，避免 1.5x 被取整成 2x。
  let turbo = window.turboSpeed || 1;
  let frameDur = (1000 / 60) / turbo; // 每模拟帧所需毫秒
  let nesFrames = (elapsed + nesFrameResidue) / frameDur;
  let framesToRun = Math.floor(nesFrames);
  nesFrameResidue = (elapsed + nesFrameResidue) - framesToRun * frameDur;

  // 移动端一次回调补跑过多帧会长时间占用主线程，形成“越卡越追帧”的循环。
  // 丢弃本次过量的追帧时间，让模拟器在下一次屏幕刷新中重新跟上节奏。
  // 基准测试显示本模拟器单帧在桌面约 2.9ms、在手机端会成倍放大。
  // 加速掉帧时一次补跑过多帧会造成长时间主线程阻塞，因此加速档位把
  // 单次回调的上限收紧（2x 也只需 2 帧/回调），减少卡顿加剧的连锁反应。
  const maxFramesPerTick = turbo > 1 ? 3 : 4;
  if (framesToRun > maxFramesPerTick) {
    framesToRun = maxFramesPerTick;
    nesFrameResidue = 0;
  }

  if (framesToRun > 0) {
    for (let i = 0; i < framesToRun; i++) {
      let r = runFrame(i === framesToRun - 1);
      if (r) {
        setPausedState(true);
        return;
      }
    }
  }
  loopId = requestAnimationFrame(update);
}
function runFrame(renderFrame) {
  let bpHit = db.runFrame();
  frameCounter++;

  // 加速时只绘制这一批模拟帧中的最后一帧，避免重复像素上传、滤镜和画布操作。
  const skipFrames = window.skipFrames || 1;
  if (renderFrame && frameCounter % skipFrames === 0) {
    draw();
  } else if (audioHandler && audioHandler.hasAudio) {
    // 未绘制的模拟帧也要消费 APU 数据，避免跳帧或加速时音频在模拟器内部滞留。
    if (!turboAudioScratch || turboAudioScratch.length !== audioHandler.samplesPerFrame) {
      turboAudioScratch = new Float32Array(audioHandler.samplesPerFrame);
    }
    db.nes.getSamples(turboAudioScratch, audioHandler.samplesPerFrame);
  }
  if (bpHit) {
    return true;
  }
  return false;
}


let lastFpsUpdate = performance.now();
let frameCount = 0;
let currentFps = 60;
// showFps 控制：从 localStorage 恢复，UI 与变量同步
let showFps = false;
const fpsCheckbox = document.getElementById('showFpsCheckbox');
if (fpsCheckbox) {
  try {
    const saved = localStorage.getItem('showFps');
    if (saved !== null) {
      fpsCheckbox.checked = (saved === '1');
    }
  } catch (e) {}
  showFps = !!fpsCheckbox.checked;
  fpsCheckbox.addEventListener('change', function () {
    showFps = this.checked;
    try { localStorage.setItem('showFps', this.checked ? '1' : '0'); } catch (e) {}
  });
}


function draw() {
  db.nes.getSamples(audioHandler.sampleBuffer, audioHandler.samplesPerFrame);
  audioHandler.nextBuffer();
  db.nes.getPixels(imgData.data);

  // 如果启用了 show240Lines ，在最终画面上方和下方各绘制8px的黑条以模拟240线裁剪显示
  if (window.show240Lines) {
    const data = imgData.data;
    const width = 256;
    const height = 240;

    // Fill top 8 lines with black
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        data[index] = 0;     // R
        data[index + 1] = 0; // G
        data[index + 2] = 0; // B
        data[index + 3] = 255; // A
      }
    }

    // Fill bottom 8 lines with black
    for (let y = height - 8; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        data[index] = 0;     // R
        data[index + 1] = 0; // G
        data[index + 2] = 0; // B
        data[index + 3] = 255; // A
      }
    }
  }

  if (window.renderBackend === 'webgl' && isWebGL) {
    // WebGL rendering
    drawWebGLFrame();
  } else {
    // 2D fallback
    // If high DPI mode enabled, write into buffer and scale to visible canvas using drawImage
    if (window.highDpiMode) {
      // copy pixel data into buffer image
      bufferImgData.data.set(imgData.data);
      bufferCtx.putImageData(bufferImgData, 0, 0);
      // draw buffer to visible canvas with smoothing off/on based on scalingMode
      if (typeof ctx.imageSmoothingEnabled !== 'undefined') {
        ctx.imageSmoothingEnabled = (window.scalingMode === 'smooth');
      }
      // use drawImage which respects imageSmoothingEnabled
      try {
        // draw using logical NES pixel dimensions; ctx transform handles DPR scaling
        ctx.drawImage(bufferCanvas, 0, 0, 256, 240, 0, 0, 256, 240);
      } catch (e) {
        // fallback to putImageData if drawImage fails
        ctx.putImageData(imgData, 0, 0);
      }
    } else {
      // legacy path: direct putImageData (keeps logical pixels, scaling via CSS)
      ctx.putImageData(imgData, 0, 0);
    }
  }

  // FPS统计
  frameCount++;
  let now = performance.now();
  if (now - lastFpsUpdate >= 500) {
    currentFps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
    lastFpsUpdate = now;
    frameCount = 0;
  }

  // 仅在 showFps 为 true 时绘制FPS
  if (showFps) {
    ensureFpsOverlay();
    if (fpsOverlayCtx) {
          const ctxo = fpsOverlayCtx;
          // 节流：每 100ms 更新一次 overlay，避免每帧都重绘
          const nowMs = performance.now();
          // 使用 overlay 的上下文对象存储上次绘制时间和 FPS，避免依赖可能未初始化的主 ctx
          ctxo.o_lastDraw = ctxo.o_lastDraw || 0;
          // 仅当超过阈值或 FPS 值变化时重绘
          if (nowMs - ctxo.o_lastDraw >= 100 || ctxo.o_lastFps !== currentFps) {
            ctxo.o_lastDraw = nowMs;
            ctxo.o_lastFps = currentFps;

            // 清除右上角小区域（使用 CSS 像素坐标，因为我们对 context 做了 dpr 缩放）
            // overlay 的 CSS 宽度是显式设置的，clientWidth 即 CSS 宽度，避免 getComputedStyle 强制样式计算
            const cssW = ctxo.canvas.clientWidth;
            const clearW = 160;
            const clearH = 48;
            ctxo.clearRect(cssW - clearW, 0, clearW, clearH);

            const fontSize = Math.max(12, Math.round((ctxo.canvas.width / (window.devicePixelRatio || 1)) / 28));
            ctxo.font = `500 ${fontSize}px Arial,Consolas,monospace`;
            ctxo.textAlign = 'right';
            ctxo.textBaseline = 'top';
            // 稍微透明一些
            ctxo.globalAlpha = 0.6;
            ctxo.fillStyle = '#fff';
            ctxo.strokeStyle = 'rgba(0,0,0,0.45)';
            ctxo.lineWidth = Math.max(1, Math.floor(fontSize / 6));
            const x = ctxo.canvas.clientWidth - 8;
            const y = 4;
            let fpsText = currentFps > 0 ? currentFps + ' FPS' : '... FPS';
            ctxo.strokeText(fpsText, x, y);
            ctxo.fillText(fpsText, x, y);
          }
    }
  } else {
    if (fpsOverlayCtx) {
      // 清空整个 overlay（按 CSS 像素）
      const ctxo = fpsOverlayCtx;
      ctxo.clearRect(0, 0, ctxo.canvas.width / (window.devicePixelRatio || 1), ctxo.canvas.height / (window.devicePixelRatio || 1));
    }
  }
}

window.addEventListener('load', function () {
  if (window.resizeCanvasToFitWindow) window.resizeCanvasToFitWindow();
  if (window.updateCtxAfterResize) window.updateCtxAfterResize();
  // 初始化并调整 FPS overlay
  ensureFpsOverlay();
  updateFpsOverlaySize();
  // 不在页面 load 就应用滤镜，等待游戏加载后再触发
});

// Expose updateCtxAfterResize globally with correct name so other modules can call it
window.updateCtxAfterResize = updateCtxAfterResize;
function updateCtxAfterResize() {
  c = el("output");

  // If we already have a valid context for the currently selected backend, don't reinitialize
  if ((window.renderBackend === 'webgl' && isWebGL && gl) || (window.renderBackend === '2d' && ctx)) {
    // Removed console.log for reusing existing context
    // Just update viewport/transform for existing context
    try {
      var effectiveDpr = (window.highDpiMode ? Math.max(1, Math.floor(window.devicePixelRatio || 1)) : 1);
      if (isWebGL) {
        gl.viewport(0, 0, c.width, c.height);
      } else if (ctx && typeof ctx.setTransform === 'function') {
        ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
      }
    } catch (e) {}
    ensureFpsOverlay();
    updateFpsOverlaySize();
    return;
  }

  // Initialize backend: NSF 强制 2D；NES 按用户配置
  const wantWebgl = (window.renderBackend === 'webgl' && !window.isNsfMode);
  if (wantWebgl) {
    if (!initWebGL()) {
      // WebGL init failed -> fallback to 2D
      ctx = c.getContext("2d");
      isWebGL = false;
      updateFilterSelectState();
    }
  } else {
    // User requested 2D backend: ensure we have a 2D context
    try {
      ctx = c.getContext("2d");
    } catch (e) {
      ctx = null;
    }
    isWebGL = false;
    updateFilterSelectState();
  }

  // Apply rendering settings based on context type
  if (!isWebGL) {
    // 2D context settings
    var mode = window.scalingMode || 'pixelated';
    try {
      if (mode === 'smooth') {
        applyImageRenderingFallback(c, 'smooth');
        if (typeof ctx.imageSmoothingEnabled !== 'undefined') ctx.imageSmoothingEnabled = true;
      } else {
        applyImageRenderingFallback(c, 'pixelated');
        if (typeof ctx.imageSmoothingEnabled !== 'undefined') ctx.imageSmoothingEnabled = false;
      }
    } catch (e) {
      // 忽略不支持的属性
    }
  }

  // Initialize image data for both WebGL and 2D modes
  if (isWebGL) {
    // For WebGL, we still need imgData to store pixel data
    imgData = new ImageData(256, 240);
  } else {
    // For 2D, create ImageData from context
    imgData = ctx.createImageData(256, 240);
  }

  // 如果 highDpiMode 开启，确保 buffer 与 output 的物理像素匹配（buffer 保持 256x240）
  bufferCanvas.width = 256;
  bufferCanvas.height = 240;
  bufferCtx = bufferCanvas.getContext('2d');
  bufferImgData = bufferCtx.createImageData(256, 240);
  // 如果输出 canvas 已经放大（物理像素），确保 ctx 的 transform 已经设置（控制文件也设置了一次）
  try {
    var effectiveDpr = (window.highDpiMode ? Math.max(1, Math.floor(window.devicePixelRatio || 1)) : 1);
    if (isWebGL) {
      // For WebGL, update viewport
      gl.viewport(0, 0, c.width, c.height);
    } else if (ctx && typeof ctx.setTransform === 'function') {
      ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
    }
  } catch (e) {}
  // 更新 overlay 大小
  ensureFpsOverlay();
  updateFpsOverlaySize();
}

// 在窗口尺寸或滚动变化时保持 overlay 同步
window.addEventListener('resize', function () {
  updateFpsOverlaySize();
});
window.addEventListener('scroll', function () {
  updateFpsOverlaySize();
}, true);


// 应用当前选择的滤镜效果
function applyFilter() {
  if (window.FilterSystem) {
    window.FilterSystem.applyFilter();
  }
}

function el(id) {
  return document.getElementById(id);
}

// 更新滤镜选择状态，根据WebGL可用性启用/禁用选项
function updateFilterSelectState() {
  if (window.FilterSystem) {
    window.FilterSystem.updateFilterSelectState();
  }
}

// 填充游戏信息到传入的容器元素，供 index.html 弹窗调用
window.fillGameInfo = function (containerEl) {
  if (!containerEl) return;
  const info = {};
  try {
    info.name = loadedName || 'N/A';
    // 优先从已加载的 mapper 中读取信息（大部分 mapper 会暴露 h/prgRom/chrRom/name）
    if (db && db.nes && db.nes.mapper) {
      const m = db.nes.mapper;
      const h = m.h || {};
      // PRG/CHR 信息：优先使用 prgRom/chrRom 的 byte 长度，再回退到 header 提供的 banks
      if (m.prgRom && m.prgRom.length !== undefined) {
        info.prgBanks = (m.prgRom.length / 0x4000) + ' banks';
        info.prgBytes = m.prgRom.length;
      } else if (h.banks !== undefined) {
        info.prgBanks = h.banks + ' banks';
        info.prgBytes = (h.banks * 0x4000);
      } else {
        info.prgBanks = 'N/A';
        info.prgBytes = 'N/A';
      }

      if (m.chrRom && m.chrRom.length !== undefined) {
        info.chrBanks = (m.chrRom.length / 0x2000) + ' banks';
        info.chrBytes = m.chrRom.length;
      } else if (h.chrBanks !== undefined) {
        info.chrBanks = h.chrBanks + ' banks';
        info.chrBytes = (h.chrBanks * 0x2000);
      } else {
        info.chrBanks = 'N/A';
        info.chrBytes = 'N/A';
      }

      info.mapper = m.name || (h.mapper !== undefined ? h.mapper : 'N/A');
  // mapper id（数值），优先使用 header 中的 mapper 字段
  info.mapperId = (h.mapper !== undefined) ? h.mapper : (m.number !== undefined ? m.number : 'N/A');

      // ROM 长度：如果有 prgRom/chrRom，合并长度；否则尝试 header 提供的估算
      if (info.prgBytes !== 'N/A' && info.prgBytes !== undefined) {
        let total = info.prgBytes || 0;
        if (info.chrBytes && info.chrBytes !== 'N/A') total += info.chrBytes;
        info.romLength = total;
      } else if (h.banks !== undefined) {
        info.romLength = h.banks * 0x4000 + (h.chrBanks || 0) * 0x2000;
      } else {
        info.romLength = 'N/A';
      }

      // 计算 PRG CRC32（如果 prgRom 可用）
      try {
        if (m.prgRom && typeof calcCRC32 === 'function') {
          let crc = calcCRC32(m.prgRom);
          info.crc32 = '0x' + crc.toString(16).padStart(8, '0').toUpperCase();
        } else {
            info.crc32 = 'N/A';
          }
      } catch (e) {
        info.crc32 = 'N/A';
      }

    } else if (db && db.nes && db.nes.rom) {
      // 兼容老属性：某些实现可能把 rom 放在 db.nes.rom
      const rom = db.nes.rom;
      info.prgBanks = rom.prgBanks || rom.prgSize || rom.prg ? rom.prg : 'N/A';
      info.chrBanks = rom.chrBanks || rom.chrSize || rom.chr ? rom.chr : 'N/A';
  info.mapper = rom.mapper !== undefined ? rom.mapper : (db.nes.mapper ? db.nes.mapper.number || 'N/A' : 'N/A');
  info.mapperId = rom.mapper !== undefined ? rom.mapper : (db.nes.mapper ? (db.nes.mapper.h && db.nes.mapper.h.mapper !== undefined ? db.nes.mapper.h.mapper : (db.nes.mapper.number !== undefined ? db.nes.mapper.number : 'N/A')) : 'N/A');
      info.romLength = rom.length || rom.size || 'N/A';
      info.crc32 = rom.crc32 || 'N/A';
    } else if (nes && nes.rom) {
      const rom = nes.rom;
      info.prgBanks = rom.prgBanks || rom.prg || 'N/A';
      info.chrBanks = rom.chrBanks || rom.chr || 'N/A';
  info.mapper = rom.mapper || 'N/A';
  info.mapperId = rom.mapper || (nes && nes.mapper ? nes.mapper : 'N/A');
      info.romLength = rom.length || 'N/A';
      info.crc32 = rom.crc32 || 'N/A';
    } else {
      info.prgBanks = info.chrBanks = info.mapper = info.romLength = info.crc32 = info.mapperId = 'N/A';
    }
    // 当前调色板
    const palSel = document.getElementById('palettes');
    info.palette = (palSel && palSel.value) ? palSel.value : (localStorage.getItem('palette') || 'N/A');
    // showFps 与 show240Lines
    info.showFps = !!localStorage.getItem('showFps') ? (localStorage.getItem('showFps') === '1') : !!window.showFps;
    // show240Lines: 勾选表示显示240线 -> true
    info.show240 = (localStorage.getItem('show240Lines') !== null) ? (localStorage.getItem('show240Lines') === '1') : !!window.show240Lines;
    // audio
    info.sampleRate = localStorage.getItem('sampleRate') || (window.audioHandler && window.audioHandler.sampleRate) || 'N/A';
    info.bufferSize = localStorage.getItem('bufferSize') || (window.audioHandler && window.audioHandler.bufferSize) || 'N/A';
  } catch (e) {
    // ignore
  }

  const lines = [];
  lines.push(`<div><strong>名称:</strong> ${info.name}</div>`);
  lines.push(`<div><strong>PRG:</strong> ${info.prgBanks}</div>`);
  lines.push(`<div><strong>CHR:</strong> ${info.chrBanks}</div>`);
  // 如果有字节长度，显示附加信息
  if (info.prgBytes !== undefined && info.prgBytes !== 'N/A') lines.push(`<div><strong>PRG 大小:</strong> ${info.prgBytes} bytes</div>`);
  if (info.chrBytes !== undefined && info.chrBytes !== 'N/A') lines.push(`<div><strong>CHR 大小:</strong> ${info.chrBytes} bytes</div>`);
  // Mapper 显示带 id（若可用）: e.g. MMC3(4)
  const mapperIdDisplay = (info.mapperId !== undefined && info.mapperId !== 'N/A') ? `(${info.mapperId})` : '';
  lines.push(`<div><strong>Mapper:</strong> ${info.mapper}${mapperIdDisplay}</div>`);
  // ROM 长度：显示 bytes 并附加 (XXkb)
  let romBytes = null;
  if (typeof info.romLength === 'number') romBytes = info.romLength;
  else if (typeof info.prgBytes === 'number') romBytes = info.prgBytes + (typeof info.chrBytes === 'number' ? info.chrBytes : 0);
  if (romBytes !== null && romBytes !== 'N/A') {
    const kb = Math.round(romBytes / 1024);
    lines.push(`<div><strong>ROM 长度:</strong> ${romBytes} (${kb}kb)</div>`);
  } else {
    lines.push(`<div><strong>ROM 长度:</strong> ${info.romLength}</div>`);
  }
  lines.push(`<div><strong>CRC32:</strong> ${info.crc32 || 'N/A'}</div>`);
  lines.push(`<div><strong>调色板:</strong> ${info.palette}</div>`);
  lines.push(`<div><strong>显示FPS:</strong> ${info.showFps ? '是' : '否'}</div>`);
  lines.push(`<div><strong>显示240线:</strong> ${info.show240 ? '是' : '否'}</div>`);
  // 不限制活动块：勾选表示不限制 -> true
  info.unlimitedSprites = (localStorage.getItem('unlimitedSprites') !== null) ? (localStorage.getItem('unlimitedSprites') === '1') : !!window.unlimitedSprites;
  lines.push(`<div><strong>不限制活动块:</strong> ${info.unlimitedSprites ? '是' : '否'}</div>`);
  lines.push(`<div><strong>采样率:</strong> ${info.sampleRate}</div>`);
  lines.push(`<div><strong>音频缓冲:</strong> ${info.bufferSize}</div>`);

  containerEl.innerHTML = lines.join('');
};



// 每个游戏各自记住上次使用的快速存档槽（普通槽位 0-19 是所有游戏共用的，
// 切换游戏后若不切槽，很容易把上一个游戏同号槽的存档覆盖掉）
const SLOT_BY_GAME_KEY = 'quickSlotByGame';
function rememberGameSlot(romName, slot) {
  if (!romName || typeof slot !== 'number') return;
  try {
    let map = JSON.parse(localStorage.getItem(SLOT_BY_GAME_KEY) || '{}');
    map[romName] = slot;
    localStorage.setItem(SLOT_BY_GAME_KEY, JSON.stringify(map));
  } catch (e) { /* ignore */ }
}
function restoreGameSlot(romName) {
  function normalizeSlot(slot) {
    if (typeof slot === 'string' && /^\d+$/.test(slot)) return parseInt(slot, 10);
    return slot;
  }
  function applySlot(slot, why) {
    slot = normalizeSlot(slot);
    if (typeof slot !== 'number' || slot === window.currentSaveSlot) return;
    window.currentSaveSlot = slot;
    if (window.SaveManager && SaveManager.setDefaultSlot) SaveManager.setDefaultSlot(slot, function () {});
    log("已切换到本游戏" + why + "的存档卡槽 " + slot, "save");
  }
  function scanSaveSlots() {
    // 没有记忆或记忆槽位无效时：找存档库里该游戏最近一次存档所在的普通槽位
    if (!(window.SaveManager && SaveManager.getAllSaveSlots)) return;
    SaveManager.getAllSaveSlots(function (err, list) {
      if (err || !list) return;
      let best = null, bestTime = -1;
      list.forEach(function (item) {
        if (!item || item.romName !== romName || !item.saveState) return;
        let slot = normalizeSlot(item.slot);
        if (typeof slot !== 'number') return;
        let t = Date.parse(item.timestamp) || 0;
        if (t > bestTime || (t === bestTime && best !== null && slot > best)) { bestTime = t; best = slot; }
      });
      if (best !== null) { rememberGameSlot(romName, best); applySlot(best, "最近存档"); }
    });
  }
  try {
    let map = JSON.parse(localStorage.getItem(SLOT_BY_GAME_KEY) || '{}');
    if (Object.prototype.hasOwnProperty.call(map, romName)) {
      let mapped = normalizeSlot(map[romName]);
      if (typeof mapped === 'number' && window.SaveManager && SaveManager.getSaveData) {
        // 校验旧映射：槽位里必须真的是当前游戏的存档，否则回退扫描存档库
        SaveManager.getSaveData(mapped, function (err, record) {
          if (!err && record && record.romName === romName && record.saveState) {
            applySlot(mapped, "上次使用");
          } else {
            scanSaveSlots();
          }
        });
        return;
      }
      if (typeof mapped === 'number') { applySlot(mapped, "上次使用"); return; }
    }
  } catch (e) { /* ignore */ }
  scanSaveSlots();
}

function save_State() {
  let slot = window.currentSaveSlot !== undefined ? window.currentSaveSlot : 0;
  if (!(window.SaveManager && SaveManager.updateSaveSlot)) return;
  // 按键瞬间抓取状态与截图，再做槽位检查
  let saveState = db.nes.getState();
  let output = document.getElementById('output');
  let screenshot = isWebGL ? getWebGLScreenshot(output) : output.toDataURL("image/png");

  // 目标槽已是其他游戏的存档时先确认，避免无意覆盖
  SaveManager.getSaveData(slot, function (err, existing) {
    if (!err && existing && existing.saveState && existing.romName && existing.romName !== loadedName) {
      if (!confirm("存档卡槽 " + slot + " 里是《" + existing.romName + "》的存档（" + existing.timestamp + "），\n继续会用当前游戏的进度覆盖它。是否覆盖？")) {
        log("已取消存档（卡槽 " + slot + " 属于其他游戏），可先按 3 打开存档列表换个卡槽", "save");
        return;
      }
    }
    doSaveState(slot, saveState, screenshot);
  });
}

function doSaveState(slot, saveState, screenshot) {
  let timestamp = new Date().toLocaleString();

  SaveManager.updateSaveSlot(slot, screenshot, timestamp, function (err, record) {
    if (err) {
      log(i18n('log.save.failed_save_state') + "到存档卡槽" + slot, "save");
      return;
    }

    record.saveState = saveState;

    window.SaveManager.updateSaveData(slot, record, function (err) {
      if (err) {
        log(i18n('log.save.failed_save_state') + "到存档卡槽" + slot, "save");
      } else {
        log(i18n('log.save.saved_state') + "到存档卡槽" + slot, "save");
        rememberGameSlot(loadedName, slot);
      }
    });
  });
}

function load_State() {
  let slot = window.currentSaveSlot !== undefined ? window.currentSaveSlot : 0;

  if (window.SaveManager && SaveManager.getSaveData) {
    window.SaveManager.getSaveData(slot, function (err, record) {
      if (err || !record || !record.saveState) {
        log("存档卡槽" + slot + "为空，无法读档!", "save");
        return;
      }

      if (record.romName !== loadedName) {
        log("存档卡槽" + slot + "属于《" + record.romName + "》，当前游戏是《" + loadedName + "》，无法读档!", "save");
        return;
      }

      if (db.nes.setState(record.saveState)) {
        if (slot != -1) {
          log("从存档卡槽" + slot + i18n('log.save.loaded_state'), "save");
        }
        else {
          log("已加载自动存档", "save");
        }
      } else {
        log("从存档卡槽" + slot + i18n('log.save.failed_load_state'), "save");
      }
    });
  }
}

    // 确保全局回退标志存在（用于 JSNSF 识别到非 NSF 时通知 NES 端放行）
    try {
        if (typeof window !== 'undefined' && typeof window.jsnsfLoadedNonNsf === 'undefined') {
            window.jsnsfLoadedNonNsf = false;
        }
    } catch (e) { /* ignore */ }

window.nes = nes;
