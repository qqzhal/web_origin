// NSF 播放器相关变量
let nsfLastUpdateTime = 0;
const nsfUpdateInterval = 1000 / 60; // 60FPS的时间间隔
let nsfPlayer = null;
let nsfAudioHandler = null;
let nsfPaused = false;
let nsfLoaded = false;
let nsfLoopId = 0;
let nsfCurrentSong = 1;
let nsfRandomMode = false;  // 随机播放

// 是否以"静默/后台"模式播放（仅输出音频，不切换或绘制NSF界面）
let nsfHeadless = false;

// 将状态同步到 window，方便外部脚本检查/切换
window.nsfHeadless = nsfHeadless;

// NSF播放器稳定播放控制变量

// NSF播放器UI元素
let nsfUIContainer = null;

window.nsfResizeCanvasToFitWindow = function() {
  const c = document.getElementById('output');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  let maxW = window.innerWidth, maxH = window.innerHeight;
  let scale = Math.min(maxW / 256, maxH / 240); // 按NSF画布比例调整
  let displayW = Math.round(256 * scale);
  let displayH = Math.round(240 * scale);
  c.width = displayW * dpr;
  c.height = displayH * dpr;
  c.style.width = displayW + "px";
  c.style.height = displayH + "px";
  // 如有需要，重建 context 或 imgData
  if (window.nsfUpdateCtxAfterResize) window.nsfUpdateCtxAfterResize();
  
  // 确保在NSF模式下toolbarToggleBtn保持隐藏
  const toolbarToggleBtn = document.getElementById('toolbarToggleBtn');
  if (toolbarToggleBtn) toolbarToggleBtn.style.display = "none";
  

};

// 按钮名称常量
const NSF_BTN_NAMES = ["prev", "pause", "next", "random", "edit", "debugger", "datafetch", "fps"];

// 新增：NSF/编辑模式切换
let nsfEditMode = false;
let nsfDebuggerPanel = null; // 新增：全局变量

