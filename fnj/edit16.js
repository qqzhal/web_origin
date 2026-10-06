$(document).ready(function () {
    // 初始化编辑器模式
    initHexEditor();
    BulidEdit16TabHtml();
});

// 全局变量定义
var hexEditorMode = 'classic'; // 'classic' 或 'professional'
var hexEditorSettings = {
    fontSize: 10,
    rowsPerPage: 16,
    showAddress: true,
    showHex: true,
    autoSave: true,
    theme: 'light'
};

// 专业编辑器状态变量
var professionalEditor = {
    currentOffset: 0,
    selectionStart: -1,
    selectionEnd: -1,
    isSelecting: false,
    isEditing: false,
    editBuffer: '',
    cursorPosition: 0,
    virtualOffset: 0,
    pageSize: 512,
    modifiedOffsets: []  // 存储已修改的偏移量
};

function hex2int(hex) {
    var len = hex.length,
        a = new Array(len),
        code;
    for (var i = 0; i < len; i++) {
        code = hex.charCodeAt(i);
        if (48 <= code && code < 58) {
            code -= 48;
        } else {
            code = (code & 0xdf) - 65 + 10;
        }
        a[i] = code;
    }

    return a.reduce(function (acc, c) {
        acc = 16 * acc + c;
        return acc;
    }, 0);
}

function LoadHex16() {
    //@"\b(0[xX])?[A-Fa-f0-9]+\b";
    var ff = $("#offEditNo").val();
    /*	var offtd=ff;
        if(offtd.length>1)
            {
            offtd.substr(offtd.length-1,1);
            }*/
    ff = hex2int(ff);
    $("#HexPreView").empty();
    var budHexHtml = "";
    budHexHtml += "<table id='Edit16ViewTabs' style='border:1px solid #090;border-radius: 3px;'>";
    budHexHtml += "<tr>";
    budHexHtml += "<td><pre>Offset:</pre></td>";
    for (var i = 0; i <= 0x0F; i++) {
        //budHexHtml+="<td>"+addPreZero((i).toString(16).toUpperCase())+"</td>";
        budHexHtml += "<td><pre>0" + addPreZero((ff + i).toString(16).toUpperCase()).substring(1) + "</pre></td>";
    }
    budHexHtml += "</tr>";
    for (var i = 0; i <= 0x0F; i++) {
        budHexHtml += "<tr>";
        var defid = i + ff;
        var topoff = addPreZero2((defid + i * 0x0F).toString(16), 6);
        //budHexHtml+="0x"+topoff.toUpperCase()+"0:";
        budHexHtml += "<td><pre>" + "" + topoff.toUpperCase() + ":" + "</pre></td>";
        for (var w = 0; w <= 0x0F; w++) {
            var oftdtd = ff + (i * 0x10) + w;
            // 检查NesHex数组是否存在且索引有效
            var byteValue = (window.NesHex && oftdtd < window.NesHex.length) ? window.NesHex[oftdtd] : 0;
            var bhex = addPreZero(byteValue.toString(16).toUpperCase());
            budHexHtml += "<td onclick='GetRditAddr(this)' offset='" + oftdtd + "' ><pre>" + bhex + "</pre></td>";
            /*		if(w==0x0F)
                    {
                        budHexHtml+=bhex+"<br>";
                    }
                    else
                    {
                        budHexHtml+=bhex+" ";
                    }*/
        }
        budHexHtml += "</tr>";
    }

    budHexHtml += "</table>";
    $("#HexPreView ").html(budHexHtml);
    $("#HexPreView td").css({
        "font-size": defEditFontSize
    });
    $("#HexPreView table").css({
        "font-size": defEditFontSize
    });
    $("#HexPreView tr").css({
        "font-size": defEditFontSize
    });
    $("#HexPreView").css('font-size', defEditFontSize);
}

function NextHexData(nexttype) {
    var ff = $("#offEditNo").val();
    ff = hex2int(ff);
    if (nexttype == 0) {
        ff = ff - 0x100;
    } else {
        ff = ff + 0x100;
    }
    if (ff < 0) {
        $("#offEditNo").val(0);
        return;
    }
    $("#offEditNo").val(ff.toString(16).toUpperCase());
    LoadHex16();
}

function HexFontSize(fonttype) {
    //$("#HexPreView")
    var cssfontSize = $("#HexPreView").css('font-size'); // 
    //alert(cssfontSize);
    var unit = cssfontSize.replace("px", "");
    unit = parseInt(unit);
    if (unit <= 5 && fonttype == 1) {
        alert("太小啦....");
        return;
    }
    if (unit >= 28 && fonttype == 0) {
        alert("太大啦....");
        return;
    }
    if (fonttype == 0) {
        unit = unit + 1;
    } else {
        unit = unit - 1;
    }
    defEditFontSize = unit + 'px';
    $("#HexPreView td").css({
        "font-size": unit + 'px'
    });
    $("#HexPreView table").css({
        "font-size": unit + 'px'
    });
    $("#HexPreView tr").css({
        "font-size": unit + 'px'
    });
    $("#HexPreView div").css({
        "font-size": unit + 'px'
    });
    $("#HexPreView pre").css({
        "font-size": unit + 'px'
    });
    $("#HexPreView").css('font-size', unit + 'px');
}

var defEditFontSize = "12px";

function BulidEdit16TabHtml() {
    $("#Edit16Tab ").empty();
    var edit16html = "";
    // 添加模式切换开关
    edit16html += "<div style='margin-bottom: 10px; padding: 8px; background: #f0f0f0; border-radius: 5px; border: 1px solid #ccc;'>";
    edit16html += "<label style='font-weight: bold; margin-right: 10px;'>编辑器模式:</label>";
    edit16html += "<label style='margin-right: 15px;'><input type='radio' checked name='editorMode' value='classic'" + (hexEditorMode === 'classic' ? ' checked' : '') + " onchange='switchHexEditorMode(this.value)'> 经典模式</label>";
    edit16html += "<label><input type='radio' name='editorMode' value='professional'" + (hexEditorMode === 'professional' ? ' checked' : '') + " onchange='switchHexEditorMode(this.value)'> 专业模式 (HxD风格)</label>";
    edit16html += "</div>";
    edit16html += "<button onclick='LoadHex16()'>读取/刷新</button> ";
    edit16html += "<button onclick='NextHexData(0)'>↑(-0x100)</button> <button onclick='NextHexData(1)'>↓(+0x100)</button><br>";
    edit16html += "<span style='color:red;'>数据地址:</span><input type='text' style='width:60px;' id='offEditNo' value='0'>";
    edit16html += " <button onclick='HexFontSize(0)'>放大文本</button> <button onclick='HexFontSize(1)'>缩小文本</button>(可能无效)";
    edit16html += "<div>";
    edit16html += "<div id='HexPreView' style='font-size:12px;'></div>";
    edit16html += "<span>目标地址:</span><input type='text' style='width:60px;'  editindex=0  id='ShowEditIndex' > <button onclick='EditSeValue()'>查找</button><div id='EditSEdivSe'></div>";
    edit16html += "<span>数据:</span> <span id='EditAlertSpan' style='color:red;'></span><br><textarea  id='ShowEditValue' cols='25' rows='5'></textarea><br>";
    edit16html += "<button onclick='WriteEdit16()'>写入数据</button>";
    edit16html += "<div id='edit16war'><span>警告不要搜索连续相同的00或FF,会造成浏览器<span style='color:red;'>真真真</span>的卡死!</span><br>";
    edit16html += "<span>1.在红色 '</span><span style='color:red;'>数据地址</span><span>' 处输入地址(不带0x,不能超过文件大小上限-0x100).<br>2.点读取/刷新获得数据.<br>3.点击加载出来的对应数据会在下面显示地址跟值.<br>4.然后随便了.</span><br>";
    edit16html += "<span>关于直接写入指定地址的数据:<br>1.在 '目标地址' 处填上需要写入的地址<br>2.在 '数据' 里写上代码.<br>3.点击 '写入数据' 即可.</span><br>";
    edit16html += "<span>PS:批量的代码要空格隔开.<br>手机端字体缩小可能无效.</span></div>";
    edit16html += "</div>";
    $("#Edit16Tab ").html(edit16html);
    $("#offEditNo").bind("keydown", function (e) {　　 // 兼容FF和IE和Opera

        var theEvent = e || window.event;
        var code = theEvent.keyCode || theEvent.which || theEvent.charCode;
        if (code == 13) {　　 //回车执行查询
            LoadHex16();
        }
    });
    
    // 自动加载数据，无需手动刷新
    LoadHex16();
}

