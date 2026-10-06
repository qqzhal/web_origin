/**
 * 修改器集成模式支持模块
 * 用于处理与模拟器的通信和数据同步
 */

// 全局变量
var HackCT2Integration = {
    isIntegrated: false,
    runningMode: 'standalone', // standalone, popup, modal
    emulatorWindow: null,
    currentRomData: null,
    syncStatus: 'idle', // idle, syncing, success, error
    currentTab: null,
    originalSaveButton: null,
    syncButton: null
};

// 定义全局变量以兼容原始代码
var filenamenes = '';

/**
 * 初始化集成模式
 */
function initHackCT2IntegrationMode() {

    // 检测当前运行模式（拟态层模式或传统模式）
    detectRunningMode();

    // 检查是否从模拟器打开
    if (window.opener && window.opener.nes && window.opener.nes.rom) {
        enableIntegrationMode();
    } else {
    }

    // 设置消息监听
    setupMessageListener();
}

/**
 * 检测当前运行模式
 */
function detectRunningMode() {
    // 检测是否在拟态层模式下运行
    if (window.parent && window.parent !== window) {
        HackCT2Integration.runningMode = 'modal';
    } else if (window.opener) {
        HackCT2Integration.runningMode = 'popup';
    } else {
        HackCT2Integration.runningMode = 'standalone';
    }
}

/**
 * 启用集成模式
 */
function enableIntegrationMode() {
    HackCT2Integration.isIntegrated = true;
    document.body.classList.add('integrated-mode');

    // 创建集成状态指示器
    createIntegrationStatusIndicator();

    // 优化界面布局
    optimizeInterfaceForIntegration();

    // 添加同步按钮
    addSyncButton();

    // 隐藏非当前TAB页
    hideNonCurrentTabs();

    // 设置当前TAB页
    setupCurrentTab();

}

/**
 * 创建集成状态指示器
 */
function createIntegrationStatusIndicator() {
    var indicator = document.createElement('div');
    indicator.id = 'integrationStatus';
    indicator.className = 'integration-status';
    indicator.innerHTML = '<span class="status-text">模拟器集成模式</span>';
    document.body.appendChild(indicator);
}

/**
 * 优化集成模式下的界面
 */
function optimizeInterfaceForIntegration() {
    // 添加页面加载完成后的优化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', performInterfaceOptimization);
    } else {
        performInterfaceOptimization();
    }
}

/**
 * 执行界面优化
 */
function performInterfaceOptimization() {
    // 优化标题显示
    var title = document.querySelector('h1') || document.querySelector('title');
    if (title) {
        title.textContent = '天使之翼2修改器 - 集成模式';
    }

    // 优化文件信息显示
    var fileInfo = document.getElementById('checknes');
    if (fileInfo) {
        fileInfo.style.fontWeight = 'bold';
        fileInfo.style.padding = '6px 12px';
        fileInfo.style.borderRadius = '4px';
        fileInfo.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
        fileInfo.style.color = 'white';
        fileInfo.style.display = 'inline-block';
    }

    // 优化RAM类型显示
    var ramType = document.getElementById('ramtype');
    if (ramType) {
        ramType.style.fontWeight = 'bold';
        ramType.style.padding = '6px 12px';
        ramType.style.borderRadius = '4px';
        ramType.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
        ramType.style.color = 'white';
        ramType.style.display = 'inline-block';
        ramType.style.marginLeft = '10px';
    }

}

/**
 * 添加同步按钮
 */
function addSyncButton() {
    // 等待DOM加载完成
    var checkExist = setInterval(function () {
        var saveButton = document.getElementById('btnsave');
        if (saveButton) {
            clearInterval(checkExist);

            // 保存原始保存按钮引用
            HackCT2Integration.originalSaveButton = saveButton;

            // 创建同步按钮
            var syncButton = document.createElement('button');
            syncButton.id = 'btnSyncToGame';
            syncButton.textContent = '将当前修改器数据同步到游戏';
            syncButton.title = '将修改后的数据同步回模拟器';
            syncButton.onclick = syncDataToEmulator;

            // 将同步按钮添加到保存按钮右侧
            saveButton.parentNode.insertBefore(syncButton, saveButton.nextSibling);

            // 保存引用
            HackCT2Integration.syncButton = syncButton;

        }
    }, 100);
}

