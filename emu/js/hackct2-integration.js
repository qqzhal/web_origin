/**
 * 天使之翼2修改器集成模块
 * 实现模拟器与修改器的数据交互和功能整合
 */

// 全局变量定义
window.HackCT2Integration = {
    // 修改器窗口对象
    hackWindow: null,
    // 当前ROM数据缓存
    currentRomData: null,
    // 修改器是否已打开
    isHackOpen: false,
    // 同步状态
    syncStatus: {
        lastSyncTime: 0,
        pendingChanges: false,
        autoSync: true
    },
    // 修改器配置
    config: {
        showSyncButton: true,
        autoHideTabs: true,
        defaultTab: '队伍'
    }
}

/**
 * 恢复最小化的修改器弹出层
 */
function restoreHackModal() {
    const overlay = document.getElementById('hackCT2Overlay');
    const floatingBtn = document.getElementById('floatingCT2Btn');
    
    
    if (overlay) {
        overlay.style.display = 'flex';
    }
    
    if (floatingBtn) {
        floatingBtn.style.display = 'none';
    }
    
    // 更新状态
    const integration = window.HackCT2Integration;
    if (integration) {
        integration.isMinimized = false;
    }
    
};

/**
 * 打开修改器
 * 验证游戏加载状态，创建拟态层弹窗并传递ROM数据
 * 实现点击TAB时的状态检查机制：若已有弹窗则先销毁再重新打开
 */
function openHackCT2() {
    const integration = window.HackCT2Integration;
    
    // 验证游戏是否已加载
    if (!isGameLoaded()) {
        showGameNotLoadedAlert();
        return;
    }
    
    // 验证ROM数据
    if (!window.nes.mapper || !window.nes.mapper.prgRom) {
        showRomExtractionError();
        return;
    }
    
    // 检查是否已有修改器弹窗打开（状态检查机制）
    const existingModal = document.getElementById('hackCT2Modal');
    const existingOverlay = document.getElementById('hackCT2Overlay');
    
    if (existingModal || existingOverlay) {
        
        // 销毁当前弹窗
        if (existingModal) {
            existingModal.remove();
        }
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        // 重置状态
        integration.isHackOpen = false;
        integration.hackWindow = null;
        
        // 短暂延迟后重新打开新弹窗，确保销毁完成
        setTimeout(() => {
            createNewHackModal();
        }, 100);
    } else {
        // 没有已存在的弹窗，直接创建新弹窗
        createNewHackModal();
    }
}

/**
 * 创建新的修改器拟态层弹窗
 * 提取ROM数据并创建弹窗界面
 */
function createNewHackModal() {
    const integration = window.HackCT2Integration;
    
    try {
        // 提取ROM数据
        const romData = extractRomDataFromEmulator();
        if (!romData) {
            showRomExtractionError();
            return;
        }
        
        // 缓存ROM数据
        integration.currentRomData = romData;
        
        // 创建修改器拟态层弹窗（替代原有的新窗口方式）
        createHackModalLayer(romData);
        
    } catch (error) {
        console.error('打开修改器失败:', error);
        showErrorAlert('打开修改器失败: ' + error.message);
    }
}

/**
 * 从模拟器提取ROM数据
 * 整合PRG ROM、CHR ROM和其他相关数据
 */
function extractRomDataFromEmulator() {
    try {
        const nes = window.nes;
        const mapper = nes.mapper;
        
        // 获取PRG ROM大小
        const prgRomSize = mapper.prgRom ? mapper.prgRom.length : 0;
        const chrRomSize = mapper.chrRom ? mapper.chrRom.length : 0;
        
        // 创建完整的ROM数据（包含原始头部和mapper.rom数据）
        const totalSize = nes.romheadbase.length + (mapper.rom ? mapper.rom.length : 0);
        const romData = new Uint8Array(totalSize);
        
        // 复制原始头部数据
        romData.set(nes.romheadbase, 0);
        
        // 复制mapper.rom数据（PRG+CHR）
        if (mapper.rom) {
            romData.set(mapper.rom, nes.romheadbase.length);
        }
        
        return romData;
        
    } catch (error) {
        console.error('提取ROM数据失败:', error);
        return null;
    }
}

// createNesHeader函数已移除 - 现在使用原始ROM头部数据

/**
 * 获取当前mapper类型
 * 返回当前游戏的mapper类型信息
 */
function getCurrentMapperType() {
    try {
        const nes = window.nes;
        const mapper = nes.mapper;
        
        if (mapper && mapper.type !== undefined) {
            return mapper.type;
        }
        
        // 根据mapper的构造函数或其他属性判断类型
        if (mapper && mapper.constructor && mapper.constructor.name) {
            return mapper.constructor.name;
        }
        
        return 'Unknown';
    } catch (error) {
        console.error('获取mapper类型失败:', error);
        return 'Unknown';
    }
}


/**
 * 创建修改器窗口
 * 打开修改器页面并建立通信机制
 */
