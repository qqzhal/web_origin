function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GameSavesDB', 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('RomStore')) {
        db.createObjectStore('RomStore', { keyPath: 'id' });
      }
    };

    request.onsuccess = function (event) {
      resolve(event.target.result);
    };

    request.onerror = function (event) {
      reject('IndexedDB 初始化失败: ' + event.target.errorCode);
    };
  });
}



const LANG = window.LANG || 'zh';
const I18N_DICT = {
  "log.save.loaded_battery": {
    "zh": "已加载电池存档",
    "en": "Loaded battery"
  },
  "log.save.saved_battery": {
    "zh": "已保存电池存档",
    "en": "Saved battery"
  },
  "log.save.failed_save_battery": {
    "zh": "保存电池存档失败: {err}",
    "en": "Failed to save battery: {err}"
  },
  "log.save.saved_state": {
    "zh": "已保存存档",
    "en": "Saved state"
  },
  "log.save.failed_save_state": {
    "zh": "保存存档失败: {err}",
    "en": "Failed to save state: {err}"
  },
  "log.save.loaded_state": {
    "zh": "加载存档",
    "en": "Loaded state"
  },
  "log.save.failed_load_state": {
    "zh": "加载存档失败",
    "en": "Failed to load state"
  },
  "log.save.no_state": {
    "zh": "尚未保存存档",
    "en": "No state saved yet"
  },
  "log.zip.loaded": {
    "zh": "已从zip加载 \"{name}\"",
    "en": "Loaded \"{name}\" from zip"
  },
  "log.zip.no_nes": {
    "zh": "zip中未找到.nes文件",
    "en": "No .nes file found in zip"
  },
  "log.zip.no_nsf": {
    "zh": "zip中未找到.nsf文件",
    "en": "No .nsf file found in zip"
  },
  "log.zip.empty": {
    "zh": "zip文件为空",
    "en": "Zip file was empty"
  },
  "log.zip.failed": {
    "zh": "读取zip失败: {err}",
    "en": "Failed to read zip: {err}"
  },
  "log.pause.paused": {
    "zh": "暂停游戏",
    "en": "Game paused"
  },
  "log.pause.unpaused": {
    "zh": "继续游戏",
    "en": "Game resumed"
  },
  "log.debugger.invalid_bp_addr": {
    "zh": "断点地址无效",
    "en": "Invalid address for breakpoint"
  },
  "log.palette.loaded_palette": {
    "zh": "已加载调色板: {name}",
    "en": "Loaded palette: {name}"
  },
  "log.imagefilter.switch": {
    "zh": "[NES滤镜] 切换滤镜: {filter}",
    "en": "[NES Filter] Switch filter: {filter}"
  },
  "log.rom.load_failed": {
    "zh": "ROM加载失败: {err}",
    "en": "ROM load failed: {err}"
  },
  "log.rom.unsupported_format": {
    "zh": "不支持的ROM格式",
    "en": "Unsupported ROM format"
  },
  "log.rom.load_success": {
    "zh": "ROM加载成功: {name}",
    "en": "ROM loaded successfully: {name}"
  },
  "log.rom.unsupported_mapper": {
    "zh": "不支持的Mapper: {mapper}",
    "en": "Unsupported Mapper: {mapper}"
  },
  "log.ppu.init_failed": {
    "zh": "PPU初始化失败",
    "en": "PPU initialization failed"
  },
  "log.apu.init_failed": {
    "zh": "APU初始化失败",
    "en": "APU initialization failed"
  },
  "log.gamepad.connected": {
    "zh": "已连接手柄: {id}",
    "en": "Gamepad connected: {id}"
  },
  "log.gamepad.disconnected": {
    "zh": "手柄已断开: {id}",
    "en": "Gamepad disconnected: {id}"
  },
  "log.gamepad.detected": {
    "zh": "检测到 {n} 个手柄",
    "en": "Detected {n} gamepad(s)"
  }
  ,
  "log.default.breakpoint_read": {
    "zh": "断点命中(读取){adr}:{val}",
    "en": "Breakpoint hit (read){adr}:{val}"
  }
  ,
  "log.default.breakpoint_execute": {
    "zh": "断点命中(执行):{adr}",
    "en": "Breakpoint hit (execute):{adr}"
  }
  ,
  "log.default.breakpoint_write": {
    "zh": "断点命中(写入){adr}:{val}",
    "en": "Breakpoint hit (write){adr}:{val}"
  }
};
function i18n(key, vars) {
  let str = (I18N_DICT[key] && I18N_DICT[key][LANG]) || key;
  if (vars) {
    for (const k in vars) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    }
  }
  return str;
}