/**
 * 隐藏非当前TAB页
 */
function hideNonCurrentTabs() {
    var checkExist = setInterval(function () {
        var tabs = document.querySelectorAll('#menu li.ctab');
        var contents = document.querySelectorAll('#content li.ctab');

        if (tabs.length > 0 && contents.length > 0) {
            clearInterval(checkExist);

            // 获取当前激活的TAB
            var currentTab = null;
            var currentContent = null;

            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].classList.contains('tabFocus')) {
                    currentTab = tabs[i];
                    currentContent = contents[i];
                    break;
                }
            }

            // 如果没有当前激活的TAB，默认显示第一个
            if (!currentTab && tabs.length > 0) {
                currentTab = tabs[0];
                currentContent = contents[0];
                currentTab.classList.add('tabFocus');
                currentContent.style.display = 'block';
            }

            // 保存当前TAB
            if (currentTab) {
                HackCT2Integration.currentTab = currentTab.id || currentTab.getAttribute('data-tab');
            }

            // 隐藏其他TAB
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i] !== currentTab) {
                    tabs[i].style.display = 'none';
                    if (contents[i]) {
                        contents[i].style.display = 'none';
                    }
                }
            }

        }
    }, 100);
}

/**
 * 设置当前TAB页
 */
function setupCurrentTab() {
    // 监听TAB切换事件
    var tabs = document.querySelectorAll('#menu li.ctab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var tabId = this.id || this.getAttribute('data-tab');
            HackCT2Integration.currentTab = tabId;
        });
    });
}

/**
 * 设置消息监听器
 */
function setupMessageListener() {
    window.addEventListener('message', function (event) {

        // 验证消息来源 - 支持拟态层模式下的iframe通信
        // 在拟态层模式下，消息可能来自父页面而不是window.opener
        if (event.source !== window.opener && event.source !== window.parent) {
            console.warn('消息来源不匹配，忽略');
            return;
        }

        var data = event.data;
        if (!data || !data.type) {
            console.warn('消息格式不正确');
            return;
        }

        switch (data.type) {
            case 'ROM_DATA':
                handleRomData(data);
                break;

            case 'SYNC_REQUEST':
                handleSyncRequest();
                break;

            case 'SWITCH_TAB':
                handleSwitchTab(data);
                break;

            case 'INTEGRATION_STATUS':
                handleIntegrationStatus(data.status);
                break;

            case 'APPLY_REQUEST':
                handleApplyRequest(data);
                break;

            case 'APPLY_SUCCESS':
                handleApplySuccess(data);
                break;

            case 'APPLY_FAILED':
                handleApplyFailed(data);
                break;

            case 'SAVE_FILE_REQUEST':
                handleSaveFileRequest(data);
                break;

            default:
                console.warn('未知消息类型:', data.type);
        }
    });

}

/**
 * 处理ROM数据
 */