function EditSeValue() {
    $("#EditAlertSpan").css("color", "red");
    $("#EditAlertSpan").html("");
    if ($("#ShowEditValue").val().length <= 1) {
        $("#EditAlertSpan").html("请输入要查询的代码段!");
        return;
    }
    if ($("#ShowEditValue").val().length < 5) {
        $("#EditAlertSpan").html("请输入2个以上byte查找!");
        return;
    }
    var edvalue = $("#ShowEditValue").val().split(" ");
    for (var i = 0; i < edvalue.length; i++) {
        edvalue[i] = hex2int(edvalue[i]);
    }
    if (edvalue.length == 2) {
        if (edvalue[0] == edvalue[1]) {
            if (edvalue[0] == 0 || edvalue[0] == 0xff) {
                $("#EditAlertSpan").html("不要搜索连续的00/FF.浏览器会卡死.");
                return;
            }
        }
    }
    if (edvalue.length == 3) {
        if (edvalue[0] == edvalue[1] && edvalue[1] == edvalue[2]) {
            if (edvalue[0] == 0 || edvalue[0] == 0xff) {
                $("#EditAlertSpan").html("不要搜索连续的00/FF.浏览器会卡死.");
                return;
            }
        }
    }
    if (edvalue.length == 4) {
        if (edvalue[0] == edvalue[1] && edvalue[1] == edvalue[2] && edvalue[2] == edvalue[3]) {
            if (edvalue[0] == 0 || edvalue[0] == 0xff) {
                $("#EditAlertSpan").html("不要搜索连续的00/FF.浏览器会卡死.");
                return;
            }
        }
    }
    //alert(edvalue[0]+" "+edvalue[1]+" "+edvalue[2])
    var okbool = false;
    var unix = new Array();
    for (var i = 0; i < NesHex.length; i++) {
        for (var w = 0; w < edvalue.length; w++) {
            if (NesHex[i + w] != edvalue[w]) {
                okbool = false;
            }
        }
        if (okbool == true) {
            unix.push(i);
        }
        okbool = true;
    }
    $("#EditSEdivSe").empty();
    if (unix.length <= 0) {
        $("#EditAlertSpan").html("找不到对应的数据.");
        return;
    }
    var Editselecthtml = "";
    Editselecthtml += "<select id='EditselectId'>";
    for (var i = 0; i < unix.length; i++) {
        Editselecthtml += "<option value='" + unix[i] + "'>" + unix[i].toString(16) + "</option>";
    }
    Editselecthtml += "</select><button onclick='JumpEdit()'>跳转</button>"; //onclick='(this)'
    $("#EditSEdivSe").html(Editselecthtml);
    $("#EditAlertSpan").html("发现 " + unix.length + " 处相同数据.");
    $("#EditAlertSpan").css("color", "green");
}

function JumpEdit() {
    var vls = parseInt($("#EditselectId").val());
    $("#offEditNo").val(vls.toString(16).toUpperCase());
    LoadHex16();
}

function WriteEdit16() {
    if ($("#ShowEditValue").val().length <= 1) {
        alertMsg("#isfileload", "red", "请输入单个代码或代码段!");
        return;
    }
    if ($("#ShowEditIndex").val().length <= 0) {
        alertMsg("#isfileload", "red", "请输入目标地址!");
        return;
    }
    var edindex = hex2int($("#ShowEditIndex").val());
    if ($("#ShowEditValue").val().length == 2) {
        NesHex[edindex] = hex2int($("#ShowEditValue").val());
    } else {
        var edvalue = $("#ShowEditValue").val().split(" ");
        for (var i = 0; i < edvalue.length; i++) {
            NesHex[edindex + i] = hex2int(edvalue[i]);
        }
    }
    alertMsg("#isfileload", "green", "写入成功!");
}

function GetRditAddr(ojb) {
    var offindex = $(ojb).attr("offset");
    offindex = parseInt(offindex);
    var topoffsssss = addPreZero2(offindex.toString(16), 6);
    $("#ShowEditIndex").attr('ShowEditIndex', offindex);
    $("#ShowEditIndex").val(topoffsssss.toUpperCase()); //.toUpperCase()
    $("#ShowEditValue").val(addPreZero(NesHex[offindex].toString(16).toUpperCase()));
}

function strToHexCharCode(str) {
    if (str === "") return "";
    var hexCharCode = [];
    hexCharCode.push("0x");
    for (var i = 0; i < str.length; i++) {
        hexCharCode.push((str.charCodeAt(i)).toString(16));
    }
    return hexCharCode.join("");
}

function BandHex16Se() {
    $("#Edit16Se ").empty();
}

// 初始化编辑器
function initHexEditor() {
    // 从localStorage加载用户偏好设置
    var savedMode = localStorage.getItem('hexEditorMode');
    var savedSettings = localStorage.getItem('hexEditorSettings');
    
    if (savedMode) {
        hexEditorMode = savedMode;
    }
    
    if (savedSettings) {
        try {
            hexEditorSettings = JSON.parse(savedSettings);
        } catch (e) {
            console.log('加载设置失败，使用默认设置');
        }
    }
}

// 切换编辑器模式
function switchHexEditorMode(mode) {
    hexEditorMode = mode;
    localStorage.setItem('hexEditorMode', hexEditorMode);
    
    if (hexEditorMode === 'professional') {
        buildProfessionalHexEditor();
    } else {
        BulidEdit16TabHtml();
    }
}

// 切换编辑器模式（兼容旧函数）
function toggleHexEditorMode() {
    hexEditorMode = (hexEditorMode === 'classic') ? 'professional' : 'classic';
    localStorage.setItem('hexEditorMode', hexEditorMode);
    
    if (hexEditorMode === 'professional') {
        buildProfessionalHexEditor();
    } else {
        BulidEdit16TabHtml();
    }
}

