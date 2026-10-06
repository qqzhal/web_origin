// 【自定义扩展】
// 缓存游戏管理（独立模块）。
// 功能：在"文件"菜单"选择游戏文件"上方注入"缓存游戏管理"入口，弹窗内可
//   1) 导入新游戏（.nes/.nsf/.zip）到 IndexedDB(GameSavesDB/RomStore)；
//   2) 删除已缓存游戏；3) 直接游玩某个缓存游戏。
// id 规则：文件名去掉扩展名（如 xxx.nes -> xxx），同名重复导入即覆盖更新；
// name 字段保留完整文件名（loadRom 依赖扩展名识别 zip/nsf，并用作存档键）。
// 移除本模块：删除本文件并去掉 index.html 中对应的 <script> 引用即可，无其他耦合。
(function () {
  'use strict';

  // RomStore 系统保留键（?debug=true 自动加载通道），不展示、不允许删除
  var RESERVED_IDS = ['RomDataToplay', 'RomDataToplay_name'];

  // 随包发布的内置游戏：一键导入入口（.nes 不依赖后缀识别格式，name 直接用干净的名字；
  // zip/nsf 仍需后缀，通用导入逻辑不受影响）
  var BUNDLED_GAME = { id: '天使之翼2', name: '天使之翼2', path: 'roms/origin.nes' };

  // ---------- IndexedDB ----------
  // 与 afunction.js 的 openGameSavesDB 相同策略：不带版本号探测打开；
  // 库已存在但缺 RomStore 时升一版重开强制升级建表。
  function openRomStoreDB() {
    return new Promise(function (resolve, reject) {
      function hook(req) {
        req.onupgradeneeded = function (event) {
          var db = event.target.result;
          if (!db.objectStoreNames.contains('RomStore')) {
            db.createObjectStore('RomStore', { keyPath: 'id' });
          }
        };
        return req;
      }
      var probe = hook(indexedDB.open('GameSavesDB'));
      probe.onsuccess = function (event) {
        var db = event.target.result;
        if (db.objectStoreNames.contains('RomStore')) {
          resolve(db);
          return;
        }
        var next = db.version + 1;
        db.close();
        var req = hook(indexedDB.open('GameSavesDB', next));
        req.onsuccess = function (ev) { resolve(ev.target.result); };
        req.onerror = function () { reject(new Error('IndexedDB 初始化失败')); };
      };
      probe.onerror = function () {
        reject(new Error('IndexedDB 初始化失败'));
      };
    });
  }

  // 遍历 RomStore，返回 [{id, name, size}]（不含保留键，不取 data 避免整库读入内存）
  function listCachedGames() {
    return openRomStoreDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['RomStore'], 'readonly');
        var store = tx.objectStore('RomStore');
        var out = [];
        var req = store.openCursor();
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (!cursor) return;
          var rec = cursor.value;
          if (rec && RESERVED_IDS.indexOf(rec.id) === -1) {
            var size = 0;
            if (rec.data) {
              if (rec.data.byteLength !== undefined) size = rec.data.byteLength;
              else if (rec.data.length !== undefined) size = rec.data.length;
            }
            out.push({ id: rec.id, name: rec.name || rec.id, size: size });
          }
          cursor.continue();
        };
        tx.oncomplete = function () {
          out.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });
          resolve(out);
        };
        tx.onerror = function () { reject(tx.error || new Error('读取缓存列表失败')); };
      });
    });
  }

  function saveCachedGame(id, name, data) {
    return openRomStoreDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['RomStore'], 'readwrite');
        tx.objectStore('RomStore').put({ id: id, name: name, data: data });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('写入缓存失败')); };
      });
    });
  }

  function getCachedGame(id) {
    return openRomStoreDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['RomStore'], 'readonly');
        var req = tx.objectStore('RomStore').get(id);
        tx.oncomplete = function () { resolve(req.result || null); };
        tx.onerror = function () { reject(tx.error || new Error('读取缓存失败')); };
      });
    });
  }

  function deleteCachedGame(id) {
    return openRomStoreDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(['RomStore'], 'readwrite');
        tx.objectStore('RomStore').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('删除缓存失败')); };
      });
    });
  }

  // ---------- 工具 ----------
  function stripExt(name) {
    var i = String(name).lastIndexOf('.');
    return i > 0 ? String(name).slice(0, i) : String(name);
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function closeMenuIfOpen() {
    if (typeof window.closeMenuIfOpen === 'function') {
      window.closeMenuIfOpen();
      return;
    }
    var toggle = document.getElementById('menu-toggle');
    if (toggle && toggle.classList.contains('active')) toggle.click();
  }

  // ---------- 样式（全部内联注入，随模块一起移除） ----------
  var STYLE_CSS = [
    '.cachemgr-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:20029;}',
    '.cachemgr-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);',
    'width:min(460px,94vw);max-height:82vh;display:flex;flex-direction:column;',
    'background:rgba(11,15,20,.98);color:#fff;border-radius:14px;',
    'box-shadow:0 18px 36px rgba(0,0,0,.55);z-index:20030;box-sizing:border-box;padding:16px 18px;}',
    '.cachemgr-dialog *{box-sizing:border-box;}',
    '.cachemgr-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}',
    '.cachemgr-title{font-size:16px;font-weight:700;}',
    '.cachemgr-close{appearance:none;background:rgba(255,255,255,.12);border:none;color:#fff;',
    'width:30px;height:30px;border-radius:50%;font-size:17px;cursor:pointer;line-height:1;}',
    '.cachemgr-close:hover{background:rgba(255,255,255,.28);}',
    '.cachemgr-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;}',
    '.cachemgr-dialog button{appearance:none;background:rgba(255,255,255,.08);color:#fff;',
    'border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:7px 12px;',
    'font-size:13px;cursor:pointer;}',
    '.cachemgr-dialog button:hover{background:rgba(255,255,255,.16);}',
    '.cachemgr-dialog button:disabled{opacity:.5;cursor:default;}',
    '.cachemgr-dialog button.cachemgr-del{border-color:rgba(224,85,85,.55);color:#ff9d9d;}',
    '.cachemgr-dialog button.cachemgr-del:hover{background:rgba(224,85,85,.22);}',
    '.cachemgr-status{font-size:12px;color:#cfd8dc;flex:1;min-width:0;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.cachemgr-status.ok{color:#81c784;}',
    '.cachemgr-status.err{color:#ff9d9d;}',
    '.cachemgr-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}',
    '.cachemgr-item{display:flex;align-items:center;gap:8px;padding:8px 10px;',
    'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;}',
    '.cachemgr-info{flex:1;min-width:0;}',
    '.cachemgr-name{font-size:14px;font-weight:600;word-break:break-all;}',
    '.cachemgr-meta{font-size:11px;color:#9fb0bd;margin-top:2px;word-break:break-all;}',
    '.cachemgr-item button{flex-shrink:0;}',
    '.cachemgr-empty{font-size:13px;color:#9fb0bd;text-align:center;padding:18px 0;}',
    '.cachemgr-tip{font-size:11px;color:#9fb0bd;margin-top:10px;line-height:1.5;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('cachemgr-style')) return;
    var style = document.createElement('style');
    style.id = 'cachemgr-style';
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  // ---------- 弹窗 ----------
  var refs = null; // 弹窗内部元素引用

  function buildDialog() {
    var mask = document.createElement('div');
    mask.className = 'cachemgr-mask';
    mask.style.display = 'none';

    var dlg = document.createElement('div');
    dlg.className = 'cachemgr-dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.style.display = 'none';
    dlg.innerHTML =
      '<div class="cachemgr-header">' +
      '  <span class="cachemgr-title">缓存游戏管理</span>' +
      '  <button type="button" class="cachemgr-close" title="关闭">&times;</button>' +
      '</div>' +
      '<div class="cachemgr-toolbar">' +
      '  <button type="button" class="cachemgr-import">导入游戏</button>' +
      '  <button type="button" class="cachemgr-quick">导入《天使之翼2》</button>' +
      '  <input type="file" class="cachemgr-file" accept=".nes,.nsf,.zip" multiple hidden>' +
      '  <span class="cachemgr-status"></span>' +
      '</div>' +
      '<div class="cachemgr-list"></div>' +
      '<div class="cachemgr-tip">说明：导入时以“文件名去掉扩展名”作为缓存标识，导入同名文件会覆盖更新；' +
      '删除缓存不会影响已保存的存档。</div>';

    document.body.appendChild(mask);
    document.body.appendChild(dlg);

    refs = {
      mask: mask,
      dlg: dlg,
      closeBtn: dlg.querySelector('.cachemgr-close'),
      importBtn: dlg.querySelector('.cachemgr-import'),
      quickBtn: dlg.querySelector('.cachemgr-quick'),
      fileInput: dlg.querySelector('.cachemgr-file'),
      status: dlg.querySelector('.cachemgr-status'),
      list: dlg.querySelector('.cachemgr-list')
    };

    mask.addEventListener('click', closeDialog);
    refs.closeBtn.addEventListener('click', closeDialog);
    refs.importBtn.addEventListener('click', function () {
      refs.fileInput.value = '';
      refs.fileInput.click();
    });
    refs.quickBtn.addEventListener('click', importBundledGame);
    refs.fileInput.addEventListener('change', function () {
      if (refs.fileInput.files && refs.fileInput.files.length) {
        importFiles(refs.fileInput.files);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && refs && refs.dlg.style.display === 'flex') closeDialog();
    });
  }

  function setStatus(text, cls) {
    if (!refs) return;
    refs.status.textContent = text || '';
    refs.status.className = 'cachemgr-status' + (cls ? ' ' + cls : '');
  }

  function openDialog() {
    closeMenuIfOpen();
    if (!refs) buildDialog();
    injectStyles();
    refs.mask.style.display = 'block';
    refs.dlg.style.display = 'flex';
    setStatus('');
    refreshList();
  }

  function closeDialog() {
    if (!refs) return;
    refs.mask.style.display = 'none';
    refs.dlg.style.display = 'none';
  }

  function refreshList() {
    if (!refs) return;
    refs.list.innerHTML = '<div class="cachemgr-empty">正在读取缓存列表...</div>';
    listCachedGames().then(function (games) {
      if (!refs) return;
      refs.list.innerHTML = '';
      if (!games.length) {
        var empty = document.createElement('div');
        empty.className = 'cachemgr-empty';
        empty.textContent = '暂无缓存游戏，点击上方“导入游戏”添加';
        refs.list.appendChild(empty);
        return;
      }
      games.forEach(function (g) {
        refs.list.appendChild(buildItem(g));
      });
    }).catch(function (err) {
      refs.list.innerHTML = '';
      setStatus('读取缓存列表失败: ' + (err && err.message ? err.message : err), 'err');
    });
  }

  function buildItem(g) {
    var item = document.createElement('div');
    item.className = 'cachemgr-item';

    var info = document.createElement('div');
    info.className = 'cachemgr-info';
    var nameEl = document.createElement('div');
    nameEl.className = 'cachemgr-name';
    nameEl.textContent = stripExt(g.name);
    var metaEl = document.createElement('div');
    metaEl.className = 'cachemgr-meta';
    metaEl.textContent = formatSize(g.size) + ' · id: ' + g.id;
    info.appendChild(nameEl);
    info.appendChild(metaEl);

    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.textContent = '玩';
    playBtn.title = '开始游玩';
    playBtn.addEventListener('click', function () { playGame(g.id, playBtn); });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cachemgr-del';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', function () {
      if (!confirm('确定删除缓存游戏「' + stripExt(g.name) + '」吗？')) return;
      delBtn.disabled = true;
      deleteCachedGame(g.id).then(function () {
        setStatus('已删除: ' + stripExt(g.name), 'ok');
        refreshList();
      }).catch(function (err) {
        delBtn.disabled = false;
        setStatus('删除失败: ' + (err && err.message ? err.message : err), 'err');
      });
    });

    item.appendChild(info);
    item.appendChild(playBtn);
    item.appendChild(delBtn);
    return item;
  }

  function playGame(id, btn) {
    getCachedGame(id).then(function (rec) {
      if (!rec || !rec.data) {
        setStatus('缓存数据缺失，无法加载', 'err');
        return;
      }
      var data = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
      var name = rec.name || id;
      if (btn) btn.disabled = true;
      window.currentGameFileName = name;
      if (typeof audioHandler !== 'undefined' && audioHandler && typeof audioHandler.resume === 'function') {
        audioHandler.resume();
      }
      if (window.loadRom) {
        window.loadRom(data, name);
      } else if (window.db && typeof window.db.loadRom === 'function') {
        window.db.loadRom(data, name);
      }
      document.title = name;
      closeDialog();
      if (btn) btn.disabled = false;
    }).catch(function (err) {
      setStatus('加载失败: ' + (err && err.message ? err.message : err), 'err');
      if (btn) btn.disabled = false;
    });
  }

  // ---------- 导入 ----------
  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    var index = 0;
    var okCount = 0;
    if (!files.length) return;
    refs.importBtn.disabled = true;

    function fail(msg) {
      refs.importBtn.disabled = false;
      setStatus(msg, 'err');
    }

    function next() {
      if (index >= files.length) {
        refs.importBtn.disabled = false;
        setStatus('导入完成：' + okCount + '/' + files.length + ' 个游戏', 'ok');
        refreshList();
        return;
      }
      var file = files[index];
      setStatus('正在导入 ' + (index + 1) + '/' + files.length + '：' + file.name + ' ...');
      var reader = new FileReader();
      reader.onload = function (evt) {
        var data = new Uint8Array(evt.target.result);
        saveCachedGame(stripExt(file.name), file.name, data).then(function () {
          okCount++;
          index++;
          next();
        }).catch(function (err) {
          fail('导入失败: ' + file.name + ' (' + (err && err.message ? err.message : err) + ')');
        });
      };
      reader.onerror = function () {
        fail('读取文件失败: ' + file.name);
      };
      reader.readAsArrayBuffer(file);
    }

    next();
  }

  // 一键导入随包发布的内置游戏（roms/origin.nes），同 id 重复点击即覆盖更新
  function importBundledGame() {
    if (refs.quickBtn.disabled) return;
    refs.quickBtn.disabled = true;
    setStatus('正在导入《天使之翼2》...');
    fetch(BUNDLED_GAME.path)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        return saveCachedGame(BUNDLED_GAME.id, BUNDLED_GAME.name, new Uint8Array(buf));
      })
      .then(function () {
        setStatus('《天使之翼2》导入完成', 'ok');
        refreshList();
      })
      .catch(function (err) {
        setStatus('导入《天使之翼2》失败: ' + (err && err.message ? err.message : err), 'err');
      })
      .then(function () {
        refs.quickBtn.disabled = false;
      });
  }

  // ---------- 菜单入口注入 ----------
  function ensureMenuButton() {
    if (document.getElementById('cacheMgrBtn')) return;

    var romUpload = document.getElementById('romUpload');
    var groupContent = romUpload
      ? romUpload.parentNode
      : document.querySelector('#menu-dropdown .menu-group .group-content');
    if (!groupContent) return; // 菜单结构变化时静默退出，不影响页面

    var row = document.createElement('div');
    row.className = 'row';
    // 与下方"选择游戏文件"上传区留出间隙（.row + .row 规则覆盖不到非 row 的上传区）
    row.style.marginBottom = '10px';
    var btn = document.createElement('button');
    btn.id = 'cacheMgrBtn';
    btn.type = 'button';
    btn.textContent = '缓存游戏管理';
    btn.addEventListener('click', openDialog);
    row.appendChild(btn);

    if (romUpload) {
      groupContent.insertBefore(row, romUpload); // "选择游戏文件"上方
    } else {
      groupContent.insertBefore(row, groupContent.firstChild);
    }
  }

  function init() {
    if (typeof indexedDB === 'undefined') return;
    injectStyles();
    ensureMenuButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