function handleRomData(messageData) {

    if (!messageData || !messageData.data) {
        console.error('ROM数据为空');
        return;
    }
    
    // 提取ROM数据和元数据
    const romData = messageData.data;
    const gameName = messageData.metadata && messageData.metadata.gameName ? messageData.metadata.gameName : null;


    HackCT2Integration.currentRomData = romData;

    // 将数据传递给修改器核心功能 
    try {
        if (window.NesHex && Array.isArray(window.NesHex)) {

            // 安全地清空现有数据
            window.NesHex.length = 0;

            // 使用安全的转换方式，避免调用栈溢出
            if (romData instanceof Uint8Array) {
                // 对于Uint8Array，使用循环逐个添加（分批处理大数据）
                const batchSize = 10000; // 每批处理10000个元素
                for (let i = 0; i < romData.length; i += batchSize) {
                    const end = Math.min(i + batchSize, romData.length);
                    const batch = Array.from(romData.subarray(i, end));
                    window.NesHex.push(...batch);
                }
            } else if (Array.isArray(romData)) {
                // 对于普通数组，也使用分批处理
                const batchSize = 10000;
                for (let i = 0; i < romData.length; i += batchSize) {
                    const end = Math.min(i + batchSize, romData.length);
                    const batch = romData.slice(i, end);
                    window.NesHex.push(...batch);
                }
            } else {
                // 其他类型，直接赋值
                window.NesHex = Array.from(romData);
            }


            // 模拟文件加载后的初始化流程
            filenamenes = gameName ;
            CheckNesHex();

            // 自动初始化修改器界面
            autoInitializeHackInterface();

            sendMessageToEmulator({
                type: 'ROM_DATA_RECEIVED',
                success: true
            });
        } else {
            console.warn('NesHex数组不存在，创建新数组');
            // 创建新的NesHex数组
            if (romData instanceof Uint8Array) {
                window.NesHex = Array.from(romData);
            } else {
                window.NesHex = Array.isArray(romData) ? romData.slice() : Array.from(romData);
            }

            filenamenes = gameName;
            CheckNesHex();
            autoInitializeHackInterface();
            sendMessageToEmulator({
                type: 'ROM_DATA_RECEIVED',
                success: true
            });
        }
    } catch (error) {
        console.error('直接加载ROM数据失败:', error);
        sendMessageToEmulator({
            type: 'ROM_DATA_RECEIVED',
            success: false,
            error: error.message
        });
    }
}

/**
 * 处理同步请求
 */
function handleSyncRequest() {
    syncDataToEmulator();
}

/**
 * 处理应用成功消息
 * 当模拟器成功应用修改时调用
 */
function handleApplySuccess(data) {
  
    // 可以在这里添加成功提示或其他UI更新
    if (window.showNotification) {
        window.showNotification('修改已应用', 'success');
    }
}

/**
 * 处理应用失败消息
 * 当模拟器应用修改失败时调用
 */
function handleApplyFailed(data) {
    console.error('修改应用到模拟器失败:', data.error);

    // 可以在这里添加错误提示或其他UI更新
    if (window.showNotification) {
        window.showNotification('修改应用失败: ' + (data.error || '未知错误'), 'error');
    }
}

/**
 * 处理TAB切换消息
 * 响应模拟器发送的TAB切换请求
 */
function handleSwitchTab(message) {
    const tabName = message.tab;

    try {
        // 查找对应的TAB按钮 - 通过文本内容匹配
        const tabs = document.querySelectorAll('#menu li.ctab');
        let targetTab = null;
        let targetIndex = -1;

        for (let i = 0; i < tabs.length; i++) {
            const tabText = tabs[i].textContent.trim();
            let shouldMatch = false;

            switch (tabName) {
                case 'team':
                    shouldMatch = tabText === '队伍';
                    break;
                case 'player':
                    shouldMatch = tabText === '球员';
                    break;
                case 'instruct':
                    shouldMatch = tabText === '指令';
                    break;
                case 'ai':
                    shouldMatch = tabText === 'AI';
                    break;
                case 'music':
                    shouldMatch = tabText === '音乐';
                    break;
                case 'hex':
                    shouldMatch = tabText === 'HEX';
                    break;
                case 'chr':
                    shouldMatch = tabText === 'CHR';
                    break;
                case 'about':
                    shouldMatch = tabText === '关于';
                    break;
                default:
                    shouldMatch = (tabText === tabName);
            }

            if (shouldMatch) {
                targetTab = tabs[i];
                targetIndex = i;
                break;
            }
        }

        if (targetTab) {
            // 触发点击事件
            targetTab.click();

            // 发送确认消息回模拟器
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'TAB_SWITCH_CONFIRMED',
                    tab: tabName,
                    timestamp: Date.now(),
                    source: 'hack'
                }, '*');
            }


        } else {
            console.warn(`未找到TAB: ${tabName}`);

            // 发送失败消息回模拟器
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'TAB_SWITCH_FAILED',
                    tab: tabName,
                    error: 'TAB_NOT_FOUND',
                    timestamp: Date.now(),
                    source: 'hack'
                }, '*');
            }

            updateIntegrationStatus(`切换TAB失败: 未找到 ${tabName} 页面`, 'error');
        }

    } catch (error) {
        console.error('处理TAB切换失败:', error);

        // 发送失败消息回模拟器
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'TAB_SWITCH_FAILED',
                tab: tabName,
                error: error.message,
                timestamp: Date.now(),
                source: 'hack'
            }, '*');
        }

        updateIntegrationStatus(`处理TAB切换失败: ${error.message}`, 'error');
    }
}