function createHackWindow(romData) {
    const integration = window.HackCT2Integration;
    
    try {
        // 计算窗口大小和位置
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const windowWidth = Math.min(1200, screenWidth * 0.8);
        const windowHeight = Math.min(800, screenHeight * 0.8);
        const left = (screenWidth - windowWidth) / 2;
        const top = (screenHeight - windowHeight) / 2;
        
        // 打开修改器窗口
        const hackUrl = '../index.html?mode=integrated&timestamp=' + Date.now();
        integration.hackWindow = window.open(
            hackUrl,
            'HackCT2Window',
            `width=${windowWidth},height=${windowHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
        
        if (!integration.hackWindow) {
            alert('无法打开修改器窗口，请检查弹窗拦截设置');
            return;
        }
        
        integration.isHackOpen = true;
        
        // 等待修改器窗口加载完成
        setTimeout(() => {
            if (integration.hackWindow && !integration.hackWindow.closed) {
                // 传递ROM数据到修改器
                passRomDataToHack(romData);
                
                // 设置窗口关闭监听
                setupWindowCloseListener();
                
                // 建立双向通信
                setupBidirectionalCommunication();
            }
        }, 2000);
        
    } catch (error) {
        console.error('创建修改器窗口失败:', error);
        alert('创建修改器窗口失败: ' + error.message);
        integration.isHackOpen = false;
    }
}

/**
 * 传递ROM数据到修改器
 * 通过postMessage机制安全传递数据
 */
function passRomDataToHack(romData) {
    const integration = window.HackCT2Integration;
    
    if (!integration.hackWindow || integration.hackWindow.closed) {
        console.error('修改器窗口不可用');
        return;
    }
    
    try {
        // 发送ROM数据到修改器
        integration.hackWindow.postMessage({
            type: 'ROM_DATA',
            data: Array.from(romData), // 转换为普通数组
            timestamp: Date.now(),
            source: 'emulator'
        }, '*');
        
        
    } catch (error) {
        console.error('传递ROM数据失败:', error);
    }
}

/**
 * 设置窗口关闭监听
 * 处理修改器窗口关闭事件
 */
function setupWindowCloseListener() {
    const integration = window.HackCT2Integration;
    
    const checkWindowClosed = setInterval(() => {
        if (integration.hackWindow && integration.hackWindow.closed) {
            // 修改器窗口已关闭
            integration.hackWindow = null;
            integration.isHackOpen = false;
            integration.currentRomData = null;
            
            clearInterval(checkWindowClosed);
        }
    }, 1000);
}

/**
 * 建立双向通信机制
 * 设置消息监听，处理修改器的请求和数据更新
 */
function setupBidirectionalCommunication() {
    window.addEventListener('message', handleHackMessage);
}

/**
 * 处理来自修改器的消息
 * 实现数据同步和功能交互
 */
function handleHackMessage(event) {
    const integration = window.HackCT2Integration;
    
    // 验证消息来源
    if (!integration.hackWindow || event.source !== integration.hackWindow) {
        return;
    }
    
    const message = event.data;
    
    try {
        switch (message.type) {
            case 'REQUEST_SYNC':
                // 修改器请求同步数据
                handleSyncRequest();
                break;
                
            case 'DATA_UPDATED':
                // 修改器数据已更新
                handleDataUpdate(message.data);
                break;
                
            case 'REQUEST_APPLY':
                // 请求应用修改到游戏
                handleApplyRequest(message.data);
                break;
                
            case 'CLOSE_REQUEST':
                // 修改器请求关闭
                handleCloseRequest();
                break;
                
            default:
                console.warn('未知的消息类型:', message.type);
        }
        
    } catch (error) {
        console.error('处理修改器消息失败:', error);
    }
}

/**
 * 处理同步请求
 * 将当前游戏状态发送给修改器
 */
function handleSyncRequest() {
    const integration = window.HackCT2Integration;
    
    if (!integration.hackWindow || integration.hackWindow.closed) {
        return;
    }
    
    try {
        // 重新提取ROM数据
        const romData = extractRomDataFromEmulator();
        if (romData) {
            integration.hackWindow.postMessage({
                type: 'SYNC_DATA',
                data: Array.from(romData),
                timestamp: Date.now(),
                source: 'emulator'
            }, '*');
            
            integration.syncStatus.lastSyncTime = Date.now();
        }
        
    } catch (error) {
        console.error('处理同步请求失败:', error);
    }
}

/**
 * 处理数据更新
 * 接收修改器的数据变更
 */
function handleDataUpdate(data) {
    const integration = window.HackCT2Integration;
    
    // 缓存修改的数据
    integration.currentRomData = new Uint8Array(data);
    integration.syncStatus.pendingChanges = true;
    
}

/**
 * 处理应用请求
 * 将修改器的数据变更应用到模拟器（仅使用实时修改机制）
 */
function handleApplyRequest(data) {
    const integration = window.HackCT2Integration;
    
    try {
        // 使用实时修改机制（无需重新加载游戏）
        const success = applyModifiedDataToEmulator(new Uint8Array(data));
        
        if (success) {
            // 更新缓存
            integration.currentRomData = new Uint8Array(data);
            integration.syncStatus.pendingChanges = false;
            
            // 发送成功响应
            if (integration.hackWindow && !integration.hackWindow.closed) {
                integration.hackWindow.postMessage({
                    type: 'APPLY_SUCCESS',
                    timestamp: Date.now(),
                    source: 'emulator'
                }, '*');
            }
            
            
        } else {
            throw new Error('实时修改失败 - 数据大小不匹配或模拟器状态异常');
        }
        
    } catch (error) {
        console.error('处理应用请求失败:', error);
        
        // 发送失败响应
        if (integration.hackWindow && !integration.hackWindow.closed) {
            integration.hackWindow.postMessage({
                type: 'APPLY_FAILED',
                error: error.message,
                timestamp: Date.now(),
                source: 'emulator'
            }, '*');
        }
    }
}

// applyRomDataToEmulator 函数已删除 - 现在仅使用实时修改机制

/**
 * 直接替换当前模拟器的ROM数据（不重新加载）
 * 用于快速应用修改而不重启游戏
 */
// replaceCurrentRomData 函数已删除 - 现在使用applyModifiedDataToEmulator实现实时修改

/**
 * 解析NES文件头部
 */
function parseNesHeader(romData) {
    if (romData.length < 16) {
        throw new Error('ROM数据太短，无法解析头部');
    }
    
    const header = {
        signature: (romData[0] << 24) | (romData[1] << 16) | (romData[2] << 8) | romData[3],
        prgSize: romData[4] * 16384,  // 16KB单位
        chrSize: romData[5] * 8192,   // 8KB单位
        flags6: romData[6],
        flags7: romData[7],
        flags8: romData[8],
        flags9: romData[9],
        flags10: romData[10],
        trainer: (romData[6] & 0x04) !== 0,
        base: 16 + ((romData[6] & 0x04) !== 0 ? 512 : 0)  // 基础偏移量
    };
    
    return header;
}

/**
 * 处理关闭请求
 */
function handleCloseRequest() {
    const integration = window.HackCT2Integration;
    
    if (integration.hackWindow && !integration.hackWindow.closed) {
        integration.hackWindow.close();
        integration.hackWindow = null;
        integration.isHackOpen = false;
    }
}

/**
 * 主动同步数据到修改器
 * 用于手动触发数据同步
 */
function syncToHack() {
    const integration = window.HackCT2Integration;
    
    if (!integration.isHackOpen) {
        alert('修改器未打开，无法同步数据');
        return;
    }
    
    handleSyncRequest();
    alert('数据同步请求已发送');
}

/**
 * 应用修改器数据到游戏
 * 用于手动触发数据应用
 */
function applyHackChanges() {
    const integration = window.HackCT2Integration;
    
    if (!integration.isHackOpen) {
        alert('修改器未打开，无法应用修改');
        return;
    }
    
    if (!integration.syncStatus.pendingChanges) {
        alert('没有待应用的修改');
        return;
    }
    
    if (integration.currentRomData) {
        handleApplyRequest(integration.currentRomData);
    }
}

/**
 * 获取集成状态
 */
function getIntegrationStatus() {
    const integration = window.HackCT2Integration;
    
    return {
        isHackOpen: integration.isHackOpen,
        hasPendingChanges: integration.syncStatus.pendingChanges,
        lastSyncTime: integration.syncStatus.lastSyncTime,
        hackWindowActive: integration.hackWindow && !integration.hackWindow.closed
    };
}

/**
 * 创建修改器拟态层弹窗
 * 集成修改器界面到当前页面，替代新窗口打开方式
 */
function createHackModalLayer(romData) {
    const integration = window.HackCT2Integration;
    
    // 移除已存在的弹窗
    const existingPopup = document.getElementById('hackCT2Modal');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'hackCT2Overlay';
    overlay.className = 'hack-ct2-overlay';
    
    // 创建拟态层弹窗
    const modal = document.createElement('div');
    modal.id = 'hackCT2Modal';
    modal.className = 'hack-ct2-modal';
    
    // 加载保存的最小化偏好设置
    const savedMinimizePreference = localStorage.getItem('hackct2_minimize_preference');
    const isMinimizeChecked = savedMinimizePreference !== null ? savedMinimizePreference === 'true' : true; // 默认为true
    
    modal.innerHTML = `
        <div class="modal-header">
            <span>天使之翼2修改器(内置版)</span>
            <div class="modal-header-controls">
                <label class="minimize-checkbox">
                    <input type="checkbox" id="minimizeHackCheckbox" ${isMinimizeChecked ? 'checked' : ''}>
                    <span>最小化</span>
                </label>
                <button class="modal-close-btn" onclick="closeHackModal()" title="关闭" id="modalCloseBtn">&times;</button>
            </div>
        </div>
        <div class="modal-content">
            <div class="modal-iframe-container">
                <iframe id="hackCT2Frame" class="hack-ct2-iframe" src="" frameborder="0"></iframe>
            </div>
            <div class="modal-actions">
                <button class="modal-action-btn sync-btn" onclick="syncDataToHackModal()">同步数据</button>
                <button class="modal-action-btn apply-btn" onclick="applyHackModalChanges()">应用修改</button>
                <button class="modal-action-btn save-btn" onclick="saveHackModalFile()">保存文件</button>
            </div><label>1.选择修改功能,调整好参数.<br>2.点击修改器上确认修改按钮.<br>3.点击应用修改按钮.</label>
            <div class="modal-status" id="hackModalStatus"></div>
        </div>
    `;
    
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .hack-ct2-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .hack-ct2-modal {
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 1200px;
            height: 85%;
            max-height: 800px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: modalFadeIn 0.3s ease-out;
        }
        
        @keyframes modalFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
        
        .modal-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 18px;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .modal-header-controls {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .minimize-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: normal;
            cursor: pointer;
            user-select: none;
        }
        
        .minimize-checkbox input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
        }
        
        .minimize-checkbox span {
            color: white;
            font-size: 13px;
        }
        
        .modal-close-btn {
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        
        .modal-close-btn:hover {
            background: #c0392b;
            transform: scale(1.1);
        }
        
        .modal-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .modal-iframe-container {
            flex: 1;
            overflow: hidden;
            background: #ffffff;
        }
        
        .hack-ct2-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: #ffffff;
        }
        
        .modal-actions {
            display: flex;
            gap: 12px;
            padding: 16px;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
            flex-shrink: 0;
        }
        
        .modal-action-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .modal-action-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .modal-action-btn.sync-btn {
            background: #17a2b8;
            color: white;
        }
        
        .modal-action-btn.sync-btn:hover {
            background: #138496;
        }
        
        .modal-action-btn.apply-btn {
            background: #28a745;
            color: white;
        }
        
        .modal-action-btn.apply-btn:hover {
            background: #218838;
        }
        
        .modal-action-btn.close-btn {
            background: #6c757d;
            color: white;
        }
        
        .modal-action-btn.close-btn:hover {
            background: #5a6268;
        }
        
        .modal-action-btn.save-btn {
            background: #007bff;
            color: white;
        }
        
        .modal-action-btn.save-btn:hover {
            background: #0056b3;
        }
        
        .modal-status {
            padding: 8px 16px;
            font-size: 12px;
            text-align: center;
            display: none;
        }
        
        .modal-status.success {
            background: #d4edda;
            color: #155724;
            border-top: 1px solid #c3e6cb;
            display: block;
        }
        
        .modal-status.error {
            background: #f8d7da;
            color: #721c24;
            border-top: 1px solid #f5c6cb;
            display: block;
        }
        
        .modal-status.info {
            background: #d1ecf1;
            color: #0c5460;
            border-top: 1px solid #bee5eb;
            display: block;
        }
        
        /* 浮动CT2修改器按钮 */
        .floating-ct2-btn {
            position: fixed;
            top: 10px;
            right: 60px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            transition: all 0.3s ease;
            display: none;
        }
        
        .floating-ct2-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }
        
        .floating-ct2-btn:active {
            transform: translateY(0);
        }
    `;
    
    document.head.appendChild(style);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
       
    // 添加拖拽功能 - 简单直观的实现
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    const modalHeader = modal.querySelector('.modal-header');
    
    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        if (e.target === modalHeader || modalHeader.contains(e.target)) {
            isDragging = true;
            modal.style.cursor = 'grabbing';
        }
    }
    
    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        modal.style.cursor = 'default';
    }
    
    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }
            
            xOffset = currentX;
            yOffset = currentY;
            
            modal.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }
    
    // 绑定拖拽事件
    modalHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // 触摸设备支持
    modalHeader.addEventListener('touchstart', dragStart);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', dragEnd);
    // 加载修改器页面到iframe
    const iframe = document.getElementById('hackCT2Frame');
    const hackUrl = '../index.html?mode=integrated&timestamp=' + Date.now();
    iframe.src = hackUrl;
    
    // 设置iframe加载完成后的处理
    
    // 添加最小化复选框的事件监听
    const minimizeCheckbox = document.getElementById('minimizeHackCheckbox');
    const closeBtn = document.getElementById('modalCloseBtn');
    
    function updateCloseButtonIcon() {
        if (closeBtn) {
            if (minimizeCheckbox && minimizeCheckbox.checked) {
                closeBtn.innerHTML = '&#8212;'; // 横线符号
                closeBtn.title = '最小化';
            } else {
                closeBtn.innerHTML = '&times;'; // X符号
                closeBtn.title = '关闭';
            }
        }
    }
    
    function saveMinimizePreference(checked) {
        try {
            localStorage.setItem('ct2MinimizePreference', checked ? 'true' : 'false');
        } catch (error) {
            console.warn('无法保存用户偏好设置:', error);
        }
    }
    
    function loadMinimizePreference() {
        try {
            const saved = localStorage.getItem('ct2MinimizePreference');
            return saved === 'true';
        } catch (error) {
            console.warn('无法加载用户偏好设置:', error);
            return true; // 默认返回true（勾选状态）
        }
    }
    
    if (minimizeCheckbox) {
        // 加载用户偏好设置
        const savedPreference = loadMinimizePreference();
        minimizeCheckbox.checked = savedPreference;
        
        // 初始化按钮图标
        updateCloseButtonIcon();
        
        minimizeCheckbox.addEventListener('change', function() {
            // 保存用户偏好设置
            saveMinimizePreference(this.checked);
            
            // 更新关闭按钮图标
            updateCloseButtonIcon();
        });
    }
    iframe.onload = function() {
        updateModalStatus('修改器加载完成', 'success');
        
        // 传递ROM数据到iframe中的修改器
        setTimeout(() => {
            passRomDataToHackModal(romData);
        }, 1000);
    };
    
    // 设置全局状态
    integration.isHackOpen = true;
    integration.hackWindow = iframe.contentWindow; // 使用iframe的contentWindow作为hackWindow
    
    // 建立通信机制
    setupModalCommunication();
    
    updateModalStatus('修改器正在加载...', 'info');
}