// 创建NSF播放器UI
function createNsfUI() {
  // 如果已经存在UI容器，则先移除
  if (nsfUIContainer && nsfUIContainer.parentNode) {
    nsfUIContainer.parentNode.removeChild(nsfUIContainer);
  }

  // 创建NSF播放器UI容器
  nsfUIContainer = document.createElement('div');
  nsfUIContainer.id = 'nsf-ui-container';
  nsfUIContainer.className = 'nsf-ui-container';
  
  // 创建播放器信息区域
  const infoContainer = document.createElement('div');
  infoContainer.className = 'nsf-info-container';
  
  const titleElement = document.createElement('div');
  titleElement.className = 'nsf-title';
  titleElement.textContent = nsfEditMode ? "CT2编辑器" : "NSF播放器";
  infoContainer.appendChild(titleElement);
  
  // 调试器和数据分析按钮 - 直接放在标题后面
  const debugBtn = document.createElement('button');
  debugBtn.className = 'nsf-button nsf-button-secondary';
  debugBtn.textContent = '调试器';
  debugBtn.onclick = openNsfDebugger;
  infoContainer.appendChild(debugBtn);
  
  const dataBtn = document.createElement('button');
  dataBtn.className = 'nsf-button nsf-button-secondary';
  dataBtn.textContent = '数据分析';
  dataBtn.onclick = function() {
    if (window.nsfDebugPL && typeof window.nsfDebugPL.showHotspotAnalysis === "function") {
      window.nsfDebugPL.showHotspotAnalysis();
    }
  };
  infoContainer.appendChild(dataBtn);
  
  // 打开文件按钮
  const openFileBtn = document.createElement('button');
  openFileBtn.className = 'nsf-button nsf-button-secondary';
  openFileBtn.textContent = '打开文件';
  openFileBtn.onclick = function() {
    // 触发index.html中的文件上传input元素的点击事件
    const fileInput = document.getElementById('rom');
    if (fileInput) {
      fileInput.click();
    }
  };
  infoContainer.appendChild(openFileBtn);
  
  nsfUIContainer.appendChild(infoContainer);
  
  // 创建控制按钮区域
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'nsf-controls-container';
  
  const prevBtn = document.createElement('button');
  prevBtn.className = 'nsf-button nsf-control-button';
  prevBtn.innerHTML = '⏮';
  prevBtn.title = '上一曲';
  prevBtn.onclick = nsfPrevSong;
  
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'nsf-button nsf-control-button';
  pauseBtn.innerHTML = nsfPaused ? '▶' : '⏸';
  pauseBtn.title = nsfPaused ? '播放' : '暂停';
  pauseBtn.onclick = nsfPauseToggle;
  pauseBtn.id = 'nsf-pause-button'; // 用于动态更新按钮文本
  
  const nextBtn = document.createElement('button');
  nextBtn.className = 'nsf-button nsf-control-button';
  nextBtn.innerHTML = '⏭';
  nextBtn.title = '下一曲';
  nextBtn.onclick = nsfNextSong;
  
  const randomBtn = document.createElement('button');
  randomBtn.className = 'nsf-button nsf-control-button' + (nsfRandomMode ? ' nsf-button-active' : '');
  randomBtn.innerHTML = '🔀';
  randomBtn.title = '随机播放';
  randomBtn.id = 'nsf-random-button';
  randomBtn.onclick = function() {
    nsfRandomMode = !nsfRandomMode;
    randomBtn.classList.toggle('nsf-button-active', nsfRandomMode);
  
  };
  
  const editBtn = document.createElement('button');
  editBtn.className = 'nsf-button nsf-mode-button';
  editBtn.textContent = nsfEditMode ? 'NSF模式' : '编辑模式';
  editBtn.onclick = nsfSwitchToEditMode;
  editBtn.id = 'nsf-edit-button';
  

  
  controlsContainer.appendChild(prevBtn);
  controlsContainer.appendChild(pauseBtn);
  controlsContainer.appendChild(nextBtn);
  controlsContainer.appendChild(randomBtn);
  controlsContainer.appendChild(editBtn);
  
  nsfUIContainer.appendChild(controlsContainer);
  
  // 创建歌曲信息区域
  const songInfoContainer = document.createElement('div');
  songInfoContainer.className = 'nsf-song-info';
  
  const nameLabel = document.createElement('div');
  nameLabel.className = 'nsf-info-label';
  nameLabel.innerHTML = `<strong>标题:</strong> <span id="nsf-title-text">${nsfPlayer?.tags?.name || ""}</span>`;
  
  const artistLabel = document.createElement('div');
  artistLabel.className = 'nsf-info-label';
  artistLabel.innerHTML = `<strong>作者:</strong> <span id="nsf-artist-text">${nsfPlayer?.tags?.artist || ""}</span>`;
  
  const copyrightLabel = document.createElement('div');
  copyrightLabel.className = 'nsf-info-label';
  copyrightLabel.innerHTML = `<strong>版权:</strong> <span id="nsf-copyright-text">${nsfPlayer?.tags?.copyright || ""}</span>`;
  
  const songNumberLabel = document.createElement('div');
  songNumberLabel.className = 'nsf-info-label nsf-song-number';
  songNumberLabel.innerHTML = `<strong>曲目:</strong> <span id="nsf-song-number-text">${nsfCurrentSong} / ${nsfPlayer?.totalSongs || 1}</span>`;
  
  songInfoContainer.appendChild(nameLabel);
  songInfoContainer.appendChild(artistLabel);
  songInfoContainer.appendChild(copyrightLabel);
  songInfoContainer.appendChild(songNumberLabel);
  
  nsfUIContainer.appendChild(songInfoContainer);
  
  // 创建芯片信息区域
  const chipContainer = document.createElement('div');
  chipContainer.className = 'nsf-chip-container';
  
  const chipNames = [
    { key: 'vrc6', name: 'VRC6' },
    { key: 'vrc7', name: 'VRC7' },
    { key: 'fds', name: 'FDS' },
    { key: 'mmc5', name: 'MMC5' },
    { key: 'namco', name: 'N106' },
    { key: 'sunsoft5b', name: 'FME7' }
  ];
  
  chipNames.forEach(chip => {
    const chipElement = document.createElement('span');
    chipElement.className = 'nsf-chip';
    chipElement.textContent = chip.name;
    chipElement.id = `nsf-chip-${chip.key}`;
    chipElement.classList.toggle('nsf-chip-enabled', !!nsfPlayer?.extraChips?.[chip.key]);
    chipContainer.appendChild(chipElement);
  });
  
  nsfUIContainer.appendChild(chipContainer);
  
  // 创建技术信息区域
  const techInfoContainer = document.createElement('div');
  techInfoContainer.className = 'nsf-tech-info';
  
  let loadAdr = nsfPlayer?.mapper?.loadAdr || 0;
  let initAdr = 0, playAdr = 0;
  if (nsfPlayer && nsfPlayer.callArea) {
    initAdr = nsfPlayer.callArea[1] | (nsfPlayer.callArea[2] << 8);
    playAdr = nsfPlayer.callArea[9] | (nsfPlayer.callArea[10] << 8);
  }
  
  const techInfoText = document.createElement('div');
  techInfoText.className = 'nsf-tech-text';
  techInfoText.innerHTML = `加载: $${loadAdr.toString(16).padStart(4, "0").toUpperCase()} 初始化: $${initAdr.toString(16).padStart(4, "0").toUpperCase()} 播放: $${playAdr.toString(16).padStart(4, "0").toUpperCase()}`;
  techInfoText.id = 'nsf-tech-info-text';
  
  techInfoContainer.appendChild(techInfoText);
  nsfUIContainer.appendChild(techInfoContainer);
  
  // 将UI添加到页面
  const outputContainer = document.getElementById('fullscreenContainer') || document.body;
  outputContainer.appendChild(nsfUIContainer);
}