// 加载游戏
function loadgame() {
  initIndexedDB().then(db => {
    try {
      const transaction = db.transaction(['RomStore'], 'readonly');
      const store = transaction.objectStore('RomStore');
      const romDataReq = store.get('RomDataToplay');
      const romNameReq = store.get('RomDataToplay_name');
      transaction.oncomplete = function () {
        const romData = romDataReq.result?.data;
        const romName = romNameReq.result?.data;
        if (!romData || !romName) {
          alert("无法识别游戏文件\nUnable to recognize game file.");
          return;
        }
        // 直接调用 window.loadRom，自动支持 zip
        if (window.loadRom) {
          // 设置全局游戏文件名
          window.currentGameFileName = romName;
          // 如果是 zip，转为 Blob 传递
          if (romName.slice(-4).toLowerCase() === ".zip") {
            window.loadRom(new Blob([romData]), romName);
          } else {
            window.loadRom(new Uint8Array(romData), romName);
          }
        } else if (window.db && typeof db.loadRom === "function") {
          // 设置全局游戏文件名
          window.currentGameFileName = romName;
          db.loadRom(new Uint8Array(romData), romName);
        }
        // 设置标题栏
        document.title = romName;
        // 隐藏文件选择
        const romInput = document.getElementById('rom');
        if (romInput) romInput.style.display = 'none';
      };
      transaction.onerror = function () {
        alert("无法识别游戏文件\nUnable to recognize game file.");
      };
    } catch (e) {
      alert("无法识别游戏文件\nUnable to recognize game file.");
    }
  }).catch(() => {
    alert("无法识别游戏文件\nUnable to recognize game file.");
  });
}

// 页面加载时检测参数
if (location.search.indexOf('debug=true') !== -1 || location.search.indexOf('rom=') !== -1) {
  window.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(location.search);

    // 检查是否有 rom 参数
    if (params.has('rom')) {
      const romUrl = params.get('rom');
      const romName = decodeURIComponent(romUrl.split('/').pop());
      // 支持 .nes/.nsf/.zip（不区分大小写）
      if ((romUrl.startsWith('https://') || romUrl.startsWith('http://')) &&
        (romUrl.toLowerCase().endsWith('.nes') || romUrl.toLowerCase().endsWith('.zip') || romUrl.toLowerCase().endsWith('.nsf'))) {
        fetch(romUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error(`无法下载游戏文件: ${response.statusText}`);
            }
            return response.arrayBuffer();
          })
          .then(buffer => {
            // 设置全局游戏文件名
            window.currentGameFileName = romName;
            // 统一用 Uint8Array 传递，window.loadRom 内部自动判断 zip/nes/nsf
            if (window.loadRom) {
              window.loadRom(new Uint8Array(buffer), romName);
            } else if (window.db && typeof db.loadRom === "function") {
              db.loadRom(new Uint8Array(buffer), romName);
            }
            document.title = romName;
            const romInput = document.getElementById('rom');
            if (romInput) romInput.style.display = 'none';
          })
          .catch(err => {
            alert(`加载游戏文件失败: ${err.message}`);
          });
      } else {
        alert("无效的 ROM 文件路径。请提供 https:// 开头且以 .nes/.nsf/.zip 结尾的路径。");
      }
      history.replaceState({}, "", window.location.pathname);
    }
    if (location.search.indexOf('debug=true') !== -1) {
      loadgame();
    }
  });
}