/**
 * 关闭修改器拟态层弹窗
 * 处理最小化和完全关闭的逻辑
 */
function closeHackModal() {
    const minimizeCheckbox = document.getElementById('minimizeHackCheckbox');
    const overlay = document.getElementById('hackCT2Overlay');
    
    
    // 保存复选框状态到本地存储
    if (minimizeCheckbox) {
        localStorage.setItem('hackct2_minimize_preference', minimizeCheckbox.checked);
    }
    
    if (minimizeCheckbox && minimizeCheckbox.checked) {
        // 最小化模式：隐藏弹出层，显示浮动按钮
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        // 显示浮动按钮
        let floatingBtn = document.getElementById('floatingCT2Btn');
        if (!floatingBtn) {
            floatingBtn = document.createElement('button');
            floatingBtn.id = 'floatingCT2Btn';
            floatingBtn.className = 'floating-ct2-btn';
            floatingBtn.textContent = 'CT2修改器';
            floatingBtn.onclick = restoreHackModal;
            document.body.appendChild(floatingBtn);
        }
        floatingBtn.style.display = 'block';
        
        // 更新状态为最小化而不是完全关闭
        const integration = window.HackCT2Integration;
        if (integration) {
            integration.isHackOpen = true; // 保持为true，表示修改器仍然可用
            integration.isMinimized = true;
        }
        
    } else {
        // 完全关闭模式：移除弹出层和浮动按钮
        if (overlay) {
            overlay.remove();
        }
        
        // 移除浮动按钮
        const floatingBtn = document.getElementById('floatingCT2Btn');
        if (floatingBtn) {
            floatingBtn.remove();
        }
        
        // 重置状态
        const integration = window.HackCT2Integration;
        if (integration) {
            integration.isHackOpen = false;
            integration.hackWindow = null;
            integration.isMinimized = false;
        }
    }
}