/**
 * 处理集成状态
 */
function handleIntegrationStatus(status) {
    //updateSyncStatus(status.type, status.message);
}

/**
 * 处理应用修改请求
 * 将修改器中的数据转换格式后发送给模拟器
 */
function handleApplyRequest(message) {

    try {
        // 获取当前修改后的数据
        var modifiedData = null;

        if (window.NesHex && typeof window.NesHex.getModifiedData === 'function') {
            modifiedData = window.NesHex.getModifiedData();
        } else {
            // 如果没有getModifiedData方法，尝试获取NesHex数据
            if (window.NesHex) {
                modifiedData = window.NesHex;
            }
        }

        if (!modifiedData) {
            throw new Error('无法获取修改后的数据');
        }

        // 数据格式转换
        var convertedData = convertHackDataToEmulatorFormat(modifiedData);


        // 发送转换后的数据到模拟器
        sendMessageToEmulator({
            type: 'APPLY_REQUEST',
            data: convertedData,
            tab: HackCT2Integration.currentTab
        });


    } catch (error) {
        console.error('处理应用修改请求失败:', error);

        // 发送错误信息回模拟器
        sendMessageToEmulator({
            type: 'APPLY_ERROR',
            error: error.message
        });
    }
}

/**
 * 转换修改器数据格式为模拟器可识别的格式
 * 将NesHex数组转换为Uint8Array格式
 */
function convertHackDataToEmulatorFormat(hackData) {

    try {
        // 如果已经是Uint8Array格式，直接返回
        if (hackData instanceof Uint8Array) {
            return hackData;
        }

        // 如果是普通数组，转换为Uint8Array
        if (Array.isArray(hackData)) {
            return new Uint8Array(hackData);
        }

        // 如果是对象或其他格式，尝试转换为数组再转Uint8Array
        if (typeof hackData === 'object' && hackData !== null) {
            var arrayData = Object.values(hackData);
            return new Uint8Array(arrayData);
        }

        // 如果以上都不行，抛出错误
        throw new Error('不支持的数据格式: ' + typeof hackData);

    } catch (error) {
        console.error('数据格式转换失败:', error);
        throw new Error('数据格式转换失败: ' + error.message);
    }
}

/**
 * 应用修改器修改到模拟器（拆分头部版本）
 * 接收修改后的数据，拆分头部16字节并传递回mapper
 */
function applyHackChangesWithHeaderSplit(modifiedData) {
    try {
        // 获取修改后的数据
        var hackData = window.NesHex.getModifiedData();
        if (!hackData) {
            throw new Error('无法获取修改后的数据');
        }

        // 确保数据是Uint8Array格式
        var convertedData = convertHackDataToEmulatorFormat(hackData);

        // 检查数据完整性（至少包含16字节头部）
        if (convertedData.length < 16) {
            throw new Error('修改数据长度不足，无法拆分头部');
        }

        // 验证NES头部标识符
        if (convertedData[0] !== 0x4E || convertedData[1] !== 0x45 ||
            convertedData[2] !== 0x53 || convertedData[3] !== 0x1A) {
            throw new Error('修改数据不包含有效的NES头部');
        }


        // 发送完整数据（包含头部）给模拟器处理
        sendMessageToEmulator({
            type: 'APPLY_REQUEST',
            data: convertedData,
            tab: HackCT2Integration.currentTab
        });


    } catch (error) {
        console.error('应用修改失败:', error);

        // 发送错误信息回模拟器
        sendMessageToEmulator({
            type: 'APPLY_ERROR',
            error: error.message
        });
    }
}

