// 恢复自定义音乐状态的全局函数
// 不再强制 enableCustomMusic()：自定义音乐开关完全由用户在"自定义音轨"面板决定。
// 功能未启用时 playNsfMusic 内部守卫会直接返回，读档不会自己出声；
// 已启用时仍按存档记录的 code 正常恢复播放。
function restoreCustomMusicState(customMusicState) {
    if (!customMusicState || typeof customMusicState !== 'object' || !window.customMusicMonitor) {
        return;
    }

    // 如果存档记录外部音乐在播放，尝试恢复它
    if (customMusicState.externalActive && customMusicState.externalCode) {

        // 找到对应的映射
        if (window.musicMappings && window.musicMappings[customMusicState.externalCode]) {
            const mapping = window.musicMappings[customMusicState.externalCode];

            if (mapping && mapping.path) {
                // 延迟播放，确保环境准备好
                setTimeout(() => {
                    if (typeof window.playNsfMusic === 'function') {
                        window.playNsfMusic(mapping, { skipStopCommand: true });
                    } else {
                    }
                }, 100);
            } else {
            }
        } else {
        }
    } else {
    }
}

// 新增：缓存机制减少数据库查询
(function () {
    const DB_NAME = "NesSaveDB";
    const STORE_NAME = "saveSlots";
    const CONFIG_STORE = "config"; // 新增配置存储
    const DB_VERSION = 5; // 增加版本号
    const AUTO_SAVE_SLOT = -1; // 自动存档专用槽位
    const AUTO_SAVE_INTERVAL = 7000; // 自动存档间隔(ms)
    let db;
    let saveSlotsCache = null; // 缓存存档数据
    let cacheTimestamp = 0; // 缓存时间戳
    const CACHE_DURATION = 5000; // 缓存有效期5秒

    function openDB(callback) {
        let request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = function (e) { console.error("IndexedDB打开失败", e); };
        request.onsuccess = function (e) { db = e.target.result; callback(); };
        request.onupgradeneeded = function (e) {
            db = e.target.result;
            // 创建存档存储
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                let store = db.createObjectStore(STORE_NAME, { keyPath: "slot" });
                for (let i = 0; i < 20; i++) {
                    store.put({ slot: i, screenshot: "", timestamp: "", romName: "" });
                }
                // 初始化自动存档槽位
                //store.put({ slot: AUTO_SAVE_SLOT, screenshot: "", timestamp: "", romName: "" });
            }
            // 创建配置存储
            if (!db.objectStoreNames.contains(CONFIG_STORE)) {
                let configStore = db.createObjectStore(CONFIG_STORE, { keyPath: "key" });
                configStore.put({ key: "defaultSlot", value: 0 });
            }
        };
    }

    // 新增：获取默认卡槽
    function getDefaultSlot(callback) {
        init(function () {
            let tx = db.transaction(CONFIG_STORE, "readonly");
            let store = tx.objectStore(CONFIG_STORE);
            let req = store.get("defaultSlot");
            req.onsuccess = function () {
                callback(null, req.result ? req.result.value : 0);
            };
            req.onerror = function (e) { callback(e, 0); };
        });
    }

    // 新增：设置默认卡槽
    function setDefaultSlot(slot, callback) {
        init(function () {
            let tx = db.transaction(CONFIG_STORE, "readwrite");
            let store = tx.objectStore(CONFIG_STORE);
            let req = store.put({ key: "defaultSlot", value: slot });
            req.onsuccess = function () { if (callback) callback(null); };
            req.onerror = function (e) { if (callback) callback(e); };
        });
    }

    function init(callback) {
        if (db) {
            if (callback) callback();
            return;
        }
        openDB(callback);
    }

    function updateSaveSlot(slot, screenshot, timestamp, callback) {
        init(function () {
            let tx = db.transaction(STORE_NAME, "readwrite");
            let store = tx.objectStore(STORE_NAME);
            let saveState = window.nes.getState();
            // 获取自定义音乐状态
            let customMusicState = null;
            try {
                if (window.customMusicMonitor && typeof window.getMusicStatus === 'function') {
                    customMusicState = window.getMusicStatus();
                }
            } catch (e) {
                console.error("获取音乐状态失败:", e);
            }
            let record = {
                slot: slot === AUTO_SAVE_SLOT ? `${AUTO_SAVE_SLOT}_${loadedName}` : slot, // 自动存档与游戏名绑定
                screenshot: screenshot,
                timestamp: timestamp,
                romName: loadedName || "", // 确保保存当前游戏名称
                saveState: saveState,
                customMusicState: customMusicState // 添加自定义音乐状态
            };
            let req = store.put(record);
            req.onsuccess = function () {
                saveSlotsCache = null; // 清除缓存
                if (callback) callback(null, record);
            };
            req.onerror = function (e) {
                if (callback) callback(e);
            };
        });
    }

    function getAllSaveSlots(callback) {
        // 检查缓存是否有效
        if (saveSlotsCache && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
            callback(null, saveSlotsCache);
            return;
        }

        init(function () {
            let tx = db.transaction(STORE_NAME, "readonly");
            let store = tx.objectStore(STORE_NAME);
            let req = store.getAll();
            req.onsuccess = function () {
                let result = req.result.filter(item =>
                    item.slot !== `${AUTO_SAVE_SLOT}_${loadedName}` || item.romName === loadedName
                );
                // 预计算并缓存saveState的大小，避免重复JSON.stringify
                result.forEach(item => {
                    if (item.saveState && !item._size) {
                        item._size = JSON.stringify(item.saveState).length;
                    }
                });
                // 更新缓存
                saveSlotsCache = result;
                cacheTimestamp = Date.now();
                callback(null, result);
            };
            req.onerror = function (e) {
                callback(e, []);
            };
        });
    }

    // 同步下载后强制清空缓存，避免恢复槽位时读到同步前的旧列表
    function clearCache() {
        saveSlotsCache = null;
        cacheTimestamp = 0;
    }

    // 在现有的 SaveManager 模块中添加新方法
    function updateSaveData(slot, record, callback) {
        init(function () {
            let tx = db.transaction(STORE_NAME, "readwrite");
            let store = tx.objectStore(STORE_NAME);
            let req = store.put(record);
            req.onsuccess = function () { if (callback) callback(null); };
            req.onerror = function (e) { if (callback) callback(e); };
        });
    }

    function getSaveData(slot, callback) {
        init(function () {
            let tx = db.transaction(STORE_NAME, "readonly");
            let store = tx.objectStore(STORE_NAME);
            let req = store.get(slot);
            req.onsuccess = function () { callback(null, req.result); };
            req.onerror = function (e) { callback(e); };
        });
    }

    // 新增：检查自动存档
    function checkAutoSave(callback) {
        init(function () {
            let tx = db.transaction(STORE_NAME, "readonly");
            let store = tx.objectStore(STORE_NAME);
            let req = store.get(`${AUTO_SAVE_SLOT}_${loadedName}`); // 根据游戏名读取自动存档
            req.onsuccess = function () {
                let record = req.result;
                if (record && record.romName === loadedName) {
                    callback(null, record);
                } else {
                    callback(null, null); // 当前游戏没有自动存档
                }
            };
            req.onerror = function (e) {
                callback(e);
            };
        });
    }

    // 修改：显示自动存档加载提示
    function showAutoSavePrompt(record, callback) {
        let overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 12000;
        `;

        let dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            width: 90%;
            text-align: center;
        `;

        let img = document.createElement('img');
        img.src = record.screenshot;
        img.style.cssText = 'width: 256px; height: 240px; object-fit: contain; margin: 10px 0;';

        let text = document.createElement('p');
        text.textContent = `发现自动存档 (${record.timestamp})，是否加载？`;

        let btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '15px';

        let loadBtn = document.createElement('button');
        loadBtn.textContent = '加载存档';
        loadBtn.onclick = function () {
            if (record && record.saveState) {
                try {
                    if (window.nes && window.nes.setState(record.saveState)) {
                        // 恢复自定义音乐状态
                        if (record.customMusicState && window.customMusicMonitor) {
                            // 延迟恢复音乐，确保NES状态加载完成
                            setTimeout(() => {
                                restoreCustomMusicState(record.customMusicState);
                            }, 100);
                        }
                        log("已加载自动存档", "save");
                        document.body.removeChild(overlay);
                        if (callback) callback();
                    } else {
                        throw new Error("设置状态失败");
                    }
                } catch (e) {
                    console.error("加载存档失败:", e);
                    log("加载自动存档失败", "save");
                }
            } else {
                log("自动存档数据无效", "save");
            }
        };

        let cancelBtn = document.createElement('button');
        cancelBtn.textContent = '重新开始';
        cancelBtn.style.marginLeft = '10px';
        cancelBtn.onclick = function () {
            document.body.removeChild(overlay);
            if (callback) callback();
        };

        btnContainer.appendChild(loadBtn);
        btnContainer.appendChild(cancelBtn);
        dialog.appendChild(img);
        dialog.appendChild(text);
        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    // 新增：删除指定游戏的所有存档
    function deleteGameSaves(gameName, callback) {
        init(function () {
            SaveManager.getAllSaveSlots(function (err, list) {
                if (err) return callback(err);
                let delList = list.filter(item => item.romName === gameName);
                if (delList.length === 0) return callback(null);
                let tx = db.transaction(STORE_NAME, "readwrite");
                let store = tx.objectStore(STORE_NAME);
                delList.forEach(item => store.delete(item.slot));
                tx.oncomplete = function () {
                    saveSlotsCache = null; // 清除缓存
                    callback(null);
                };
                tx.onerror = function (e) { callback(e); };
            });
        });
    }

    // 新增：删除所有存档
    function clearAllSaves(callback) {
        init(function () {
            let tx = db.transaction(STORE_NAME, "readwrite");
            let store = tx.objectStore(STORE_NAME);
            let req = store.clear();
            req.onsuccess = function () {
                saveSlotsCache = null; // 清除缓存
                if (callback) callback(null);
            };
            req.onerror = function (e) { if (callback) callback(e); };
        });
    }

    // 暴露接口到 window
    window.SaveManager = {
        init: init,
        updateSaveSlot: updateSaveSlot,
        getAllSaveSlots: getAllSaveSlots,
        clearCache: clearCache,
        getDefaultSlot: getDefaultSlot,
        setDefaultSlot: setDefaultSlot,
        updateSaveData: updateSaveData,
        getSaveData: getSaveData,
        checkAutoSave: checkAutoSave,
        showAutoSavePrompt: showAutoSavePrompt,
        deleteGameSaves: deleteGameSaves,
        clearAllSaves: clearAllSaves,
        AUTO_SAVE_SLOT: AUTO_SAVE_SLOT
    };
})();
(function () {

    function showGameManager() {
        SaveManager.getAllSaveSlots(function (err, list) {
            if (err) return alert("获取存档失败");
            // 按游戏名分组
            let gameMap = {};
            list.forEach(item => {
                if (!item.romName) return;
                if (!gameMap[item.romName]) gameMap[item.romName] = { size: 0, count: 0 };
                gameMap[item.romName].size += item._size || 0;
                gameMap[item.romName].count++;
            });
            // 弹窗
            let overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;top:0;left:0;right:0;bottom:0;
                background:rgba(0,0,0,0.5);z-index:12001;display:flex;align-items:center;justify-content:center;`;
            let dialog = document.createElement('div');
            dialog.style.cssText = `
                background:#fff;padding:1rem;border-radius:8px;max-width:400px;width:90vw;
                max-height:350px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.2);`;
            dialog.innerHTML = `<div style="font-weight:bold;margin-bottom:0.5em;">所有有存档的游戏</div>
                <div id="gameSaveList"></div>
                <button id="deleteAllSaves" style="width:100%;margin-top:1em;">全部删除</button>
                <button id="closeGameManager" style="width:100%;margin-top:0.5em;">关闭</button>`;
            overlay.appendChild(dialog);
            let container = document.getElementById('fullscreenContainer') || document.body;
            container.appendChild(overlay);

            // 游戏列表
            let gameListDiv = dialog.querySelector('#gameSaveList');
            Object.keys(gameMap).sort().forEach(name => {
                let row = document.createElement('div');
                row.style = "display:flex;align-items:center;justify-content:space-between;padding:0.3em 0;border-bottom:1px solid #eee;";
                row.innerHTML = `<span>${name}</span>
                    <span style="font-size:0.9em;color:#888;">${(gameMap[name].size / 1024).toFixed(1)} KB</span>
                    <button data-name="${name}" style="margin-left:1em;">删除</button>`;
                gameListDiv.appendChild(row);
            });

            // 单个删除
            gameListDiv.querySelectorAll('button[data-name]').forEach(btn => {
                btn.onclick = function () {
                    let name = this.getAttribute('data-name');
                    let row = this.parentNode; // 获取父元素 row
                    if (!confirm(`确定要删除游戏 "${name}" 的所有存档吗？`)) return;
                    SaveManager.deleteGameSaves(name, function (err) {
                        if (err) return alert("删除失败");
                        row.parentNode.removeChild(row);
                        alert("已删除");
                    });
                };
            });

            // 全部删除
            dialog.querySelector('#deleteAllSaves').onclick = function () {
                if (!confirm("确定要删除所有存档吗？")) return;
                SaveManager.clearAllSaves(function (err) {
                    if (err) return alert("删除失败");
                    saveSlotsCache = null; // 清除缓存
                    gameListDiv.innerHTML = "";
                    alert("所有存档已删除");
                });
            };

            dialog.querySelector('#closeGameManager').onclick = function () {
                container.removeChild(overlay);
            };
        });
    }

    // 创建简单的存档管理界面
    function createUI() {
        SaveManager.getDefaultSlot(function (err, defaultSlot) {
            window.currentSaveSlot = defaultSlot;
            updateCurrentSlotDisplay();
        });
        let ui = document.createElement('div');
        ui.id = 'saveManagerUI';
        ui.style.position = 'fixed';
        ui.style.top = '1%';
        ui.style.left = '50%';
        ui.style.transform = 'translateX(-50%)';
        ui.style.background = '#fff';
        ui.style.border = '2px solid #888';
        ui.style.borderRadius = '8px';
        ui.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        ui.style.padding = '1rem';
        ui.style.zIndex = '11000';
        ui.style.maxWidth = '98vw';
        ui.style.width = '420px';
        ui.style.maxHeight = '90vh';
        ui.style.overflowY = 'auto';
        ui.style.display = 'none';
        ui.innerHTML = `<span>
            存档管理——按行切换卡槽
            <span id="saveTotalSize" style="font-size:0.9em;color:#888;margin-left:1em;">(统计中...)</span>
            <button id="saveManagerGameBtn" style="float:right;">管理存档</button>
        <br>内存当做程序[prgrom]的改版存档会更大.</span>
        <div id="currentSaveSlotDisplay" style="margin-bottom:0.5rem;font-weight:bold;">
          当前卡槽：${window.currentSaveSlot}
        </div>
        <div id="saveList" style="max-height:300px;overflow-y:auto;"></div>
        <button id="saveManagerCloseBtn" style="width:100%;margin-top:1rem;">关闭</button>`;
        let container = document.getElementById('fullscreenContainer') || document.body;
        container.appendChild(ui);

        // 统计存档大小
        SaveManager.getAllSaveSlots(function (err, list) {
            let total = 0;
            if (list && list.length) {
                total = list.reduce((sum, item) => sum + (item._size || 0), 0);
            }
            document.getElementById('saveTotalSize').textContent = `(${(total / 1024 / 1024).toFixed(1)} mb)`;
        });

        document.getElementById('saveManagerCloseBtn').onclick = function () {
            ui.style.display = 'none';
        };
        document.getElementById('saveManagerGameBtn').onclick = showGameManager;
        return ui;
    }

    function refreshSaveList() {
        SaveManager.getAllSaveSlots(function (err, list) {
            if (err) return console.error("获取存档列表失败", err);
            let saveList = document.getElementById('saveList');
            if (!saveList) return;
            saveList.innerHTML = "";

            // 创建文档片段，一次性插入所有元素
            let fragment = document.createDocumentFragment();

            // 自动存档
            let autoSave = list.find(item => item.slot === `${SaveManager.AUTO_SAVE_SLOT}_${loadedName}`);
            let autoScreenshot = autoSave && autoSave.romName === loadedName ? autoSave.screenshot : "";
            let autoTimestamp = autoSave && autoSave.romName === loadedName ? autoSave.timestamp : "<空>";

            let autoDiv = document.createElement('div');
            autoDiv.className = 'auto-save-row';
            autoDiv.style.cssText = 'padding:0.5rem;border-bottom:1px solid #ccc;background:#f0f0f0;';
            autoDiv.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <strong>自动</strong>
                        <img src="${autoScreenshot}" style="width:60px;height:45px;object-fit:cover;margin:0;" onerror="this.style.display='none';">
                        <span style="flex:1;font-size:0.9em;">${autoTimestamp}</span>
                    </div>
                    <div>
                        <button class="load-btn" data-slot="${SaveManager.AUTO_SAVE_SLOT}_${loadedName}">读</button>
                    </div>
                </div>`;
            fragment.appendChild(autoDiv);

            // 20个普通存档 - 批量创建
            for (let i = 0; i < 20; i++) {
                let slotSave = list.find(item => item.slot === i && item.romName === loadedName);
                let screenshot = slotSave ? slotSave.screenshot : "";
                let timestamp = slotSave ? slotSave.timestamp : "<空>";

                let slotDiv = document.createElement('div');
                slotDiv.setAttribute('data-slot', i);
                slotDiv.style.cssText = 'padding:0.5rem;border-bottom:1px solid #ccc;cursor:pointer;display:flex;align-items:center;justify-content:space-between;';
                slotDiv.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <strong style="width:2rem;">${i}</strong>
                        <img src="${screenshot}" style="width:60px;height:45px;object-fit:cover;margin:0;" onerror="this.style.display='none';">
                        <span style="flex:1;font-size:0.9em;">${timestamp}</span>
                    </div>
                    <div style="display:flex;gap:0.2rem;">
                        <button class="save-btn" data-slot="${i}">存</button>
                        <button class="load-btn" data-slot="${i}">读</button>
                    </div>`;
                fragment.appendChild(slotDiv);
            }

            // 一次性插入所有元素
            saveList.appendChild(fragment);

            // 使用事件委托，只绑定一次事件到父容器
            saveList.onclick = function(e) {
                let target = e.target;
                let slotDiv = target.closest('[data-slot]');
                if (!slotDiv) return;

                let slot = slotDiv.getAttribute('data-slot');

                // 如果点击的是按钮，执行对应操作
                if (target.classList.contains('save-btn')) {
                    e.stopPropagation();
                    let s = parseInt(slot);
                    let defs = window.currentSaveSlot;
                    window.currentSaveSlot = s;
                    if (typeof save_State === 'function') {
                        save_State();
                        window.currentSaveSlot = defs;
                        setTimeout(refreshSaveList, 500);
                    }
                    return;
                }

                if (target.classList.contains('load-btn')) {
                    e.stopPropagation();
                    let realSlot = isNaN(Number(slot)) ? slot : Number(slot);
                    SaveManager.getSaveData(realSlot, function (err, record) {
                        if (err) return console.error("读取存档失败", err);
                        if (record && record.saveState) {
                            window.nes.setState(record.saveState);
                            // 恢复自定义音乐状态
                            if (record.customMusicState && window.customMusicMonitor) {
                                // 延迟恢复音乐，确保NES状态加载完成
                                setTimeout(() => {
                                    restoreCustomMusicState(record.customMusicState);
                                }, 100);
                            }
                            if (String(slot) === `${SaveManager.AUTO_SAVE_SLOT}_${loadedName}`) {
                                log("已加载自动存档", "save");
                            } else {
                                log("已加载存档：" + slot, "save");
                            }
                        } else {
                            log("存档无效：" + slot, "save");
                        }
                    });
                    return;
                }

                // 点击非按钮区域：切换默认卡槽
                let s = parseInt(slot);
                window.currentSaveSlot = s;
                switchSlot(s);
                Array.from(saveList.querySelectorAll('div[data-slot]')).forEach(d => d.style.background = '');
                slotDiv.style.background = '#def';
                log("存档卡槽已切换为 " + s, "save");
            };
        });
    }

    // 新增辅助函数：更新顶部显示的当前卡槽
    function updateCurrentSlotDisplay() {
        let disp = document.getElementById('currentSaveSlotDisplay');
        if (disp) {
            disp.textContent = "当前卡槽：" + (window.currentSaveSlot !== undefined ? window.currentSaveSlot : 0);
        }
    }

    function switchSlot(slot) {
        window.currentSaveSlot = slot;
        SaveManager.setDefaultSlot(slot, function (err) {
            if (err) console.error("保存默认卡槽失败", err);
            updateCurrentSlotDisplay();
        });
    }

    function show() {
        let ui = document.getElementById('saveManagerUI') || createUI();
        SaveManager.getDefaultSlot(function (err, defaultSlot) {
            window.currentSaveSlot = defaultSlot;
            updateCurrentSlotDisplay();
            refreshSaveList();
            ui.style.display = 'block';
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        SaveManager.init(function () {
            SaveManager.getDefaultSlot(function (err, defaultSlot) {
                if (err) {
                    window.currentSaveSlot = 0;
                } else {
                    window.currentSaveSlot = defaultSlot;
                }
                // 可以在这里触发其他需要用到 currentSaveSlot 的初始化操作
                updateCurrentSlotDisplay();
            });
        });
    });

    // 暴露接口
    window.SaveManagerUI = { show: show, refresh: refreshSaveList };
})();