/**
 * 更新拟态层弹窗状态
 */
function updateModalStatus(message, type = 'info') {
    const statusElement = document.getElementById('hackModalStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'modal-status ' + type;
        
        // 3秒后自动隐藏状态信息
        setTimeout(() => {
            statusElement.className = 'modal-status';
            statusElement.textContent = '';
        }, 3000);
    }
}

/**
 * 切换拟态层弹窗的TAB
 */
function switchHackModalTab(tabName) {
    const tabButtons = document.querySelectorAll('.modal-tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // 发送TAB切换消息到iframe中的修改器
    const iframe = document.getElementById('hackCT2Frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'TAB_SWITCH',
            tab: tabName
        }, '*');
    }
    
    updateModalStatus(`已切换到${tabName}选项卡`, 'info');
}

/**
 * 传递ROM数据到拟态层弹窗中的修改器
 * 修复数据传递问题，确保修改器能正确获取ROM加载状态
 */
function passRomDataToHackModal(romData) {
    const iframe = document.getElementById('hackCT2Frame');
    if (iframe && iframe.contentWindow && romData) {
        // 将Uint8Array转换为普通数组以确保正确传递
        const romDataArray = Array.from(romData);
        
        // 添加游戏状态信息
        const gameStatus = {
            isLoaded: isGameLoaded(),
            hasRomData: romData && romData.length > 0,
            romSize: romData.length,
            timestamp: Date.now(),
            source: 'emulator'
        };
        
        iframe.contentWindow.postMessage({
            type: 'ROM_DATA',
            data: romDataArray,
            status: gameStatus,
            metadata: {
                prgRomSize: romData.length > 16 ? romData.length - 16 : 0,
                chrRomSize: 0, // 可以根据需要计算CHR ROM大小
                mapperType: getCurrentMapperType(),
                gameName: loadedName
            }
        }, '*');
        
        updateModalStatus('ROM数据已传递到修改器', 'success');
    } else {
        updateModalStatus('无法传递ROM数据到修改器', 'error');
        console.error('无法传递ROM数据到拟态层弹窗中的修改器');
    }
}