// 构建专业级16进制编辑器
function buildProfessionalHexEditor() {
    $("#Edit16Tab").empty();
    // 添加专业编辑器样式
    addProfessionalHexEditorStyles();
    
    var html = `
        <div class="hex-editor-container">
            <div class="hex-editor-toolbar">
                <div class="toolbar-left">
                    <div style="background: #f8f8f8; padding: 4px 8px; border-radius: 3px; border: 1px solid #d0d0d0;">
                        <label style="color: #333333; font-size: 11px; margin-right: 8px;">模式:</label>
                        <label style="color: #333333; font-size: 10px; margin-right: 6px;">
                            <input type="radio" name="proEditorMode" value="classic" onchange="switchHexEditorMode(this.value)" style="margin-right: 2px;"> 经典
                        </label>
                        <label style="color: #333333; font-size: 10px;">
                            <input type="radio" name="proEditorMode" value="professional" onchange="switchHexEditorMode(this.value)" checked style="margin-right: 2px;"> 专业
                        </label>
                    </div>
                </div>
                <div class="toolbar-center">
                    <span class="address-label">地址:</span>
                    <input type="text" id="hexAddressInput" class="address-input" placeholder="(十六进制)">
                    <button onclick="jumpToProfessionalAddress()" class="jump-btn">跳转</button>
                    <button onclick="adjustFontSize(-1)" class="font-btn">A-</button>
                    <button onclick="adjustFontSize(1)" class="font-btn">A+</button>
            </div>
            
         
            </div>
                        <div class="hex-editor-statusbar"><button onclick="showSearchDialog()" class="search-btn">查找</button>
                <span id="statusOffset">偏移: 0x000000</span>
                <span id="statusSelection">选择: 0 字节</span>
                <span id="statusSize">大小: 0 字节</span>
            </div>
                
      
            <div class="hex-editor-main">
                <div class="hex-editor-body" id="hexEditorBody">
                    <!-- 动态生成的16进制数据将在这里显示 -->
                </div>
            </div>
            

        </div>
        
        <!-- 右键菜单 -->
        <div id="hexContextMenu" class="context-menu" style="display: none;">
            <div class="context-menu-item" onclick="copySelectedData()">📋 复制</div>
            <div class="context-menu-item" onclick="pasteData()">📋 粘贴</div>
        </div>
        
        <!-- 查找对话框 -->
        <div id="hexSearchDialog" class="dialog" style="display: none;">
            <div class="dialog-content">
                <h3>查找数据</h3>
                <div class="dialog-body">
                    <label>查找内容:</label>
                    <textarea id="searchInput" placeholder="输入十六进制数据 (如: 1A 2B 3C)"></textarea>
                    <div class="dialog-buttons">
                        <button onclick="performSearch()">查找</button>
                        <button onclick="closeSearchDialog()">取消</button>
                    </div>
                    <div id="searchResults"></div>
                </div>
            </div>
        </div>
        
        <!-- 写入对话框 -->
        <div id="hexWriteDialog" class="dialog" style="display: none;">
            <div class="dialog-content">
                <h3>写入数据</h3>
                <div class="dialog-body">
                    <label>目标地址:</label>
                    <input type="text" id="writeAddress" placeholder="十六进制地址">
                    <label>写入数据:</label>
                    <textarea id="writeData" placeholder="输入十六进制数据 (如: 1A 2B 3C)"></textarea>
                    <div class="dialog-buttons">
                        <button onclick="performWrite()">写入</button>
                        <button onclick="closeWriteDialog()">取消</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $("#Edit16Tab").html(html);
    
    // 添加CSS样式
    addProfessionalHexEditorStyles();
    
    // 绑定事件
    bindProfessionalHexEditorEvents();
    
    // 加载初始数据
    try {
        // 确保NesHex数据可用
        if (typeof NesHex === 'undefined' || NesHex.length === 0) {
            // 显示等待消息
            $('#hexEditorBody').html('<div style="padding: 20px; text-align: center; color: #666;">等待数据加载...</div>');
            
            // 延迟加载数据
            setTimeout(function() {
                loadProfessionalHexData();
            }, 1000);
        } else {
            loadProfessionalHexData();
        }
        
        // 添加简单的加载验证
        setTimeout(function() {
            var rowCount = $('#hexEditorBody').find('.hex-row').length;
            if (rowCount === 0) {
                $('#hexEditorBody').html('<div style="padding: 20px; text-align: center; color: #ff0000;">错误：无法加载十六进制数据<br>请检查NesHex数据是否可用</div>');
            }
        }, 2000);
    } catch (error) {
        console.error('Hex editor initialization error:', error);
        $('#hexEditorBody').html('<div style="padding: 20px; text-align: center; color: #ff0000;">错误：初始化失败<br>' + error.message + '</div>');
    }
    
    // 添加移动端支持
    addMobileTouchSupport();
    
    // 启用虚拟滚动（使用相对定位）
    if (typeof NesHex !== 'undefined' && NesHex.length > 1000) {
        implementVirtualScrolling();
    }
}



// 绑定专业编辑器事件
function bindProfessionalHexEditorEvents() {
    // 键盘事件
    $(document).on('keydown', function(e) {
        if (hexEditorMode !== 'professional') return;
        
        // 检查当前焦点是否在编辑器外部（修复键盘锁定问题）
        var activeElement = document.activeElement;
        var isOutsideEditor = 
            $(activeElement).is('input[type="text"], textarea, select') && 
            !$(activeElement).closest('.hex-editor-container').length;
        
        // 如果焦点在编辑器外部，允许地址栏正常输入
        if (isOutsideEditor) {
            // 只处理特定的全局快捷键（Ctrl+C, Ctrl+V, ESC），不影响地址栏输入
            if (e.ctrlKey && (e.key === 'c' || e.key === 'v') || e.key === 'Escape') {
                // 这些快捷键在编辑器外部也有效
            } else {
                return; // 其他按键在编辑器外部不处理，确保地址栏可以正常输入
            }
        }
        
        // 如果焦点在地址栏上，不处理16进制输入
        if ($(activeElement).is('#hexAddressInput')) {
            // 只处理ESC键取消选择
            if (e.key === 'Escape') {
                clearSelection();
            }
            return; // 其他按键在地址栏上不处理
        }
        
        // Ctrl+C 复制
        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            copySelectedData();
        }
        
        // Ctrl+V 粘贴
        if (e.ctrlKey && e.key === 'v') {
            e.preventDefault();
            pasteData();
        }
        
        // ESC 取消选择
        if (e.key === 'Escape') {
            clearSelection();
        }
        
        // 直接键盘输入支持（修复输入功能异常）
        if (!professionalEditor.isEditing && professionalEditor.selectionStart !== -1) {
            var key = e.key.toLowerCase();
            if (/^[0-9a-f]$/.test(key)) {
                e.preventDefault();
                // 直接编辑选中的字节
                var currentByte = $('.hex-byte[data-offset="' + professionalEditor.selectionStart + '"]');
                if (currentByte.length > 0) {
                    startEditHexByte(currentByte[0]);
                    // 设置初始输入
                    currentByte.text(key);
                }
            }
        }
    });
    
    // 鼠标拖动选择事件（修复代码多选功能失效）
    var isDragging = false;
    var dragStartOffset = -1;
    
    $(document).on('mousedown', '.hex-byte', function(e) {
        if (professionalEditor.isEditing) return;
        
        isDragging = true;
        dragStartOffset = parseInt($(this).data('offset'));
        
        // 设置初始选择
        professionalEditor.selectionStart = dragStartOffset;
        professionalEditor.selectionEnd = dragStartOffset;
        updateSelection();
        
        e.preventDefault();
    });
    
    $(document).on('mousemove', '.hex-byte', function(e) {
        if (!isDragging || professionalEditor.isEditing) return;
        
        var currentOffset = parseInt($(this).data('offset'));
        professionalEditor.selectionStart = Math.min(dragStartOffset, currentOffset);
        professionalEditor.selectionEnd = Math.max(dragStartOffset, currentOffset);
        updateSelection();
        
        e.preventDefault();
    });
    
    $(document).on('mouseup', function(e) {
        if (!isDragging) return;
        
        isDragging = false;
        dragStartOffset = -1;
        
        // 保存选择状态
        localStorage.setItem('hexEditorSelection', JSON.stringify({
            start: professionalEditor.selectionStart,
            end: professionalEditor.selectionEnd
        }));
        
        // 多选后自动显示右键菜单（新模式功能）
        if (hexEditorMode === 'professional' && 
            professionalEditor.selectionStart !== -1 && 
            professionalEditor.selectionEnd !== -1 &&
            Math.abs(professionalEditor.selectionEnd - professionalEditor.selectionStart) > 0) {
            
            // 获取最后一个被选中的元素位置
            var lastSelectedOffset = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
            var lastSelectedElement = $('.hex-byte[data-offset="' + lastSelectedOffset + '"]');
            
            if (lastSelectedElement.length > 0) {
                // 模拟右键点击事件
                var event = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    screenX: e.screenX,
                    screenY: e.screenY
                });
                
                // 延迟显示菜单，确保选择状态已更新
                setTimeout(function() {
                    showContextMenu(event, lastSelectedElement[0]);
                }, 50);
            }
        }
    });
}

// 绑定虚拟编辑器事件，确保在重新渲染后事件仍然有效
function bindVirtualEditorEvents() {
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.isVirtualMode) {
        // 重新绑定点击事件
        $('.hex-byte').on('click', function() {
            selectHexByte(this);
        });
        
        $('.hex-byte').on('contextmenu', function(e) {
            showContextMenu(e, this);
        });
        
        $('.hex-byte').on('dblclick', function() {
            startEditHexByte(this);
        });
    }
    
    // 点击外部关闭右键菜单
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.context-menu').length) {
            $('#hexContextMenu').hide();
        }
    });
    
    // 地址输入框回车事件
    $('#hexAddressInput').on('keypress', function(e) {
        if (e.which === 13) {
            jumpToProfessionalAddress();
        }
    });
}

// 加载专业编辑器数据
function loadProfessionalHexData() {
    try {
        // 检查是否启用了虚拟滚动模式
        if (professionalEditor.virtualMode && professionalEditor.virtualMode.isVirtualMode) {
            // 虚拟滚动模式下，数据由虚拟滚动函数处理
            // 只需要确保虚拟滚动正确渲染即可
            if (professionalEditor.virtualMode.updateVisibleRows) {
                professionalEditor.virtualMode.updateVisibleRows();
            }
            updateStatusBar();
            return;
        }
        
        // 传统模式下的渲染（数据量较小时）
        var offset = professionalEditor.currentOffset;
        var rows = professionalEditor.pageSize / 16;
        
        if (!NesHex || NesHex.length === 0) {
            $('#hexEditorBody').html('<div style="padding: 20px; text-align: center; color: #ff0000;">错误：NesHex数据不可用</div>');
            return;
        }
        
        var html = '';
    
    for (var row = 0; row < rows; row++) {
        var rowOffset = offset + (row * 16);
        
        html += '<div class="hex-row" data-offset="' + rowOffset + '">';
        html += '<div class="hex-offset">' + addPreZero2(rowOffset.toString(16), 6).toUpperCase() + '</div>';
        html += '<div class="hex-bytes">';
        
        for (var col = 0; col < 16; col++) {
            var byteOffset = rowOffset + col;
            var byteValue = NesHex[byteOffset] || 0;
            var byteHex = addPreZero(byteValue.toString(16).toUpperCase());
            
            html += '<div class="hex-byte" ';
            html += 'data-offset="' + byteOffset + '" ';
            html += 'data-value="' + byteValue + '" ';
            html += 'onclick="selectHexByte(this)" ';
            html += 'oncontextmenu="showContextMenu(event, this)" ';
            html += 'ondblclick="startEditHexByte(this)">';
            html += byteHex;
            html += '</div>';
        }
        
        html += '</div></div>';
    }
    
    // 检查是否在虚拟滚动模式下
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.isVirtualMode) {
        // 虚拟滚动模式下，调用updateVisibleRows来重新渲染
        if (professionalEditor.virtualMode.updateVisibleRows) {
            professionalEditor.virtualMode.updateVisibleRows();
        }
    } else {
        // 传统模式下，直接替换HTML
        $('#hexEditorBody').html(html);
    }
    
    updateStatusBar();
    
    // 调试信息 - 检查元素的定位属性
  
    
    } catch (error) {
        console.error('Error loading hex data:', error);
        $('#hexEditorBody').html('<div style="padding: 20px; text-align: center; color: #ff0000;">错误：加载十六进制数据失败<br>' + error.message + '</div>');
    }
    adjustFontSize(0);
}

// 选择16进制字节
function selectHexByte(element) {
    if (professionalEditor.isEditing) {
        return;
    }
    
    var offset = parseInt($(element).data('offset'));
    // 更新当前偏移量为点击位置，修复状态栏显示问题
    professionalEditor.currentOffset = offset;
    
    // 获取事件对象
    var event = window.event || arguments[0];
    
    if (event.ctrlKey || event.metaKey) {
        // Ctrl+点击：添加到选择
        if (professionalEditor.selectionStart === -1) {
            professionalEditor.selectionStart = offset;
            professionalEditor.selectionEnd = offset;
        } else {
            // 修复Ctrl+点击选择逻辑，允许多个独立选择
            var start = Math.min(professionalEditor.selectionStart, offset);
            var end = Math.max(professionalEditor.selectionEnd, offset);
            professionalEditor.selectionStart = start;
            professionalEditor.selectionEnd = end;
        }
    } else if (event.shiftKey) {
        // Shift+点击：范围选择
        if (professionalEditor.selectionStart !== -1) {
            professionalEditor.selectionEnd = offset;
        } else {
            // 如果还没有起始选择，设置起始位置
            professionalEditor.selectionStart = offset;
            professionalEditor.selectionEnd = offset;
        }
    } else {
        // 普通点击：单选
        professionalEditor.selectionStart = offset;
        professionalEditor.selectionEnd = offset;
    }
    
    updateSelection();
    
    // 保存选择状态到本地存储
    localStorage.setItem('hexEditorSelection', JSON.stringify({
        start: professionalEditor.selectionStart,
        end: professionalEditor.selectionEnd
    }));
}

// 更新选择状态
function updateSelection() {
    $('.hex-byte').removeClass('selected');
    
    if (professionalEditor.selectionStart !== -1 && professionalEditor.selectionEnd !== -1) {
        var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
        var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
        
        // 优化选择逻辑，修复多选功能异常
        $('.hex-byte').each(function() {
            var byteOffset = parseInt($(this).data('offset'));
            if (byteOffset >= start && byteOffset <= end) {
                $(this).addClass('selected');
            }
        });
        
        // 确保在虚拟模式下也能正确复制粘贴多个区域
        professionalEditor.lastSelectionStart = start;
        professionalEditor.lastSelectionEnd = end;
        
        // 添加选择范围滚动到可视区域
        if (start >= 0) {
            var firstSelected = $('.hex-byte[data-offset="' + start + '"]');
            if (firstSelected.length > 0) {
                firstSelected[0].scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }
        }
    }
    
    updateStatusBar();
}

// 清除选择
function clearSelection() {
    professionalEditor.selectionStart = -1;
    professionalEditor.selectionEnd = -1;
    $('.hex-byte').removeClass('selected');
    updateStatusBar();
}

// 确保元素在可视区域内（虚拟滚动模式下使用）
function ensureElementVisible(offset) {
    if (!professionalEditor.virtualMode || !professionalEditor.virtualMode.isVirtualMode) {
        return true; // 非虚拟滚动模式下总是返回true
    }
    
    var virtualMode = professionalEditor.virtualMode;
    var $container = $('.hex-editor-main');
    var itemHeight = 16;
    
    // 检查偏移量是否在当前的虚拟滚动范围内
    var rowIndex = Math.floor(offset / 16);
    
    if (rowIndex < virtualMode.startIndex || rowIndex >= virtualMode.endIndex) {
        // 需要滚动到对应的行
        var scrollTop = rowIndex * itemHeight - 100; // 提前一点显示
        scrollTop = Math.max(0, scrollTop);
        $container.scrollTop(scrollTop);
        
        // 等待虚拟滚动重新渲染完成
        setTimeout(function() {
            // 重新尝试编辑
            var element = $('.hex-byte[data-offset="' + offset + '"]')[0];
            if (element) {
                startEditHexByte(element);
            }
        }, 100); // 增加等待时间确保渲染完成
        
        return false; // 表示需要等待重新渲染
    }
    
    return true; // 元素在可视区域内
}

// 开始编辑16进制字节
function startEditHexByte(element) {
    if (professionalEditor.isEditing) {
        return;
    }
    
    // 检查元素是否有效
    if (!element || !$(element).length) {
        console.warn('startEditHexByte: 无效的元素');
        return;
    }
    
    var $element = $(element);
    var offset = parseInt($element.data('offset'));
    
    // 在虚拟滚动模式下，重新验证元素是否仍然有效
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.isVirtualMode) {
        // 重新查询元素，确保它仍然存在于DOM中
        var currentElement = $('.hex-byte[data-offset="' + offset + '"]')[0];
        if (!currentElement) {
            // 确保元素在可视区域内，这会触发重新渲染
            ensureElementVisible(offset);
            return;
        }
        
        // 如果元素已变更，使用当前元素
        if (currentElement !== element) {
            element = currentElement;
            $element = $(element);
        }
    }
    
    professionalEditor.isEditing = true;
    var originalValue = $element.data('value');
    

    
    if (!document.contains(element)) {
        console.warn('startEditHexByte: 元素不在文档中，可能是虚拟滚动导致的');
        professionalEditor.isEditing = false;
        
        // 尝试重新定位元素
        var offset = parseInt($element.data('offset'));
        var retryElement = $('.hex-byte[data-offset="' + offset + '"]')[0];

        
        if (retryElement && document.contains(retryElement)) {
            startEditHexByte(retryElement);
        } else {
            
            // 如果虚拟滚动正在渲染，等待完成后再尝试
            var renderCompleteHandler = function() {
                var finalElement = $('.hex-byte[data-offset="' + offset + '"]')[0];
                if (finalElement) {
                    startEditHexByte(finalElement);
                }
            };
            
            // 监听渲染完成事件
            $(document).one('virtualRenderComplete', renderCompleteHandler);
            
            // 设置超时，防止无限等待
            setTimeout(function() {
                $(document).off('virtualRenderComplete', renderCompleteHandler);
                if (professionalEditor.virtualMode && professionalEditor.virtualMode.isVirtualMode) {
                    professionalEditor.virtualMode.updateVisibleRows();
                    // 重新尝试编辑
                    setTimeout(function() {
                        var finalElement = $('.hex-byte[data-offset="' + offset + '"]')[0];
                        if (finalElement) {
                            startEditHexByte(finalElement);
                        }
                    }, 50);
                }
            }, 200);
        }
        return;
    }
    
    // 获取当前偏移量
    var currentOffset = parseInt($element.data('offset'));
    
    // 确保元素在可视区域内（虚拟滚动模式下）
    if (!ensureElementVisible(currentOffset)) {
        return; // 等待滚动完成后的重新调用
    }
    
    // 修复编辑状态问题
    $('.hex-byte').removeClass('editing');
    $('.hex-byte').attr('contenteditable', 'false');
    
    $element.addClass('editing');
    $element.attr('contenteditable', 'true');
    $element.focus();
    
    // 选中内容（添加错误处理）
    try {
        // 检查元素是否在文档中且可见
        if (element && document.contains(element) && element.offsetParent !== null) {
            var range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false); // 关键修复：折叠到末尾，避免光标在开头
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            console.warn('元素不在文档中或不可见，直接聚焦');
            $element.focus();
        }
    } catch (e) {
        // 如果元素不在文档中，直接聚焦元素
        console.warn('无法选中元素内容，可能元素不在可视区域内:', e);
        $element.focus();
    }
    
    // 绑定输入事件，支持连续输入模式（新功能）
    $element.on('input', function() {
        var currentText = $(this).text().trim();
        
        // 只保留16进制字符，但保持原始大小写
        var cleanText = currentText.replace(/[^0-9A-Fa-f]/g, '');
        
        // 获取当前偏移量
        var currentOffset = parseInt($(this).data('offset'));
        
        // 新功能：支持连续输入多个字节
        if (cleanText.length > 2) {
            // 处理连续输入，如 "1F223355" -> 分配到多个地址
            processContinuousInput(currentOffset, cleanText, originalValue);
            return; // 不再处理当前输入
        }
        
        // 如果输入1-2个字符，正常处理当前字节
        if (cleanText.length <= 2) {
            // 更新显示内容，保持原始大小写
            $(this).text(cleanText);
            
            // 关键修复：将光标移动到文本末尾，避免字符顺序错误
            var selection = window.getSelection();
            var range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false); // 折叠到末尾
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 当输入2个字符时，自动切换到下一个字节
            if (cleanText.length >= 2) {
                // 完成当前编辑
                finishEditHexByte(this, originalValue);
                
                // 找到下一个字节
                var nextOffset = currentOffset + 1;
                var nextByte = $('.hex-byte[data-offset="' + nextOffset + '"]');
                
                // 如果存在下一个字节，开始编辑
                if (nextByte.length > 0) {
                    // 更新选择状态
                    professionalEditor.selectionStart = nextOffset;
                    professionalEditor.selectionEnd = nextOffset;
                    updateSelection();
                    // 开始编辑下一个字节
                    setTimeout(function() {
                        startEditHexByte(nextByte[0]);
                    }, 10);
                }
            }
        }
    });
    
    // 绑定编辑完成事件
    $element.on('blur keypress', function(e) {
        if (e.type === 'blur' || e.which === 13) {
            finishEditHexByte(this, originalValue);
        }
    });
    
    // 绑定键盘事件处理 - 类似HxD的输入逻辑
    $element.on('keydown', function(e) {
        var currentOffset = parseInt($(this).data('offset'));
        var currentValue = $(this).text().trim();
        
        // 处理特殊按键
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            // 完成当前编辑并移动到左侧字节
            finishEditHexByte(this, originalValue);
            var prevOffset = currentOffset - 1;
            var prevByte = $('.hex-byte[data-offset="' + prevOffset + '"]');
            if (prevByte.length > 0) {
                professionalEditor.selectionStart = prevOffset;
                professionalEditor.selectionEnd = prevOffset;
                updateSelection();
                // 不自动进入编辑，等待用户输入
            }
        }
        else if (e.key === 'ArrowRight') {
            e.preventDefault();
            // 完成当前编辑并移动到右侧字节
            finishEditHexByte(this, originalValue);
            var nextOffset = currentOffset + 1;
            var nextByte = $('.hex-byte[data-offset="' + nextOffset + '"]');
            if (nextByte.length > 0) {
                professionalEditor.selectionStart = nextOffset;
                professionalEditor.selectionEnd = nextOffset;
                updateSelection();
                // 不自动进入编辑，等待用户输入
            }
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            // 完成当前编辑并移动到下一行
            finishEditHexByte(this, originalValue);
            var nextRowOffset = currentOffset + 16;
            var nextRowByte = $('.hex-byte[data-offset="' + nextRowOffset + '"]');
            if (nextRowByte.length > 0) {
                professionalEditor.selectionStart = nextRowOffset;
                professionalEditor.selectionEnd = nextRowOffset;
                updateSelection();
                // 不自动进入编辑，等待用户输入
            }
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            // 取消编辑，恢复原值
            $(this).text(addPreZero(originalValue.toString(16).toUpperCase()));
            finishEditHexByte(this, originalValue);
        }
        else if (e.key.match(/^[0-9A-Fa-f]$/)) {
            // 处理十六进制字符输入
            e.preventDefault();
            
            if (currentValue.length === 0) {
                // 第一个字符
                $(this).text(e.key.toUpperCase());
            } else if (currentValue.length === 1) {
                // 第二个字符，完成当前字节
                var newValue = currentValue + e.key.toUpperCase();
                $(this).text(newValue);
                
                // 延迟移动到下一个字节
                setTimeout(function() {
                    finishEditHexByte(element, originalValue);
                    var nextOffset = currentOffset + 1;
                    var nextByte = $('.hex-byte[data-offset="' + nextOffset + '"]');
                    if (nextByte.length > 0) {
                        professionalEditor.selectionStart = nextOffset;
                        professionalEditor.selectionEnd = nextOffset;
                        updateSelection();
                        // 不自动进入编辑，等待用户输入
                    }
                }, 50);
            }
        }
        else if (e.key === 'Backspace') {
            e.preventDefault();
            if (currentValue.length === 2) {
                // 删除第二个字符
                $(this).text(currentValue.charAt(0));
            } else if (currentValue.length === 1) {
                // 删除第一个字符，移动到上一个字节
                $(this).text('');
                setTimeout(function() {
                    finishEditHexByte(element, originalValue);
                    var prevOffset = currentOffset - 1;
                    var prevByte = $('.hex-byte[data-offset="' + prevOffset + '"]');
                    if (prevByte.length > 0) {
                        professionalEditor.selectionStart = prevOffset;
                        professionalEditor.selectionEnd = prevOffset;
                        updateSelection();
                        startEditHexByte(prevByte[0]);
                    }
                }, 50);
            }
        }
    });
}

// 完成编辑16进制字节
function finishEditHexByte(element, originalValue) {
    var $element = $(element);
    var newValue = $element.text().trim();
    
    // 移除所有绑定的事件
    $element.off('input keydown blur keypress');
    
    // 验证输入
    if (/^[0-9A-Fa-f]{2}$/.test(newValue)) {
        var newByte = parseInt(newValue, 16);
        var offset = parseInt($element.data('offset'));
        
        if (NesHex[offset] !== newByte) {
            NesHex[offset] = newByte;
            $element.data('value', newByte);
            $element.addClass('modified');
            
            // 触发数据变更事件
            onHexDataChanged(offset, originalValue, newByte);
        }
    } else if (/^[0-9A-Fa-f]{1}$/.test(newValue)) {
        // 如果只有一个字符，添加前导零
        newValue = '0' + newValue.toUpperCase();
        var newByte = parseInt(newValue, 16);
        var offset = parseInt($element.data('offset'));
        
        if (NesHex[offset] !== newByte) {
            NesHex[offset] = newByte;
            $element.data('value', newByte);
            $element.addClass('modified');
            
            // 触发数据变更事件
            onHexDataChanged(offset, originalValue, newByte);
        }
        $element.text(newValue);
    } else {
        // 恢复原始值
        $element.text(addPreZero(originalValue.toString(16).toUpperCase()));
    }
    
    professionalEditor.isEditing = false;
    $element.removeClass('editing');
    $element.attr('contenteditable', 'false');
    
    // 执行虚拟滚动渲染，确保修改后的数据正确显示
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.renderVirtualRows) {
        professionalEditor.virtualMode.renderVirtualRows();
    }
}

// 新功能：处理连续输入多个字节
function processContinuousInput(startOffset, hexString, originalValue) {
    // 将字符串按每2个字符分割成字节数组
    var bytes = [];
    for (var i = 0; i < hexString.length; i += 2) {
        if (i + 1 < hexString.length) {
            bytes.push(hexString.substring(i, i + 2));
        } else {
            // 处理奇数个字符的情况（最后一个字符）
            bytes.push(hexString.substring(i, i + 1));
        }
    }
    
    // 依次处理每个字节
    for (var i = 0; i < bytes.length; i++) {
        var currentOffset = startOffset + i;
        var byteElement = $('.hex-byte[data-offset="' + currentOffset + '"]');
        
        if (byteElement.length > 0) {
            var byteValue = bytes[i];
            
            // 如果是单个字符，添加前导零
            if (byteValue.length === 1) {
                byteValue = '0' + byteValue;
            }
            
            // 更新显示
            byteElement.text(byteValue);
            
            // 更新数据
                    var byteIndex = currentOffset;
                    if (byteIndex >= 0 && typeof NesHex !== 'undefined' && byteIndex < NesHex.length) {
                        // 将16进制字符串转换为字节值
                        var numericValue = parseInt(byteValue, 16);
                        if (!isNaN(numericValue) && numericValue >= 0 && numericValue <= 255) {
                            NesHex[byteIndex] = numericValue;
                            
                            // 标记为已修改
                            if (!professionalEditor.modifiedOffsets.includes(byteIndex)) {
                                professionalEditor.modifiedOffsets.push(byteIndex);
                            }
                        }
                    }
            
            // 添加修改效果
            byteElement.addClass('modified');
            setTimeout((function(element) {
                return function() {
                    element.removeClass('modified');
                };
            })(byteElement), 300);
        }
    }
    
    // 更新选择状态到最后一个字节
    var lastOffset = startOffset + bytes.length - 1;
    
    // 重新加载数据以更新显示（使用全局函数）
    loadProfessionalHexData();
    
    // 执行虚拟滚动渲染，确保修改后的数据正确显示
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.renderVirtualRows) {
        professionalEditor.virtualMode.renderVirtualRows();
    }
    
    // 无论输入长度是奇数还是偶数，都只更新选择状态，不自动进入编辑模式
    // 让用户主动输入时才进入编辑状态
    $(document).one('virtualRenderComplete', function() {
        setTimeout(function() {
            var lastByte = $('.hex-byte[data-offset="' + lastOffset + '"]');
            if (lastByte.length > 0) {
                professionalEditor.selectionStart = lastOffset;
                professionalEditor.selectionEnd = lastOffset;
                updateSelection();
                // 不自动进入编辑状态，等待用户主动输入
            }
        }, 50);
    });
}

// 显示右键菜单
function showContextMenu(event, element) {
    event.preventDefault();
    

    
    var $menu = $('#hexContextMenu');
    var offsetX = event.pageX;
    var offsetY = event.pageY;
    
    // 修复：获取正确的鼠标位置，考虑滚动偏移
    var scrollTop = $(window).scrollTop();
    var scrollLeft = $(window).scrollLeft();
    var containerOffset = $('.hex-editor-main').offset();
    
    // 如果有选择区域，智能定位菜单到选择区域附近
    if (professionalEditor.selectionStart !== -1 && professionalEditor.selectionEnd !== -1) {
        var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
        var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
        
        // 获取选择区域的中心位置
        var centerOffset = Math.floor((start + end) / 2);
        var centerElement = $('.hex-byte[data-offset="' + centerOffset + '"]');
        
        if (centerElement.length > 0) {
            var elementOffset = centerElement.offset();
            offsetX = elementOffset.left + centerElement.outerWidth() + 10;
            offsetY = elementOffset.top + centerElement.outerHeight() / 2;
        } else {
            // 如果中心元素不可见，使用最后一个选中元素
            var lastOffset = end;
            var lastElement = $('.hex-byte[data-offset="' + lastOffset + '"]');
            
            if (lastElement.length > 0) {
                var elementOffset = lastElement.offset();
                offsetX = elementOffset.left + lastElement.outerWidth() + 10;
                offsetY = elementOffset.top + lastElement.outerHeight() / 2;
            }
        }
    } else {
        // 修复：如果没有选择区域，使用鼠标右键位置，但确保在可视区域内
        if (containerOffset) {
            offsetX = Math.max(containerOffset.left, Math.min(offsetX, containerOffset.left + $('.hex-editor-main').width() - 50));
            offsetY = Math.max(containerOffset.top, offsetY);
        }
    }
    
    // 确保菜单不超出屏幕边界
    var menuWidth = $menu.outerWidth() || 120; // 默认值
    var menuHeight = $menu.outerHeight() || 150; // 默认值
    var windowWidth = $(window).width();
    var windowHeight = $(window).height();
    
    if (offsetX + menuWidth > windowWidth) {
        offsetX = windowWidth - menuWidth - 10;
    }
    
    if (offsetY + menuHeight > windowHeight) {
        offsetY = windowHeight - menuHeight - 10;
    }
    
    // 确保菜单不会定位到负坐标
    offsetX = Math.max(10, offsetX);
    offsetY = Math.max(10, offsetY);
    
    // 根据选择状态更新菜单项可用性
    var hasSelection = professionalEditor.selectionStart !== -1 && professionalEditor.selectionEnd !== -1;
    var selectionSize = hasSelection ? Math.abs(professionalEditor.selectionEnd - professionalEditor.selectionStart) + 1 : 0;
    
    // 更新菜单项状态
    $menu.find('.context-menu-item').each(function() {
        var $item = $(this);
        var action = $item.attr('onclick');
        
        if (action && action.includes('copySelectedData')) {
            // 复制功能需要选择区域
            if (hasSelection) {
                $item.removeClass('disabled');
                $item.css('opacity', '1');
                $item.css('pointer-events', 'auto');
            } else {
                $item.addClass('disabled');
                $item.css('opacity', '0.5');
                $item.css('pointer-events', 'none');
            }
        } else if (action && action.includes('pasteData')) {
            // 粘贴功能需要选择起始位置
            if (professionalEditor.selectionStart !== -1) {
                $item.removeClass('disabled');
                $item.css('opacity', '1');
                $item.css('pointer-events', 'auto');
            } else {
                $item.addClass('disabled');
                $item.css('opacity', '0.5');
                $item.css('pointer-events', 'none');
            }
        }
    });
    
    // 修复：确保菜单有正确的定位上下文和样式
    $menu.css({
        position: 'fixed', // 使用fixed定位避免滚动问题
        left: offsetX,
        top: offsetY,
        display: 'block',
        'z-index': 10000, // 确保在最上层
        background: '#1e1e1e', // 强制背景色
        color: '#ffffff', // 强制文字颜色
        opacity: 1, // 确保不透明
        visibility: 'visible', // 确保可见
        border: '1px solid #007acc', // 强制边框
        'border-radius': '6px', // 强制圆角
        'box-shadow': '0 4px 12px rgba(0,0,0,0.5)' // 强制阴影
    });
    
    // 确保菜单项也有正确的样式
    $menu.find('.context-menu-item').css({
        color: '#ffffff',
        background: 'transparent',
        'font-size': '12px',
        'font-weight': '500',
        'line-height': '1.4'
    });
    
    // 验证并修复可能的样式问题
    setTimeout(function() {
        var computedBackground = $menu.css('background-color');
        var computedOpacity = $menu.css('opacity');
        

        
        // 如果背景仍然是透明或opacity为0，强制修复
        if (computedBackground === 'transparent' || computedBackground === 'rgba(0, 0, 0, 0)' || computedOpacity === '0') {
            $menu.css({
                'background-color': '#1e1e1e !important',
                'opacity': '1 !important',
                'visibility': 'visible !important',
                'display': 'block !important'
            });
        }
    }, 50);
}

// 复制选择的数据
function copySelectedData() {
    if (professionalEditor.selectionStart === -1 || professionalEditor.selectionEnd === -1) {
        return;
    }
    
    // 隐藏右键菜单
    document.getElementById('hexContextMenu').style.display = 'none';
    
    var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    
    var data = [];
    for (var i = start; i <= end; i++) {
        data.push(addPreZero(NesHex[i].toString(16).toUpperCase()));
    }
    
    var clipboardData = data.join(' ');
    
    // 使用现代的Clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(clipboardData).then(function() {
            showNotification('已复制 ' + data.length + ' 字节到剪贴板');
        }).catch(function(err) {
            console.error('复制失败:', err);
            fallbackCopyToClipboard(clipboardData);
        });
    } else {
        fallbackCopyToClipboard(clipboardData);
    }
}

// 备用复制方法
function fallbackCopyToClipboard(text) {
    var textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showNotification('已复制到剪贴板');
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败，请手动复制', 'error');
    }
    
    document.body.removeChild(textArea);
}

// 粘贴数据
function pasteData() {
    if (professionalEditor.selectionStart === -1) {
        showNotification('请先选择要粘贴的位置', 'warning');
        return;
    }
    
    // 隐藏右键菜单
    document.getElementById('hexContextMenu').style.display = 'none';
    
    if (navigator.clipboard) {
        navigator.clipboard.readText().then(function(text) {
            parseAndPasteHexData(text);
        }).catch(function(err) {
            console.error('粘贴失败:', err);
            showNotification('无法访问剪贴板', 'error');
        });
    } else {
        showNotification('您的浏览器不支持剪贴板API', 'warning');
    }
}

// 解析并粘贴16进制数据
function parseAndPasteHexData(text) {
    // 支持多种格式：空格分隔、无分隔符、混合格式
    var bytes = [];
    
    // 首先尝试按空格分隔解析（支持格式如 "1f 22 f0"）
    var spaceParts = text.trim().split(/\s+/);
    var allValid = true;
    
    for (var i = 0; i < spaceParts.length; i++) {
        var part = spaceParts[i].replace(/^0x/i, '');
        if (/^[0-9A-Fa-f]{1,2}$/.test(part)) {
            bytes.push(parseInt(part, 16));
        } else {
            allValid = false;
            break;
        }
    }
    
    // 如果空格分隔解析失败，尝试无分隔符解析
    if (!allValid || bytes.length === 0) {
        bytes = [];
        // 移除所有非16进制字符，然后每两个字符分组
        var cleanText = text.replace(/[^0-9A-Fa-f]/g, '');
        
        for (var i = 0; i < cleanText.length; i += 2) {
            if (i + 2 <= cleanText.length) {
                var byteStr = cleanText.substr(i, 2);
                bytes.push(parseInt(byteStr, 16));
            } else if (i + 1 === cleanText.length) {
                // 处理奇数个字符的情况
                var byteStr = cleanText.substr(i, 1);
                bytes.push(parseInt(byteStr, 16));
            }
        }
    }
    
    if (bytes.length === 0) {
        showNotification('剪贴板中没有有效的16进制数据', 'warning');
        return;
    }
    
    // 从选择位置开始写入数据
    var startOffset = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    
    for (var i = 0; i < bytes.length && (startOffset + i) < NesHex.length; i++) {
        NesHex[startOffset + i] = bytes[i];
        $('.hex-byte[data-offset="' + (startOffset + i) + '"]').addClass('modified');
    }
    
    loadProfessionalHexData();
    
    // 执行虚拟滚动渲染，确保修改后的数据正确显示
    if (professionalEditor.virtualMode && professionalEditor.virtualMode.renderVirtualRows) {
        professionalEditor.virtualMode.renderVirtualRows();
    }
    
    showNotification('已粘贴 ' + bytes.length + ' 字节');
}

// 显示通知
function showNotification(message, type = 'info') {
    var $notification = $('<div class="hex-notification"></div>');
    $notification.text(message);
    $notification.addClass('hex-notification-' + type);
    
    // 添加通知样式
    if (!$('#hexNotificationStyles').length) {
        var styles = `
            <style id="hexNotificationStyles">
                .hex-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 16px;
                    background: #107c10;
                    color: white;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 3000;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                }
                
                .hex-notification-error {
                    background: #e81123;
                }
                
                .hex-notification-warning {
                    background: #ff8c00;
                }
                
                .hex-notification.show {
                    opacity: 1;
                    transform: translateX(0);
                }
            </style>
        `;
        $('head').append(styles);
    }
    
    $('body').append($notification);
    
    setTimeout(function() {
        $notification.addClass('show');
    }, 100);
    
    setTimeout(function() {
        $notification.removeClass('show');
        setTimeout(function() {
            $notification.remove();
        }, 300);
    }, 2000);
}

// 数据变更回调
function onHexDataChanged(offset, oldValue, newValue) {
    // 这里可以添加自动保存逻辑
}

// 更新状态栏
function updateStatusBar() {
    var totalSize = NesHex.length;
    var currentOffset = professionalEditor.currentOffset;
    
    var selectionSize = 0;
    if (professionalEditor.selectionStart !== -1 && professionalEditor.selectionEnd !== -1) {
        selectionSize = Math.abs(professionalEditor.selectionEnd - professionalEditor.selectionStart) + 1;
    }
    
    // 修复状态栏显示，显示当前点击位置的偏移量
    $('#statusOffset').text('偏移: 0x' + addPreZero2(currentOffset.toString(16), 6).toUpperCase());
    $('#statusSelection').text('选择: ' + selectionSize + ' 字节');
    $('#statusSize').text('大小: ' + totalSize + ' 字节');
}

// 导航数据
function navigateProfessionalData(direction) {
    var newOffset = professionalEditor.currentOffset + (direction * professionalEditor.pageSize);
    
    if (newOffset < 0) {
        newOffset = 0;
    }
    
    if (newOffset >= NesHex.length) {
        newOffset = NesHex.length - professionalEditor.pageSize;
    }
    
    professionalEditor.currentOffset = newOffset;
    loadProfessionalHexData();
}

// 跳转到指定地址
function jumpToProfessionalAddress() {
    var addressStr = $('#hexAddressInput').val().trim();
    if (!addressStr) {
        return;
    }
    
    // 移除0x前缀（如果有）
    addressStr = addressStr.replace(/^0x/i, '');
    
    if (!/^[0-9A-Fa-f]+$/.test(addressStr)) {
        showNotification('请输入有效的十六进制地址', 'error');
        return;
    }
    
    var address = parseInt(addressStr, 16);
    
    if (address < 0 || address >= NesHex.length) {
        showNotification('地址超出范围', 'error');
        return;
    }
    
    professionalEditor.currentOffset = Math.floor(address / 16) * 16;
    loadProfessionalHexData();
    
    // 高亮显示目标字节
    setTimeout(function() {
        $('.hex-byte[data-offset="' + address + '"]').addClass('selected');
    }, 100);
}

// 调整字体大小
function adjustFontSize(delta) {
    var newSize = hexEditorSettings.fontSize + delta;
    
    if (newSize < 8 || newSize > 24) {
        return;
    }
    
    hexEditorSettings.fontSize = newSize;
    localStorage.setItem('hexEditorSettings', JSON.stringify(hexEditorSettings));
    
    $('.hex-editor-body').css('font-size', newSize + 'px');
    $('.hex-byte').css({
        width: (newSize + 8) + 'px',
        height: (newSize + 4) + 'px'
    });
}

// 显示查找对话框
function showSearchDialog() {
    $('#hexSearchDialog').show();
    $('#searchInput').focus();
}

// 关闭查找对话框
function closeSearchDialog() {
    $('#hexSearchDialog').hide();
    $('#searchInput').val('');
    $('#searchResults').empty();
}

// 执行查找
function performSearch() {
    var searchPattern = $('#searchInput').val().trim();
    if (!searchPattern) {
        return;
    }
    
    // 解析搜索模式
    var bytes = [];
    var parts = searchPattern.split(/\s+/);
    
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].replace(/^0x/i, '');
        if (/^[0-9A-Fa-f]{1,2}$/.test(part)) {
            bytes.push(parseInt(part, 16));
        }
    }
    
    if (bytes.length === 0) {
        showNotification('请输入有效的十六进制数据', 'error');
        return;
    }
    
    // 执行搜索
    var results = [];
    
    for (var i = 0; i <= NesHex.length - bytes.length; i++) {
        var found = true;
        for (var j = 0; j < bytes.length; j++) {
            if (NesHex[i + j] !== bytes[j]) {
                found = false;
                break;
            }
        }
        
        if (found) {
            results.push(i);
        }
    }
    
    // 显示结果
    var resultsHtml = '<div style="margin-top: 12px; padding: 8px; background: #1e1e1e; border-radius: 2px;">';
    
    if (results.length === 0) {
        resultsHtml += '<div style="color: #f48771;">未找到匹配的数据</div>';
    } else {
        resultsHtml += '<div style="color: #4ec9b0; margin-bottom: 8px;">找到 ' + results.length + ' 个匹配项:</div>';
        
        for (var k = 0; k < Math.min(10, results.length); k++) {
            resultsHtml += '<div style="cursor: pointer; padding: 2px 4px; margin: 1px 0;" ';
            resultsHtml += 'onclick="jumpToSearchResult(' + results[k] + ')" ';
            resultsHtml += 'onmouseover="this.style.background=\'#2a2d2e\'" ';
            resultsHtml += 'onmouseout="this.style.background=\'transparent\'">';
            resultsHtml += '0x' + addPreZero2(results[k].toString(16), 6).toUpperCase();
            resultsHtml += '</div>';
        }
        
        if (results.length > 10) {
            resultsHtml += '<div style="color: #858585; font-size: 10px;">... 还有 ' + (results.length - 10) + ' 个结果</div>';
        }
    }
    
    resultsHtml += '</div>';
    $('#searchResults').html(resultsHtml);
}

// 跳转到搜索结果
function jumpToSearchResult(offset) {
    closeSearchDialog();
    professionalEditor.currentOffset = Math.floor(offset / 16) * 16;
    loadProfessionalHexData();
    
    // 高亮显示找到的字节
    setTimeout(function() {
        for (var i = 0; i < 5; i++) { // 简单的高亮效果
            $('.hex-byte[data-offset="' + offset + '"]').fadeOut(100).fadeIn(100);
        }
    }, 100);
}

// 显示写入对话框
function showWriteDialog() {
    $('#hexWriteDialog').show();
    
    // 如果有选择，自动填入地址
    if (professionalEditor.selectionStart !== -1) {
        var address = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
        $('#writeAddress').val(addPreZero2(address.toString(16), 6).toUpperCase());
    }
    
    $('#writeData').focus();
}

// 关闭写入对话框
function closeWriteDialog() {
    $('#hexWriteDialog').hide();
    $('#writeAddress').val('');
    $('#writeData').val('');
}

// 执行写入
function performWrite() {
    var addressStr = $('#writeAddress').val().trim();
    var dataStr = $('#writeData').val().trim();
    
    if (!addressStr || !dataStr) {
        showNotification('请填写地址和数据', 'error');
        return;
    }
    
    // 解析地址
    addressStr = addressStr.replace(/^0x/i, '');
    if (!/^[0-9A-Fa-f]+$/.test(addressStr)) {
        showNotification('请输入有效的十六进制地址', 'error');
        return;
    }
    
    var address = parseInt(addressStr, 16);
    if (address < 0 || address >= NesHex.length) {
        showNotification('地址超出范围', 'error');
        return;
    }
    
    // 解析数据
    var bytes = [];
    var parts = dataStr.split(/\s+/);
    
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].replace(/^0x/i, '');
        if (/^[0-9A-Fa-f]{1,2}$/.test(part)) {
            bytes.push(parseInt(part, 16));
        }
    }
    
    if (bytes.length === 0) {
        showNotification('请输入有效的十六进制数据', 'error');
        return;
    }
    
    // 执行写入
    for (var j = 0; j < bytes.length && (address + j) < NesHex.length; j++) {
        NesHex[address + j] = bytes[j];
    }
    
    closeWriteDialog();
    loadProfessionalHexData();
    showNotification('成功写入 ' + bytes.length + ' 字节');
}

// 移动端触摸交互优化
function addMobileTouchSupport() {
    var touchStartX, touchStartY, touchStartTime;
    var longPressTimer;
    var isLongPress = false;
    var touchMoved = false;
    
    // 为16进制字节添加触摸事件
    $(document).on('touchstart', '.hex-byte', function(e) {
        var $element = $(this);
        var touch = e.originalEvent.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        touchMoved = false;
        isLongPress = false;
        
        // 长按检测（500ms）
        longPressTimer = setTimeout(function() {
            isLongPress = true;
            showContextMenu({
                pageX: touchStartX,
                pageY: touchStartY,
                preventDefault: function() {}
            }, $element[0]);
        }, 500);
        
        // 选择字节
        if (!window.event || (!window.event.ctrlKey && !window.event.shiftKey)) {
            selectHexByte(this);
        }
    });
    
    $(document).on('touchmove', '.hex-byte', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        var touch = e.originalEvent.touches[0];
        var deltaX = Math.abs(touch.clientX - touchStartX);
        var deltaY = Math.abs(touch.clientY - touchStartY);
        
        // 如果移动距离超过阈值，认为是拖拽选择
        if (deltaX > 10 || deltaY > 10) {
            touchMoved = true;
            
            // 获取触摸位置的元素
            var elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            if ($(elementBelow).hasClass('hex-byte')) {
                // 扩展选择范围
                if (professionalEditor.selectionStart !== -1) {
                    professionalEditor.selectionEnd = parseInt($(elementBelow).data('offset'));
                    updateSelection();
                }
            }
        }
    });
    
    $(document).on('touchend', '.hex-byte', function(e) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        
        var touchDuration = Date.now() - touchStartTime;
        
        // 短按且没有移动，认为是单击
        if (touchDuration < 300 && !touchMoved && !isLongPress) {
            selectHexByte(this);
        }
    });
    
    // 防止默认的触摸行为
    $(document).on('touchstart touchmove touchend', '.hex-byte', function(e) {
        if (isLongPress || touchMoved) {
            e.preventDefault();
        }
    });
}

// 添加专业编辑器样式（修复界面布局问题）
function addProfessionalHexEditorStyles() {
    var styles = `
        /* 修复地址后面过多空白区域的问题 */
        .hex-offset {
            width: 70px; /* 设置固定宽度 */
            padding-right: 10px;
            text-align: right;
            font-family: monospace;
            color: #aaa;
            user-select: none;
        }
        

        
        .hex-bytes {
            display: flex;
            flex-wrap: nowrap;
            overflow: visible; /* 允许内容溢出 */
        }
        

        
        .hex-row {
            display: flex;
            align-items: center;
            padding: 2px 0;
            min-width: 100%; /* 确保行不会被压缩 */
        }
        
        .hex-byte {
            width: 30px;
            text-align: center;
            font-family: monospace;
            padding: 2px 0;
            cursor: pointer;
            transition: background-color 0.2s;
            user-select: none;
            border: 1px solid transparent; /* 防止边框变化引起布局抖动 */
        }
        
        .hex-byte:hover {
            background-color: #444;
        }
        
        .hex-byte.selected {
            background-color: #0066cc;
            color: white;
        }
        
        .hex-byte.editing {
            background-color: #663300;
            color: white;
            outline: 1px solid #ffcc00;
        }
        
        .hex-byte.modified {
            border-bottom: 1px solid #ffcc00;
        }
        
        /* 修复滚动条显示问题 */
        .hex-editor-main {
            height: 400px; /* 设置固定高度 */
            overflow: auto; /* 显示滚动条 */
            border: 1px solid #555;
            width: 100%;
        }
        
        .hex-editor-main::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }
        
        .hex-editor-main::-webkit-scrollbar-track {
            background: #333;
        }
        
        .hex-editor-main::-webkit-scrollbar-thumb {
            background: #666;
            border-radius: 6px;
        }
        
        .hex-editor-main::-webkit-scrollbar-thumb:hover {
            background: #888;
        }
        
        .hex-editor-content {
            min-width: max-content; /* 确保内容不会被压缩 */
        }
        
        /* 修复整体界面样式混乱问题 */
        .hex-editor-container {
            width: 100%;
            padding: 10px;
            border-radius: 4px;
            box-sizing: border-box;
        }
        
        .hex-editor-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px;
            border-radius: 3px;
        }
        
        .hex-editor-statusbar {
            padding: 5px;
            border-radius: 3px;
            color: #aaa;
            font-size: 12px;
            font-family: monospace;
        }
        
        .hex-editor-statusbar span {
            margin-right: 15px;
        }
    `;
    
    // 添加样式到页面
    var styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
}

// 虚拟滚动优化
function implementVirtualScrolling() {
    var $container = $('.hex-editor-main');
    var $viewport = $('#hexEditorBody');
    var itemHeight = 16; // 每行高度减小到16px
    var visibleRows = 25; // 增加可见行数到25行
    var bufferRows = 10; // 增加缓冲区行数
    var totalRows = Math.ceil(NesHex.length / 16);
    
    // 确保总行数计算正确
    totalRows = Math.max(1, Math.ceil(NesHex.length / 16));
    
    // 为了修复多选和复制粘贴功能，我们需要在professionalEditor对象中保存选择状态
    if (!professionalEditor.lastSelectionStart) {
        professionalEditor.lastSelectionStart = -1;
        professionalEditor.lastSelectionEnd = -1;
    }
    
    var virtualEditor = {
        startIndex: 0,
        endIndex: visibleRows + bufferRows,
        scrollTop: 0,
        isVirtualMode: true, // 始终启用虚拟模式以获得更好的性能
        updateVisibleRows: updateVisibleRows, // 添加对更新函数的引用
        renderVirtualRows: renderVirtualRows // 添加对渲染函数的引用
    };
    
    function updateVisibleRows() {
        if (!virtualEditor.isVirtualMode) {
            return;
        }
        
        var scrollTop = $container.scrollTop();
        var startIndex = Math.floor(scrollTop / itemHeight) - bufferRows;
        var endIndex = startIndex + visibleRows + (bufferRows * 2);
        
        startIndex = Math.max(0, startIndex);
        endIndex = Math.min(totalRows, endIndex);
        
        if (startIndex !== virtualEditor.startIndex || endIndex !== virtualEditor.endIndex) {
            virtualEditor.startIndex = startIndex;
            virtualEditor.endIndex = endIndex;
            
            // 更新viewport位置
            var translateY = startIndex * itemHeight;
            $viewport.css('transform', 'translateY(' + translateY + 'px)');
            
            renderVirtualRows();
        }
    }
    
    function renderVirtualRows() {
        var html = '';
        var startOffset = virtualEditor.startIndex * 16;
        var endOffset = Math.min(virtualEditor.endIndex * 16, NesHex.length);
        
        for (var row = virtualEditor.startIndex; row < virtualEditor.endIndex; row++) {
            var rowOffset = row * 16;
            
            if (rowOffset >= NesHex.length) break;
            
            html += '<div class="hex-row" data-offset="' + rowOffset + '">';
            html += '<div class="hex-offset">' + addPreZero2(rowOffset.toString(16), 6).toUpperCase() + '</div>';
            html += '<div class="hex-bytes">';
            
            for (var col = 0; col < 16; col++) {
                var byteOffset = rowOffset + col;
                if (byteOffset >= NesHex.length) break;
                
                var byteValue = NesHex[byteOffset] || 0;
                var byteHex = addPreZero(byteValue.toString(16).toUpperCase());
                
                // 检查是否需要添加选中状态
                var isSelected = false;
                if (professionalEditor.selectionStart !== -1 && professionalEditor.selectionEnd !== -1) {
                    var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
                    var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
                    isSelected = (byteOffset >= start && byteOffset <= end);
                }
                
                html += '<div class="hex-byte' + (isSelected ? ' selected' : '') + '" ';
                html += 'data-offset="' + byteOffset + '" ';
                html += 'data-value="' + byteValue + '" ';
                html += 'onclick="selectHexByte(this)" ';
                html += 'oncontextmenu="showContextMenu(event, this)" ';
                html += 'ondblclick="startEditHexByte(this)">';
                html += byteHex;
                html += '</div>';
            }
            
            html += '</div></div>';
        }
        
        $viewport.html(html);
        
        // 重新绑定键盘输入事件，修复输入功能异常
        bindVirtualEditorEvents();
        

        
        // 触发渲染完成事件，通知等待的编辑操作
        setTimeout(function() {
            $(document).trigger('virtualRenderComplete');
        }, 10); // 稍微增加延迟确保DOM完全更新
        adjustFontSize(0); // 调整字体大小  
    }
    
    // 绑定滚动事件
    if (virtualEditor.isVirtualMode) {
        // 移除之前的滚动事件处理器，防止重复绑定
        $container.off('scroll');
        $container.on('scroll', updateVisibleRows);
        
        // 修复滚动条显示，设置正确的高度
        var actualContentHeight = totalRows * itemHeight;
        var containerHeight = Math.min(visibleRows * itemHeight, actualContentHeight);
        
        // 确保容器高度合理
        if (containerHeight > actualContentHeight) {
            containerHeight = actualContentHeight;
        }
        
        // 设置容器样式
        $container.css({
            'height': containerHeight + 'px',
            'overflow-y': 'auto',
            'position': 'relative'
        });
        
        // 清理之前的占位符，避免重复创建
        $('.virtual-scroll-placeholder').remove();
        
        // 设置占位符高度，确保滚动条正确显示
        var placeholder = $('<div class="virtual-scroll-placeholder"></div>');
        placeholder.css('height', actualContentHeight + 'px');
        $viewport.after(placeholder);
        
        // 设置viewport为相对定位（而不是绝对定位）
        $viewport.css({
            'position': 'relative',
            'top': '0',
            'left': '0',
            'right': '0'
        });
        
        // 确保hex-editor-body类也保持相对定位
        $('.hex-editor-body').css({
            'position': 'relative'
        });
        

        
        updateVisibleRows(); // 初始渲染
    }
    
    professionalEditor.virtualMode = virtualEditor;
}

// 填充选择的数据
function fillSelectedData() {
    if (professionalEditor.selectionStart === -1 || professionalEditor.selectionEnd === -1) {
        showNotification('请先选择要填充的区域', 'warning');
        return;
    }
    
    // 简单的填充对话框
    var fillValue = prompt('请输入填充值 (十六进制，如: FF):', 'FF');
    if (!fillValue) {
        return;
    }
    
    fillValue = fillValue.replace(/^0x/i, '');
    if (!/^[0-9A-Fa-f]{1,2}$/.test(fillValue)) {
        showNotification('请输入有效的十六进制值', 'error');
        return;
    }
    
    var byteValue = parseInt(fillValue, 16);
    var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    
    for (var i = start; i <= end; i++) {
        NesHex[i] = byteValue;
        $('.hex-byte[data-offset="' + i + '"]').addClass('modified');
    }
    
    loadProfessionalHexData();
    showNotification('已填充 ' + (end - start + 1) + ' 字节');
}

// 显示选择区域属性
function showSelectedProperties() {
    if (professionalEditor.selectionStart === -1 || professionalEditor.selectionEnd === -1) {
        showNotification('请先选择区域', 'warning');
        return;
    }
    
    var start = Math.min(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    var end = Math.max(professionalEditor.selectionStart, professionalEditor.selectionEnd);
    var size = end - start + 1;
    
    var properties = [];
    properties.push('起始地址: 0x' + addPreZero2(start.toString(16), 6).toUpperCase());
    properties.push('结束地址: 0x' + addPreZero2(end.toString(16), 6).toUpperCase());
    properties.push('大小: ' + size + ' 字节');
    properties.push('大小: ' + (size / 1024).toFixed(2) + ' KB');
    
    // 计算校验和
    var checksum = 0;
    for (var i = start; i <= end; i++) {
        checksum += NesHex[i];
    }
    checksum = checksum & 0xFFFF;
    properties.push('校验和: 0x' + addPreZero2(checksum.toString(16), 4).toUpperCase());
    
    alert('选择区域属性:\n\n' + properties.join('\n'));
}