// 关于弹窗
function showAboutDialog() {
  let dlg = document.getElementById('aboutDialog');
  let container = document.getElementById('fullscreenContainer') || document.body;
  if (dlg) {
    dlg.style.display = 'block';
    dlg.classList.add('active');
    return;
  }
  dlg = document.createElement('div');
  dlg.id = 'aboutDialog';
  dlg.className = 'controller-dialog active';
  dlg.style.position = 'fixed';
  dlg.style.left = '50%';
  dlg.style.top = '50%';
  dlg.style.transform = 'translate(-50%,-50%)';
  dlg.style.zIndex = 10020;
  dlg.style.minWidth = '260px';
  dlg.style.maxWidth = '96vw';
  dlg.style.maxHeight = '96vh';
  dlg.style.overflow = 'auto';
  dlg.style.background = '#fff';
  dlg.style.border = '2px solid #888';
  dlg.style.borderRadius = '12px';
  dlg.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
  dlg.style.padding = '1.2em 1.2em 1em 1.2em';
dlg.innerHTML = `
    <button id="aboutCloseBtn" style="position:absolute;top:8px;right:12px;font-size:1.5em;background:none;border:none;cursor:pointer;color:#888;">&times;</button>
    <div id="aboutContent" style="margin-top:1.5em;">     
      <p><a href="https://daymoe.com/rom/" target="_blank">daymoe</a> 2025</p>
<pre style="max-height: 50vh; overflow: auto; background: #f8f8f8; border-radius: 6px; padding: 0.5em 1em;">2025.11.01~2025.11.02
添加不限制活动块选项(精灵上限64)
集成hack ct2到模拟器菜单中
2025.10.19
使用<a href="https://github.com/libgme/game-music-emu" target="_blank">Game Music Emu</a>转wasm作为外部播放器支持更多格式
2025.10.05~2025.10.11
添加了天2音乐替换NSF播放的相关功能
优化了NSF播放器的性能
NSF充部分扩展芯片支持
针对移动端做了以下调整
添加了采样率和缓冲区大小调整功能
实现了音频重采样系统，支持多种采样率
添加了平台特定默认值设置（移动/桌面）
修复了音频处理器全局变量问题
添加音频输出相关设置
增强命名表&精灵查看器
优化菜单等UI逻辑
添加WebGL渲染模式
2025.05.18~2025.05.21
NSF播放器添加调试及音乐获取功能
中文版自动检查添加简易不卡顿补丁
优化帧率默认锁定60帧
优化Mapper加载方式
触屏按钮调整
2025.05.13~2025.05.15
整合NSF并优化播放功能
添加音乐编辑模式(CT2简谱转换功能)
优化CPU、PPU内存数据的显示
解决调试器错误的逻辑导致音频卡顿
2025.05.11
优化了调试器的性能改进部分调试功能
2025.05.07~2005.05.08
对阵信息功能增强修改
部分内容可以点击修改
2025.05.06
添加存档选项卡功能,20多卡槽+自动存档.
可以将prgrom[ram<=0x8000]数据保存至存档.
调整部分页面响应式逻辑.
添加对阵信息,可选择球员切换持球状态.
2025.04.21~2025.04.30
在原有基础上添加mapper74/195/198的支持
修正模拟器mmc3的bug
添加金手指功能/GamePad/调色板/滤镜等
修正大部分改版ROM兼容(暗黑破坏神等.)
完善调试器功能(仿VirtuaNES-debug)
修复存档功能,解决部分bug.
</pre><p>源代码来自<a href="https://github.com/angelo-wf/NesJs" target="_blank">Github</a></p>
    </div>
  `;
  dlg.querySelector('#aboutCloseBtn').onclick = function () {
    dlg.style.display = 'none';
    dlg.classList.remove('active');
  };
  container.appendChild(dlg);
}

// 新增：支持拖拽文件到页面加载游戏
document.addEventListener('dragover', function(e) {
    e.preventDefault();
}, false);

document.addEventListener('drop', function(e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const fileName = file.name;
        const reader = new FileReader();
        reader.onload = function(evt) {
            const arrayBuffer = evt.target.result;
            // 设置全局游戏文件名
            window.currentGameFileName = fileName;
            if (window.loadRom) {
                if (fileName.slice(-4).toLowerCase() === ".zip") {
                    window.loadRom(new Blob([arrayBuffer]), fileName);
                } else {
                    window.loadRom(new Uint8Array(arrayBuffer), fileName);
                }
            } else if (window.db && typeof db.loadRom === "function") {
                db.loadRom(new Uint8Array(arrayBuffer), fileName);
            }
        };
        reader.readAsArrayBuffer(file);
    }
}, false);