/**
 * 同步数据到拟态层弹窗中的修改器
 */
function syncDataToHackModal() {
    const integration = window.HackCT2Integration;
    const romData = extractRomDataFromEmulator();
    
    if (romData) {
        passRomDataToHackModal(romData);
        integration.currentRomData = romData;
        updateModalStatus('数据同步完成', 'success');
    } else {
        updateModalStatus('无法从模拟器提取ROM数据', 'error');
        showRomExtractionError();
    }
}

/**
 * 应用拟态层弹窗中的修改到游戏
 */
function applyHackModalChanges() {
    const iframe = document.getElementById('hackCT2Frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'APPLY_REQUEST'
        }, '*');
        updateModalStatus('正在应用修改到游戏...', 'info');
    } else {
        updateModalStatus('无法与应用修改器通信', 'error');
    }
}

/**
 * 保存修改器文件
 * 触发修改器的savefile()函数
 */
function saveHackModalFile() {
    const iframe = document.getElementById('hackCT2Frame');
    if (!iframe || !iframe.contentWindow) {
        console.error('无法访问修改器iframe');
        alert('无法访问修改器，请确保通过HTTP服务器访问本页面');
        return;
    }
    
    try {
        // 首先尝试通过消息机制通知保存（推荐方式）
        iframe.contentWindow.postMessage({
            type: 'SAVE_FILE_REQUEST',
            action: 'savefile'
        }, '*');
        
        
        // 更新状态
        window.HackCT2Integration.isFileSaved = true;
        
        // 显示成功提示
        const saveBtn = document.querySelector('.save-btn');
        if (saveBtn) {
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '已发送保存请求';
            saveBtn.style.backgroundColor = '#28a745';
            
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.backgroundColor = '';
            }, 2000);
        }
        
    } catch (error) {
        console.error('保存文件失败:', error);
        
        // 提供更详细的错误信息和解决方案
        if (error.name === 'SecurityError') {
            alert('跨域访问被拒绝。请通过以下方式解决：\n\n' +
                  '1. 使用本地HTTP服务器访问（推荐）\n' +
                  '   - 在终端运行: python -m http.server 8082\n' +
                  '   - 然后访问: http://localhost:8082\n\n' +
                  '2. 或者使用其他HTTP服务器工具\n' +
                  '   - VS Code的Live Server插件\n' +
                  '   - Node.js的http-server\n' +
                  '   - 任何其他本地服务器');
        } else {
            alert('保存文件失败: ' + error.message);
        }
    }
}