function showNsfUI() {
  // 隐藏 NES 控件
  ["pause", "reset", "hardreset", "palettes", "doutput", "turboBtnLabel"].forEach(id => {
    let elx = document.getElementById(id);
    if (elx) elx.style.display = "none";
  });
  // 新增：隐藏所有触屏按钮（transparent-button类）
  document.querySelectorAll('.transparent-button').forEach(btn => {
    btn.style.display = "none";
  });
  
  // 创建并显示NSF UI
  createNsfUI();

}

function openNsfDebugger() {
  // 打开调试器，只能有一个
  if (window.nsfDebugger && typeof window.nsfDebugger.init === "function") {
    // 已有则先关闭
    if (nsfDebuggerPanel && nsfDebuggerPanel.parentNode) {
      return;
    }
    // 创建一个浮动层
    let panel = document.createElement("div");
    panel.style = "position:fixed;left:50vw;top:10vh;min-width:420px;max-height:90vh;overflow:auto;background:#222;border:2px solid #FFD700;z-index:5000;box-shadow:0 8px 32px #000;border-radius:8px;padding:0 0 18px 0;color:#FFD700;font-size:14px;";
    panel.innerHTML = `
        <div class="nsf-debugger-dragbar" style="cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center;background:#333;padding:8px 16px;border-radius:8px 8px 0 0;">
          <span style="color:#FFD700;font-size:16px;">NSF调试器</span>
          <button class="nsf-debugger-close" title="关闭" style="background:none;border:none;color:#FFD700;font-size:20px;cursor:pointer;">&#10005;</button>
        </div>
        <div id="nsf-debugger-float-panel"></div>
      `;
    document.body.appendChild(panel);
    nsfDebuggerPanel = panel; // 记录
    // 关闭按钮事件
    panel.querySelector('.nsf-debugger-close').onclick = function () {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      nsfDebuggerPanel = null;
    };
    // 拖动实现
    let dragbar = panel.querySelector('.nsf-debugger-dragbar');
    let dragging = false, offsetX = 0, offsetY = 0;
    dragbar.onmousedown = function (e) {
      // 如果点击的是按钮、输入框等，不拖拽
      if (
        e.target.tagName === "BUTTON" ||
        e.target.tagName === "INPUT" ||
        e.target.tagName === "LABEL" ||
        e.target.closest("button") ||
        e.target.closest("input")
      ) return;
      dragging = true;
      let rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      document.onmousemove = function (ev) {
        if (!dragging) return;
        panel.style.left = (ev.clientX - offsetX) + "px";
        panel.style.top = (ev.clientY - offsetY) + "px";
        panel.style.right = "";
        panel.style.bottom = "";
        panel.style.transform = "";
      };
      document.onmouseup = function () {
        dragging = false;
        document.onmousemove = null;
        document.onmouseup = null;
      };
      e.preventDefault();
    };
    // 手机端拖拽支持（用addEventListener防止passive问题）
    let touchMoveHandler = function (ev) {
      if (!dragging || !ev.touches || ev.touches.length !== 1) return;
      let t = ev.touches[0];
      panel.style.left = (t.clientX - offsetX) + "px";
      panel.style.top = (t.clientY - offsetY) + "px";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.transform = "";
      ev.preventDefault();
    };
    let touchEndHandler = function () {
      dragging = false;
      document.removeEventListener("touchmove", touchMoveHandler, { passive: false });
      document.removeEventListener("touchend", touchEndHandler, { passive: false });
    };
    dragbar.ontouchstart = function (e) {
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
      let rect = panel.getBoundingClientRect();
      let touch = e.touches[0];
      offsetX = touch.clientX - rect.left;
      offsetY = touch.clientY - rect.top;
      document.addEventListener("touchmove", touchMoveHandler, { passive: false });
      document.addEventListener("touchend", touchEndHandler, { passive: false });
      e.preventDefault();
    };
    // 初始化调试器内容到指定panel
    window.nsfDebugger.init(panel.querySelector('#nsf-debugger-float-panel'));
  }
}

