// 【自定义扩展】
// 快速存/读/槽 悬浮按钮（quickbar）
// 复用 dbmain.js 的 save_State/load_State（读写 window.currentSaveSlot 指向的槽位）。
// 「存」「读」按钮下方显示当前快捷键（来自 controller.js 的 commonKeyMap.save/load，
// 用户在按键设置里改键后标签会自动跟随），槽按钮左键下一槽、右键上一槽。
// 显隐不按设备 UA 判断，而是按"屏幕是否放得下"：画布右侧有空位就显示；
// 没空位时视口宽度需 >= MIN_VIEWPORT_WIDTH（与 dstyle.css 的移动端断点一致）。
// 当虚拟按键（透明按钮）存在时，quickbar 默认折叠为右上角的小按钮，点击展开/收起。
(function () {
  const SLOT_COUNT = 20;               // 与 savemanager.js 初始化的槽位数一致
  const BAR_WIDTH = 46 + 10;           // 按钮宽 + 右边距，用于计算是否放得下
  const MIN_VIEWPORT_WIDTH = 768;

  const style = document.createElement('style');
  style.textContent = `
    #quickSaveBar {
      position: fixed;
      right: 6px; /* 6px + 4px padding，按钮距屏幕右缘仍为 10px */
      top: 50%;
      transform: translateY(-50%);
      display: none;
      flex-direction: column;
      gap: 10px;
      /* hover 时按钮 scale(1.06) 会视觉溢出约 1.4px，padding 把溢出兜在容器内，
         否则 overflow-y:auto 的容器会闪出滚动条 */
      padding: 4px;
      box-sizing: border-box;
      z-index: 10060;
      max-height: calc(100vh - 88px); /* 原 96px 预留，扣除新加的上下 padding 8px */
      overflow-y: auto;
      overscroll-behavior: contain;
      user-select: none;
      -webkit-user-select: none;
    }
    #quickSaveBar.qk-mobile-horizontal {
      right: 68px;
      top: 8px;
      transform: none;
      flex-direction: row-reverse;
      max-width: calc(100vw - 78px);
      max-height: none;
      overflow-x: auto;
      overflow-y: visible;
      padding: 2px;
      box-sizing: border-box;
      -webkit-overflow-scrolling: touch;
    }
    #quickBarToggle {
      position: fixed;
      right: 10px;
      top: 8px;
      width: 48px;
      height: 48px;
      box-sizing: border-box;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 8px;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.36);
      z-index: 10061;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    #quickBarToggle:hover,
    #quickBarToggle:focus-visible,
    #quickBarToggle.active {
      background: rgba(255, 255, 255, 0.22);
      border-color: rgba(255, 255, 255, 0.45);
    }
    #quickBarToggle:active { transform: scale(0.94); }
    #quickBarToggle .qk-toggle-label { pointer-events: none; }
    #quickSaveBar .qk-btn {
      width: 46px;
      height: 46px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(20, 20, 20, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 10px;
      color: #fff;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.36);
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
    }
    #quickSaveBar .qk-btn:hover { background: rgba(60, 60, 60, 0.85); transform: scale(1.06); }
    #quickSaveBar .qk-btn:active { transform: scale(0.94); }
    #quickSaveBar .qk-char { font-size: 15px; font-weight: 700; line-height: 1; pointer-events: none; }
    #quickSaveBar .qk-sub { font-size: 13px; font-weight: 700; line-height: 1; color: #ffd54a; margin-top: 3px; pointer-events: none; }
    #quickSaveBar .qk-btn.qk-flash-save { background: rgba(46, 204, 113, 0.9); border-color: #2ecc71; }
    #quickSaveBar .qk-btn.qk-flash-load { background: rgba(52, 152, 219, 0.9); border-color: #3498db; }
    #quickSaveBar .qk-btn.qk-flash-slot { background: rgba(255, 213, 74, 0.35); border-color: #ffd54a; }
    #quickSaveBar .qk-btn.qk-busy { opacity: 0.55; cursor: progress; animation: qk-pulse 1s ease-in-out infinite; }
    @keyframes qk-pulse { 50% { border-color: #fff; } }
    #quickSaveBar .qk-btn.qk-fs-active { background: rgba(52, 152, 219, 0.85); border-color: #3498db; }
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'quickSaveBar';
  bar.innerHTML = `
    <div class="qk-btn" id="qkSaveBtn" title="快速存档到当前槽位"><span class="qk-char">存</span><span class="qk-sub" id="qkSaveKey">1</span></div>
    <div class="qk-btn" id="qkLoadBtn" title="快速读取当前槽位"><span class="qk-char">读</span><span class="qk-sub" id="qkLoadKey">2</span></div>
    <div class="qk-btn" id="qkSlotBtn"><span class="qk-char">槽</span><span class="qk-sub" id="qkSlotNum">0</span></div>
    <div class="qk-btn" id="qkCloudUpBtn" title="上传全部存档到云端（地址在 /server/ 页面设置）"><span class="qk-char">传</span></div>
    <div class="qk-btn" id="qkCloudDownBtn" title="从云端下载存档，覆盖本地全部存档（地址在 /server/ 页面设置）"><span class="qk-char">取</span></div>
    <div class="qk-btn" id="qkCt2Btn" title="天使之翼2专用金手指"><span class="qk-char">翼</span></div>
    <div class="qk-btn" id="qkFsBtn" title="进入全屏（隐藏浏览器地址栏）"><span class="qk-char">屏</span></div>
  `;
  (document.getElementById('fullscreenContainer') || document.body).appendChild(bar);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'quickBarToggle';
  toggleBtn.type = 'button';
  toggleBtn.title = '展开快速存档按钮';
  toggleBtn.setAttribute('aria-label', '展开快速存档按钮');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.innerHTML = '<span class="qk-toggle-label">档</span>';
  (document.getElementById('fullscreenContainer') || document.body).appendChild(toggleBtn);

  const saveBtn = bar.querySelector('#qkSaveBtn');
  const loadBtn = bar.querySelector('#qkLoadBtn');
  const slotBtn = bar.querySelector('#qkSlotBtn');
  const slotNum = bar.querySelector('#qkSlotNum');
  const cloudUpBtn = bar.querySelector('#qkCloudUpBtn');
  const cloudDownBtn = bar.querySelector('#qkCloudDownBtn');
  const ct2Btn = bar.querySelector('#qkCt2Btn');
  const fsBtn = bar.querySelector('#qkFsBtn');

  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 450);
  }

  function updateSlotBadge(slot) {
    const s = (slot === undefined || slot === null || isNaN(Number(slot))) ? 0 : Number(slot);
    slotNum.textContent = s;
    slotBtn.title = `切换快速存档槽（左键下一槽，右键上一槽），当前槽位: ${s}`;
  }

  // 快捷键标签跟随按键设置（commonKeyMap 可被按键设置对话框整体替换）
  function formatKeyLabel(v) {
    if (typeof v !== 'string' || !v.trim()) return '—';
    return v.toUpperCase();
  }

  let lastKeyLabel = '';
  function refreshKeyLabels() {
    let saveKey = '', loadKey = '';
    try {
      const ckm = (typeof commonKeyMap !== 'undefined') ? commonKeyMap : {};
      saveKey = ckm.save || '';
      loadKey = ckm.load || '';
    } catch (e) { /* ignore */ }
    const sig = saveKey + '|' + loadKey;
    if (sig === lastKeyLabel) return;
    lastKeyLabel = sig;
    document.getElementById('qkSaveKey').textContent = formatKeyLabel(saveKey);
    document.getElementById('qkLoadKey').textContent = formatKeyLabel(loadKey);
    saveBtn.title = `快速存档到当前槽位（快捷键 ${formatKeyLabel(saveKey)}）`;
    loadBtn.title = `快速读取当前槽位（快捷键 ${formatKeyLabel(loadKey)}）`;
  }

  // 存档管理器里切换卡槽也会走 setDefaultSlot，包装一层让徽标保持同步
  if (window.SaveManager && typeof window.SaveManager.setDefaultSlot === 'function') {
    const origSetDefaultSlot = window.SaveManager.setDefaultSlot;
    window.SaveManager.setDefaultSlot = function (slot, callback) {
      updateSlotBadge(slot);
      return origSetDefaultSlot.call(window.SaveManager, slot, callback);
    };
  }

  function doQuickSave() {
    if (!window.loaded) { log('未载入游戏，无法存档', 'save'); return; }
    if (typeof save_State !== 'function') return;
    save_State();
    flash(saveBtn, 'qk-flash-save');
  }

  function doQuickLoad() {
    if (!window.loaded) { log('未载入游戏，无法读档', 'save'); return; }
    if (typeof load_State !== 'function') return;
    load_State();
    flash(loadBtn, 'qk-flash-load');
  }

  function cycleSlot(dir) {
    let cur = parseInt(window.currentSaveSlot, 10);
    if (isNaN(cur) || cur < 0) cur = 0;
    const next = (cur + dir + SLOT_COUNT) % SLOT_COUNT;
    window.currentSaveSlot = next;
    if (window.SaveManager && typeof window.SaveManager.setDefaultSlot === 'function') {
      window.SaveManager.setDefaultSlot(next, function (err) {
        if (err) console.error('保存默认卡槽失败', err);
      });
    } else {
      updateSlotBadge(next);
    }
    flash(slotBtn, 'qk-flash-slot');
    log('快速存档槽已切换为 ' + next, 'save');
  }

  saveBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); doQuickSave(); };
  loadBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); doQuickLoad(); };
  slotBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); cycleSlot(1); };
  slotBtn.oncontextmenu = function (e) { e.preventDefault(); e.stopPropagation(); cycleSlot(-1); };
  cloudUpBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); syncToCloud(); };
  cloudDownBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); syncFromCloud(); };
  // 复用菜单里"天使之翼2专用金手指"按钮的处理逻辑（cheats.js 绑定），保证行为一致
  ct2Btn.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const srcBtn = document.getElementById('ct2cheat');
    if (srcBtn && typeof srcBtn.onclick === 'function') srcBtn.onclick();
    else log('当前页面没有天使之翼2专用金手指功能', 'save');
  };

  // ---------- 全屏切换：手机 Chrome 没有全屏入口，用 Fullscreen API 提供 ----------
  // 与菜单全屏按钮（control.js）一致对 #fullscreenContainer 全屏，
  // 进入后 body.fullscreen 类的联动（重排透明按钮等）由 control.js 的监听器自动处理
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.mozFullScreenElement || document.msFullscreenElement);
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen ||
                   document.mozCancelFullScreen || document.msExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    const target = document.getElementById('fullscreenContainer') || document.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen ||
                target.mozRequestFullScreen || target.msRequestFullscreen;
    if (!req) { log('当前浏览器不支持网页全屏 API', 'default'); return; }
    const ret = req.call(target);
    // 未加前缀的 requestFullscreen 返回 Promise，被浏览器/用户拒绝时提示
    if (ret && typeof ret.catch === 'function') {
      ret.catch(function () { log('进入全屏被浏览器拒绝', 'default'); });
    }
  }

  function refreshFsBtnState() {
    const on = isFullscreen();
    fsBtn.classList.toggle('qk-fs-active', on);
    fsBtn.title = on ? '退出全屏' : '进入全屏（隐藏浏览器地址栏）';
  }
  document.addEventListener('fullscreenchange', refreshFsBtnState);
  document.addEventListener('webkitfullscreenchange', refreshFsBtnState);

  fsBtn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); };

  // ---------- 云同步：与 /server/ 页面相同的全量上传 / 下载 ----------
  // 接口地址由 /server/ 页面写入 localStorage.cloudSyncUrl（留空用默认）；.env 设了 SYNC_TOKEN 时把令牌放在 localStorage.syncToken
  const CLOUD_API = (function () { try { return localStorage.getItem('cloudSyncUrl') || '../server/index.php'; } catch (e) { return '../server/index.php'; } })();
  const CLOUD_BATCH = 3;
  const CLOUD_DB = 'NesSaveDB', CLOUD_STORE = 'saveSlots';
  let syncing = false;

  // 上传时跳过自动存档（键为 "-1_游戏名"）；下载仍为服务器内容全量覆盖本地。想连自动存档一起上传，把下面过滤条件里的 !isAutoSave 去掉即可
  function isAutoSave(slot) { return typeof slot === 'string' && slot.indexOf('-1_') === 0; }

  function cloudApi(action, method, body) {
    const opt = { method: method || 'GET', headers: {} };
    try { const tok = localStorage.getItem('syncToken'); if (tok) opt.headers['X-Sync-Token'] = tok; } catch (e) { /* ignore */ }
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(CLOUD_API + '?action=' + action, opt).then(function (r) {
      return r.text().then(function (t) {
        let j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('服务器返回非 JSON（HTTP ' + r.status + '）'); }
        if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function setSyncing(on) {
    syncing = on;
    cloudUpBtn.classList.toggle('qk-busy', on);
    cloudDownBtn.classList.toggle('qk-busy', on);
  }

  function cleanItem(it) {
    return {
      slot: String(it.slot), romName: it.romName || '', timestamp: it.timestamp || '', screenshot: it.screenshot || '',
      saveState: it.saveState == null ? null : it.saveState, customMusicState: it.customMusicState == null ? null : it.customMusicState
    };
  }

  function syncToCloud() {
    if (syncing) return;
    if (!window.SaveManager || typeof window.SaveManager.getAllSaveSlots !== 'function') return;
    setSyncing(true);
    window.SaveManager.getAllSaveSlots(function (err, all) {
      if (err) { setSyncing(false); log('云同步：读取本地存档失败', 'save'); return; }
      const items = (all || []).filter(function (it) { return it && it.saveState && !isAutoSave(it.slot); }).map(cleanItem);//不提交自动存档
      //const items = (all || []).filter(function (it) { return it && it.saveState; }).map(cleanItem);//自动存档也提交
      if (!items.length) { setSyncing(false); log('云同步：本地没有可上传的存档（自动存档不参与同步）', 'save'); return; }
      const slots = items.map(function (it) { return it.slot; });
      let i = 0, last = null;
      log('云同步：开始上传 ' + items.length + ' 条存档...', 'save');
      function next() {
        if (i >= items.length) {
          setSyncing(false);
          flash(cloudUpBtn, 'qk-flash-save');
          log('云同步：上传完成，服务器现有 ' + last.total + ' 条（清理 ' + last.deleted + ' 条）', 'save');
          return;
        }
        const batch = items.slice(i, i + CLOUD_BATCH);
        const isFinal = i + CLOUD_BATCH >= items.length;
        cloudApi('upload', 'POST', isFinal ? { items: batch, slots: slots, final: true } : { items: batch })
          .then(function (r) { last = r; i += CLOUD_BATCH; log('云同步：上传中 ' + Math.min(i, items.length) + '/' + items.length, 'save'); next(); })
          .catch(function (e) { setSyncing(false); log('云同步：上传失败 ' + e.message, 'save'); });
      }
      next();
    });
  }

  function replaceLocalSaves(items) {
    return new Promise(function (res, rej) {
      const req = indexedDB.open(CLOUD_DB);   // 不传版本号：沿用现有版本，不触发升级
      req.onerror = function () { rej(req.error); };
      req.onsuccess = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(CLOUD_STORE)) { db.close(); rej(new Error('本地还没有存档库，请先存一次档')); return; }
        const tx = db.transaction(CLOUD_STORE, 'readwrite');
        const store = tx.objectStore(CLOUD_STORE);
        store.clear();
        items.forEach(function (it) {
          store.put({ slot: it.slot, romName: it.romName || '', timestamp: it.timestamp || '', screenshot: it.screenshot || '', saveState: it.saveState, customMusicState: it.customMusicState || null });
        });
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = function () { db.close(); rej(tx.error); };
        tx.onabort = function () { db.close(); rej(tx.error || new Error('事务中止')); };
      };
    });
  }

  function syncFromCloud() {
    if (syncing) return;
    if (!confirm('从云端下载会覆盖本浏览器里模拟器的全部存档（不影响正在运行的游戏），继续？')) return;
    setSyncing(true);
    log('云同步：正在下载...', 'save');
    cloudApi('download').then(function (r) {
      const items = r.items || [];
      if (!items.length) { setSyncing(false); log('云同步：服务器上还没有存档', 'save'); return; }
      return replaceLocalSaves(items).then(function () {
        setSyncing(false);
        if (window.SaveManager && typeof SaveManager.clearCache === 'function') {
          SaveManager.clearCache();
        }
        flash(cloudDownBtn, 'qk-flash-load');
        log('云同步：已下载 ' + items.length + ' 条存档到本地', 'save');
        if (window.SaveManagerUI && typeof window.SaveManagerUI.refresh === 'function') {
          try { window.SaveManagerUI.refresh(); } catch (e) { /* ignore */ }
        }
      });
    }).catch(function (e) { setSyncing(false); log('云同步：下载失败 ' + e.message, 'save'); });
  }

  // ---------- 显隐：按空间判断；虚拟按键存在时默认折叠到右上角按钮 ----------
  function quickBarFits() {
    const output = document.getElementById('output');
    if (output && output.offsetWidth > 0) {
      const rect = output.getBoundingClientRect();
      if (window.innerWidth - rect.right >= BAR_WIDTH) return true;
    }
    return window.innerWidth >= MIN_VIEWPORT_WIDTH;
  }

  // 判断虚拟按键是否实际存在（兼容用户通过“触屏按钮”手动开关）
  function hasVirtualButtons() {
    if (window.joyButtonsVisible !== true) return false;
    const overlay = document.getElementById('transparentOverlay');
    // 已开启虚拟按键、但首次渲染还没完成时，先按“存在”处理，避免 quickbar 闪一下
    if (!overlay) return true;
    const btn = overlay.querySelector('.transparent-button');
    return !btn || btn.offsetWidth > 0;
  }

  let quickBarCollapsed = false;
  let quickBarUserToggled = false;

  function isMobileLayout() {
    return Math.min(window.innerWidth, window.innerHeight) <= 768;
  }

  // 非电脑端（手机/平板）判断，优先复用 controller.js 的 isMobileDevice()
  function isMobileLikeDevice() {
    try {
      if (typeof isMobileDevice === 'function') return isMobileDevice();
    } catch (e) { /* ignore */ }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  // statusBar 在 HTML 里默认 display:none：手机端首帧不再闪现提示条，
  // 桌面端由本同步脚本（body 底部，先于首帧渲染执行）恢复显示。
  // 只恢复一次：之后 initStatusBar 的 15 秒自动隐藏 / 手动关闭不会被周期任务顶回。
  let statusBarRestored = false;
  function syncStatusBarVisibility() {
    if (statusBarRestored) return;
    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;
    statusBarRestored = true;
    if (!isMobileLikeDevice()) statusBar.style.display = 'flex';
  }

  syncStatusBarVisibility();

  function updateToggleState() {
    const expanded = !quickBarCollapsed;
    toggleBtn.classList.toggle('active', expanded);
    const label = expanded ? '收起快速存档按钮' : '展开快速存档按钮';
    toggleBtn.title = label;
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  // 顶部状态栏未隐藏时，把按钮放在状态栏下方，避免挡住右侧关闭按钮
  function updateTogglePosition() {
    const statusBar = document.getElementById('statusBar');
    const statusBarVisible = !!(statusBar && statusBar.offsetHeight > 0);
    toggleBtn.style.top = (statusBarVisible ? statusBar.offsetHeight + 8 : 8) + 'px';
  }

  function updateQuickBarVisibility() {
    syncStatusBarVisibility();
    const hasVirtual = hasVirtualButtons();

    // 用户没有手动切换过时，跟随虚拟按键状态：有虚拟按键默认折叠
    if (!quickBarUserToggled) quickBarCollapsed = hasVirtual;

    if (hasVirtual) {
      // 有虚拟按键时，即使原来看“放不下”，也保留右上角按钮，保证还能展开 quickbar
      toggleBtn.style.display = 'flex';
      // 手机端从右上角往左水平展开，桌面端仍保持右侧竖排
      bar.classList.toggle('qk-mobile-horizontal', isMobileLayout());
      bar.style.display = quickBarCollapsed ? 'none' : 'flex';
    } else {
      toggleBtn.style.display = 'none';
      bar.classList.remove('qk-mobile-horizontal');
      bar.style.display = quickBarFits() ? 'flex' : 'none';
    }

    updateTogglePosition();
    updateToggleState();
  }

  let pendingTimer = 0;
  function scheduleVisibilityUpdate() {
    if (pendingTimer) return;
    // 用 setTimeout 而不是 requestAnimationFrame：页面在后台时 rAF 会被挂起
    pendingTimer = setTimeout(function () {
      pendingTimer = 0;
      updateQuickBarVisibility();
    }, 0);
  }

  toggleBtn.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    quickBarCollapsed = !quickBarCollapsed;
    quickBarUserToggled = true;
    updateQuickBarVisibility();
  };

  // gamepad.js 切换虚拟按键时会调用它；包装后让折叠状态立即跟随
  if (typeof window.renderTransparentOverlay === 'function' && !window.renderTransparentOverlay.__quickBarWrapped) {
    const origRenderTransparentOverlay = window.renderTransparentOverlay;
    const wrappedRenderTransparentOverlay = function () {
      const ret = origRenderTransparentOverlay.apply(this, arguments);
      scheduleVisibilityUpdate();
      return ret;
    };
    wrappedRenderTransparentOverlay.__quickBarWrapped = true;
    window.renderTransparentOverlay = wrappedRenderTransparentOverlay;
  }

  window.addEventListener('resize', scheduleVisibilityUpdate);
  window.addEventListener('orientationchange', scheduleVisibilityUpdate);
  document.addEventListener('fullscreenchange', scheduleVisibilityUpdate);

  // 画布尺寸由 JS 控制（载入 ROM、裁剪 240、缩放模式等都会改），监听它而不是只监听窗口
  if (typeof ResizeObserver === 'function') {
    const output = document.getElementById('output');
    if (output) new ResizeObserver(scheduleVisibilityUpdate).observe(output);
  }

  // ---------- 加速档位：小键盘 + / - 升降档（档位与工具栏加速按钮一致：1 / 1.5 / 2） ----------
  const TURBO_LEVELS = [1, 1.5, 2];

  function stepTurbo(dir) {
    if (typeof window.setTurboSpeed !== 'function') return;
    const cur = Number(window.turboSpeed) || 1;
    let idx = TURBO_LEVELS.indexOf(cur);
    if (idx < 0) { idx = TURBO_LEVELS.findIndex(function (v) { return v >= cur; }); if (idx < 0) idx = TURBO_LEVELS.length - 1; }
    const nextIdx = Math.max(0, Math.min(TURBO_LEVELS.length - 1, idx + dir));
    const next = TURBO_LEVELS[nextIdx];
    if (next === cur) { log('加速已是' + (dir > 0 ? '最高' : '最低') + '档 ' + cur + 'X', 'default'); return; }
    window.setTurboSpeed(next);
    const lbl = document.querySelector('#turboBtnOverlay .toolbar-label');
    if (lbl) lbl.textContent = next + 'X';
    log('加速档位：' + next + 'X', 'default');
  }

  function isInputActive() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable;
  }

  // 若用户在按键设置里把 + / - 分配给了手柄或功能键，则让位避免双重触发
  function isKeyReserved(key) {
    try {
      const ckm = (typeof commonKeyMap !== 'undefined') ? commonKeyMap : {};
      for (const k in ckm) if (ckm[k] === key) return true;
      const km = (typeof keyMap !== 'undefined') ? keyMap : {};
      for (const p in km) for (const k in km[p]) if (km[p][k] === key) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (isInputActive()) return;
    let dir = 0;
    if (e.code === 'NumpadAdd' || e.key === '+') dir = 1;
    else if (e.code === 'NumpadSubtract' || e.key === '-') dir = -1;
    if (!dir || isKeyReserved(e.key)) return;
    stepTurbo(dir);
    e.preventDefault();
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    // gamepad.js 的 DOMContentLoaded 监听器先注册，会先把按键设置从配置库加载进 commonKeyMap
    refreshKeyLabels();
    if (window.SaveManager && typeof window.SaveManager.getDefaultSlot === 'function') {
      window.SaveManager.getDefaultSlot(function (err, slot) {
        updateSlotBadge(err ? 0 : slot);
      });
    } else {
      updateSlotBadge(window.currentSaveSlot);
    }
    scheduleVisibilityUpdate();
  });

  // 兜底：按键设置保存后没有事件可监听，定期比对一次（字符串比较，开销可忽略）
  // 同时同步虚拟按键的显隐状态，保证折叠按钮跟随“触屏按钮”开关
  setInterval(function () {
    refreshKeyLabels();
    scheduleVisibilityUpdate();
  }, 1000);

  window.QuickBar = { save: doQuickSave, load: doQuickLoad, cycleSlot: cycleSlot, refresh: scheduleVisibilityUpdate, cloudUpload: syncToCloud, cloudDownload: syncFromCloud, fullscreen: toggleFullscreen, ct2Cheat: function () { ct2Btn.onclick({ preventDefault: function () {}, stopPropagation: function () {} }); } };
})();