/**
 * 应用修改器数据到模拟器（无需重新加载）
 * 接收修改后的数据，拆分头部并更新mapper.rom
 */
function applyModifiedDataToEmulator(modifiedData) {
    try {
        const nes = window.nes;
        const mapper = nes.mapper;
        
        
        if (!modifiedData || modifiedData.length < 16) {
            throw new Error('无效的修改数据');
        }
        
        // 检查是否是完整的ROM文件（包含头部）
        const hasHeader = (modifiedData[0] === 0x4E && modifiedData[1] === 0x45 && 
                          modifiedData[2] === 0x53 && modifiedData[3] === 0x1A);
        
        if (!hasHeader) {
            throw new Error('修改数据不包含有效的NES头部');
        }
        
        // 获取头部长度 - 使用更健壮的方式
        let headerLength = 16; // 默认NES头部长度
        if (nes.romheadbase && nes.romheadbase.length) {
            headerLength = nes.romheadbase.length;
        } else if (mapper.romheadbase && mapper.romheadbase.length) {
            headerLength = mapper.romheadbase.length;
        }
        
        // 拆分头部和实际ROM数据
        const romDataWithoutHeader = modifiedData.subarray(headerLength);
        
        
        // 直接更新mapper.rom数据（无需重新加载游戏）
            if (mapper.rom && mapper.rom.length === romDataWithoutHeader.length) {
               
                mapper.rom.set(romDataWithoutHeader);
            
            // 如果需要，也可以更新prgRom和chrRom
            if (mapper.prgRom) {
                const prgSize = mapper.prgRom.length;
                mapper.prgRom.set(romDataWithoutHeader.subarray(0, prgSize));
                
            }
            
            if (mapper.chrRom) {
                const prgSize = mapper.prgRom ? mapper.prgRom.length : 0;
                const chrSize = mapper.chrRom.length;
                mapper.chrRom.set(romDataWithoutHeader.subarray(prgSize, prgSize + chrSize));
               
            }
            
            // 重要：更新ROM数据后需要刷新银行映射
            if (mapper.setPrgBanks) {
                mapper.setPrgBanks();
            }
            
            if (mapper.setChrBanks) {
                mapper.setChrBanks();
            }
            
            return true;
        } else {
            console.warn('mapper.rom大小不匹配，可能需要重新加载');
            return false;
        }
        
    } catch (error) {
        console.error('应用修改数据失败:', error);
        return false;
    }
}

/**
 * 建立拟态层弹窗的通信机制
 */
