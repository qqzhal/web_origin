// 自定义音乐播放功能
(function () {
    // 全局状态
    let customMusicEnabled = false;
    let musicMappings = {}; // 内存代码 -> {name: 文件名, path: 文件路径, index: 曲目索引, note: 备注} 的映射
    let loadedNsfFiles = {}; // 已加载的NSF文件缓存：文件名 -> {data: 数组, loaded: true}
    let loadedScripts = new Set(); // 已加载的脚本文件路径集合，避免重复加载集成NSF文件
    let currentNsfPlayer = null; // 当前NSF播放器实例
    let currentPlayingCode = null; // 当前正在播放的音乐代码
    let currentPlayingTrack = null; // 当前播放的曲目索引（1-based）
    let isOverlayOpen = false; // 跟踪弹出层是否打开
    let monitorLog = []; // 存储最近的内存写入记录
    // 音乐缓冲区状态跟踪
    let musicBufferState = new Array(5).fill(0); // 跟踪0x0700-0x0704缓冲区状态

    // UI相关状态
    let wasGameRunning = false; // 打开UI时游戏是否正在运行
    let wasExternalNsfPlaying = false; // 打开UI时是否有外部NSF在播放
    let pausedExternalMapping = null; // 被暂停的外部NSF映射信息
    let pausedExternalTrack = null; // 被暂停的外部NSF曲目索引
    let uiNsfPlayer = null; // UI中的NSF播放器（独立于游戏音乐）
    let uiCurrentNsfPath = null; // UI中当前播放的NSF路径
    let uiCurrentVariableName = null; // UI中当前播放的NSF变量名
    let uiCurrentTrack = 0; // UI中当前播放的曲目索引（0-based）
    let uiTotalTracks = 0; // UI中NSF的总曲目数
    let uiIsPlaying = false; // UI中是否正在播放

    // NSF FPS设置
    // 默认将外部NSF播放FPS设为60（手机和桌面均为60）
    let externalNsfFps = 60; // 外部NSF播放时的默认fps（统一为60）

    // 强制默认使用 GME 引擎（禁用 JSNSF 模式为可选）
    let nsfEngine = 'gme'; // 'gme' or 'jsnsf' (jsnsf 模式在UI不可选)
    let gmeAudioContext = null;
    let gmeScriptNode = null;
    let gmeUiScriptNode = null;
    let gmeBufferPtr = null;
    let gmeDataPtr = null;
    let gmeCurrentTrack = 0;

    // 默认音乐配置（如果外部配置文件无法加载，将使用此配置）
    const defaultMusicConfig = {
    };



    // 验证文件类型与引擎兼容性
    function isFileTypeSupported(filePath, engine) {
        // 从文件路径提取扩展名
        const extension = filePath.split('.').pop().toLowerCase();

        if (engine === 'jsnsf') {
            // JSNSF 只支持 NSF 文件（通过 JS 文件加载）
            return extension === 'js';
        } else if (engine === 'gme') {
            // GME 支持多种格式（通过 JS 文件加载原始数据）
            return extension === 'js';
        }

        return false;
    }

    // 预加载所有配置中的NSF JS文件
    function preloadAllNsfFiles() {
        const configToUse = window.musicConfig || defaultMusicConfig;
        let entries = [];
        if (configToUse instanceof Map) {
            entries = Array.from(configToUse.entries());
        } else if (typeof configToUse === 'object' && configToUse !== null) {
            entries = Object.entries(configToUse);
        }

        const uniquePaths = new Set();
        entries.forEach(([code, config]) => {
            if (config && config.path) {
                uniquePaths.add(config.path);
            }
        });

        console.log(`预加载 ${uniquePaths.size} 个NSF JS文件...`);

        // 首先预加载所有扩展芯片模块，避免播放时的动态加载
        preloadExpansionChips();

        const preloadPromises = Array.from(uniquePaths).map(path => {
            // 使用与 loadSettings 相同的逻辑确定变量名，确保缓存键一致
            let name = '';
            for (const [code, config] of entries) {
                if (config && config.path === path) {
                    // 如果配置中有 name 字段且非空，使用它作为变量名
                    if (config.name && typeof config.name === 'string' && config.name.trim()) {
                        name = config.name.trim();
                    } else {
                        // 从路径中提取文件名作为name，去掉 .js 扩展名
                        name = path.split('/').pop().replace(/\.js$/i, '') || path;
                    }
                    break;
                }
            }
            return loadNsfFile(path, false, name).catch(error => {
                console.warn(`预加载NSF文件失败 ${path}:`, error);
                return null; // 预加载失败不影响整体功能
            });
        });

        return Promise.all(preloadPromises).then(() => {
            console.log('NSF JS文件预加载完成');
        });
    }

    // 通用脚本注入 helper，返回 Promise，避免重复注入
    function injectScript(src, opts) {
        opts = opts || {};
        return new Promise((resolve, reject) => {
            if (loadedScripts.has(src) && !opts.forceReload) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src + (opts.forceReload ? '?t=' + Date.now() : '');
            script.async = !!opts.async;

            let fired = false;
            function success() {
                if (fired) return; fired = true;
                loadedScripts.add(src);
                resolve();
            }
            function failure(e) {
                if (fired) return; fired = true;
                reject(e || new Error('Failed to load ' + src));
            }

            script.onload = () => success();
            script.onerror = (e) => failure(e);
            document.head.appendChild(script);

            if (opts.timeout) {
                setTimeout(() => {
                    if (!fired) failure(new Error('Script load timeout: ' + src));
                }, opts.timeout);
            }
        });
    }

    // 预加载NSF扩展芯片模块，避免播放时的动态加载导致帧率下降
    function preloadExpansionChips() {
        const chipModules = [
            { path: 'mappers/ApuEX/emu2413.js', check: 'window.emu2413' },  // VRC7需要
            { path: 'mappers/ApuEX/VRC6.js', check: 'APU_VRC6' },
            { path: 'mappers/ApuEX/MMC5.js', check: 'APU_MMC5' },
            { path: 'mappers/ApuEX/VRC7.js', check: 'APU_VRC7' },
            { path: 'mappers/ApuEX/FME7.js', check: 'APU_FME7' },
            { path: 'mappers/ApuEX/N106.js', check: 'APU_N106' },
            { path: 'mappers/ApuEX/FDS.js', check: 'APU_FDS' }
        ];

        console.log('预加载NSF扩展芯片模块...');

        const preloadPromises = chipModules.map(({ path, check }) => {
            return new Promise((resolve, reject) => {
                // 检查是否已经加载
                const isLoaded = check.includes('.')
                    ? eval(`typeof ${check} !== 'undefined'`)
                    : (typeof window[check] !== 'undefined');

                if (isLoaded) {
                    resolve(); // 已经加载
                    return;
                }

                const script = document.createElement('script');
                script.src = path;
                script.onload = () => {
                    // 等待一小段时间确保脚本完全执行
                    setTimeout(() => {
                        const moduleName = path.split('/').pop().replace('.js', '');
                        console.log(`扩展芯片模块加载完成: ${moduleName}`);

                        // 验证是否正确设置了全局变量
                        const checkLoaded = check.includes('.')
                            ? eval(`typeof ${check} !== 'undefined'`)
                            : (typeof window[check] !== 'undefined');

                        if (!checkLoaded) {
                            console.warn(`警告: 扩展芯片模块 ${moduleName} 加载完成但全局变量 ${check} 未设置`);
                        }

                        resolve();
                    }, 10);
                };
                script.onerror = () => {
                    console.warn(`扩展芯片模块加载失败: ${path}`);
                    resolve(); // 加载失败不阻塞，继续
                };
                document.head.appendChild(script);
            });
        });

        return Promise.all(preloadPromises).then(() => {
            console.log('NSF扩展芯片模块预加载完成');
        });
    }

    // 加载NSF JS文件，返回 Uint8Array
    function loadNsfFile(filePath, forceReload = false, variableName = null) {
        return new Promise((resolve, reject) => {
            // 创建缓存键，包含文件路径和变量名
            const cacheKey = filePath + (variableName ? '|' + variableName : '');

            // 检查是否已经加载（除非强制重新加载）
            if (!forceReload && loadedNsfFiles[cacheKey]) {
                //console.log(`NSF文件缓存命中: ${cacheKey}`);
                resolve(loadedNsfFiles[cacheKey].data);
                return;
            }

            // 如果强制重新加载，先清除缓存
            if (forceReload && loadedNsfFiles[cacheKey]) {
                delete loadedNsfFiles[cacheKey];
                loadedScripts.delete(filePath); // 也清除脚本加载标记
            }

            // 检查脚本是否已经加载过（用于集成多个NSF的JS文件）
            if (!forceReload && loadedScripts.has(filePath)) {
                //console.log(`脚本已加载，检查变量: ${filePath} -> ${variableName}`);
                // 脚本已加载，直接检查变量是否存在
                const nsfData = window[variableName];
                if (nsfData && (Array.isArray(nsfData) || nsfData instanceof Uint8Array)) {
                    const uint8Data = nsfData instanceof Uint8Array ? nsfData : new Uint8Array(nsfData);
                    loadedNsfFiles[cacheKey] = { data: uint8Data, loaded: true };
                    //console.log(`NSF变量缓存命中: ${cacheKey}`);
                    resolve(uint8Data);
                    return;
                } else {
                    reject(new Error(`脚本已加载但NSF变量 ${variableName} 未找到或不是数组/Uint8Array`));
                    return;
                }
            }

            //console.log(`加载NSF文件: ${filePath} (缓存键: ${cacheKey})`);

            // 动态加载JS文件（使用 injectScript 以复用加载逻辑）
            injectScript(filePath, { forceReload: !!forceReload, timeout: 10000 }).then(() => {
                // JS文件加载完成后，确定变量名
                let varName = variableName;
                if (!varName) {
                    // 如果没有指定变量名，从文件路径提取并去掉扩展名
                    varName = filePath.split('/').pop().replace(/\.js$/i, '');
                } else if (varName.endsWith('.js')) {
                    // 如果变量名以 .js 结尾，去掉扩展名
                    varName = varName.replace(/\.js$/i, '');
                }

                const nsfData = window[varName];

                if (nsfData && (Array.isArray(nsfData) || nsfData instanceof Uint8Array)) {
                    // 缓存加载的数据，使用包含变量名的缓存键
                    const uint8Data = nsfData instanceof Uint8Array ? nsfData : new Uint8Array(nsfData);
                    loadedNsfFiles[cacheKey] = { data: uint8Data, loaded: true };
                    resolve(uint8Data);
                } else {
                    reject(new Error(`NSF变量 ${varName} 未找到或不是数组/Uint8Array`));
                }
            }).catch(err => {
                reject(new Error(`加载NSF文件失败: ${filePath} (${err && err.message ? err.message : err})`));
            });
        });
    }


    // 播放NSF音乐
    // options: { skipStopCommand: boolean } 当为 true 时，不向内存写入 0x01 停止内部音乐
    function playNsfMusic(mapping, options) {
        options = options || {};
        const skipStopCommand = !!options.skipStopCommand;

        if (!customMusicEnabled) {
            return;
        }

        // 1. 停止任何正在播放的 *外部* 音乐（由 stopMusic 负责清理状态）
        if (currentNsfPlayer) {
            stopMusic();
        }

        // 2. 根据调用方意图，决定是否写入 0x01 到 0x700 停止 *内部* 游戏音乐。
        //    在某些场景（例如：外部 BGM->外部 BGM 的切换），我们不希望向 NES 内存写入 0x01。
        if (!skipStopCommand && window.nes && typeof window.nes.write === 'function') {
            const stopAddress = 0x700;
            try {
                isWritingStopCommand = true;
                window.nes.write(stopAddress, 0x01);
                musicBufferState[0] = 0x01; // 更新本地缓冲区状态
            } finally {
                isWritingStopCommand = false;
            }
        }

        if (!mapping || !mapping.path) {
            return;
        }

        // 3. 验证文件类型与引擎兼容性
        if (!isFileTypeSupported(mapping.path, nsfEngine)) {
            console.warn(`文件 ${mapping.path} 不支持当前引擎 ${nsfEngine}`);
            return;
        }

        // 4. 延迟一小段时间后，加载并播放新的外部音乐
        setTimeout(() => {
            if (nsfEngine === 'gme') {
                // GME 播放
                loadNsfFile(mapping.path, false, mapping.name).then(data => {
                    if (!gmeAudioContext) {
                        gmeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                        if (typeof Module !== 'undefined') {
                            gmeBufferPtr = Module.ccall('get_buffer', 'number', [], []);
                            gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []);
                        }
                    }

                    if (typeof Module === 'undefined') {
                        console.error('GME Module not loaded');
                        return;
                    }

                    const resizeResult = Module.ccall('resize_data_buffer', 'number', ['number'], [data.length]);
                    if (resizeResult !== 0) {
                        console.error('Failed to resize GME data buffer');
                        return;
                    }

                    gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []);
                    for (let i = 0; i < data.length; i++) {
                        HEAPU8[gmeDataPtr + i] = data[i];
                    }

                    const track = mapping.index || 0;
                    const result = Module.ccall('init_gme', 'number', ['number', 'number', 'number'], [data.length, track, gmeAudioContext.sampleRate]);
                    if (result === 0) {
                        gmeCurrentTrack = track;
                        playGmeBackground();
                        currentPlayingCode = mapping.code;
                        currentPlayingTrack = track + 1;
                        forceUpdateMonitorDisplay();
                    } else {
                        console.error('Failed to init GME');
                    }
                }).catch(error => {
                    console.error('Failed to load NSF file for GME:', error);
                });
            } else {
                // JSNSF 播放
                loadNsfFile(mapping.path, false, mapping.name)
                    .then(nsfData => {
                        let songNum = (mapping.index || 0) + 1; // 将 0-indexed 转换为 1-indexed

                        if (typeof nsfPlayBackground === 'function' && typeof ExternalAudioHandler === 'function') {
                            // 设置外部NSF播放的fps
                            if (window.nsfTargetFps !== undefined) {
                                window.nsfTargetFps = externalNsfFps;
                            }

                            if (window.nes && window.nes.apu && window.nes.apu.audioHandler) {
                                window.nes.apu.audioHandler.pause();
                            }

                            const handler = new ExternalAudioHandler();
                            const ok = nsfPlayBackground(Array.from(nsfData), songNum, handler);

                            if (ok && handler.hasAudio) {
                                currentPlayingCode = mapping.code;
                                currentPlayingTrack = songNum;
                                currentNsfPlayer = handler;
                                forceUpdateMonitorDisplay();
                            } else {
                                if (window.nes && window.nes.apu && window.nes.apu.audioHandler) {
                                    window.nes.apu.audioHandler.unpause();
                                }
                            }
                        }
                    })
                    .catch(error => {
                        if (window.nes && window.nes.apu && window.nes.apu.audioHandler) {
                            window.nes.apu.audioHandler.unpause();
                        }
                    });
            }
        }, 100); // 延迟100毫秒
    }

    // 停止当前音乐
    function stopMusic() {
        // 停止后台播放器（这会处理播放器和音频处理器的内部状态）
        if (typeof nsfStopBackground === 'function') {
            nsfStopBackground();
        }

        // 如果我们用一个处理器实例作为播放标志，现在清除它
        if (currentNsfPlayer) {
            if (typeof currentNsfPlayer.stop === 'function') {
                currentNsfPlayer.stop();
            }
        }

        // 停止 GME
        if (gmeScriptNode) {
            stopGmeBackground();
        }

        // 清理状态
        currentNsfPlayer = null;
        currentPlayingCode = null;
        currentPlayingTrack = null;
        musicBufferState.fill(0);

        // 恢复主音频处理器
        if (window.nes && window.nes.apu && window.nes.apu.audioHandler) {
            window.nes.apu.audioHandler.unpause();
        }
        forceUpdateMonitorDisplay();
    }

    // GME 后台播放
    function playGmeBackground() {
        if (gmeScriptNode) {
            gmeScriptNode.disconnect();
        }

        const bufferSize = 4096;
        gmeScriptNode = gmeAudioContext.createScriptProcessor(bufferSize, 0, 2);
        gmeScriptNode.onaudioprocess = function (event) {
            const outputBuffer = event.outputBuffer;
            const left = outputBuffer.getChannelData(0);
            const right = outputBuffer.getChannelData(1);

            const result = Module.ccall('play_gme', 'number', ['number'], [bufferSize]);
            if (result === 0) {
                // 使用 HEAP16 以避免字节对齐和视图问题，gmeBufferPtr 为字节偏移
                try {
                    const start = (gmeBufferPtr || 0) >> 1;
                    const data = (typeof HEAP16 !== 'undefined')
                        ? HEAP16.subarray(start, start + bufferSize * 2)
                        : new Int16Array(HEAPU8.buffer, gmeBufferPtr, bufferSize * 2);
                    for (let i = 0; i < bufferSize; i++) {
                        // 使用 32767 做归一化，并做范围裁剪，避免偶发峰值
                        let sL = data[i * 2] / 32767;
                        let sR = data[i * 2 + 1] / 32767;
                        if (!isFinite(sL) || isNaN(sL)) sL = 0;
                        if (!isFinite(sR) || isNaN(sR)) sR = 0;
                        if (sL > 1) sL = 1; else if (sL < -1) sL = -1;
                        if (sR > 1) sR = 1; else if (sR < -1) sR = -1;
                        left[i] = sL;
                        right[i] = sR;
                    }
                } catch (e) {
                    // 回退到原始简单转换以保证不中断播放
                    const data = new Int16Array(HEAPU8.buffer, gmeBufferPtr, bufferSize * 2);
                    for (let i = 0; i < bufferSize; i++) {
                        left[i] = data[i * 2] / 32768;
                        right[i] = data[i * 2 + 1] / 32768;
                    }
                }
            } else {
                // End of track
                stopGmeBackground();
            }
        };

        gmeScriptNode.connect(getMuteGainNode(gmeAudioContext));
        currentNsfPlayer = gmeScriptNode; // 为了兼容 stopMusic
    }

    function stopGmeBackground() {
        if (gmeScriptNode) {
            gmeScriptNode.disconnect();
            gmeScriptNode = null;
        }
        currentNsfPlayer = null;
    }

    // 综合音频清理函数 - 停止所有WASM音频播放器
    window.cleanupAllAudioPlayers = function () {

        let stoppedCount = 0;

        // 0. 停止GME引擎本身 - 通过断开音频节点实现
        // GME引擎没有专门的stop_gme函数，正确的停止方法是断开音频节点连接

        // 1. 停止GME背景播放
        if (gmeScriptNode) {
            try {
                gmeScriptNode.disconnect();
                gmeScriptNode = null;
                stoppedCount++;
            } catch (e) {
                console.warn('停止GME背景音频时出错:', e);
            }
        }

        // 2. 停止GME UI播放
        if (gmeUiScriptNode) {
            try {
                gmeUiScriptNode.disconnect();
                gmeUiScriptNode = null;
                stoppedCount++;
            } catch (e) {
                console.warn('停止GME UI音频时出错:', e);
            }
        }

        // 3. 停止当前NSF播放器
        if (currentNsfPlayer) {
            try {
                if (typeof currentNsfPlayer.stop === 'function') {
                    currentNsfPlayer.stop();
                } else if (typeof currentNsfPlayer.disconnect === 'function') {
                    currentNsfPlayer.disconnect();
                }
                currentNsfPlayer = null;
                stoppedCount++;
            } catch (e) {
                console.warn('停止当前NSF播放器时出错:', e);
            }
        }

        // 4. 停止UI NSF播放器
        if (uiNsfPlayer) {
            try {
                if (typeof uiNsfPlayer.stop === 'function') {
                    uiNsfPlayer.stop();
                } else if (typeof uiNsfPlayer.disconnect === 'function') {
                    uiNsfPlayer.disconnect();
                }
                uiNsfPlayer = null;
                uiIsPlaying = false;
                stoppedCount++;
            } catch (e) {
                console.warn('停止UI NSF播放器时出错:', e);
            }
        }

        // 5. 停止JSNSF背景播放（如果存在）
        if (typeof nsfStopBackground === 'function') {
            try {
                nsfStopBackground();
                stoppedCount++;
            } catch (e) {
                console.warn('停止JSNSF背景音频时出错:', e);
            }
        }

        // 6. 停止外部音频处理器
        if (typeof window.nsfAudioHandler !== 'undefined' && window.nsfAudioHandler) {
            try {
                window.nsfAudioHandler.stop();
                stoppedCount++;
            } catch (e) {
                console.warn('停止外部音频处理器时出错:', e);
            }
        }

        // 7. 重置音频状态变量
        currentPlayingCode = null;
        currentPlayingTrack = null;
        uiCurrentNsfPath = null;
        uiCurrentVariableName = null;
        uiIsPlaying = false;

        // 8. 如果游戏处于暂停状态，确保GME引擎完全停止
        if (typeof window.paused !== 'undefined' && window.paused) {
            try {
                // 强制停止GME引擎，即使游戏处于暂停状态
                // GME引擎没有专门的stop_gme函数，正确的停止方法是断开音频节点连接
                // 清除暂停标记，防止游戏恢复时重新连接
                window._gmePausedByGame = false;
            } catch (e) {
                console.warn('清理暂停状态下的GME引擎时出错:', e);
            }
        }

        // 更新UI状态
        updateNsfPlayerUI();

        return stoppedCount;
    };

    // UI专用NSF播放控制函数（使用 GME 进行试听）
    function playUiNsf(nsfPath, trackIndex, variableName) {
        // 停止当前UI播放
        stopUiNsf();

        // 使用 GME 进行 UI 试听（优先使用 GME），若 Module 未加载则动态加载
        function doPlayWithGme(uint8Data) {
            if (!gmeAudioContext) {
                gmeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Ensure Module is available
            function playNow() {
                try {
                    if (typeof Module === 'undefined') {
                        console.error('GME Module not available for UI preview');
                        return;
                    }

                    // Resize buffer and copy data
                    const resizeResult = Module.ccall('resize_data_buffer', 'number', ['number'], [uint8Data.length]);
                    if (resizeResult !== 0) {
                        console.error('Failed to resize GME data buffer for UI preview');
                        return;
                    }
                    gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []);
                    for (let i = 0; i < uint8Data.length; i++) {
                        HEAPU8[gmeDataPtr + i] = uint8Data[i];
                    }

                    const track = trackIndex || 0;
                    const result = Module.ccall('init_gme', 'number', ['number', 'number', 'number'], [uint8Data.length, track, gmeAudioContext.sampleRate]);
                    if (result !== 0) {
                        console.error('Failed to init GME for UI preview');
                        return;
                    }

                    // 创建 UI 专用的 ScriptProcessor（避免干扰全局 gmeScriptNode）
                    try {
                        if (gmeUiScriptNode) {
                            try { gmeUiScriptNode.disconnect(); } catch (e) { }
                            gmeUiScriptNode = null;
                        }
                        const bufferSize = 4096;
                        gmeUiScriptNode = gmeAudioContext.createScriptProcessor(bufferSize, 0, 2);
                        gmeUiScriptNode.onaudioprocess = function (event) {
                            const outputBuffer = event.outputBuffer;
                            const left = outputBuffer.getChannelData(0);
                            const right = outputBuffer.getChannelData(1);

                            const r = Module.ccall('play_gme', 'number', ['number'], [bufferSize]);
                            if (r === 0) {
                                try {
                                    const start = (gmeBufferPtr || 0) >> 1;
                                    const data = (typeof HEAP16 !== 'undefined')
                                        ? HEAP16.subarray(start, start + bufferSize * 2)
                                        : new Int16Array(HEAPU8.buffer, gmeBufferPtr, bufferSize * 2);
                                    for (let i = 0; i < bufferSize; i++) {
                                        let sL = data[i * 2] / 32767;
                                        let sR = data[i * 2 + 1] / 32767;
                                        if (!isFinite(sL) || isNaN(sL)) sL = 0;
                                        if (!isFinite(sR) || isNaN(sR)) sR = 0;
                                        if (sL > 1) sL = 1; else if (sL < -1) sL = -1;
                                        if (sR > 1) sR = 1; else if (sR < -1) sR = -1;
                                        left[i] = sL;
                                        right[i] = sR;
                                    }
                                } catch (e) {
                                    const data = new Int16Array(HEAPU8.buffer, gmeBufferPtr, bufferSize * 2);
                                    for (let i = 0; i < bufferSize; i++) {
                                        left[i] = data[i * 2] / 32768;
                                        right[i] = data[i * 2 + 1] / 32768;
                                    }
                                }
                            } else {
                                // End of track
                                try { stopUiNsf(); } catch (e) { }
                            }
                        };
                        gmeUiScriptNode.connect(getMuteGainNode(gmeAudioContext));
                        uiNsfPlayer = gmeUiScriptNode;
                        uiCurrentNsfPath = nsfPath;
                        uiCurrentTrack = trackIndex;
                        uiIsPlaying = true;
                        updateNsfPlayerUI();
                    } catch (e) {
                        console.error('GME UI playback setup failed', e);
                    }
                } catch (e) {
                    console.error('Error during GME UI playback', e);
                }
            }

            if (typeof Module === 'undefined') {
                // 动态加载 gme_player.js 并在加载完成后播放
                injectScript('lib/gme_player.js', { timeout: 10000 }).then(() => {
                    if (typeof Module !== 'undefined' && typeof Module.onRuntimeInitialized === 'function') {
                        Module.onRuntimeInitialized = function () {
                            try { gmeBufferPtr = Module.ccall('get_buffer', 'number', [], []); } catch (e) { }
                            try { gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []); } catch (e) { }
                            playNow();
                        };
                    } else {
                        // If Module already ready
                        try { gmeBufferPtr = Module.ccall('get_buffer', 'number', [], []); } catch (e) { }
                        try { gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []); } catch (e) { }
                        playNow();
                    }
                }).catch((err) => {
                    console.error('Failed to load gme_player.js for UI preview', err);
                });
            } else {
                // Module available now
                try { gmeBufferPtr = Module.ccall('get_buffer', 'number', [], []); } catch (e) { }
                try { gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []); } catch (e) { }
                playNow();
            }
        }

        loadNsfFile(nsfPath, false, variableName)
            .then(nsfData => {
                // nsfData is Uint8Array
                doPlayWithGme(nsfData instanceof Uint8Array ? nsfData : new Uint8Array(nsfData));
            })
            .catch(error => {
                console.error('UI NSF(GME)播放失败:', error);
            });
    }

    function stopUiNsf() {
        // 如果使用了 nsfStopBackground（JSNSF），调用它
        try {
            if (typeof nsfStopBackground === 'function') nsfStopBackground();
        } catch (e) { }

        // 如果 UI 使用了 ExternalAudioHandler 实例（旧逻辑），尝试 stop()
        if (uiNsfPlayer) {
            try {
                if (typeof uiNsfPlayer.stop === 'function') {
                    uiNsfPlayer.stop();
                } else if (uiNsfPlayer && typeof uiNsfPlayer.disconnect === 'function') {
                    try { uiNsfPlayer.disconnect(); } catch (e) { }
                }
            } catch (e) {
                console.warn('stopUiNsf: error stopping uiNsfPlayer', e);
            }
        }

        // 特殊处理 GME UI 节点
        if (gmeUiScriptNode) {
            try { gmeUiScriptNode.disconnect(); } catch (e) { }
            gmeUiScriptNode = null;
        }

        uiNsfPlayer = null;
        uiIsPlaying = false;
        updateNsfPlayerUI();
    }

    function nextUiTrack() {
        if (!uiCurrentNsfPath || uiTotalTracks <= 1) return;
        const nextTrack = (uiCurrentTrack + 1) % uiTotalTracks;
        playUiNsf(uiCurrentNsfPath, nextTrack, uiCurrentVariableName);
    }

    function prevUiTrack() {
        if (!uiCurrentNsfPath || uiTotalTracks <= 1) return;
        const prevTrack = uiCurrentTrack > 0 ? uiCurrentTrack - 1 : uiTotalTracks - 1;
        playUiNsf(uiCurrentNsfPath, prevTrack, uiCurrentVariableName);
    }

    function toggleUiPlayback() {
        if (uiIsPlaying) {
            stopUiNsf();
        } else if (uiCurrentNsfPath) {
            playUiNsf(uiCurrentNsfPath, uiCurrentTrack, uiCurrentVariableName);
        }
    }

    function updateNsfPlayerUI() {
        const playerDiv = document.getElementById('nsfPlayer');
        if (!playerDiv) return;

        if (!uiCurrentNsfPath) {
            playerDiv.innerHTML = '';
            return;
        }

        const fileName = uiCurrentNsfPath.split('/').pop().replace(/\.js$/i, '');
        const trackDisplay = uiTotalTracks > 0 ? `${uiCurrentTrack + 1}/${uiTotalTracks}` : '--/--';

        playerDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">
                <span style="color: #4CAF50; font-weight: bold;">${fileName}</span>
                <span style="color: #FF9800;">[${trackDisplay}]</span>
                <button id="prevTrackBtn" style="padding: 4px 8px; background: #666; color: #fff; border: none; border-radius: 3px; cursor: pointer;" ${uiTotalTracks <= 1 ? 'disabled' : ''}>◀</button>
                <button id="playPauseBtn" style="padding: 4px 8px; background: #1976D2; color: #fff; border: none; border-radius: 3px; cursor: pointer;">${uiIsPlaying ? '⏸' : '▶'}</button>
                <button id="nextTrackBtn" style="padding: 4px 8px; background: #666; color: #fff; border: none; border-radius: 3px; cursor: pointer;" ${uiTotalTracks <= 1 ? 'disabled' : ''}>▶</button>
            </div>
        `;

        // 绑定按钮事件
        const prevBtn = playerDiv.querySelector('#prevTrackBtn');
        const playPauseBtn = playerDiv.querySelector('#playPauseBtn');
        const nextBtn = playerDiv.querySelector('#nextTrackBtn');

        if (prevBtn) prevBtn.onclick = prevUiTrack;
        if (playPauseBtn) playPauseBtn.onclick = toggleUiPlayback;
        if (nextBtn) nextBtn.onclick = nextUiTrack;
    }

    // 监控内存写入的函数（只处理音乐播放逻辑）
    let isWritingStopCommand = false; // 防止递归写入停止命令
    let isManualWrite = false; // UI 发起的写入标志
    // 判断 PC 是否来源于内部写声音的子例程（sub_CBF1）或其范围
    function isPcFromInternalSoundRoutine(pc) {
        if (typeof pc !== 'number') return false;
        // sub_CBF1 在汇编中位于 0x03CC01 附近，写入操作在 0x03CC0E
        // 我们放宽范围以包含可能的变体
        if (pc >= 0x03CBF0 && pc <= 0x03CC20) return true;
        return false;
    }

    // 可配置选项（将来可暴露于 UI）
    const customMusicOptions = {
        // 如果 true，则允许游戏自行停止外部音乐（旧行为）。false 则默认阻止非手动写入停止外部音乐。
        allowGameToStopExternal: false,
    };

    function monitorMemoryWrite(address, value) {
        if (!customMusicEnabled) return false;
        if (isWritingStopCommand) return false;

        // 只监控 0x700 地址的写入
        if (address !== 0x700) return false;

        musicBufferState[0] = value; // 更新本地缓冲区状态
        const hexValue = value.toString(16).toUpperCase().padStart(2, '0');

        // 快速查找映射（如果存在）
        const mapping = musicMappings[hexValue];
        if (mapping) mapping.code = hexValue;

        // 辅助：判断写入是否表示 BGM（优先使用映射的 type，其次使用数值阈值）
        const val = value & 0xFF;
        const isMappedBgm = !!(mapping && mapping.type === 'bgm');
        const isMappedSe = !!(mapping && mapping.type === 'se');
        const isValueBgmByThreshold = val >= 0x32; // 来自汇编的阈值判断
        const incomingIsBgm = isMappedBgm || (!mapping && isValueBgmByThreshold) || (mapping && mapping.type === undefined && isValueBgmByThreshold) || (mapping && mapping.type === 'bgm');

        // 调试输出：非 SE 的写入（含未映射、自定义 type）与停止命令打印到控制台，
        // 便于观察球权切换时的命令序列。只挡 type:'se' 的音效防刷屏，
        // 其余 type（bgm/未写/自定义值）一律打印，并附带实际 type 值方便核对。
        if (window.__cmDebug && (val >= 0x32 || val === 0x01) && !(mapping && mapping.type === 'se')) {
            if (val === 0x01) {
                console.log(`[自定义音乐] $0700 ← 0x01（停止命令）`);
            } else if (mapping) {
                console.log(`[自定义音乐] $0700 ← 0x${hexValue} - ${mapping.note || mapping.name || '已映射'} (type:${mapping.type})`);
            } else {
                console.log(`[自定义音乐] $0700 ← 0x${hexValue}（未映射）`);
            }
        }

        // 如果写入正要触发 BGM：
        if (incomingIsBgm) {
            // 如果当前外部播放的是 BGM（即 currentNsfPlayer 不为空），并且来的是 BGM，则我们希望替换外部音乐
            if (currentNsfPlayer) {
                // 但如果该映射显式标记为 SE，则不要替换
                if (isMappedSe) {
                    const t = new Date().toLocaleTimeString();
                    monitorLog.unshift(`${t}: mapped as SE 0x${hexValue} ignored while external BGM playing`);
                    if (monitorLog.length > 50) monitorLog.pop();
                    forceUpdateMonitorDisplay();
                    return false;
                }

                // 执行外部 BGM -> 外部 BGM 的切换：播放新外部音乐，但不要写入 0x01 停止内部音乐（skipStopCommand = true）
                if (mapping && mapping.path) {
                    const t2 = new Date().toLocaleTimeString();
                    monitorLog.unshift(`${t2}: switching external BGM to mapped 0x${hexValue}`);
                    if (monitorLog.length > 50) monitorLog.pop();
                    forceUpdateMonitorDisplay();
                    playNsfMusic(mapping, { skipStopCommand: true });
                    return true; // 我们拦截这次写入以处理外部音乐切换
                }

                // 如果没有映射，但值表明为 BGM（阈值），且用户允许游戏停止外部音乐，则停止外部音乐
                if (!mapping && isValueBgmByThreshold) {
                    if (customMusicOptions.allowGameToStopExternal) {
                        const t3 = new Date().toLocaleTimeString();
                        monitorLog.unshift(`${t3}: unmapped BGM value 0x${hexValue} accepted to stop external BGM`);
                        if (monitorLog.length > 50) monitorLog.pop();
                        forceUpdateMonitorDisplay();
                        stopMusic();
                        return false; // 放行写入
                    } else {
                        const t4 = new Date().toLocaleTimeString();
                        monitorLog.unshift(`${t4}: unmapped BGM 0x${hexValue} ignored while external BGM playing (option blocked)`);
                        if (monitorLog.length > 50) monitorLog.pop();
                        forceUpdateMonitorDisplay();
                        return false;
                    }
                }
            } else {
                // 没有外部音乐在播放：如果是映射的BGM，直接播放（允许写入/替换内部音乐）
                if (mapping && mapping.path) {
                    const t5 = new Date().toLocaleTimeString();
                    monitorLog.unshift(`${t5}: playing mapped BGM 0x${hexValue}`);
                    if (monitorLog.length > 50) monitorLog.pop();
                    forceUpdateMonitorDisplay();
                    playNsfMusic(mapping); // 默认会写入 0x01 停止内部音乐
                    return true;
                }

                // 未映射但数值为BGM：按配置决定是否允许停止内部音乐（老行为）
                if (!mapping && isValueBgmByThreshold) {
                    if (customMusicOptions.allowGameToStopExternal) {
                        const t6 = new Date().toLocaleTimeString();
                        monitorLog.unshift(`${t6}: unmapped BGM value 0x${hexValue} allowed (no external playing)`);
                        if (monitorLog.length > 50) monitorLog.pop();
                        forceUpdateMonitorDisplay();
                        stopMusic();
                        return false;
                    }
                }
            }

            return false;
        }

        // 处理写入 0x01 的特殊情况：写入 0x01 到 0x700 时停止外部 NSF 音乐播放
        if (val === 0x01) {
            // 总是停止外部 NSF 音乐
            stopMusic();

            // UI 手动写入直接允许停止
            if (isManualWrite) {
                return false; // 放行写入
            }

            const pc = (window.nes && window.nes.cpu && typeof window.nes.cpu.br !== 'undefined') ? window.nes.cpu.br[0] : undefined;
            if (isPcFromInternalSoundRoutine(pc)) {
                const t7 = new Date().toLocaleTimeString();
                monitorLog.unshift(`${t7}: internal routine wrote 0x01 -> stopping external music`);
                if (monitorLog.length > 50) monitorLog.pop();
                forceUpdateMonitorDisplay();
                return false;
            }

            // 不是内部例程写入的 0x01，也停止了外部音乐，但记录日志
            const t8 = new Date().toLocaleTimeString();
            monitorLog.unshift(`${t8}: game wrote 0x01 from non-sound-routine (external music stopped)`);
            if (monitorLog.length > 50) monitorLog.pop();
            forceUpdateMonitorDisplay();
            return false;
        }

        // 其余情况（例如短音效 SE 的值 < 0x32），在有外部音乐时默认忽略
        if (currentNsfPlayer) {
            const t9 = new Date().toLocaleTimeString();
            const hx = val.toString(16).toUpperCase().padStart(2, '0');
            monitorLog.unshift(`${t9}: SE/other 0x${hx} ignored while external BGM playing`);
            if (monitorLog.length > 50) monitorLog.pop();
            forceUpdateMonitorDisplay();
            return false;
        }

        return false; // 默认放行
    }

    // 获取当前音乐状态信息
    function getMusicStatus() {
        const status = {
            externalActive: !!(currentNsfPlayer),
            externalCode: currentPlayingCode,
            externalTrack: currentPlayingTrack,
            bufferState: [...musicBufferState]
        };
        return status;
    }

    // 强制更新UI显示（用于外部音乐状态变化时）
    function forceUpdateMonitorDisplay() {
        if (!customMusicEnabled || !isOverlayOpen) return;

        const monitorDiv = document.getElementById('memoryMonitor');
        if (!monitorDiv) return;

        const status = getMusicStatus();
        let statusHtml = '';

        // 显示当前音乐状态
        statusHtml += '<div style="margin-bottom: 8px; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 3px;">';
        statusHtml += '<div style="font-weight: bold; color: #4CAF50;">音乐状态:</div>';

        if (status.externalActive) {
            const trackText = status.externalTrack ? ` (曲目 ${status.externalTrack})` : '';
            statusHtml += `<div style="color: #2196F3;">外部NSF: 0x${status.externalCode || '--'}${trackText} (播放中)</div>`;
        } else {
            statusHtml += '<div style="color: #888;">外部NSF: 未播放</div>';
        }

        statusHtml += '</div>';

        // 显示缓冲区状态
        statusHtml += '<div style="margin-bottom: 8px; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 3px;">';
        statusHtml += '<div style="font-weight: bold; color: #4CAF50;">音乐缓冲区 (0x0700-0x0704):</div>';
        statusHtml += '<div style="font-family: monospace; font-size: 11px;">';
        for (let i = 0; i < 5; i++) {
            const val = status.bufferState[i];
            const color = val === 0 ? '#888' : (val === 1 ? '#f44336' : '#4CAF50');
            statusHtml += `<span style="color: ${color};">[${i}]: ${val.toString(16).toUpperCase().padStart(2, '0')}</span> `;
        }
        statusHtml += '</div></div>';

        // 显示最近的内存写入记录
        if (monitorLog.length === 0) {
            statusHtml += '<div>等待内存写入...</div>';
        } else {
            statusHtml += '<div style="font-weight: bold; color: #4CAF50;">最近写入记录:</div>';
            statusHtml += monitorLog.map(entry => {
                const parts = entry.split(': ');
                const time = parts[0];
                const data = parts.slice(1).join(': ');

                // 高亮匹配的音乐代码
                const match = data.match(/<- 0x([0-9A-F]{2})/);
                if (match) {
                    const code = match[1];
                    const hasMapping = musicMappings[code] && musicMappings[code].path;
                    const mapping = musicMappings[code];
                    const color = hasMapping ? '#4CAF50' : (mapping ? '#FF9800' : '#888');
                    let displayText = data;
                    if (mapping) {
                        displayText += ` → ${mapping.name}`;
                        if (mapping.index !== undefined) {
                            displayText += ` [曲目${mapping.index}]`;
                        }
                        if (mapping.note) {
                            displayText += ` [${mapping.note}]`;
                        }
                    }
                    return `<div style="margin-bottom: 2px;">
                        <span style="color: #888; font-size: 10px;">${time}</span><br>
                        <span style="color: ${color};">${displayText}</span>
                    </div>`;
                }
                return `<div style="margin-bottom: 2px;">
                    <span style="color: #888; font-size: 10px;">${time}</span><br>
                    <span>${data}</span>
                </div>`;
            }).join('');
        }

        monitorDiv.innerHTML = statusHtml;
    }

    // 创建自定义音乐设置界面
    function createCustomMusicUI() {
        // 检查游戏运行状态
        wasGameRunning = false;
        if (typeof window.paused !== 'undefined') {
            wasGameRunning = !window.paused; // 如果没有暂停，那么游戏在运行
            if (wasGameRunning) {
                if (typeof window.pause === 'function') {
                    window.pause();
                }
            }
        }

        // 检查外部NSF播放状态
        wasExternalNsfPlaying = false;
        pausedExternalMapping = null;
        pausedExternalTrack = null;
        if (currentNsfPlayer && currentPlayingCode) {
            wasExternalNsfPlaying = true;
            // 保存当前播放的映射信息
            pausedExternalMapping = musicMappings[currentPlayingCode];
            pausedExternalTrack = currentPlayingTrack;
            // 注意：不再在这里手动停止NSF，因为 window.pause() 会自动处理
        }

        // 如果已经打开，先关闭
        const existing = document.getElementById('customMusicContainer');
        if (existing) {
            existing.remove();
        }

        isOverlayOpen = true;

        // 创建一个浮动容器（无遮罩层），可拖动，不遮挡游戏交互（仅阻塞容器自身区域）
        const container = document.createElement('div');
        container.id = 'customMusicContainer';
        // 初始居中；当开始拖动时会切换到像素定位
        container.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 600px;
            max-width: calc(100vw - 40px);
            max-height: calc(100vh - 40px);
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid #666;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* 内部滚动由 content 区域处理 */
            pointer-events: auto;
        `;

        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            padding: 15px;
            color: #fff;
            overflow: auto; /* 当容器或窗口较小时显示滚动条 */
            box-sizing: border-box;
            max-height: calc(100vh - 80px);
        `;

        contentWrapper.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #666; padding-bottom: 10px;">
                <h3 style="margin: 0; color: #fff;">自定义音乐设置</h3>
                <button id="closeCustomMusic" style="background: #f44336; color: white; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer; font-size: 12px;">关闭</button>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="customMusicEnabled" ${customMusicEnabled ? 'checked' : ''}>
                    <span>启用自定义音乐功能(支持未使用的音乐代码)</span>
                </label>
            </div>

            <div style="margin-bottom: 15px;display:none !important;">
                <label style="margin-bottom: 5px; color: #4CAF50; font-weight: bold;display:none !important;">
                    NSF播放器帧率 (FPS):
                </label>
                <div id="nsfFpsWrapper">
                <select id="nsfFpsSelect" style="padding: 6px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="10" ${externalNsfFps === 10 ? 'selected' : ''}>10 FPS (低端设备推荐)</option>
                    <option value="15" ${externalNsfFps === 15 ? 'selected' : ''}>15 FPS</option>
                    <option value="30" ${externalNsfFps === 30 ? 'selected' : ''}>30 FPS</option>
                    <option value="45" ${externalNsfFps === 45 ? 'selected' : ''}>45 FPS</option>
                    <option value="60" ${externalNsfFps === 60 ? 'selected' : ''}>60 FPS</option>
                    <option value="120" ${externalNsfFps === 120 ? 'selected' : ''}>120 FPS</option>
                </select>
                </div>
                <div style="margin-top: 3px; font-size: 11px; color: #ccc;">
                    这是针对外部播放NSF设置的选项，影响缓冲区填充速度，较低FPS减少CPU负载，适合低端设备；
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #4CAF50; font-weight: bold;">
                    NSF播放引擎:(不支持SE替换)
                </label>
                <!-- 禁用 JSNSF 选择，默认并固定为 GME -->
                <select id="nsfEngineSelect" style="padding: 6px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    <option value="gme" selected>GME WASM (多格式)</option>
                </select>
                <div style="margin-top: 3px; font-size: 11px; color: #ccc;">
                    GME: 支持NSF/NSFE/VGM/VGZ/GYM/SPC/SAP/GBS/AY/HES/KSS等多格式（通过JS文件加载）
                </div>
            </div>

            <div style="margin-bottom: 15px; border: 1px solid #666; border-radius: 4px; padding: 10px; background: rgba(255,255,255,0.05);">
                <div style="font-weight: bold; margin-bottom: 8px; color: #4CAF50;">实时内存监控 (0x700-0x704) 写入01可停止音乐播放</div>
                <div id="memoryMonitor" style="font-family: monospace; font-size: 12px; max-height: 100px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 3px;">
                    等待内存写入...
                </div>
                <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
                    <input id="memoryWriteInput" placeholder="输入十六进制字节，例如: 01 02 AF" style="flex:1; padding:6px; background:#222; border:1px solid #555; color:#fff; border-radius:4px; font-family:monospace; font-size:12px;">
                    <button id="memoryWriteBtn" style="padding:6px 10px; background:#1976D2; color:#fff; border:none; border-radius:4px; cursor:pointer;">写入 0x700</button>
                </div>
            </div>

            <div style="margin-bottom: 15px;">
                <strong>NSF音乐映射设置:</strong>
                <div id="nsfPlayer" style="margin-top: 5px;"></div>
                <div style="margin-top: 5px; font-size: 11px; color: #ccc;">
                    配置存储在 music/music_config.js 中，点击NSF路径可试听<br>最好在游戏未运行的时候试听避免造成音乐混乱
                </div>
            </div>

            <div id="musicMappings" style="margin-bottom: 15px; max-height: 350px; overflow-y: auto; border: 1px solid #666; padding: 10px; border-radius: 4px; background: rgba(255,255,255,0.05);">
                <!-- 动态添加的映射项 -->
            </div>
        `;

        // 将 contentWrapper 放入浮动容器并挂到 body
        container.appendChild(contentWrapper);
        document.body.appendChild(container);

        // 绑定事件（传入 container 作为 dialog 兼容旧逻辑）
        setupUIEvents(container);
        refreshMappingsList();

        // 可拖动：使用整个标题栏区域作为拖拽手柄
        const headerDiv = container.querySelector('div[style*="justify-content: space-between"]');
        if (headerDiv) {
            headerDiv.style.cursor = 'move';
            let dragging = false;
            let startX = 0, startY = 0, origX = 0, origY = 0;

            function onPointerMove(e) {
                if (!dragging) return;
                const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
                const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY);
                if (clientX === undefined || clientY === undefined) return;

                const dx = clientX - startX;
                const dy = clientY - startY;

                // 切换到像素定位（取消 translate 中心）
                if (container.style.transform) {
                    const rect = container.getBoundingClientRect();
                    container.style.left = rect.left + 'px';
                    container.style.top = rect.top + 'px';
                    container.style.transform = '';
                }

                container.style.left = (origX + dx) + 'px';
                container.style.top = (origY + dy) + 'px';
            }

            function onPointerUp() {
                dragging = false;
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                document.removeEventListener('touchmove', onPointerMove);
                document.removeEventListener('touchend', onPointerUp);
            }

            headerDiv.addEventListener('pointerdown', (ev) => {
                ev.preventDefault();
                dragging = true;
                startX = ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX);
                startY = ev.clientY !== undefined ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY);

                const rect = container.getBoundingClientRect();
                origX = rect.left;
                origY = rect.top;

                document.addEventListener('pointermove', onPointerMove);
                document.addEventListener('pointerup', onPointerUp);
                document.addEventListener('touchmove', onPointerMove, { passive: false });
                document.addEventListener('touchend', onPointerUp);
            });

            // 防止文本选择
            headerDiv.addEventListener('selectstart', (e) => e.preventDefault());
        }
    }

    // 设置UI事件
    function setupUIEvents(dialog) {
        // dialog parameter may be the old dialog element or the new floating container
        const root = dialog || document;
        const enabledCheckbox = root.querySelector('#customMusicEnabled');
        const closeBtn = root.querySelector('#closeCustomMusic');

        // 绑定内存写入控件
        const writeInput = dialog.querySelector('#memoryWriteInput');
        const writeBtn = dialog.querySelector('#memoryWriteBtn');
        if (writeBtn) {
            writeBtn.addEventListener('click', () => {
                const hexText = writeInput ? writeInput.value : '';
                try {
                    const bytes = parseHexString(hexText);
                    if (bytes.length === 0) return;
                    writeHexTo700(bytes);
                } catch (e) {
                    log('无效的十六进制输入: ' + e.message, 'error');
                }
            });
        }

        // 绑定FPS选择器
        const fpsSelect = dialog.querySelector('#nsfFpsSelect');
        if (fpsSelect) {
            fpsSelect.addEventListener('change', function () {
                externalNsfFps = parseInt(this.value);
                // 如果有NSF正在播放，立即应用新的fps设置
                if (window.nsfTargetFps !== undefined) {
                    window.nsfTargetFps = externalNsfFps;
                }
                log(`外部NSF播放FPS已设置为: ${externalNsfFps}`, 'music');
            });
        }

        // 绑定引擎选择器
        const engineSelect = dialog.querySelector('#nsfEngineSelect');
        if (engineSelect) {
            // UI 中的引擎选择器保持可见但不可更改（强制使用GME）
            engineSelect.addEventListener('change', function () {
                // 恢复到 GME（忽略用户选择）
                if (this.value !== 'gme') {
                    this.value = 'gme';
                }
                nsfEngine = 'gme';
            });
        }

        enabledCheckbox.onchange = function () {
            const wasEnabled = customMusicEnabled;
            customMusicEnabled = this.checked;
            // 按当前游戏名记住勾选状态（该功能针对游戏，换游戏默认关闭）
            try {
                const storeKey = loadedName ? ('customMusicEnabled_' + loadedName) : 'customMusicEnabled_global';
                localStorage.setItem(storeKey, this.checked ? '1' : '0');
            } catch (e) {}

            // 如果刚启用，开始预加载所有NSF文件
            if (customMusicEnabled && !wasEnabled) {
                  log(`自定义音乐功能${customMusicEnabled ? '已启用' : '已禁用'}`, 'music');
                preloadAllNsfFiles().catch(error => {
                    console.error('NSF文件预加载失败:', error);
                });
            }
            // 如果刚禁用，执行清理所有音频播放器
             if (!customMusicEnabled ) {
                log('取消勾选自定义音乐，开始清理所有音频播放器...', 'music');
                if (typeof window.cleanupAllAudioPlayers === 'function') {
                    const stoppedCount = window.cleanupAllAudioPlayers();
                    log(`清理完成，共停止 ${stoppedCount} 个音频播放器`, 'music');
                } else {
                    log('错误：cleanupAllAudioPlayers 函数未找到', 'error');
                }
            }
        };

        closeBtn.onclick = function () {
            // 停止UI NSF播放
            stopUiNsf();

            // 注意：不再在这里手动恢复外部NSF，因为 window.unpause() 会自动处理

            // 恢复游戏状态
            if (wasGameRunning && typeof window.unpause === 'function') {
                window.unpause();
            }

            isOverlayOpen = false;
            // remove the outer container element
            const container = document.getElementById('customMusicContainer') || document.getElementById('customMusicOverlay');
            if (container && container.parentNode) container.parentNode.removeChild(container);
        };
    }

    // 解析十六进制字符串为字节数组，接受空格或逗号分隔
    function parseHexString(s) {
        if (!s) return [];
        // 移除所有非十六进制字符（保留空格以便分隔），然后按空白分割
        const parts = s.trim().split(/[^0-9a-fA-F]+/).filter(Boolean);
        const bytes = parts.map(p => {
            if (!/^[0-9a-fA-F]{1,2}$/.test(p)) throw new Error(p);
            return parseInt(p, 16) & 0xFF;
        });
        return bytes;
    }

    // 将字节数组写入 0x700 起始地址，并更新监控状态与日志
    function writeHexTo700(bytes) {
        if (!bytes || bytes.length === 0) return;
        const base = 0x700;

        // 标记为手动写入，monitorMemoryWrite 会检测此标志并区别处理
        isManualWrite = true;
        try {
            for (let i = 0; i < bytes.length && i < 5; i++) {
                const addr = base + i;
                const val = bytes[i] & 0xFF;

                // 优先使用 window.nes.write，如果不可用，尝试 CPU 的写入接口
                try {
                    if (window.nes && typeof window.nes.write === 'function') {
                        window.nes.write(addr, val);
                    } else if (window.nes && window.nes.cpu && typeof window.nes.cpu.writeMemory === 'function') {
                        nes.cpu.writeMemory(addr, val);
                    } else if (window.nes && nes.cpu && typeof nes.cpu.write === 'function') {
                        nes.cpu.write(addr, val);
                    } else {
                        // 无法直接写入 NES 内存，仍更新本地状态模拟写入
                    }
                } catch (e) {
                    // 写入可能因模拟器保护失败，依然更新本地状态
                }

                // 更新本地缓冲区状态和监控日志
                musicBufferState[i] = val;
                const time = new Date().toLocaleTimeString();
                const hex = val.toString(16).toUpperCase().padStart(2, '0');
                monitorLog.unshift(`${time}: -> 0x${hex}`);
                if (monitorLog.length > 50) monitorLog.pop();

                // 调用 monitorMemoryWrite 以触发播放逻辑（monitor 会识别 isManualWrite 并做合适处理）
                try {
                    if (typeof monitorMemoryWrite === 'function') monitorMemoryWrite(addr, val);
                } catch (e) {
                    // 忽略 monitor 内部错误
                }
            }
        } finally {
            isManualWrite = false;
        }

        forceUpdateMonitorDisplay();
    }


    // 刷新映射列表显示
    function refreshMappingsList() {
        const container = document.querySelector('#musicMappings');
        if (!container) return;
        container.innerHTML = '';

        const configToUse = window.musicConfig || defaultMusicConfig;

        // 支持两种配置格式：普通对象（旧）或 Map（新）。
        // 如果是 Map，保留插入顺序；如果是对象，使用其可枚举属性顺序（受 JS 引擎规则影响）。
        let codes = [];
        if (configToUse instanceof Map) {
            codes = Array.from(configToUse.keys());
        } else if (typeof configToUse === 'object' && configToUse !== null) {
            codes = Object.keys(configToUse);
        }

        for (const code of codes) {
            const mapping = musicMappings[code.toUpperCase()];
            if (!mapping) continue;

            const mappingDiv = document.createElement('div');
            mappingDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; font-size: 12px;';

            // 创建所有元素并一次性添加到容器中
            const codeSpan = document.createElement('span');
            codeSpan.style.cssText = 'color: #4CAF50; font-weight: bold;';
            codeSpan.textContent = `0x${code.toUpperCase()}`;

            const arrow1 = document.createElement('span');
            arrow1.style.color = '#888';
            arrow1.textContent = '->';

            const pathSpan = document.createElement('span');
            pathSpan.style.cssText = 'color: #E0E0E0; flex: 1.5; cursor: pointer; text-decoration: underline;';
            pathSpan.textContent = mapping.path || '';
            pathSpan.title = '点击试听此NSF文件';
            // 使用立即执行函数表达式来避免闭包问题
            (function (path, index, name) {
                pathSpan.onclick = function () {
                    loadNsfForPlayer(path, index, name);
                };
            })(mapping.path, mapping.index || 0, mapping.name);

            const arrow2 = document.createElement('span');
            arrow2.style.color = '#888';
            arrow2.textContent = '->';

            const trackSpan = document.createElement('span');
            trackSpan.style.color = '#FF9800';
            trackSpan.textContent = `[${mapping.index !== undefined ? mapping.index : 0}]`;

            const arrow3 = document.createElement('span');
            arrow3.style.color = '#888';
            arrow3.textContent = '->';

            const noteSpan = document.createElement('span');
            noteSpan.style.cssText = 'color: #BDBDBD; flex: 2;';
            noteSpan.textContent = mapping.note || '';

            // 将所有元素添加到容器
            mappingDiv.appendChild(codeSpan);
            mappingDiv.appendChild(arrow1);
            mappingDiv.appendChild(pathSpan);
            mappingDiv.appendChild(arrow2);
            mappingDiv.appendChild(trackSpan);
            mappingDiv.appendChild(arrow3);
            mappingDiv.appendChild(noteSpan);

            container.appendChild(mappingDiv);
        }
    }

    // 为播放器加载NSF文件信息
    function loadNsfForPlayer(nsfPath, defaultTrack, variableName) {
        if (!nsfPath) return;

        loadNsfFile(nsfPath, false, variableName)
            .then(nsfData => {
                // 使用 NsfPlayer 来正确解析曲目总数
                let totalTracks = 1;
                try {
                    if (typeof NsfPlayer !== 'undefined') {
                        const tempPlayer = new NsfPlayer();
                        if (tempPlayer.loadNsf(Array.from(nsfData))) {
                            totalTracks = tempPlayer.totalSongs || 1;
                        }
                    }
                } catch (e) {
                    console.warn('无法解析NSF曲目总数，使用默认值1:', e);
                }

                uiTotalTracks = totalTracks;
                uiCurrentNsfPath = nsfPath;
                uiCurrentVariableName = variableName;
                uiCurrentTrack = Math.min(defaultTrack || 0, uiTotalTracks - 1);
                updateNsfPlayerUI();
                // 立即开始播放选中的曲目
                playUiNsf(uiCurrentNsfPath, uiCurrentTrack, variableName);
            })
            .catch(error => {
                console.error('加载NSF文件信息失败:', error);
                // 即使加载失败，也设置基本信息
                uiTotalTracks = 1;
                uiCurrentNsfPath = nsfPath;
                uiCurrentVariableName = variableName;
                uiCurrentTrack = defaultTrack || 0;
                updateNsfPlayerUI();
                // 即使加载失败也尝试播放（可能有缓存）
                playUiNsf(uiCurrentNsfPath, uiCurrentTrack, variableName);
            });
    }

    // 加载设置
    function loadSettings() {
        // 自定义音乐默认禁用；开关按游戏名各自记住（见 restoreCustomMusicEnabledForGame），
        // 在 ROM 载入时恢复，避免跨游戏误开启
        customMusicEnabled = false;

        // 强制使用 GME 引擎（忽略 localStorage 中的设置）
        nsfEngine = 'gme';

        // 只使用外部配置文件，不使用localStorage中的映射数据
        musicMappings = {};
        const configToUse = window.musicConfig || defaultMusicConfig;

        // 支持 Map 或普通对象
        let entries = [];
        if (configToUse instanceof Map) {
            entries = Array.from(configToUse.entries());
        } else if (typeof configToUse === 'object' && configToUse !== null) {
            entries = Object.entries(configToUse);
        }

        entries.forEach(([code, config]) => {
            const upperCode = String(code).toUpperCase();

            // 处理新的配置格式：path, index, note, name
            let name = '';
            let path = (config && config.path) || '';
            let index = (config && config.index) !== undefined ? config.index : 0; // 默认曲目索引为0
            let note = (config && config.note) || '';

            // 如果配置中有 name 字段且非空，使用它作为变量名
            if (config && config.name && typeof config.name === 'string' && config.name.trim()) {
                name = config.name.trim();
            } else if (path) {
                // 从路径中提取文件名作为name，去掉 .js 扩展名
                name = path.split('/').pop().replace(/\.js$/i, '') || path;
            }

            musicMappings[upperCode] = {
                name: name,
                path: path,
                index: index,
                note: note,
                // 支持可选字段 type: 'bgm' | 'se'，默认 'bgm'
                type: (config && config.type) || 'bgm'
            };
        });
    }

    // 初始化
    function init() {
        loadSettings();

        // 初始化缓冲区状态 - 从NES内存中读取当前状态
        if (window.nes && window.nes.cpu && typeof window.nes.cpu.readMemory === 'function') {
            for (let i = 0; i < 5; i++) {
                const address = 0x700 + i;
                musicBufferState[i] = window.nes.cpu.readMemory(address);
            }
        } else {
            // 如果无法读取，使用默认值
            musicBufferState.fill(0);
        }

        // 绑定按钮事件（仅在主应用程序中）
        const customMusicBtn = document.getElementById('customMusic');
        if (customMusicBtn) {
            customMusicBtn.onclick = function () {
                createCustomMusicUI();
            };
        }

        // 如果选择 GME，加载 WASM 模块
        if (nsfEngine === 'gme') {
            injectScript('lib/gme_player.js', { timeout: 10000 }).then(() => {
                if (typeof Module !== 'undefined') {
                    Module.onRuntimeInitialized = () => {
                        try { gmeBufferPtr = Module.ccall('get_buffer', 'number', [], []); } catch (e) { }
                        try { gmeDataPtr = Module.ccall('get_data_buffer', 'number', [], []); } catch (e) { }
                    };
                }
            }).catch(err => {
                console.warn('gme_player.js load failed during init:', err);
            });
        }

        // 暴露接口给NES/CPU
        window.customMusicMonitor = monitorMemoryWrite;
        window.customMusicUpdateMonitor = forceUpdateMonitorDisplay;
        window.customMusicStop = stopMusic;
        // 暴露暂停/恢复接口，供全局（例如游戏暂停/恢复）调用
        window.customMusicPause = function () {
            try {
                // 优先暂停内置的 NSFs（如果已加载）
                if (typeof nsfPauseToggle === 'function' && window.nsfLoaded && !window.nsfPaused) {
                    nsfPauseToggle();
                }
            } catch (e) {
                console.warn('customMusicPause: nsfPauseToggle failed', e);
            }

            try {
                // 对于 GME：断开 ScriptProcessor 节点输出以暂停声音，但保留内部状态以便恢复
                if (typeof gmeScriptNode !== 'undefined' && gmeScriptNode) {
                    try { gmeScriptNode.disconnect(); } catch (e) { }
                    window._gmePausedByGame = true;
                }

                // 如果存在且处于 suspended 状态，则不执行 resume
            } catch (e) {
                console.warn('customMusicPause: gme pause failed', e);
            }
        };

        window.customMusicResume = function () {
            try {
                // 恢复 NSFs
                if (typeof nsfPauseToggle === 'function' && window.nsfLoaded && window.nsfPaused) {
                    // 预填充缓冲/恢复逻辑由 nsfPauseToggle 内部处理
                    nsfPauseToggle();
                }
            } catch (e) {
                console.warn('customMusicResume: nsfPauseToggle failed', e);
            }

            try {
                // 恢复 GME：如果此前由 customMusicPause 暂停过，尝试重连或重建播放节点
                if (window._gmePausedByGame) {
                    // 如果原有节点仍在且 audioContext 可用，重新连接
                    if (typeof gmeScriptNode !== 'undefined' && gmeScriptNode && gmeAudioContext && gmeAudioContext.state !== 'closed') {
                        try {
                            // 如果 audioContext 被挂起，先 resume
                            if (gmeAudioContext.state === 'suspended' && typeof gmeAudioContext.resume === 'function') {
                                gmeAudioContext.resume().catch(() => { });
                            }
                            gmeScriptNode.connect && gmeScriptNode.connect(getMuteGainNode(gmeAudioContext));
                        } catch (e) {
                            // 重连失败，尝试重建播放节点
                            try { playGmeBackground(); } catch (ee) { console.warn('playGmeBackground failed', ee); }
                        }
                    } else {
                        // 节点不存在或 audioContext 不可用，尝试重新创建播放节点
                        try { playGmeBackground(); } catch (e) { console.warn('playGmeBackground failed', e); }
                    }
                    window._gmePausedByGame = false;
                }
            } catch (e) {
                console.warn('customMusicResume: gme resume failed', e);
            }
        };
        window.getMusicStatus = getMusicStatus;
        // 按 ROM 名恢复"启用自定义音乐功能"开关：该设置按游戏各自记住，未记录的游戏默认关闭。
        // 由 dbmain.js 在 ROM 载入完成后调用，须在读档恢复音乐现场之前执行。
        window.restoreCustomMusicEnabledForGame = function (gameName) {
            let on = false;
            try { on = !!gameName && localStorage.getItem('customMusicEnabled_' + gameName) === '1'; } catch (e) {}
            customMusicEnabled = on;
            if (on) {
                preloadAllNsfFiles().catch(function (error) {
                    console.error('NSF文件预加载失败:', error);
                });
            }
            return on;
        };
        window.enableCustomMusic = function () { customMusicEnabled = true; };
        window.playNsfMusic = playNsfMusic;
        window.musicMappings = musicMappings;
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            // 在编辑器环境中跳过DOM操作
            if (window.location.pathname.includes('music_config_editor.html')) {
                // 只设置必要的全局变量
                window.customMusicMonitor = monitorMemoryWrite;
                window.customMusicUpdateMonitor = forceUpdateMonitorDisplay;
                window.customMusicStop = stopMusic;
                window.getMusicStatus = getMusicStatus;
                window.enableCustomMusic = function () { customMusicEnabled = true; };
                window.playNsfMusic = playNsfMusic;
                window.musicMappings = musicMappings;
                loadSettings();
            } else {
                init();
            }
        });
    } else {
        // 在编辑器环境中跳过DOM操作
        if (window.location && window.location.pathname && window.location.pathname.includes('music_config_editor.html')) {
            // 只设置必要的全局变量
            window.customMusicMonitor = monitorMemoryWrite;
            window.customMusicUpdateMonitor = forceUpdateMonitorDisplay;
            window.customMusicStop = stopMusic;
            window.getMusicStatus = getMusicStatus;
            window.enableCustomMusic = function () { customMusicEnabled = true; };
            window.playNsfMusic = playNsfMusic;
            window.musicMappings = musicMappings;
            loadSettings();
        } else {
            init();
        }
    }

})();