/**
 * 自动初始化修改器界面
 * 在ROM数据加载完成后自动执行初始化流程
 */
function autoInitializeHackInterface() {

    try {
        // 1. 启用所有交互控件
        enableAllHackControls();

        // 2. 隐藏与当前上下文无关的TAB页面
        hideIrrelevantTabs();

        // 3. 初始化默认显示的队伍编辑页面
        initializeDefaultTab();



    } catch (error) {
        console.error('自动初始化修改器界面失败:', error);
    }
}

/**
 * 启用所有修改器控件
 */
function enableAllHackControls() {

    // 启用主容器
    const hackDiv = document.getElementById('HackDiv');
    if (hackDiv) {
        hackDiv.style.pointerEvents = 'auto';
        hackDiv.style.opacity = '1';
    }

    // 启用保存按钮
    const saveButton = document.getElementById('btnsave');
    if (saveButton) {
        saveButton.style.pointerEvents = 'auto';
        saveButton.disabled = false;
        saveButton.style.opacity = '1';
    }

    // 启用所有TAB按钮
    const tabButtons = document.querySelectorAll('#menu li.ctab');
    tabButtons.forEach(button => {
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    });

    // 启用所有子功能按钮（更全面的选择器）
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(button => {
        // 排除文件上传和不需要启用的按钮
        if (!button.id.includes('file') && !button.type.includes('file')) {
            button.style.pointerEvents = 'auto';
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    });

    // 特别启用主要功能按钮
    const mainButtons = [
        'Teamedit_x_0', 'Teamedit_x_1',
        'playeredit_x_0', 'playeredit_x_1', 'playeredit_x_2',
        'aitab_0', 'aitab_1', 'aitab_2', 'aitab_3'
    ];

    mainButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.style.pointerEvents = 'auto';
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    });

}

/**
 * 隐藏与当前上下文无关的TAB页面和控件
 */
function hideIrrelevantTabs() {

    // 隐藏mainmeudiv元素
    const mainmeudiv = document.getElementById('mainmeudiv');
    if (mainmeudiv) {
        mainmeudiv.style.display = 'none';
        mainmeudiv.style.visibility = 'hidden';
    }

    // 隐藏关于标签及其对应内容
    const aboutTab = document.querySelector('#menu li.tabFocus.ctab');
    if (aboutTab && aboutTab.textContent.includes('关于')) {
        aboutTab.style.display = 'none';
        aboutTab.style.visibility = 'hidden';
    }

    // 隐藏关于标签对应的内容
    const aboutContent = document.querySelector('#content li.c.ctab');
    if (aboutContent) {
        aboutContent.style.display = 'none';
        aboutContent.style.visibility = 'hidden';
    }

    // 定义要隐藏的功能元素（不隐藏主要TAB）
    const functionsToHide = ['portrait', 'advanced', 'debug'];

    // 隐藏相关功能元素（不影响主要TAB切换）
    functionsToHide.forEach(funcName => {
        const elements = document.querySelectorAll(`[id*="${funcName}"]:not(#menu li), [class*="${funcName}"]:not(#menu li)`);
        elements.forEach(element => {
            element.style.display = 'none';
        });
    });

    // 隐藏文件上传相关元素（除了主要的打开文件）
    const fileElements = document.querySelectorAll('input[type="file"]:not(#Nesfileupload)');
    fileElements.forEach(element => {
        element.style.display = 'none';
    });

    // 确保主要TAB（队伍、球员、指令、AI、HEX、CHR）可以点击
    const mainTabs = document.querySelectorAll('#menu li.ctab:not(.tabFocus)');
    mainTabs.forEach(tab => {
        if (!tab.textContent.includes('关于')) { // 除了已经隐藏的关于标签
            tab.style.pointerEvents = 'auto';
            tab.style.cursor = 'pointer';
            tab.style.opacity = '1';
        }
    });

    // 隐藏复杂编辑功能的容器（只隐藏特定的，不影响主要TAB）
    const complexContainers = document.querySelectorAll('#content > li:not(#content_0):not(#content_1):not(#content_2):not(#content_3):not(#content_5):not(#content_6)');
    complexContainers.forEach(container => {
        container.style.display = 'none';
        // 不设置opacity，避免影响视觉状态
    });

}