function setupModalCommunication() {
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;
        
        
        switch (event.data.type) {
            case 'ROM_DATA_REQUEST':
                // 修改器请求ROM数据
                const romData = extractRomDataFromEmulator();
                if (romData) {
                    passRomDataToHackModal(romData);
                    window.HackCT2Integration.currentRomData = romData;
                }
                break;
                
            case 'APPLY_REQUEST':
                // 应用修改到游戏
                if (event.data.data) {
                    const success = applyModifiedDataToEmulator(event.data.data);
                    if (success) {
                        updateModalStatus('修改已应用到游戏（无需重新加载）', 'success');
                        
                        // 发送成功响应回修改器
                        if (window.HackCT2Integration && window.HackCT2Integration.hackWindow) {
                            window.HackCT2Integration.hackWindow.postMessage({
                                type: 'APPLY_SUCCESS',
                                timestamp: Date.now(),
                                source: 'emulator'
                            }, '*');
                        }
                    } else {
                        updateModalStatus('应用修改失败', 'error');
                        
                        // 发送失败响应回修改器
                        if (window.HackCT2Integration && window.HackCT2Integration.hackWindow) {
                            window.HackCT2Integration.hackWindow.postMessage({
                                type: 'APPLY_FAILED',
                                error: '应用修改数据失败',
                                timestamp: Date.now(),
                                source: 'emulator'
                            }, '*');
                        }
                    }
                }
                break;
                

                
            case 'CLOSE_REQUEST':
                // 关闭拟态层弹窗
                closeHackModal();
                break;
                
            case 'STATUS_UPDATE':
                // 更新状态
                if (event.data.message) {
                    updateModalStatus(event.data.message, event.data.status || 'info');
                }
                break;
                
            case 'SAVE_FILE_RESPONSE':
                // 处理保存文件响应
                if (event.data.success) {
                    updateModalStatus('文件保存成功', 'success');
                } else {
                    updateModalStatus('文件保存失败: ' + event.data.error, 'error');
                    console.error('文件保存失败:', event.data.error);
                }
                break;
        }
    });
}

/**
 * 切换修改器TAB页
 */
function switchHackTab(tabName) {
    const integration = window.HackCT2Integration;
    
    if (!integration.hackWindow || integration.hackWindow.closed) {
        updatePopupStatus('修改器窗口未打开', 'error');
        return;
    }
    
    try {
        // 向修改器发送TAB切换消息
        integration.hackWindow.postMessage({
            type: 'SWITCH_TAB',
            tab: tabName,
            timestamp: Date.now(),
            source: 'emulator'
        }, '*');
        
        // 更新按钮状态
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });
        
        updatePopupStatus('已切换到 ' + tabName + ' 页面', 'success');
        
    } catch (error) {
        console.error('切换TAB页失败:', error);
        updatePopupStatus('切换TAB页失败: ' + error.message, 'error');
    }
}

/**
 * 更新弹出层状态
 */
function updatePopupStatus(message, type) {
    const statusDiv = document.getElementById('popupStatus');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = 'popup-status ' + type;
        
        // 3秒后清除状态（错误状态除外）
        if (type !== 'error') {
            setTimeout(() => {
                statusDiv.className = 'popup-status';
                statusDiv.textContent = '';
            }, 3000);
        }
    }
}

/**
 * 检查游戏是否已加载
 * @returns {boolean} 游戏加载状态
 */
function isGameLoaded() {
    try {
        // 检查全局变量 - 使用window访问全局作用域的loaded变量
        if (typeof window.loaded === 'undefined' || !window.loaded || !window.nes) {
            return false;
        }
        
        // 检查NES模拟器状态
        if (!window.nes.cpu || !window.nes.ppu || !window.nes.mapper) {
            return false;
        }
        
        // 检查ROM数据
        if (!window.nes.mapper.prgRom || window.nes.mapper.prgRom.length === 0) {
            return false;
        }
        
        // 检查游戏是否正在运行
        if (typeof window.nes.isRunning === 'function') {
            return window.nes.isRunning();
        }
        
        return true;
        
    } catch (error) {
        console.error('检查游戏加载状态失败:', error);
        return false;
    }
}

/**
 * 显示游戏未加载提示
 */