// 初始化状态栏
function initStatusBar() {
  window.addEventListener('DOMContentLoaded', function () {
    const statusBar = document.getElementById('statusBar');
    const closeBtn = document.getElementById('statusBarClose');
    if (statusBar) {
      // 15秒后自动隐藏（如果还没被游戏载入隐藏的话）
      const autoClose = setTimeout(() => {
        statusBar.style.display = 'none';
      }, 15000);
      // 点击 X 时关闭状态条
      closeBtn.addEventListener('click', () => {
        statusBar.style.display = 'none';
        clearTimeout(autoClose);
      });
    }
  });
}

// 初始化音频设置
function initAudioSettings() {
  const sampleRateSelect = document.getElementById('sampleRateSelect');
  const bufferSizeSelect = document.getElementById('bufferSizeSelect');

  // 设置默认值
  function setDefaultAudioSettings() {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    sampleRateSelect.value = isMobile ? '22050' : '44100';
    bufferSizeSelect.value = isMobile ? '32768' : '16384';
  }

  // 初始化默认值
  setDefaultAudioSettings();

  // 恢复用户保存的采样率/缓冲区设置（如果存在）
  try {
    const savedSample = localStorage.getItem('sampleRate');
    if (savedSample) sampleRateSelect.value = savedSample;
  } catch (e) {}
  try {
    const savedBuf = localStorage.getItem('bufferSize');
    if (savedBuf) bufferSizeSelect.value = savedBuf;
  } catch (e) {}

  // 采样率改变事件
  sampleRateSelect.addEventListener('change', function () {
    const wasPlaying = !window.nsfPaused && window.nsfLoaded;
    if (wasPlaying) {
      // 如果正在播放，先暂停
      window.nsfPaused = true;
    }

    if (window.nsfAudioHandler) {
      nsfAudioHandler.setSampleRate(this.value);
    } else {
    }

    if (window.audioHandler) {
      audioHandler.setSampleRate(this.value);
    }
    try { localStorage.setItem('sampleRate', this.value); } catch (e) {}

    // 短暂延迟后恢复播放
    if (wasPlaying) {
      setTimeout(() => {
        window.nsfPaused = false;
      }, 100);
    }
  });

  // 缓冲区大小改变事件
  bufferSizeSelect.addEventListener('change', function () {
    const wasPlaying = !window.nsfPaused && window.nsfLoaded;
    if (wasPlaying) {
      // 如果正在播放，先暂停
      window.nsfPaused = true;
    }

    if (window.nsfAudioHandler) {
      nsfAudioHandler.setBufferSize(this.value);
    } else {
    }

    if (window.audioHandler) {
      audioHandler.setBufferSize(this.value);
    }
    try { localStorage.setItem('bufferSize', this.value); } catch (e) {}

    // 短暂延迟后恢复播放
    if (wasPlaying) {
      setTimeout(() => {
        window.nsfPaused = false;
      }, 100);
    }
  });
}

// 初始化跳帧设置
function initSkipFrameSettings() {
  const skipFrameCheckbox = document.getElementById('skipFrameCheckbox');
  const skipFrameSelectRow = document.getElementById('skipFrameSelectRow');
  const skipFrameSelect = document.getElementById('skipFrameSelect');

  // 初始化跳帧设置
  window.skipFrames = 1; // 默认不跳帧

  // checkbox 改变事件
  skipFrameCheckbox.addEventListener('change', function () {
    if (this.checked) {
      skipFrameSelectRow.style.display = 'grid';
      window.skipFrames = parseInt(skipFrameSelect.value);
    } else {
      skipFrameSelectRow.style.display = 'none';
      window.skipFrames = 1; // 不跳帧
    }
  });

  // select 改变事件
  skipFrameSelect.addEventListener('change', function () {
    window.skipFrames = parseInt(this.value);
  });
}