/**
 * 初始化默认TAB页面
 */
function initializeDefaultTab() {

    // 使用switchToTab函数切换到队伍TAB
    switchToTab('team');

    // 默认显示队伍编辑
    const teamEditButton = document.getElementById('Teamedit_x_0');
    if (teamEditButton) {
        teamEditButton.click();
    }
}

/**
 * 同步数据到模拟器
 */
function syncDataToEmulator() {
    if (!HackCT2Integration.isIntegrated) {
        alert('未处于集成模式，无法同步数据');
        return;
    }

    if (!window.opener) {
        alert('模拟器窗口已关闭');
        return;
    }


    try {
        // 获取当前修改后的数据
        var modifiedData = null;

        if (window.NesHex && typeof window.NesHex.getModifiedData === 'function') {
            modifiedData = window.NesHex.getModifiedData();
        } else {
            // 如果没有getModifiedData方法，尝试获取NesHex数据
            if (window.NesHex) {
                modifiedData = window.NesHex;
            }
        }

        if (!modifiedData) {
            throw new Error('无法获取修改后的数据');
        }

        // 发送数据到模拟器
        sendMessageToEmulator({
            type: 'APPLY_REQUEST',
            data: modifiedData,
            tab: HackCT2Integration.currentTab
        });


    } catch (error) {
        console.error('同步数据失败:', error);
        alert('同步数据失败: ' + error.message);
    }
}

/**
 * 切换到指定TAB
 */
function switchToTab(tabName) {
    var tabs = document.querySelectorAll('#menu li.ctab');
    var contents = document.querySelectorAll('#content li.ctab');

    for (var i = 0; i < tabs.length; i++) {
        // 获取TAB的文本内容作为标识
        var tabText = tabs[i].textContent.trim();
        var tabId = tabs[i].id || tabs[i].getAttribute('data-tab') || tabText;

        // 根据TAB名称匹配对应的索引
        var shouldMatch = false;
        switch (tabName) {
            case 'team':
                shouldMatch = tabText === '队伍';
                break;
            case 'player':
                shouldMatch = tabText === '球员';
                break;
            case 'instruct':
                shouldMatch = tabText === '指令';
                break;
            case 'ai':
                shouldMatch = tabText === 'AI';
                break;
            case 'music':
                shouldMatch = tabText === '音乐';
                break;
            case 'hex':
                shouldMatch = tabText === 'HEX';
                break;
            case 'chr':
                shouldMatch = tabText === 'CHR';
                break;
            case 'about':
                shouldMatch = tabText === '关于';
                break;
            default:
                shouldMatch = (tabId === tabName);
        }

        if (shouldMatch) {
            // 显示目标TAB
            tabs[i].style.display = 'block';
            tabs[i].classList.add('tabFocus');
            if (contents[i]) {
                contents[i].style.display = 'block';
            }

            HackCT2Integration.currentTab = tabName;

            // 隐藏其他TAB
            for (var j = 0; j < tabs.length; j++) {
                if (j !== i) {
                    tabs[j].classList.remove('tabFocus');
                    if (contents[j]) {
                        contents[j].style.display = 'none';
                    }
                }
            }

            break;
        }
    }
}

/**
 * 发送消息到模拟器
 * 支持拟态层模式下的iframe通信
 */
function sendMessageToEmulator(message) {
    // 尝试多种通信方式
    let sent = false;

    // 1. 尝试通过window.opener发送（传统模式）
    if (window.opener) {
        try {
            window.opener.postMessage(message, '*');
            sent = true;
        } catch (error) {
            console.warn('通过window.opener发送消息失败:', error);
        }
    }

    // 2. 尝试通过window.parent发送（拟态层模式）
    if (!sent && window.parent && window.parent !== window) {
        try {
            window.parent.postMessage(message, '*');
            sent = true;
        } catch (error) {
            console.warn('通过window.parent发送消息失败:', error);
        }
    }

    // 3. 如果都没发送成功，记录警告
    if (!sent) {
        console.warn('无法发送消息到模拟器，window.opener和window.parent都不可用');
    }
}