function hideNsfUI() {
  // 移除NSF UI
  if (nsfUIContainer && nsfUIContainer.parentNode) {
    nsfUIContainer.parentNode.removeChild(nsfUIContainer);
  }
  
 
  
  let canvas = document.getElementById("output");
  canvas.onclick = null;
  canvas.ontouchstart = null; // 新增：解绑触摸事件
  // 移除/隐藏 NSF 覆盖画布（WebGL 后端使用）
  let overlay = document.getElementById('nsfOverlay');
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  ["pause", "reset", "hardreset", "palettes", "doutput", "turboBtnLabel"].forEach(id => {
    let elx = document.getElementById(id);
    if (elx) elx.style.display = "";
  });
  // 恢复触屏按钮显示
  document.querySelectorAll('.transparent-button').forEach(btn => {
    btn.style.display = "";
  });
  
  // 显示toolbarToggleBtn
  const toolbarToggleBtn = document.getElementById('toolbarToggleBtn');
  if (toolbarToggleBtn) toolbarToggleBtn.style.display = "";
}

function nsfSwitchToEditMode() {
  nsfEditMode = true;
  nsfStopPlayback();
  hideNsfUI();
  nsfShowEditUI();
}

function nsfSwitchToNsfMode() {
  nsfEditMode = false;
  nsfStopPlayback();
  hideNsfEditUI();
  showNsfUI();
}

// 停止NSF播放（共用）
function nsfStopPlayback() {
  if (nsfLoopId) cancelAnimationFrame(nsfLoopId);
  if (nsfAudioHandler) nsfAudioHandler.stop();
  // ensure APU and audio buffers are reset so no residual audio remains
  if (nsfPlayer && nsfPlayer.apu && typeof nsfPlayer.apu.reset === 'function') {
    try { nsfPlayer.apu.reset(); } catch (e) { /* ignore */ }
  }
  if (nsfAudioHandler && typeof nsfAudioHandler.resetBuffers === 'function') {
    try { nsfAudioHandler.resetBuffers(); } catch (e) { /* ignore */ }
  }
  nsfPaused = true;
  window.nsfPaused = true; // 同步到全局
}

// 编辑模式入口
function nsfShowEditUI() {
  // 由 nsfCT2edit.js 实现
  if (window.nsfEdit && window.nsfEdit.showEditUI) {
    window.nsfEdit.showEditUI(nsfSwitchToNsfMode);
  }
}

// 编辑模式隐藏
function hideNsfEditUI() {
  if (window.nsfEdit && window.nsfEdit.hideEditUI) {
    window.nsfEdit.hideEditUI();
  }
}