// 初始化游戏信息弹窗
function initGameInfoModal() {
  // 游戏信息弹窗容器（隐藏）
  const gameInfoModal = document.createElement('div');
  gameInfoModal.id = 'gameInfoModal';
  gameInfoModal.style.position = 'fixed';
  gameInfoModal.style.left = '50%';
  gameInfoModal.style.top = '50%';
  gameInfoModal.style.transform = 'translate(-50%,-50%)';
  gameInfoModal.style.background = 'rgba(10,10,12,0.96)';
  gameInfoModal.style.color = '#fff';
  gameInfoModal.style.padding = '12px';
  gameInfoModal.style.borderRadius = '8px';
  gameInfoModal.style.zIndex = '20000';
  gameInfoModal.style.display = 'none';
  gameInfoModal.style.minWidth = '320px';
  gameInfoModal.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong>游戏信息</strong><button id="closeGameInfoBtn">关闭</button></div><div id="gameInfoContent" style="font-family:monospace;font-size:13px;line-height:1.4;max-height:60vh;overflow:auto;"></div>';
  document.body.appendChild(gameInfoModal);

  document.getElementById('openGameInfoBtn').addEventListener('click', function () {
    // 填充内容由 dbmain.js 提供全局函数 fillGameInfo
    if (typeof window.fillGameInfo === 'function') {
      window.fillGameInfo(document.getElementById('gameInfoContent'));
    }
    gameInfoModal.style.display = 'block';
  });
  document.getElementById('closeGameInfoBtn').addEventListener('click', function () {
    gameInfoModal.style.display = 'none';
  });
}

// 初始化渲染后端切换
function initRenderBackendSwitch() {
  // 渲染后端切换：用户手动切换时保存并强制刷新页面（页面初始化从 localStorage 读取不触发刷新）
  (function () {
    const rb2d = document.getElementById('rb2d');
    const rbwebgl = document.getElementById('rbwebgl');
    function onRenderBackendChange(e) {
      const val = e.target.value;
      try { localStorage.setItem('renderBackend', val); } catch (err) {}
      // 立刻强制刷新，让新的后端在初始化流程中生效
      // 加一个短延迟以保证本次事件处理完成
      setTimeout(() => {
        location.reload();
      }, 50);
    }
    if (rb2d) rb2d.addEventListener('change', onRenderBackendChange);
    if (rbwebgl) rbwebgl.addEventListener('change', onRenderBackendChange);
  })();
}

// 初始化菜单交互
function initMenuInteractions() {
  var groups = Array.prototype.slice.call(document.querySelectorAll('.menu-group'));
  groups.forEach(function (group) {
    var toggle = group.querySelector('.menu-group-toggle');
    var content = group.querySelector('.group-content');
    if (!toggle || !content) return;

    toggle.addEventListener('click', function () {
      var isOpen = group.classList.contains('open');

      groups.forEach(function (other) {
        if (other === group) return;
        other.classList.remove('open');
        var otherToggle = other.querySelector('.menu-group-toggle');
        var otherContent = other.querySelector('.group-content');
        if (otherToggle) otherToggle.setAttribute('aria-expanded', 'false');
        if (otherContent) otherContent.hidden = true;
      });

      if (isOpen) {
        group.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        content.hidden = true;
      } else {
        group.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
        content.hidden = false;
        var firstInteractive = content.querySelector('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
        if (firstInteractive && typeof firstInteractive.focus === 'function') {
          try {
            firstInteractive.focus({ preventScroll: true });
          } catch (err) {
            try { firstInteractive.focus(); } catch (err2) {}
          }
        }
      }
    });
  });
}

// 调试面板显示/隐藏逻辑
function initDebugPanelLogic() {
  document.getElementById('debugPanelBtn').onclick = function () {
    var wrapper = document.getElementById('wrapper');
    // ROM未加载时禁止显示调试器
    if (!loaded) {
      log("请载入游戏后再使用调试功能!", "debug");
      wrapper.style.display = 'none';
      return;
    }
    if (wrapper.style.display === 'none' || wrapper.style.display === '') {
      wrapper.style.display = 'block';
      // 初始化信息表格
      if (typeof window.initInfoTables === 'function') {
        window.initInfoTables();
      }
    } else {
      wrapper.style.display = 'none';
    }
  };
}

// 初始化所有UI事件
function initUIEvents() {
  initStatusBar();
  initAudioSettings();
  initSkipFrameSettings();
  initGameInfoModal();
  initRenderBackendSwitch();
  initMenuInteractions();
  initDebugPanelLogic();
}