/**
 * 页面卸载时的清理工作
 */
window.addEventListener('beforeunload', function () {
    if (HackCT2Integration.isIntegrated && window.opener) {
        sendMessageToEmulator({
            type: 'HACK_CLOSED'
        });
    }
});

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHackCT2IntegrationMode);
} else {
    initHackCT2IntegrationMode();
}


/**
 * 处理保存文件请求 - 优化版本
 * 将NesHex数据转换为NES格式并提供本地下载
 */
function handleSaveFileRequest(data) {
    try {
        // 获取修改后的数据
        const modifiedData = getModifiedData();
        
        // 转换为NES格式
        const nesData = convertToNesFormat(modifiedData);
        
        // 执行下载
        downloadNesFile(nesData);
        
        // 发送成功响应
        sendMessageToEmulator({
            type: 'SAVE_FILE_RESPONSE',
            success: true,
            message: '文件已成功下载'
        });
        
        
    } catch (error) {
        console.error('保存文件失败:', error);
        
        sendMessageToEmulator({
            type: 'SAVE_FILE_RESPONSE',
            success: false,
            error: error.message
        });
        
    }
}

/**
 * 获取修改后的数据
 */
function getModifiedData() {
    // 优先使用getModifiedData方法
    if (window.NesHex?.getModifiedData) {
        return window.NesHex.getModifiedData();
    }
    
    // 回退到直接使用NesHex数组
    if (window.NesHex) {
        return window.NesHex;
    }
    
    throw new Error('无法获取修改数据：NesHex不可用');
}

/**
 * 转换为NES格式
 */
function convertToNesFormat(data) {
    if (!data) {
        throw new Error('数据为空');
    }
    
    // 已经是Uint8Array格式
    if (data instanceof Uint8Array) {
        return validateAndFixNesHeader(data);
    }
    
    // 普通数组
    if (Array.isArray(data)) {
        return validateAndFixNesHeader(new Uint8Array(data));
    }
    
    // 对象格式
    if (typeof data === 'object') {
        return validateAndFixNesHeader(new Uint8Array(Object.values(data)));
    }
    
    throw new Error(`不支持的数据类型: ${typeof data}`);
}

/**
 * 验证并修复NES头部
 */
function validateAndFixNesHeader(data) {
    // 检查最小长度
    if (data.length < 16) {
        throw new Error('数据长度不足，无法构成有效的NES文件');
    }
    
    // 验证NES头部标识符
    const hasValidHeader = data[0] === 0x4E && data[1] === 0x45 && 
                          data[2] === 0x53 && data[3] === 0x1A;
    
    if (!hasValidHeader) {
        console.warn('数据缺少有效的NES头部标识符');
    }
    
    return data;
}

/**
 * 下载NES文件
 */
function downloadNesFile(nesData) {
    // 生成文件名
    const filename = generateNesFilename();
    
    // 创建下载链接
    const blob = new Blob([nesData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    // 创建临时链接元素
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    // 添加到页面并触发下载
    document.body.appendChild(link);
    link.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * 生成NES文件名
 */
function generateNesFilename() {
    const now = new Date();
    const timestamp = formatTimestamp(now);
    const baseName = getBaseRomName();
    
    return `${timestamp}_${baseName}.nes`;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    return `${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * 获取基础ROM名称
 */
function getBaseRomName() {
    // 优先使用模拟器的 loadedName 变量（当前游戏文件名）
    if (typeof window.loadedName === 'string' && window.loadedName.trim()) {
        return window.loadedName.replace(/\.nes$/i, '');
    }
    
    // 其次使用全局变量 filenamenes
    if (typeof filenamenes === 'string' && filenamenes.trim()) {
        return filenamenes.replace(/\.nes$/i, '');
    }
    
    // 回退到默认名称
    return 'modified_rom';
}