// NSF 播放相关函数
function nsfPauseToggle() {
  if (!nsfLoaded) return;
  if (nsfPaused) {
    // 暂停后继续播放
    
    
    // 新增：预填充音频缓冲区，避免恢复播放时声音卡顿
    if (nsfPlayer && nsfAudioHandler) {
      // 预先运行几帧但不播放，确保音频状态正确
      for (let i = 0; i < 3; i++) {
        nsfPlayer.runFrame();
        nsfPlayer.getSamples(nsfAudioHandler.sampleBuffer, nsfAudioHandler.samplesPerFrame);
        nsfAudioHandler.nextBuffer();
      }
      // 重置音频处理器状态
      nsfAudioHandler.resetBuffers && nsfAudioHandler.resetBuffers();
    }
    
    nsfLastUpdateTime = 0; // 重置时间戳，确保正确的播放速度
    nsfLoopId = requestAnimationFrame(nsfUpdate);
    nsfAudioHandler.start();
    nsfPaused = false;
  } else {
    cancelAnimationFrame(nsfLoopId);
    nsfAudioHandler.stop();
    nsfPaused = true;
  }
  window.nsfPaused = nsfPaused; // 保证全局同步
  
  // 调用UI更新函数，确保暂停按钮图标正确变化
  nsfDrawVisual();
}

// 暴露nsfPauseToggle到全局作用域
window.nsfPauseToggle = nsfPauseToggle;

function nsfRestart() {
  if (nsfLoaded) {
    nsfPlayer.playSong(nsfCurrentSong);
    window.nsfPlayer = nsfPlayer; // 保证全局同步
    document.getElementById('nsf-song-number-text').textContent = `${nsfCurrentSong} / ${nsfPlayer?.totalSongs || 1}`;
  
  }
}

function nsfPrevSong() {
  if (nsfLoaded) {
    let total = nsfPlayer.totalSongs || 1;
    if (nsfRandomMode) {
      let next = nsfCurrentSong;
      while (total > 1 && next === nsfCurrentSong) {
        next = 1 + Math.floor(Math.random() * total);
      }
      nsfCurrentSong = next;
    } else {
      nsfCurrentSong--;
      if (nsfCurrentSong < 1) nsfCurrentSong = total; // 首尾循环
    }
    nsfPlayer.playSong(nsfCurrentSong);
    window.nsfPlayer = nsfPlayer; // 保证全局同步
    document.getElementById('nsf-song-number-text').textContent = `${nsfCurrentSong} / ${nsfPlayer?.totalSongs || 1}`;
    // 切歌时自动恢复播放
    if (nsfPaused) {
      nsfPaused = false;
    window.nsfPaused = nsfPaused;
      
      // 新增：预填充音频缓冲区，避免恢复播放时声音卡顿
      if (nsfPlayer && nsfAudioHandler) {
        // 预先运行几帧但不播放，确保音频状态正确
        for (let i = 0; i < 3; i++) {
          nsfPlayer.runFrame();
          nsfPlayer.getSamples(nsfAudioHandler.sampleBuffer, nsfAudioHandler.samplesPerFrame);
          nsfAudioHandler.nextBuffer();
        }
        // 重置音频处理器状态
        nsfAudioHandler.resetBuffers && nsfAudioHandler.resetBuffers();
      }
      
      nsfLastUpdateTime = 0; // 重置时间戳，确保正确的播放速度
      nsfLastUpdateTime = 0; // 重置时间戳，确保正确的播放速度
      nsfAudioHandler.start();
      nsfLoopId = requestAnimationFrame(nsfUpdate);
    }
  
  }
}

function nsfNextSong() {
  if (nsfLoaded) {
    let total = nsfPlayer.totalSongs || 1;
    if (nsfRandomMode) {
      let next = nsfCurrentSong;
      while (total > 1 && next === nsfCurrentSong) {
        next = 1 + Math.floor(Math.random() * total);
      }
      nsfCurrentSong = next;
    } else {
      nsfCurrentSong++;
      if (nsfCurrentSong > total) nsfCurrentSong = 1; // 首尾循环
    }
    nsfPlayer.playSong(nsfCurrentSong);
    window.nsfPlayer = nsfPlayer; // 保证全局同步
    document.getElementById('nsf-song-number-text').textContent = `${nsfCurrentSong} / ${nsfPlayer?.totalSongs || 1}`;
    // 切歌时自动恢复播放
    if (nsfPaused) {
      nsfPaused = false;
    window.nsfPaused = nsfPaused;
      
      // 新增：预填充音频缓冲区，避免恢复播放时声音卡顿
      if (nsfPlayer && nsfAudioHandler) {
        // 预先运行几帧但不播放，确保音频状态正确
        for (let i = 0; i < 3; i++) {
          nsfPlayer.runFrame();
          nsfPlayer.getSamples(nsfAudioHandler.sampleBuffer, nsfAudioHandler.samplesPerFrame);
          nsfAudioHandler.nextBuffer();
        }
        // 重置音频处理器状态
        nsfAudioHandler.resetBuffers && nsfAudioHandler.resetBuffers();
      }
      
      nsfAudioHandler.start();
      nsfLoopId = requestAnimationFrame(nsfUpdate);
    }
  
  }
}