function showGameNotLoadedAlert() {
    // 创建自定义提示框
    const alertDiv = document.createElement('div');
    alertDiv.className = 'hack-ct2-alert';
    alertDiv.innerHTML = `
        <div class="alert-content">
            <div class="alert-header">提示</div>
            <div class="alert-body">
                <p>请先加载游戏后再打开修改器</p>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    您可以通过以下方式加载游戏：<br>
                    1. 点击"文件"菜单 -> "打开ROM"<br>
                    2. 拖拽ROM文件到模拟器窗口<br>
                    3. 使用快捷键 Ctrl+O
                </p>
            </div>
            <div class="alert-footer">
                <button onclick="this.closest('.hack-ct2-alert').remove()">确定</button>
            </div>
        </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .hack-ct2-alert {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
        }
        
        .alert-content {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
            overflow: hidden;
        }
        
        .alert-header {
            background: #e74c3c;
            color: white;
            padding: 12px 16px;
            font-weight: bold;
        }
        
        .alert-body {
            padding: 16px;
        }
        
        .alert-body p {
            margin: 0 0 8px 0;
            line-height: 1.4;
        }
        
        .alert-footer {
            padding: 12px 16px;
            background: #f8f9fa;
            text-align: right;
        }
        
        .alert-footer button {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .alert-footer button:hover {
            background: #2980b9;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(alertDiv);
    
    // 3秒后自动关闭
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * 显示ROM提取错误
 */
function showRomExtractionError() {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'hack-ct2-alert';
    alertDiv.innerHTML = `
        <div class="alert-content">
            <div class="alert-header">错误</div>
            <div class="alert-body">
                <p>无法提取游戏数据，请确保游戏已正确加载</p>
                <p style="font-size: 12px; color: #666; margin-top: 8px;">
                    可能的原因：<br>
                    1. 游戏ROM文件损坏<br>
                    2. 模拟器加载异常<br>
                    3. 不支持的ROM格式
                </p>
            </div>
            <div class="alert-footer">
                <button onclick="this.closest('.hack-ct2-alert').remove()">确定</button>
            </div>
        </div>
    `;
    
    // 复用之前的样式
    const style = document.querySelector('style[data-hack-alert-style]');
    if (!style) {
        const newStyle = document.createElement('style');
        newStyle.setAttribute('data-hack-alert-style', 'true');
        newStyle.textContent = `
            .hack-ct2-alert {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 20000;
            }
            
            .alert-content {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                max-width: 400px;
                width: 90%;
                overflow: hidden;
            }
            
            .alert-header {
                background: #e74c3c;
                color: white;
                padding: 12px 16px;
                font-weight: bold;
            }
            
            .alert-body {
                padding: 16px;
            }
            
            .alert-body p {
                margin: 0 0 8px 0;
                line-height: 1.4;
            }
            
            .alert-footer {
                padding: 12px 16px;
                background: #f8f9fa;
                text-align: right;
            }
            
            .alert-footer button {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .alert-footer button:hover {
                background: #2980b9;
            }
        `;
        document.head.appendChild(newStyle);
    }
    
    document.body.appendChild(alertDiv);
    
    // 3秒后自动关闭
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * 显示通用错误提示
 */
function showErrorAlert(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'hack-ct2-alert';
    alertDiv.innerHTML = `
        <div class="alert-content">
            <div class="alert-header">错误</div>
            <div class="alert-body">
                <p>${message}</p>
            </div>
            <div class="alert-footer">
                <button onclick="this.closest('.hack-ct2-alert').remove()">确定</button>
            </div>
        </div>
    `;
    
    // 复用之前的样式
    const style = document.querySelector('style[data-hack-alert-style]');
    if (!style) {
        const newStyle = document.createElement('style');
        newStyle.setAttribute('data-hack-alert-style', 'true');
        newStyle.textContent = `
            .hack-ct2-alert {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 20000;
            }
            
            .alert-content {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                max-width: 400px;
                width: 90%;
                overflow: hidden;
            }
            
            .alert-header {
                background: #e74c3c;
                color: white;
                padding: 12px 16px;
                font-weight: bold;
            }
            
            .alert-body {
                padding: 16px;
            }
            
            .alert-body p {
                margin: 0 0 8px 0;
                line-height: 1.4;
            }
            
            .alert-footer {
                padding: 12px 16px;
                background: #f8f9fa;
                text-align: right;
            }
            
            .alert-footer button {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .alert-footer button:hover {
                background: #2980b9;
            }
        `;
        document.head.appendChild(newStyle);
    }
    
    document.body.appendChild(alertDiv);
    
    // 3秒后自动关闭
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * 初始化集成模块
 * 绑定事件监听器和按钮功能
 */
function initHackCT2Integration() {
    
    // 绑定打开修改器按钮
    const openBtn = document.getElementById('openHackCT2Btn');
    if (openBtn) {
        openBtn.addEventListener('click', openHackCT2);
    } else {
        console.warn('未找到打开修改器按钮');
    }
    
    // 监听来自修改器的消息
    window.addEventListener('message', function(event) {
        
        if (event.data.type === 'ROM_DATA_REQUEST') {
            handleRomDataRequest();
        } else if (event.data.type === 'APPLY_REQUEST') {
            handleApplyRequest(event.data.data);
        } else if (event.data.type === 'CLOSE_REQUEST') {
            handleCloseRequest(event.data);
        } else if (event.data.type === 'TAB_SWITCH_CONFIRMED') {
            // 修改器确认TAB切换成功
            updatePopupStatus(`修改器已切换到 ${event.data.tab} 页面`, 'success');
        } else if (event.data.type === 'TAB_SWITCH_FAILED') {
            // 修改器TAB切换失败
            updatePopupStatus(`修改器切换TAB失败: ${event.data.error}`, 'error');
        }
    });
    
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHackCT2Integration);
} else {
    initHackCT2Integration();
}