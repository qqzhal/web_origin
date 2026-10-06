// 默认NES按键映射
const defaultKeyMap = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  select: 'g',
  start: 'h',
  b: 'k',
  a: 'l'
};
const defaultKeyMap2 = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  select: '7',
  start: '8',
  b: '4',
  a: '5'
};

// 支持两个玩家
let keyMap = {
  1: { ...defaultKeyMap },
  2: { ...defaultKeyMap2 }
};

// 通用功能键（不区分1P/2P）
let commonKeyMap = {
  save: '1',
  load: '2',
  savemeu: '3',
  softreset: 'f1',
  hardreset: 'f2',
  pause: 'p',
  turbo: ' '
};

// NES按钮名到INPUT编号映射
const nesButtonMap = {
  a: 'A',
  b: 'B',
  select: 'SELECT',
  start: 'START',
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT'
};

let keyEventBound = false;

// 获取当前 NES 实例（兼容 main/debugger/nsf 等页面）
function getActiveNesInstance() {
  if (window.nes && typeof window.nes.setButtonPressed === 'function') {
    return window.nes;
  }
  if (window.db && window.db.nes && typeof window.db.nes.setButtonPressed === 'function') {
    return window.db.nes;
  }
  if (window.dbg && window.dbg.nes && typeof window.dbg.nes.setButtonPressed === 'function') {
    return window.dbg.nes;
  }
  if (window.Debugger && window.Debugger.prototype && window.Debugger.prototype.nes && typeof window.Debugger.prototype.nes.setButtonPressed === 'function') {
    return window.Debugger.prototype.nes;
  }
  return null;
}

// 绑定事件时，先移除之前的监听，防止多次绑定或冲突
function bindKeyEvents() {
  // 先移除之前的监听，防止多次绑定
  window.removeEventListener('keydown', window._nes_keydown_handler, true);
  window.removeEventListener('keyup', window._nes_keyup_handler, true);

  if (keyEventBound) return;
  keyEventBound = true;

  function isInputActive() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable;
  }

  window._nes_keydown_handler = function (e) {
    if (isInputActive()) return;

    const nes = getActiveNesInstance();
    if (!nes || typeof nes.setButtonPressed !== 'function' || !nes.INPUT) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();

    // 通用功能键
    if (key === commonKeyMap.save) {

      if (loaded && nes.getState) {
        save_State();
      }
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.savemeu) {

      if (loaded) {
        el("saveManagerBtn").click();
      }
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.load) {

      if (loaded && nes.setState) {
        load_State();
      }
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.softreset) {
      if (window.nes) window.nes.reset(false);
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.hardreset) {
      if (window.nes) window.nes.reset(true);
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.pause) {
      el("pauseBtnOverlay").click();
      e.preventDefault();
      return;
    }
    if (key === commonKeyMap.turbo) {
      // 记住按下前的档位，松开时恢复（否则会把 +/- 设好的档位归 1）
      if (!e.repeat) window._turboBeforeHold = window.turboSpeed || 1;
      if (window.setTurboSpeed) window.setTurboSpeed(true);
      e.preventDefault();
      return;
    }

    for (let player = 1; player <= 2; player++) {
      for (let k in keyMap[player]) {
        if (key && key === keyMap[player][k]) {
          const btn = nesButtonMap[k];
          if (btn !== undefined && nes.INPUT[btn] !== undefined) {
            nes.setButtonPressed(player, nes.INPUT[btn]);
            e.preventDefault();
            break; // 只触发第一个
          }
        }
      }
    }
  };
  window._nes_keyup_handler = function (e) {
    if (isInputActive()) return;

    const nes = getActiveNesInstance();
    if (!nes || typeof nes.setButtonReleased !== 'function' || !nes.INPUT) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();

    // turbo松开
    if (key === commonKeyMap.turbo) {
      if (window.setTurboSpeed) {
        const restore = (typeof window._turboBeforeHold === 'number') ? window._turboBeforeHold : 1;
        window.setTurboSpeed(restore);
        const lbl = document.querySelector('#turboBtnOverlay .toolbar-label');
        if (lbl) lbl.textContent = restore + 'X';
      }
      e.preventDefault();
      return;
    }
    for (let player = 1; player <= 2; player++) {
      for (let k in keyMap[player]) {
        if (key && key === keyMap[player][k]) {
          const btn = nesButtonMap[k];
          if (btn !== undefined && nes.INPUT[btn] !== undefined) {
            nes.setButtonReleased(player, nes.INPUT[btn]);
            e.preventDefault();
            break; // 只触发第一个
          }
        }
      }
    }
  };

  window.addEventListener('keydown', window._nes_keydown_handler, true);
  window.addEventListener('keyup', window._nes_keyup_handler, true);
}

bindKeyEvents();

// 判断是否为移动端
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 页面加载/窗口变化/全屏切换时自动布局并渲染透明按钮
function autoRenderTransparentOverlay() {
  if (window.renderTransparentOverlay) window.renderTransparentOverlay(false);
}
window.addEventListener('DOMContentLoaded', function () {
  let btn = document.getElementById('controllerBtn');
  if (btn) btn.onclick = showControllerDialog;
  if (isMobileDevice()) {
    autoRenderTransparentOverlay();
  }
  window.addEventListener('resize', autoRenderTransparentOverlay);
});