function updateNsfSongInfo() {

}

function nsfUpdate(timestamp) {
  if (nsfPaused) {
    // 即使暂停也要更新波形，这样用户可以看到暂停时的最后状态
  
    nsfLoopId = requestAnimationFrame(nsfUpdate);
    return;
  }
  
  // 初始化lastUpdateTime
  if (!nsfLastUpdateTime) {
    nsfLastUpdateTime = timestamp;
  }
  
  // 计算自上次更新以来经过的时间
  const elapsed = timestamp - nsfLastUpdateTime;
  
  // 只有当经过的时间大于等于60FPS间隔时才更新
  if (elapsed >= nsfUpdateInterval) {
    // 更新lastUpdateTime，考虑剩余时间以保持精确的60FPS
    nsfLastUpdateTime = timestamp - (elapsed % nsfUpdateInterval);
    
    // 执行一帧的音频处理
    nsfRunFrame();
    
    // 绘制波形可视化
  }
  
  nsfLoopId = requestAnimationFrame(nsfUpdate);
}

function nsfRunFrame() {
  if (!nsfLoaded) return;

  // 固定以60fps速率生成音频，确保播放速度稳定一致
  nsfPlayer.runFrame();
  nsfPlayer.getSamples(nsfAudioHandler.sampleBuffer, nsfAudioHandler.samplesPerFrame);
  nsfAudioHandler.nextBuffer();

  // 只有在非静默模式下才绘制 NSF 界面（避免覆盖游戏画面）


  // 新增：如果数据分析层可见且正在播放，自动刷新ROM读取统计
  if (
    window.nsfToCT2Code &&
    window.nsfToCT2Code.nsfDataFetchLayer &&
    window.nsfToCT2Code.nsfDataFetchLayer.style.display !== "none" &&
    !nsfPaused &&
    typeof window.nsfToCT2Code.autoDumpRomReadStat === "function"
  ) {
    window.nsfToCT2Code.autoDumpRomReadStat();
  }
}

function nsfDrawVisual() {
  // 如果处于静默播放模式，则不绘制任何界面
  if (nsfHeadless) return;
  
  // 更新UI元素
  if (document.getElementById('nsf-title-text')) {
    document.getElementById('nsf-title-text').textContent = nsfPlayer?.tags?.name || "";
  }
  
  if (document.getElementById('nsf-artist-text')) {
    document.getElementById('nsf-artist-text').textContent = nsfPlayer?.tags?.artist || "";
  }
  
  if (document.getElementById('nsf-copyright-text')) {
    document.getElementById('nsf-copyright-text').textContent = nsfPlayer?.tags?.copyright || "";
  }
  
  if (document.getElementById('nsf-song-number-text')) {
    document.getElementById('nsf-song-number-text').textContent = `${nsfCurrentSong} / ${nsfPlayer?.totalSongs || 1}`;
  }
  
  // 更新芯片状态
  const chipNames = [
    { key: 'vrc6', name: 'VRC6' },
    { key: 'vrc7', name: 'VRC7' },
    { key: 'fds', name: 'FDS' },
    { key: 'mmc5', name: 'MMC5' },
    { key: 'namco', name: 'N106' },
    { key: 'sunsoft5b', name: 'FME7' }
  ];
  
  chipNames.forEach(chip => {
    const chipElement = document.getElementById(`nsf-chip-${chip.key}`);
    if (chipElement) {
      chipElement.classList.toggle('nsf-chip-enabled', !!nsfPlayer?.extraChips?.[chip.key]);
    }
  });
  
  // 更新技术信息
  if (document.getElementById('nsf-tech-info-text')) {
    let loadAdr = nsfPlayer?.mapper?.loadAdr || 0;
    let initAdr = 0, playAdr = 0;
    if (nsfPlayer && nsfPlayer.callArea) {
      initAdr = nsfPlayer.callArea[1] | (nsfPlayer.callArea[2] << 8);
      playAdr = nsfPlayer.callArea[9] | (nsfPlayer.callArea[10] << 8);
    }
    document.getElementById('nsf-tech-info-text').innerHTML = `加载: $${loadAdr.toString(16).padStart(4, "0").toUpperCase()} 初始化: $${initAdr.toString(16).padStart(4, "0").toUpperCase()} 播放: $${playAdr.toString(16).padStart(4, "0").toUpperCase()}`;
  }
  
  // 更新按钮状态
  const pauseBtn = document.getElementById('nsf-pause-button');
  if (pauseBtn) {
    pauseBtn.innerHTML = nsfPaused ? '▶' : '⏸';
    pauseBtn.title = nsfPaused ? '播放' : '暂停';
  }
  

  
  const randomBtn = document.getElementById('nsf-random-button');
  if (randomBtn) {
    randomBtn.classList.toggle('nsf-button-active', nsfRandomMode);
  }
  
  const editBtn = document.getElementById('nsf-edit-button');
  if (editBtn) {
    editBtn.textContent = nsfEditMode ? 'NSF模式' : '编辑模式';
  }
  
  // 更新标题
  const titleElement = nsfUIContainer?.querySelector('.nsf-title');
  if (titleElement) {
    titleElement.textContent = nsfEditMode ? "CT2编辑器" : "NSF播放器";
  }
  

}

