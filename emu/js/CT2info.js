// 添加新的常量定义到文件开头
const MATCH_PERIODS = [
    { value: "00", text: "上半场" },
    { value: "01", text: "下半场" },
    { value: "02", text: "加时上" },
    { value: "03", text: "加时下" },
    { value: "04", text: "点球大战" },
    { value: "05", text: "观看结局" }
];

const bollpostion = [
    { value: "00", text: "平地" },
    { value: "01", text: "禁区低空球" },
    { value: "02", text: "禁区高空球" }
];

document.addEventListener("DOMContentLoaded", function () {
    var popup = null; // 用于存储弹出层引用
    var isPinned = false; // 图钉状态
    let container = document.getElementById('fullscreenContainer') || document.body;
    // 定义对阵信息按钮
    var floatingButton = document.getElementById("matchInfobtn");

    function createCoordSelector(player, stats, coordSpan) {
        // 创建弹窗容器
        const coordPopup = document.createElement('div');
        coordPopup.style.position = 'fixed';
        coordPopup.style.left = '50%';
        coordPopup.style.top = '50%';
        coordPopup.style.transform = 'translate(-50%, -50%)';
        coordPopup.style.backgroundColor = '#fff';
        coordPopup.style.padding = '20px';
        coordPopup.style.border = '1px solid #ccc';
        coordPopup.style.borderRadius = '8px';
        coordPopup.style.zIndex = '20030';
        coordPopup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        coordPopup.style.maxWidth = '90vw';
        coordPopup.style.maxHeight = '90vh';
        coordPopup.style.overflow = 'auto';

        // 创建一个容器来包裹图片和足球
        const fieldContainer = document.createElement('div');
        fieldContainer.style.position = 'relative';
        fieldContainer.style.width = 'fit-content';
        fieldContainer.style.margin = '0 auto';

        // 加载球场图片
        const img = document.createElement('img');
        img.src = 'css/if.png';
        img.style.display = 'block';
        img.style.maxWidth = '100%';

        // 创建足球图标
        const ball = document.createElement('div');
        ball.style.position = 'absolute';
        ball.style.width = '8px';
        ball.style.height = '8px';
        ball.style.borderRadius = '50%';
        ball.style.backgroundColor = '#f00';
        ball.style.border = '2px solid #fff';
        ball.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
        ball.style.pointerEvents = 'none';
        ball.style.zIndex = '1000';

        // 添加当前坐标显示
        const coordInfo = document.createElement('div');
        coordInfo.style.marginBottom = '10px';
        coordInfo.style.textAlign = 'center';

        // 记录新坐标
        let newX = stats.xPos;
        let newY = stats.yPos;

        // 显示初始坐标
        coordInfo.textContent = `当前坐标: (${stats.xPos}, ${stats.yPos})`;

        // 等待图片加载完成后设置初始足球位置
        img.onload = () => {
            // 计算实际显示位置 (完全匹配C#代码的计算方式)
            const screenX = (stats.xPos - 0x34);
            const screenY = (stats.yPos - 0x54);

            ball.style.left = `${screenX}px`;
            ball.style.top = `${screenY}px`;
            fieldContainer.appendChild(ball);
        };

        // 图片点击事件
        fieldContainer.addEventListener('click', function (e) {
            if (e.target === img) {
                const rect = img.getBoundingClientRect();
                const relativeX = e.clientX - rect.left;
                const relativeY = e.clientY - rect.top;

                // 转换点击坐标到游戏坐标
                newX = Math.floor(relativeX) + 0x34;
                newY = Math.floor(relativeY) + 0x54;

                // 更新足球位置 (使用相同的计算方式)
                const screenX = (newX - 0x34);
                const screenY = (newY - 0x54);

                ball.style.left = `${screenX}px`;
                ball.style.top = `${screenY}px`;

                // 更新坐标显示
                coordInfo.textContent = `当前坐标: (${newX}, ${newY})`;
            }
        });

        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'center';
        buttonContainer.style.marginTop = '10px';

        // 创建保存和取消按钮
        const saveButton = document.createElement('button');
        saveButton.textContent = '保存';
        saveButton.style.marginRight = '10px';
        saveButton.style.padding = '5px 15px';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.padding = '5px 15px';

        // 保存按钮事件
        saveButton.addEventListener('click', function () {
            const baseAddr = player.index < 11 ? (0x300 + player.index * 0x0C) : (0x384 + (player.index - 11) * 0x0C);
            db.nes.ram[baseAddr + 6] = newX;  // X坐标
            db.nes.ram[baseAddr + 8] = newY;  // Y坐标
            coordSpan.textContent = `(${newX}, ${newY})`;
            document.body.removeChild(coordPopup);
        });

        // 取消按钮事件
        cancelButton.addEventListener('click', function () {
            document.body.removeChild(coordPopup);
        });

        // 阻止事件冒泡
        coordPopup.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        // 组装弹窗
        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(cancelButton);
        coordPopup.appendChild(coordInfo);
        fieldContainer.appendChild(img);
        coordPopup.appendChild(fieldContainer);
        coordPopup.appendChild(buttonContainer);

        return coordPopup;
    }

    // 添加获取球员详细数据的函数
    function getPlayerStats(index) {
        // 计算基础地址
        const baseAddr = index < 11 ? (0x300 + index * 0x0C) : (0x384 + (index - 11) * 0x0C);
        const nes = db.nes;

        return {
            position: nes.peak(baseAddr),       // 位置编号
            staminaL: nes.peak(baseAddr + 1),   // 体力值低位
            staminaH: nes.peak(baseAddr + 2),   // 体力值高位
            level: nes.peak(baseAddr + 3),      // 等级
            xPos: nes.peak(baseAddr + 6),       // X坐标
            yPos: nes.peak(baseAddr + 8),       // Y坐标
            status: nes.peak(baseAddr + 7),     // 状态(按键/自动)
            ai: nes.peak(baseAddr + 9),         // AI相关
            stiff: nes.peak(baseAddr + 0x0A)    // 硬直时间
        };
    }
    function setPlayerStamina(index, value) {
        const baseAddr = index < 11 ? (0x300 + index * 0x0C) : (0x384 + (index - 11) * 0x0C);
        // 将体力值拆分为高低位
        const high = Math.floor(value / 256);
        const low = value % 256;
        db.nes.ram[baseAddr + 1] = low;  // 低位
        db.nes.ram[baseAddr + 2] = high; // 高位
    }

    // 修改球员列表项的创建
    // 修改 createPlayerListItem 函数中的相关部分
    function createPlayerListItem(player, container) {
        var li = document.createElement("li");
        li.innerText = player.name;
        li.style.cursor = "pointer";
        li.style.padding = "4px 8px";
        li.style.margin = "2px 0";
        li.style.borderRadius = "4px";
        li.style.position = "relative";
        li.setAttribute("data-index", player.index);

        // 检查当前持球状态并设置颜色
        if (db.nes.ram[0x441] === player.index) {
            li.style.color = '#ff0000'; // 持球球员显示红色
        }

        var statsDiv = document.createElement("div");
        statsDiv.style.display = "none";
        statsDiv.className = "player-stats";
        statsDiv.style.color = '#000000'; // 确保详细信息始终使用默认黑色
        li.appendChild(statsDiv);

        // 添加单击事件显示详细信息
        li.addEventListener("click", function (e) {
            e.stopPropagation();
            let stats = getPlayerStats(player.index);
            const stamina = stats.staminaH * 256 + stats.staminaL;
            const isGK = player.position === 'GK';

            // 修改数据显示
            statsDiv.innerHTML = `
                <div style="margin: 5px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 0.9em;">
                    <div style="margin-bottom: 8px;">
                        <button class="switch-ball" style="
                            padding: 2px 8px;
                            background: ${db.nes.ram[0x441] === player.index ? '#4CAF50' : '#f0f0f0'};
                            color: ${db.nes.ram[0x441] === player.index ? 'white' : 'black'};
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            cursor: pointer;
                        ">
                            #${player.position}${db.nes.ram[0x441] === player.index ? '✓ 持球中' : '让我持球'}
                        </button>
                    </div>
                    <b>详细数据:</b><br>
                    体力值: <span style="color:${stamina > 30000 ? 'green' : 'red'}">${stamina}</span>
                    <button class="stamina-min" style="margin-left:5px;padding:0 4px;cursor:pointer;">min</button>
                    <button class="stamina-max" style="margin-left:5px;padding:0 4px;cursor:pointer;">max</button><br>
                    等级: 
                    <select class="level-select" style="margin-left:5px;">
                        ${Array.from({ length: 256 }, (_, i) =>
                `<option value="${i}" ${stats.level === i ? 'selected' : ''}>${i}</option>`
            )}
                    </select><br>
                    坐标: <span class="coord-text" style="cursor:pointer;text-decoration:underline;">(${stats.xPos}, ${stats.yPos})</span><br>
                    ${isGK ? `
                        硬直: <span class="gk-stiff" style="cursor:pointer">${stats.stiff.toString(16).toUpperCase()}${stats.stiff === 6 ? '(空门)' : ''}</span><br>
                        疲劳累加: ${stats.staminaL.toString(16).toUpperCase()}<br>
                        回复时间: ${stats.stiff.toString(16).toUpperCase()}<br>
                        状态: <span class="gk-status" style="cursor:pointer">${stats.status === 0x4F ? '摔倒' :
                        stats.status === 0x1A ? '漏球' :
                            stats.status === 0x00 ? '正常' :
                                stats.status.toString(16).toUpperCase()
                    }</span>
                    ` : `
                        硬直: <span class="player-stiff" style="cursor:pointer">${stats.stiff.toString(16).toUpperCase()}</span>
                    `}
                </div>
            `;

            // 绑定各种事件
            // 坐标点击事件
            const coordText = statsDiv.querySelector('.coord-text');
            coordText.addEventListener('click', function (e) {
                e.stopPropagation();
                const coordPopup = createCoordSelector(player, stats, coordText);
                document.body.appendChild(coordPopup);
            });

            // 持球切换按钮事件
            const switchButton = statsDiv.querySelector('.switch-ball');
            if (switchButton) {
                switchButton.addEventListener('click', function (e) {
                    e.stopPropagation();
                    db.nes.ram[0x441] = player.index;
                    // 更新所有球员的状态显示
                    document.querySelectorAll('.player-stats').forEach(div => {
                        const btn = div.querySelector('.switch-ball');
                        if (btn) {
                            btn.style.background = div === statsDiv ? '#4CAF50' : '#f0f0f0';
                            btn.style.color = div === statsDiv ? 'white' : 'black';
                            btn.innerHTML = div === statsDiv ?
                                `#${player.position}✓ 持球中` :
                                `#${player.position}让我持球`;
                        }
                    });
                });
            }

            // 体力值修改按钮事件
            const staminaMin = statsDiv.querySelector('.stamina-min');
            const staminaMax = statsDiv.querySelector('.stamina-max');

            staminaMin.addEventListener('click', e => {
                e.stopPropagation();
                setPlayerStamina(player.index, 0);
                stats = getPlayerStats(player.index);
                const newStamina = stats.staminaH * 256 + stats.staminaL;
                const staminaSpan = statsDiv.querySelector('span[style*="color:"]');
                if (staminaSpan) {
                    staminaSpan.textContent = newStamina;
                    staminaSpan.style.color = newStamina > 30000 ? 'green' : 'red';
                }
            });

            staminaMax.addEventListener('click', e => {
                e.stopPropagation();
                setPlayerStamina(player.index, 999);
                stats = getPlayerStats(player.index);
                const newStamina = stats.staminaH * 256 + stats.staminaL;
                const staminaSpan = statsDiv.querySelector('span[style*="color:"]');
                if (staminaSpan) {
                    staminaSpan.textContent = newStamina;
                    staminaSpan.style.color = newStamina > 30000 ? 'green' : 'red';
                }
            });

            // 等级选择事件
            const levelSelect = statsDiv.querySelector('.level-select');
            levelSelect.addEventListener('click', e => e.stopPropagation());
            levelSelect.addEventListener('change', e => {
                e.stopPropagation();
                const baseAddr = player.index < 11 ? (0x300 + player.index * 0x0C) : (0x384 + (player.index - 11) * 0x0C);
                db.nes.ram[baseAddr + 3] = parseInt(e.target.value);
            });

            // GK特有的事件绑定
            if (isGK) {
                // 硬直值点击事件
                const gkStiff = statsDiv.querySelector('.gk-stiff');
                gkStiff.addEventListener('click', e => {
                    e.stopPropagation();
                    let newStiff = parseInt(gkStiff.textContent, 16);
                    newStiff = (newStiff + 1) % 7;
                    if (newStiff === 5) newStiff = 6;

                    const baseAddr = player.index < 11 ? (0x300 + player.index * 0x0C) : (0x384 + (player.index - 11) * 0x0C);
                    db.nes.ram[baseAddr + 0x0A] = newStiff;

                    gkStiff.textContent = `${newStiff.toString(16).toUpperCase()}${newStiff === 6 ? '(空门)' : ''}`;
                });

                // GK状态点击事件
                const gkStatus = statsDiv.querySelector('.gk-status');
                gkStatus.addEventListener('click', e => {
                    e.stopPropagation();
                    const baseAddr = player.index < 11 ? (0x300 + player.index * 0x0C) : (0x384 + (player.index - 11) * 0x0C);
                    const currentStatus = db.nes.peak(baseAddr + 7);

                    let newStatus;
                    if (currentStatus === 0x00) newStatus = 0x4F;
                    else if (currentStatus === 0x4F) newStatus = 0x1A;
                    else newStatus = 0x00;

                    db.nes.ram[baseAddr + 7] = newStatus;

                    gkStatus.textContent = newStatus === 0x4F ? '摔倒' :
                        newStatus === 0x1A ? '漏球' :
                            newStatus === 0x00 ? '正常' :
                                newStatus.toString(16).toUpperCase();
                });
            } else {
                // 普通球员硬直值点击事件
                const playerStiff = statsDiv.querySelector('.player-stiff');
                playerStiff.addEventListener('click', e => {
                    e.stopPropagation();
                    let newStiff = parseInt(playerStiff.textContent, 16);
                    newStiff = (newStiff + 1) % 6;

                    const baseAddr = player.index < 11 ? (0x300 + player.index * 0x0C) : (0x384 + (player.index - 11) * 0x0C);
                    db.nes.ram[baseAddr + 0x0A] = newStiff;

                    playerStiff.textContent = newStiff.toString(16).toUpperCase();
                });
            }

            // 显示/隐藏逻辑
            const wasHidden = statsDiv.style.display === "none";
            document.querySelectorAll('.player-stats').forEach(div => {
                if (div !== statsDiv) div.style.display = "none";
            });
            document.querySelectorAll('li').forEach(item => {
                if (item !== li) item.style.background = "transparent";
            });

            if (wasHidden) {
                statsDiv.style.display = "block";
                li.style.background = "#e8e8e8";
            } else {
                statsDiv.style.display = "none";
                li.style.background = "transparent";
            }
        });

        return li;
    }

    // 更新 createFloatingDialog 函数实现
    function createFloatingDialog(teamA, teamB) {
        let popup = document.createElement("div");
        popup.style.position = "fixed";
        popup.style.left = "50%";
        popup.style.top = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.style.background = "#fff";
        popup.style.border = "1px solid #ccc";
        popup.style.borderRadius = "8px";
        popup.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        popup.style.zIndex = "20030";
        popup.style.display = "flex";
        popup.style.flexDirection = "column";
        popup.style.maxHeight = "100vh";
        popup.style.overflowY = "auto";

        // 添加标题栏
        var titleBar = document.createElement("div");
        titleBar.style.cursor = "move";
        titleBar.style.background = "#f0f0f0";
        titleBar.style.padding = "8px 10px";
        titleBar.style.borderBottom = "1px solid #ccc";
        titleBar.style.display = "flex";
        titleBar.style.justifyContent = "space-between";
        titleBar.style.alignItems = "center";

        var title = document.createElement("span");
        title.innerText = "对阵信息加强版";
        titleBar.appendChild(title);

        // 添加图钉按钮
        var pinButton = document.createElement("button");
        pinButton.innerText = "📌点我锁定";
        pinButton.style.border = "none";
        pinButton.style.background = "transparent";
        pinButton.style.cursor = "pointer";
        pinButton.style.marginRight = "10px";
        pinButton.addEventListener("click", function () {
            isPinned = !isPinned;
            pinButton.style.color = isPinned ? "red" : "black";
            pinButton.innerText = isPinned ? "📌已锁定" : "📌点我锁定";
        });
        titleBar.appendChild(pinButton);

        // 添加关闭按钮
        var closeButton = document.createElement("button");
        closeButton.innerText = "关闭";
        closeButton.style.border = "none";
        closeButton.style.background = "transparent";
        closeButton.style.cursor = "pointer";
        closeButton.addEventListener("click", function () {
            if (popup) {
                if (popup.parentNode) {
                    popup.parentNode.removeChild(popup);
                }
                popup = null;
            }
        });
        titleBar.appendChild(closeButton);

        popup.appendChild(titleBar);

        // 添加选项卡
        const tabContainer = document.createElement("div");
        tabContainer.style.borderBottom = "1px solid #ccc";

        const tabs = [
            { id: "matchInfo", text: "比赛信息" },
            { id: "playerInfo", text: "球员信息" }
        ];

        tabs.forEach((tab, index) => {
            const tabButton = document.createElement("button");
            tabButton.textContent = tab.text;
            tabButton.style.padding = "8px 16px";
            tabButton.style.border = "none";
            tabButton.style.background = "none";
            tabButton.style.cursor = "pointer";
            tabButton.dataset.tabId = tab.id;

            if (index === 0) {
                tabButton.style.borderBottom = "2px solid #4CAF50";
            }

            tabButton.addEventListener("click", (e) => switchTab(e.target));
            tabContainer.appendChild(tabButton);
        });

        popup.appendChild(tabContainer);

        // 创建内容区域容器
        const contentContainer = document.createElement("div");

        // 创建比赛信息面板
        const matchPanel = createMatchPanel();
        matchPanel.id = "matchInfoPanel";

        // 创建球员信息面板
        const playerPanel = createPlayerPanel(teamA, teamB);
        playerPanel.id = "playerInfoPanel";
        playerPanel.style.display = "none";

        contentContainer.appendChild(matchPanel);
        contentContainer.appendChild(playerPanel);
        popup.appendChild(contentContainer);

        return popup;
    }

    function createMatchPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";

        // 创建比赛基本信息设置区域
        const matchSettings = document.createElement("div");
        matchSettings.style.marginBottom = "20px";

        // 添加比分设置
        const scoreContainer = document.createElement("div");
        scoreContainer.style.marginBottom = "10px";
        scoreContainer.innerHTML = `
            <div style="display:flex;align-items:center;margin-bottom:10px">
                <span style="margin-right:10px">比分:</span>
                <select id="homeScore" style="width:60px;margin-right:5px">
                    ${Array.from({ length: 256 }, (_, i) => `<option value="${i}" ${db.nes.ram[0x28] === i ? 'selected' : ''}>${i}</option>`)}
                </select>
                <span style="margin:0 10px">-</span>
                <select id="awayScore" style="width:60px">
                    ${Array.from({ length: 256 }, (_, i) => `<option value="${i}" ${db.nes.ram[0x29] === i ? 'selected' : ''}>${i}</option>`)}
                </select>
            </div>
        `;

        // 添加比赛时间设置
        const timeContainer = document.createElement("div");
        timeContainer.style.marginBottom = "10px";
        timeContainer.innerHTML = `
            <div style="display:flex;align-items:center;margin-bottom:10px">
                <span style="margin-right:10px">比赛时间:</span>
                <select id="matchTime" style="width:120px">
                    ${gametime.map((time, i) => `<option value="${i}" ${db.nes.ram[0x5F7] === i ? 'selected' : ''}>${time}</option>`)}
                </select>
            </div>
        `;

        // 添加比赛阶段设置
        const periodContainer = document.createElement("div");
        periodContainer.style.marginBottom = "10px";
        periodContainer.innerHTML = `
            <div style="display:flex;align-items:center;margin-bottom:10px">
                <span style="margin-right:10px">比赛阶段:</span>
                <select id="matchPeriod" style="width:120px">
                    ${MATCH_PERIODS.map(period =>
            `<option value="${period.value}" ${db.nes.ram[0x27].toString(16).padStart(2, '0').toUpperCase() === period.value ? 'selected' : ''}>${period.text}</option>`
        )}
                </select>
            </div>
        `;

        // 添加关卡选择
        const stageContainer = document.createElement("div");
        stageContainer.style.marginBottom = "10px";
        stageContainer.innerHTML = `
            <div style="display:flex;align-items:center;margin-bottom:10px">
                <span style="margin-right:10px">比赛关卡:</span>
        <select id="matchStage" style="width:200px">
            ${Array.from({ length: 256 }, (_, i) => {
            const hexValue = i.toString(16).padStart(2, '0').toUpperCase();
            const displayText = i < teamlist.length ? `${hexValue}-${teamlist[i]}` : `${hexValue}-未知关卡`;
            return `<option value="${i}" ${db.nes.ram[0x26] === i ? 'selected' : ''}>${displayText}</option>`;
        })}
        </select>
            </div>
        `;

        // 添加阵型战术设置
        const formationsDiv = document.createElement("div");
        formationsDiv.style.marginBottom = "10px";

        // 阵型选项
        const formationOptions = [
            { value: "00", text: "433" },
            { value: "01", text: "442" },
            { value: "02", text: "352" },
            { value: "03", text: "巴西" },
            { value: "04", text: "04" },
            { value: "05", text: "05" },
            { value: "06", text: "06" },
            { value: "07", text: "07" },
            { value: "08", text: "08" },
            { value: "09", text: "09" },
            { value: "0A", text: "0A" },
            { value: "0B", text: "0B" },
            { value: "0C", text: "0C" },
            { value: "0D", text: "0D" },
            { value: "0E", text: "0E" },
            { value: "0F", text: "0F" }
        ];

        // 战术选项
        const tacticsOptions = [
            { value: "00", text: "普通" },
            { value: "01", text: "紧逼" },
            { value: "02", text: "反击" },
            { value: "03", text: "03" },
            { value: "04", text: "04" },
            { value: "05", text: "05" },
            { value: "06", text: "06" },
            { value: "07", text: "07" },
            { value: "08", text: "08" },
            { value: "09", text: "09" },
            { value: "0A", text: "0A" },
            { value: "0B", text: "0B" },
            { value: "0C", text: "0C" },
            { value: "0D", text: "0D" },
            { value: "0E", text: "0E" },
            { value: "0F", text: "0F" }
        ];

        formationsDiv.innerHTML = `
            <div style="margin-bottom:10px">
                <div style="display:flex;align-items:center;margin-bottom:10px">
                    <span style="margin-right:10px">我方阵型:</span>
                    <select id="formation-A" style="width:80px">
                        ${formationOptions.map(opt =>
            `<option value="${opt.value}" ${db.nes.ram[0x2C] === parseInt(opt.value, 16) ? 'selected' : ''}>${opt.text}</option>`
        ).join('')}
                    </select>
                    <span style="margin:0 10px">战术:</span>
                    <select id="tactics-A" style="width:80px">
                        ${tacticsOptions.map(opt =>
            `<option value="${opt.value}" ${db.nes.ram[0x2D] === parseInt(opt.value, 16) ? 'selected' : ''}>${opt.text}</option>`
        ).join('')}
                    </select>
                </div>
                <div style="display:flex;align-items:center;margin-bottom:10px">
                    <span style="margin-right:10px">敌方阵型:</span>
                    <select id="formation-B" style="width:80px">
                        ${formationOptions.map(opt =>
            `<option value="${opt.value}" ${db.nes.ram[0x2E] === parseInt(opt.value, 16) ? 'selected' : ''}>${opt.text}</option>`
        ).join('')}
                    </select>
                    <span style="margin:0 10px">战术:</span>
                    <select id="tactics-B" style="width:80px">
                        ${tacticsOptions.map(opt =>
            `<option value="${opt.value}" ${db.nes.ram[0x2F] === parseInt(opt.value, 16) ? 'selected' : ''}>${opt.text}</option>`
        ).join('')}
                    </select>
                </div>
            </div>
        `;

        // 修改 teamNameContainer 部分代码
        const teamNameContainer = document.createElement("div");
        teamNameContainer.innerHTML = `
            <div style="margin-bottom:10px">
                <div style="display:flex;align-items:center;margin-bottom:10px">
                    <span style="margin-right:10px">主队名称ID:</span>
                    <select id="homeTeamId" style="width:80px">
                        ${Array.from({ length: 256 }, (_, i) =>
            `<option value="${i.toString(16).padStart(2, '0').toUpperCase()}" 
                             ${db.nes.ram[0x2A] === i ? 'selected' : ''}>
                             ${i.toString(16).padStart(2, '0').toUpperCase()}
                            </option>`
        )}
                    </select>
                </div>
                <div style="display:flex;align-items:center;margin-bottom:10px">
                    <span style="margin-right:10px">客队名称ID:</span>
                    <select id="awayTeamId" style="width:80px">
                        ${Array.from({ length: 256 }, (_, i) =>
            `<option value="${i.toString(16).padStart(2, '0').toUpperCase()}" 
                             ${db.nes.ram[0x2B] === i ? 'selected' : ''}>
                             ${i.toString(16).padStart(2, '0').toUpperCase()}
                            </option>`
        )}
                    </select>
                </div>
            </div>
        `;


        const ballpsContainer = document.createElement("div");
        ballpsContainer.innerHTML = `
            <div style="margin-bottom:10px">
                <div style="display:flex;align-items:center;margin-bottom:10px">
                    <span style="margin-right:10px">足球状态:</span>
                    <select id="ballps" style="width:80px">
                 ${bollpostion.map(opt =>
            `<option value="${opt.value}" ${db.nes.ram[0x044E] === parseInt(opt.value, 16) ? 'selected' : ''}>${opt.text}</option>`
        ).join('')}
                    </select>
                </div>
            </div>
        `;

        // 组装所有元素
        matchSettings.appendChild(scoreContainer);
        matchSettings.appendChild(timeContainer);
        matchSettings.appendChild(periodContainer);
        matchSettings.appendChild(stageContainer);
        matchSettings.appendChild(formationsDiv);
        matchSettings.appendChild(teamNameContainer);
        matchSettings.appendChild(ballpsContainer);
        panel.appendChild(matchSettings);

        // 添加事件监听器
        panel.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', function () {
                let value;
                if (this.id.startsWith('formation-') || this.id.startsWith('tactics-') ||
                    this.id === 'homeTeamId' || this.id === 'awayTeamId') {
                    value = parseInt(this.value, 16);
                } else {
                    value = parseInt(this.value, this.id === 'matchPeriod' ? 16 : 10);
                }

                switch (this.id) {
                    case 'homeTeamId':
                        db.nes.ram[0x2A] = value;
                        break;
                    case 'awayTeamId':
                        db.nes.ram[0x2B] = value;
                        break;
                    case 'homeScore':
                        db.nes.ram[0x28] = value;
                        break;
                    case 'awayScore':
                        db.nes.ram[0x29] = value;
                        break;
                    case 'matchTime':
                        db.nes.ram[0x5F7] = value;
                        break;
                    case 'matchPeriod':
                        db.nes.ram[0x27] = value;
                        break;
                    case 'matchStage':
                        db.nes.ram[0x26] = value;
                        break;
                    case 'formation-A':
                        db.nes.ram[0x2C] = value;
                        break;
                    case 'tactics-A':
                        db.nes.ram[0x2D] = value;
                        break;
                    case 'formation-B':
                        db.nes.ram[0x2E] = value;
                        break;
                    case 'tactics-B':
                        db.nes.ram[0x2F] = value;
                        break;
                    case 'ballps':
                        db.nes.ram[0x044E] = value;
                        break;
                }
            });
        });

        return panel;
    }

    function createPlayerPanel(teamA, teamB) {
        const panel = document.createElement("div");
        panel.style.display = "flex";
        panel.style.padding = "10px";
        panel.style.gap = "20px";
        panel.style.width = "100%"; // 添加宽度100%
        panel.style.boxSizing = "border-box"; // 添加盒模型设置

        // 我方球员列表容器
        var teamAContainer = document.createElement("div");
        teamAContainer.style.flex = "1";
        teamAContainer.style.width = "50%"; // 设置固定宽度
        teamAContainer.style.borderRight = "1px solid #eee";

        // 添加标题
        var teamATitle = document.createElement("div");
        teamATitle.textContent = "我方球员";
        teamATitle.style.fontWeight = "bold";
        teamATitle.style.marginBottom = "10px";
        teamATitle.style.padding = "5px";
        teamATitle.style.backgroundColor = "#f5f5f5";
        teamATitle.style.borderRadius = "4px";
        teamAContainer.appendChild(teamATitle);

        var listA = document.createElement("ul");
        listA.style.listStyle = "none";
        listA.style.padding = "0";
        listA.style.margin = "0";
        listA.style.maxHeight = "calc(80vh)";
        listA.style.overflowY = "auto";
        teamA.forEach(player => listA.appendChild(createPlayerListItem(player, teamAContainer)));
        teamAContainer.appendChild(listA);

        // 敌方球员列表容器
        var teamBContainer = document.createElement("div");
        teamBContainer.style.flex = "1";
        teamBContainer.style.width = "50%"; // 设置固定宽度

        // 添加标题
        var teamBTitle = document.createElement("div");
        teamBTitle.textContent = "敌方球员";
        teamBTitle.style.fontWeight = "bold";
        teamBTitle.style.marginBottom = "10px";
        teamBTitle.style.padding = "5px";
        teamBTitle.style.backgroundColor = "#f5f5f5";
        teamBTitle.style.borderRadius = "4px";
        teamBContainer.appendChild(teamBTitle);

        var listB = document.createElement("ul");
        listB.style.listStyle = "none";
        listB.style.padding = "0";
        listB.style.margin = "0";
        listB.style.maxHeight = "calc(80vh)";
        listB.style.overflowY = "auto";
        teamB.forEach(player => listB.appendChild(createPlayerListItem(player, teamBContainer)));
        teamBContainer.appendChild(listB);

        panel.appendChild(teamAContainer);
        panel.appendChild(teamBContainer);

        return panel;
    }

    function switchTab(selectedTab) {
        // 切换选项卡样式
        document.querySelectorAll('[data-tab-id]').forEach(tab => {
            tab.style.borderBottom = tab === selectedTab ?
                "2px solid #4CAF50" : "none";
        });

        // 切换内容显示
        const tabId = selectedTab.dataset.tabId;
        const matchPanel = document.getElementById("matchInfoPanel");
        const playerPanel = document.getElementById("playerInfoPanel");

        if (tabId === "matchInfo") {
            matchPanel.style.display = "block";
            playerPanel.style.display = "none";
        } else {
            matchPanel.style.display = "none";
            playerPanel.style.display = "flex"; // 改为 flex 显示
        }
    }

    // 防止select的点击事件冒泡到文档
    document.addEventListener('click', function (e) {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') {
            e.stopPropagation();
        }
    });

    floatingButton.addEventListener("click", function () {
        if (popup) {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
            popup = null;
            return;
        }

        // 获取当前持球球员
        const currentBallHolder = db.nes.ram[0x441];

        // 定义 teamA 和 teamB
        var teamA = [];
        var teamB = [];
        // 添加位置编号映射
        const positionMap = {
            0: 'GK',  // 守门员
            1: '2',   // 后卫
            2: '3',
            3: '4',
            4: '5',
            5: '6',   // 中场
            6: '7',
            7: '8',
            8: '9',   // 前锋
            9: '10',  // 前腰/影锋
            10: '11'  // 前锋
        };
        // 修改创建球员时的代码
        for (var i = 0; i < 22; i++) {
            var addr = 0x300 + i * 0x0C;
            var playerNum = 0;
            if (typeof db.nes.peak === "function") {
                playerNum = db.nes.peak(addr);
            }
            var playerName = (typeof playerstr !== "undefined" && playerstr[playerNum]) ? playerstr[playerNum] : ("未知(" + playerNum + ")");
            // 计算位置编号
            const positionNum = i % 11;
            const positionText = positionMap[positionNum] || '未知';

            const player = {
                name: playerName,
                index: i,
                position: positionText,
                hasBall: i === currentBallHolder  // 添加持球状态标记
            };

            if (i < 11) {
                teamA.push(player);
            } else {
                teamB.push(player);
            }
        }

        // 创建浮动对话框
        popup = createFloatingDialog(teamA, teamB);
        container.appendChild(popup);

        // 实现拖拽功能
        const titleBar = popup.querySelector("div");
        titleBar.addEventListener("mousedown", function (e) {
            var offsetX = e.clientX - popup.offsetLeft;
            var offsetY = e.clientY - popup.offsetTop;
            function mouseMoveHandler(e) {
                popup.style.left = (e.clientX - offsetX) + "px";
                popup.style.top = (e.clientY - offsetY) + "px";
            }
            function mouseUpHandler() {
                document.removeEventListener("mousemove", mouseMoveHandler);
                document.removeEventListener("mouseup", mouseUpHandler);
            }
            document.addEventListener("mousemove", mouseMoveHandler);
            document.addEventListener("mouseup", mouseUpHandler);
        });
    });



    // 点击页面其他地方时关闭弹出层
    document.addEventListener("click", function (e) {
        if (popup && !popup.contains(e.target) && !floatingButton.contains(e.target) && !isPinned) {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
            popup = null;
        }
    });
});