window.nsfPlayBackground = function(nsfData, songNum, handler) {
  if (!nsfData || typeof NsfPlayer !== 'function' || !handler) {
      console.error("nsfPlayBackground: Invalid arguments provided.");
      return false;
  }
  try {
    // 创建播放器并加载
    nsfPlayer = new NsfPlayer();
    if (!nsfPlayer.loadNsf(nsfData)) {
         window.jsnsfLoadedNonNsf = true;
        console.error("nsfPlayBackground: Failed to load NSF data.");
        return false;
    }

    nsfCurrentSong = songNum && songNum > 0 ? songNum : 1;
    nsfLoaded = true;
    window.nsfPlayer = nsfPlayer;
    window.nsfLoaded = true; // 同步到全局
    window.nsfPaused = false; // 同步到全局

    // NSF 载入成功后直接隐藏 statusBar
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      statusBar.style.display = 'none';
    }

    // 关键：直接使用从 custommusic.js 传入的 handler
    nsfAudioHandler = handler;

    // 启用界面显示模式
    nsfHeadless = false;
    window.nsfHeadless = false;
    window.nsfAudioHandler = nsfAudioHandler;

    // 启动并预填充缓冲
    nsfPlayer.playSong(nsfCurrentSong);
    
    if (nsfAudioHandler && nsfAudioHandler.hasAudio) {
        if(typeof nsfAudioHandler.resume === 'function') {
            nsfAudioHandler.resume();
        }
        
        // 预填充
        for (let i = 0; i < 3; i++) {
            nsfPlayer.runFrame();
            nsfPlayer.getSamples(nsfAudioHandler.sampleBuffer, nsfAudioHandler.samplesPerFrame);
            nsfAudioHandler.nextBuffer();
        }
        
        if(typeof nsfAudioHandler.start === 'function') {
            nsfAudioHandler.start();
        }
    } else {
        console.error("nsfPlayBackground: nsfAudioHandler is invalid or has no audio.");
        return false;
    }

    nsfPaused = false;
    nsfLastUpdateTime = 0; // 重置时间戳，确保正确的播放速度
    if (nsfLoopId) cancelAnimationFrame(nsfLoopId);
    
    // 确保创建并显示NSF UI和波形可视化
    createNsfUI();
    nsfLoopId = requestAnimationFrame(nsfUpdate);
    
    return true;
  } catch (e) {
    console.error('nsfPlayBackground critical error', e);
    return false;
  }
};

window.nsfStopBackground = function() {
  // 仅停止播放，不改变 headless 状态
  nsfStopPlayback();
};

// 工具函数
function fillString(ctx, str, x, y) {
  if (!ctx || typeof ctx.fillText !== "function" || typeof str !== "string") return;
  ctx.fillText(str, x, y);
}

function inRect(x, y, rect) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// 检查是否为NSF文件
function isNsfFile(name) {
  return name && name.toLowerCase().endsWith('.nsf');
}

// 隐藏 NES UI（用于NSF模式）
function hideNesUiForNsf() {
  ["pause", "reset", "hardreset", "palettes", "doutput", "turboBtnLabel"].forEach(id => {
    let elx = document.getElementById(id);
    if (elx) elx.style.display = "none";
  });
  
  // 隐藏toolbarToggleBtn
  const toolbarToggleBtn = document.getElementById('toolbarToggleBtn');
  if (toolbarToggleBtn) toolbarToggleBtn.style.display = "none";
}

// 监听NES控制器按键控制NSF播放（VirtuaNES风格：仅1P控制器，方向键/AB/Start/Select有不同功能）
(function () {
  let nsfKeyBound = false;
  function bindNsfKeyControl() {
    if (nsfKeyBound) return;
    nsfKeyBound = true;

    function getKeyMap() {
      if (typeof keyMap !== 'undefined' && keyMap) return keyMap;
      return {
        1: { up: 'w', down: 's', left: 'a', right: 'd', select: 'g', start: 'h', b: 'k', a: 'l' },
        2: { up: '↑', down: '↓', left: '←', right: '→', select: '7', start: '8', b: '4', a: '5' }
      };
    }
    function getNesButtonMap() {
      if (typeof nesButtonMap !== 'undefined' && nesButtonMap) return nesButtonMap;
      return { a: 'A', b: 'B', select: 'SELECT', start: 'START', up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };
    }

    window.addEventListener('keydown', function (e) {
      // 如果未加载或处于静默/后台播放模式，不处理NSF快捷键
      if (!nsfLoaded || nsfHeadless) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

      let key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const keyMap = getKeyMap();
      const nesButtonMap = getNesButtonMap();

      // 只用1P控制器
      for (let btn in keyMap[1]) {
        if (key && key === keyMap[1][btn]) {
          let nesBtn = nesButtonMap[btn];
          if (!nesBtn) continue;
          // VirtuaNES风格：方向键=切曲目，A=暂停/继续，B=重播，Start=下一曲，Select=上一曲
          switch (nesBtn) {
            case 'UP':
              nsfPrevSong();
              e.preventDefault();
              return;
            case 'DOWN':
              nsfNextSong();
              e.preventDefault();
              return;
            case 'LEFT':
              nsfPrevSong();
              e.preventDefault();
              return;
            case 'RIGHT':
              nsfNextSong();
              e.preventDefault();
              return;
            case 'A':
              nsfPauseToggle();
              e.preventDefault();
              return;
            case 'B':
              nsfRestart();
              e.preventDefault();
              return;
            case 'START':
              nsfNextSong();
              e.preventDefault();
              return;
            case 'SELECT':
              nsfPrevSong();
              e.preventDefault();
              return;
          }
        }
      }
    }, true);
  }
  bindNsfKeyControl();
})();

// NSF模式下自动处理页面可见性变化，自动暂停/恢复
(function () {
  let nsfPausedInBg = false;
  document.addEventListener('visibilitychange', function () {
    if (!nsfLoaded) return;
    if (document.hidden) {
      nsfPausedInBg = false;
      if (!nsfPaused) {
        nsfPauseToggle();
        nsfPausedInBg = true;
      }
    } else {
      if (nsfPausedInBg && nsfLoaded) {
        nsfPauseToggle();
        nsfPausedInBg = false;
      }
    }
  });
})();



// 检查AudioHandler是否已定义，若已定义则只添加新方法
if (typeof AudioHandler === 'function') {
  // 添加重置缓冲区的方法
  AudioHandler.prototype.resetBuffers = function() {
    // 重置内部音频缓冲区状态
    if (this.audioBuffers) {
      for (let i = 0; i < this.audioBuffers.length; i++) {
        if (this.audioBuffers[i]) {
          // 将缓冲区填充为静音
          const buffer = this.audioBuffers[i];
          for (let j = 0; j < buffer.length; j++) {
            buffer[j] = 0;
          }
        }
      }
    }
    
    // 重置音频处理状态
    if (this.scriptNode) {
      // 脚本处理节点重置
      this._bufferFillAmount = 0;
      this._activeBuffer = 0;
    }
    
    // 重置采样计数器
    this._sampleCounter = 0;
  };
} else {
  console.warn('AudioHandler class not found, cannot add resetBuffers method');
}
