/*! chrview 2.3 by daymoe */
let currentData;
let currentChrDataOffset;
let currentTileData;
let currentTileAddr = 0;
let currentTileId = 0;
let currentPenColor = 0;
let chrDataOffset = 0;
let copyTileData = null;
let copyTileId = 0;

document.onclick = function () {
    document.getElementById("chrEditmeu").style.display = "none";
}

function IntoChrPage() {
    copyTileData = null;
    copyTileId = 0;
    ChrSelectColor();
    document.getElementById("chrCanvas").crossorigin = "";
    document.getElementById("selectedTileCanvas").crossorigin = "";
    document.getElementById("penCanvas").crossorigin = "";
    document.getElementById("PastTileCanvas").crossorigin = "";

    var PastTileCanvas_ = document.getElementById("PastTileCanvas");
    PastTileCanvas_.width = PastTileCanvas_.height = 0;
    PastTileCanvas_.width = PastTileCanvas_.height = 32;

    const chrPageSelect = document.getElementById('chrPageSelect');
    const chrSizeSelect = document.getElementById('chrSizeSelect');
    const chrCanvas = document.getElementById('chrCanvas');
    const tileInfo = document.getElementById('tileInfo');
    const selectedTileCanvas = document.getElementById('selectedTileCanvas');
    const penSelect = document.getElementById('penSelect');

    currentData = new Uint8Array(NesHex);
    chrDataOffset = (currentData[4] * 0x4000) + 0x10;
    const totalPages = (currentData.length - chrDataOffset) / 0x1000;
    currentChrDataOffset = chrDataOffset;

    chrPageSelect.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `页码 ${i}`;
        chrPageSelect.appendChild(option);
    }

    chrPageSelect.addEventListener('change', (event) => {
        const pageIndex = parseInt(event.target.value);
        drawChrPage(currentData, chrDataOffset, pageIndex);
    });

    chrSizeSelect.addEventListener('change', (event) => {
        const pageIndex = parseInt(chrPageSelect.value);
        drawChrPage(currentData, chrDataOffset, pageIndex);
    });

    chrCanvas.addEventListener('mousedown', (event) => {
        const scaleFactor = chrCanvas.width / 128;
        const tileX = Math.floor(event.offsetX / (8 * scaleFactor));
        const tileY = Math.floor(event.offsetY / (8 * scaleFactor));
        const tileIndex = currentTileId = (tileY * 16) + tileX;
        const tileOffset = currentTileAddr = currentChrDataOffset + (parseInt(chrPageSelect.value) * 0x1000) + (tileIndex * 16);

        tileInfo.textContent = `Tile:0x${tileIndex.toString(16).padStart(2, '0').toUpperCase()} 地址:0x${tileOffset.toString(16).padStart(4, '0').toUpperCase()}`;

        currentTileData = currentData.slice(tileOffset, tileOffset + 16);
        ShowTileCode();
        drawSelectedTile(currentTileData);
    });

    chrCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        var menu = document.getElementById("chrEditmeu");
        menu.style.display = "block";
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";
    });

    selectedTileCanvas.addEventListener('mousedown', (event) => {
        selectedTileCanvas_Click(event);
    });

    selectedTileCanvas.addEventListener('mousemove', (event) => {
        selectedTileCanvas_Click(event);
    });

    selectedTileCanvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        document.getElementById("chrEditmeu").style.display = "none";
        currentPenColor = (currentPenColor + 1) % 4;
        var penSelectselectedIndex = penSelect.selectedIndex + 1;
        if (penSelectselectedIndex >= 4) { penSelectselectedIndex = 0; }
        penSelect.selectedIndex = penSelectselectedIndex;
        drawPenCanvas();
    });

    penSelect.addEventListener('change', (event) => {
        currentPenColor = parseInt(event.target.selectedIndex);
        drawPenCanvas();
    });


    drawChrPage(currentData, chrDataOffset, 0);
    drawPenCanvas();

    ChrColorChange();
}

function ShowTileCode() {
    const tileCode = document.getElementById('tileCode');
    tileCode.innerHTML = "";
    for (var i = 0; i < currentTileData.length; i++) {
        tileCode.innerHTML += currentTileData[i].toString(16).padStart(2, '0').toUpperCase() + " ";
        if (i == 7) { tileCode.innerHTML += "<br>"; }
    }
}
function drawChrPage(data, chrDataOffset, pageIndex) {
    const chrSizeSelect = document.getElementById('chrSizeSelect');
    const chrCanvas = document.getElementById('chrCanvas');
    const tileInfo = document.getElementById('tileInfo');
    const ctx = chrCanvas.getContext('2d');

    const pageOffset = chrDataOffset + (pageIndex * 0x1000);
    const canvasSize = parseInt(chrSizeSelect.value);
    chrCanvas.width = canvasSize;
    chrCanvas.height = canvasSize;

    currentTileAddr = pageOffset + currentTileId * 0x10;
    currentTileData = currentData.slice(currentTileAddr, currentTileAddr + 16);
    tileInfo.textContent = `Tile:0x${currentTileId.toString(16).padStart(2, '0').toUpperCase()} 地址:0x${currentTileAddr.toString(16).padStart(4, '0').toUpperCase()}`;
    ShowTileCode();
    drawSelectedTile(currentTileData);

    for (let tileY = 0; tileY < 16; tileY++) {
        for (let tileX = 0; tileX < 16; tileX++) {
            const tileIndex = (tileY * 16) + tileX;
            const tileOffset = pageOffset + (tileIndex * 16);

            for (let y = 0; y < 8; y++) {
                const lowByte = data[tileOffset + y];
                const highByte = data[tileOffset + y + 8];

                for (let x = 0; x < 8; x++) {
                    const bitLow = (lowByte >> (7 - x)) & 1;
                    const bitHigh = (highByte >> (7 - x)) & 1;
                    const colorIndex = (bitHigh << 1) | bitLow;
                    const grayScale = chrcolor[colorIndex];
                    ctx.fillStyle = ReturnNesColor(grayScale);
                    const scaleFactor = canvasSize / 128;
                    ctx.fillRect((tileX * 8 + x) * scaleFactor, (tileY * 8 + y) * scaleFactor, scaleFactor, scaleFactor);
                }
            }
        }
    }
}

function drawSelectedTile(tileData) {
    const selectedTileCanvas = document.getElementById('selectedTileCanvas');
    const selectedTileCtx = selectedTileCanvas.getContext('2d');

    for (let y = 0; y < 8; y++) {
        const lowByte = tileData[y];
        const highByte = tileData[y + 8];

        for (let x = 0; x < 8; x++) {
            const bitLow = (lowByte >> (7 - x)) & 1;
            const bitHigh = (highByte >> (7 - x)) & 1;
            const colorIndex = (bitHigh << 1) | bitLow;
            const grayScale = chrcolor[colorIndex];
            selectedTileCtx.fillStyle = ReturnNesColor(grayScale);
            selectedTileCtx.fillRect(x * 16, y * 16, 16, 16);
        }
    }
}
function selectedTileCanvas_Click(event) {
    if (event.buttons === 1) {
        const x = Math.floor(event.offsetX / 16);
        const y = Math.floor(event.offsetY / 16);
        const bitIndex = (y * 8) + x;

        const byteIndex = Math.floor(bitIndex / 8);
        const bitOffset = 7 - (bitIndex % 8);

        const selectedColor = currentPenColor;
        const lowBit = selectedColor & 1;
        const highBit = (selectedColor >> 1) & 1;

        currentTileData[byteIndex] = (currentTileData[byteIndex] & ~(1 << bitOffset)) | (lowBit << bitOffset);
        currentTileData[byteIndex + 8] = (currentTileData[byteIndex + 8] & ~(1 << bitOffset)) | (highBit << bitOffset);
        ShowTileCode();
        drawSelectedTile(currentTileData);
    }
}

function drawPenCanvas() {
    const penCanvas = document.getElementById('penCanvas');
    const penCtx = penCanvas.getContext('2d');
    const selectedColor = currentPenColor;
    const grayScale = chrcolor[selectedColor];
    penCtx.fillStyle = ReturnNesColor(grayScale);
    penCtx.fillRect(0, 0, 32, 32);
}
function writeTileData() {
    const chrPageSelect = document.getElementById('chrPageSelect');
    for (var i = 0; i < 0x10; i++) {
        currentData[currentTileAddr + i] = currentTileData[i];
    }
    const pageIndex = parseInt(chrPageSelect.value);
    drawChrPage(currentData, chrDataOffset, pageIndex);
    NesHex = currentData;
    alertMsg("#isfileload", "green", "Tile数据已更改~");
}
var chrcolor = [0x0F, 0x07, 0x28, 0x39];
function ChrColorChange() {
    chrcolor = [$('#ChrColor1').get(0).selectedIndex, $('#ChrColor2').get(0).selectedIndex, $('#ChrColor3').get(0).selectedIndex, $('#ChrColor4').get(0).selectedIndex];
    ChrSelectColor();
    const pageIndex = parseInt(chrPageSelect.value);
    drawChrPage(currentData, chrDataOffset, pageIndex);
    const penSelect = document.getElementById('penSelect');
    for (var i = 0; i < penSelect.childNodes.length; i++) {
        var colorse = document.getElementById("ChrColor" + (i + 1));
        var colorseindex = colorse.selectedIndex;
        penSelect.options[i].value = colorse.options[colorseindex].value;
        penSelect.options[i].text = colorse.options[colorseindex].text;
    }
    drawPenCanvas();
}

function CopyTileData() {
    copyTileData = currentTileData;
    copyTileId = currentTileId;
    alertMsg("#isfileload", "green", "Tile:" + copyTileId.toString(16).padStart(2, '0').toUpperCase() + " 数据已复制到剪切板~");

    const pastTileCanvas = document.getElementById('PastTileCanvas');
    const pastTileCtx = pastTileCanvas.getContext('2d');

    for (let y = 0; y < 8; y++) {
        const lowByte = copyTileData[y];
        const highByte = copyTileData[y + 8];

        for (let x = 0; x < 8; x++) {
            const bitLow = (lowByte >> (7 - x)) & 1;
            const bitHigh = (highByte >> (7 - x)) & 1;
            const colorIndex = (bitHigh << 1) | bitLow;
            const grayScale = chrcolor[colorIndex];
            pastTileCtx.fillStyle = ReturnNesColor(grayScale);
            pastTileCtx.fillRect(x * 4, y * 4, 4, 4);
        }
    }
}

function PastTileData() {
    if (copyTileData == null) {
        alertMsg("#isfileload", "red", "剪切板没有数据!");
    }
    else {
        for (var i = 0; i < 0x10; i++) {
            currentData[currentTileAddr + i] = copyTileData[i];
        }
        alertMsg("#isfileload", "green", "Tile:" + currentTileId.toString(16).padStart(2, '0').toUpperCase() + " 数据已成功被覆盖~");//<br>注意:你还需点击 [应用Tile数据更改] 
        const pageIndex = parseInt(chrPageSelect.value);
        drawChrPage(currentData, chrDataOffset, pageIndex);
    }
}

/////////////背景部分(查看2023.12.01)-----
var BG_addr_05cc = 0x16B74;
var BG_addr_05ca = 0x24010;
var BG_addr_属性码 = 0x17BF4;
var BG_addr_图库 = 0x166FE;

function GetBGview_0528_05cc_list() {

    var defx = $('#BGview_0528_05ca_list').get(0).selectedIndex * 0x1000 + BG_addr_05ca;
    var def05ccindex = BG_addr_05cc + $('#BGview_0528_05cc_list').get(0).selectedIndex * 0x20;
    var x05cc = [];
    var xAttributes = [];//属性码
    for (var i = 0; i < 0x40; i++) {
        x05cc.push(NesHex[def05ccindex + i]);
        xAttributes.push(NesHex[BG_addr_属性码 + i]);
    }

    var x05ca = [];
    var nam = [];
    var cols = [];//颜色组
    var tileData = [];
    for (var i = 0; i < 0x1000; i++) {
        nam.push(0x00);
        cols.push(0x00);
        x05ca.push(NesHex[defx + i]);
        tileData[i] = 0;
    }

    var ssssss = "";

    for (var i = 0; i < x05cc.length; i++) {
        ssssss += " " + addPreZero(x05cc[i].toString(16).toUpperCase());
    }
    $('#BGview_0528_Dat_0').text(ssssss.substring(1));

    ssssss = "";
    for (var i = 0; i < x05ca.length; i++) {
        ssssss += " " + addPreZero(x05ca[i].toString(16).toUpperCase());
    }
    $('#BGview_0528_Dat_1').text(ssssss.substring(1));

    ssssss = "";
    for (var i = 0; i < xAttributes.length; i++) {
        ssssss += " " + addPreZero(xAttributes[i].toString(16).toUpperCase());
    }
    $('#BGview_0528_Dat_2').text(ssssss.substring(1));

    // 根据05CC及05CA形成NAM(命名表)排列
    for (var i = 0; i < 8; i++) {
        for (var j = 0; j < 8; j++) {
            var now05cc = i * 8 + j; // 计算当前位置的05CC值
            var now05ca = x05cc[now05cc] * 0x10; // 计算当前位置的05CA值
            var tid = i * 0x80 + j * 4; // 计算当前位置的tid值
            for (var w = 0; w < 4; w++) {
                nam[tid + w * 0x20 + 0x00] = x05ca[now05ca + w * 4 + 0x00]; // 将05CA中的像素数据复制到NAM数组中
                nam[tid + w * 0x20 + 0x01] = x05ca[now05ca + w * 4 + 0x01];
                nam[tid + w * 0x20 + 0x02] = x05ca[now05ca + w * 4 + 0x02];
                nam[tid + w * 0x20 + 0x03] = x05ca[now05ca + w * 4 + 0x03];
                var paletteIndex = 0;
                if (w == 0) {
                    paletteIndex = (xAttributes[now05cc] >> 0) & 0x03; // 获取属性码中的第一个字节，并将其转换为颜色索引
                }
                if (w == 1) {
                    paletteIndex = (xAttributes[now05cc] >> 4) & 0x03; // 获取属性码中的第二个字节，并将其转换为颜色索引
                }
                if (w == 2) {
                    paletteIndex = (xAttributes[now05cc] >> 2) & 0x03; // 获取属性码中的第三个字节，并将其转换为颜色索引
                }
                if (w == 3) {
                    paletteIndex = (xAttributes[now05cc] >> 6) & 0x03; // 获取属性码中的第四个字节，并将其转换为颜色索引
                }
                cols[tid + w * 0x20 + 0x00] = paletteIndex; // 将颜色索引存储到cols数组中
                cols[tid + w * 0x20 + 0x01] = paletteIndex;
                cols[tid + w * 0x20 + 0x02] = paletteIndex;
                cols[tid + w * 0x20 + 0x03] = paletteIndex;
            }
        }
    }

    ssssss = "";
    for (var i = 0; i < nam.length; i++) {
        ssssss += " " + addPreZero(nam[i].toString(16).toUpperCase());
    }

    $('#BGview_0528_Dat_3').text(ssssss.substring(1));
    chrPageindex = NesHex[BG_addr_图库 + $('#BGview_0528_05cc_list').get(0).selectedIndex * 2] / 4;
    var coloraddr = 0xD010 + (0 & 0x3F) * 0x10;//目前没有关连0528动画代码，无法取得 F5 颜色的数据  
    // 获取ROM中的调色板数组
    var colordata = [0x0F, 0x1A, 0x10, 0x30, 0x0F, 0x36, 0x25, 0x30, 0x0F, 0x21, 0x31, 0x30, 0x0F, 0x21, 0x31, 0x30];
    //var colordata = [NesHex[coloraddr + 0x00],NesHex[coloraddr + 0x01],NesHex[coloraddr + 0x02],NesHex[coloraddr + 0x03],NesHex[coloraddr + 0x04],NesHex[coloraddr + 0x05],NesHex[coloraddr + 0x06],NesHex[coloraddr + 0x07],NesHex[coloraddr + 0x08],NesHex[coloraddr + 0x09],NesHex[coloraddr + 0x0A],NesHex[coloraddr + 0x0B],NesHex[coloraddr + 0x0C],NesHex[coloraddr + 0x0D],NesHex[coloraddr + 0x0E],NesHex[coloraddr + 0x0F]];
    let CGcanvas = document.getElementById("chr_BGview_0528_Canvas");
    CGcanvas.style.width = "256px";
    CGcanvas.style.height = "256px";
    CGcanvas.width = 256; CGcanvas.height = 256;
    var CGctx = CGcanvas.getContext('2d');
    CGctx.fillStyle = 'black';
    CGctx.fillRect(0, 0, CGcanvas.width, CGcanvas.height);

    var xxx = 0; // 大图的x坐标
    var yyy = 0; // 大图的y坐标
    var xxxxx = 0; // 当前行的小图块数量

    // 按顺序拼接小图块到大图上
    for (var i = 0; i < nam.length; i++) {
        var tileids = nam[i]; // 获取当前小图块的ID

        // 根据属性码取得颜色
        var 颜色1 = ReturnNesColor((colordata[cols[i] * 4 + 0]));
        var 颜色2 = ReturnNesColor((colordata[cols[i] * 4 + 1]));
        var 颜色3 = ReturnNesColor((colordata[cols[i] * 4 + 2]));
        var 颜色4 = ReturnNesColor((colordata[cols[i] * 4 + 3]));
        var colors = [颜色1, 颜色2, 颜色3, 颜色4]; // 存储四个颜色的数组

        var num = chrDataOffset + chrPageindex * 0x1000 + tileids * 0x10;  // 获取Tile代码

        var bytes = [];  // 读取16个字节的数据
        for (var w = 0; w < 0x10; w++) {
            bytes[w] = NesHex[num + w]; // 从chrDataOffset中获取对应的字节数据
        }
        drawNESTile(bytes, xxx, yyy, colors, CGctx); // 调用drawNESTile函数绘制小图块
        // 更新大图的坐标和当前行的小图块数量
        xxx += 8;
        xxxxx++;
        if (xxxxx >= 0x20) {
            xxx = 0;
            yyy += 8;
            xxxxx = 0;
        }
    }
}

var _BGview_0528_05ca_Tpye = 0;
function GetBGview_0528_05ca_Tpye() {
    _BGview_0528_05ca_Tpye = $('#BGview_0528_05ca_Tpye').get(0).selectedIndex;

    if (_BGview_0528_05ca_Tpye == 0) {
        BG_addr_05cc = 0x16B74;
        BG_addr_05ca = 0x24010;
        BG_addr_属性码 = 0x17BF4;
        BG_addr_图库 = 0x166FE;
    }
    else {
        BG_addr_05cc = 0x48B74;
        BG_addr_05ca = 0x4C010;
        BG_addr_属性码 = 0x49BF4;
        BG_addr_图库 = 0x486FE;
    }

    $('#BG05cc_addr').val(addPreZero2(BG_addr_05cc.toString(16).toUpperCase(), 5));
    $('#BG05ca_addr').val(addPreZero2(BG_addr_05ca.toString(16).toUpperCase(), 5));
    $('#BGAdb_addr').val(addPreZero2(BG_addr_属性码.toString(16).toUpperCase(), 5));
    $('#BGchr_addr').val(addPreZero2(BG_addr_图库.toString(16).toUpperCase(), 5));

    It0528BG();
    GetBGview_0528_05cc_list();
}

function GetBGview_0528_05ca_list() {
    GetBGview_0528_05cc_list();
}

function It0528BG() {
    $("#BGview_0528_05cc_list").empty();
    for (var i = 0; i < 0x100; i++) {

        fillSelectlist($("#BGview_0528_05cc_list"),i);
    }
    $("#BGview_0528_05ca_list").empty();
    if (_BGview_0528_05ca_Tpye == 0) {
        for (var i = 0; i < 5; i++) {
            fillSelectlist_n($("#BGview_0528_05ca_list"),(0x24010 + i * 0x1000),5);
        }
    }
    else {
        for (var i = 0; i < 0x10; i++) {
            fillSelectlist_n($("#BGview_0528_05ca_list"),(0x4C010 + i * 0x1000),5);
        }
    }
}

function GetBGview() {
    $("#BGview_ID_0").empty();
    for (var i = 0; i < hex2int($("#BGview_Id_Len").val()) + 1; i++) {
        fillSelectlist($("#BGview_ID_0"),i);
    }
    GetBGview_BG(-1);
}

function GetBGview_BG_1() {
    var disabled = $("#BGview_SeAddr").prop("disabled");
    if (disabled == false) {
        GetBGview_BG($('#BGview_SeAddr').get(0).selectedIndex);
    }
}

var bg_data_行 = 0;
var bg_data_列 = 0;
var bg_data_起始 = 0;
var chrPageindex = 0;

function GetBGview_BG(tileaddr) {
    var ID = $('#BGview_ID_0').get(0).selectedIndex;
    var index = hex2int($('#BGview_Id').val(), $('#BGview_Id').val().length) + ID * 2;
    var idx = (NesHex[index + 1] ^ 0x40) * 0x100 + NesHex[index] + 0x10;
    var 行 = bg_data_行 = NesHex[idx + 3];
    var 列 = bg_data_列 = NesHex[idx + 4];
    bg_data_起始 = NesHex[idx + 5];
    var count = 行 * 列;
    var bttemp = [];
    $('#BGview_Dat_0').text(toHex16(NesHex[idx + 0]) + " " + toHex16(NesHex[idx + 1]));
    $('#BGview_Dat_1').text(toHex16(NesHex[idx + 2]));
    $('#BGview_Dat_2').text(toHex16(NesHex[idx + 3]));
    $('#BGview_Dat_3').text(toHex16(NesHex[idx + 4]));
    $('#BGview_Dat_4').text(toHex16(NesHex[idx + 5]));

    var x = "";
    for (var i = 0; i < count; i++) {
        x += toHex16(NesHex[idx + 6 + i]) + " ";
        bttemp.push(NesHex[idx + 6 + i]);
    }
    $('#BGview_Dat_5').text(x);
    $('#BGview_Dat_6').text(toHex16(NesHex[idx + 6 + count]) + " " + toHex16(NesHex[idx + 7 + count]));

    var w = "";
    for (var i = 0; i < 5; i++) {
        w += toHex16(NesHex[idx + i]) + " ";
    }

    $('#BGview_Dat_7').text(w + x + $('#BGview_Dat_6').text());
    chrPageindex = NesHex[idx] / 4;
    var 排列地址 = 0x10010 + ((NesHex[idx + 2]) & 0x01) * 0x1100;
    // 使用传入的地址进行解析
    if (tileaddr != -1) {
        排列地址 = 0x10010 + tileaddr * 0x1100;
    }
    else {
        // 使用默认的地址和索引值进行解析
        $('#BGview_SeAddr').prop("disabled", true);
        $('#BGview_SeAddr').get(0).selectedIndex = (NesHex[idx + 2]) & 0x01;
        $('#BGview_SeAddr').prop("disabled", false);
    }

    // 获取底层背景的排列数据
    var 田字排列组 = [count];
    var xtemp = "";//包含属性码的田字排列代码字符串
    for (var i = 0; i < count; i++) {
        var b = [];
        var sx = "";
        for (var y = 0; y < 0x11; y++) {
            b[y] = NesHex[排列地址 + bttemp[i] * 0x11 + y];
            sx += toHex16(b[y]) + " ";
        }
        田字排列组[i] = b;
        xtemp += sx + "<br>";

    }
    底层背景_绘图(田字排列组, NesHex[idx + 2]);
}

function 底层背景_绘图(田字排列组, _color) {
    var 田字排列 = 田字排列组;
    //获取ROM中的调色板索引(背景)
    var coloraddr = 0xD010 + (_color & 0x3F) * 0x10;

    var tileData = [];
    for (var i = 0; i < 0x3C0; i++) {
        tileData[i] = 0;
    }
    // 获取ROM中的调色板数组
    var colordata = [NesHex[coloraddr + 0x00], NesHex[coloraddr + 0x01], NesHex[coloraddr + 0x02], NesHex[coloraddr + 0x03], NesHex[coloraddr + 0x04], NesHex[coloraddr + 0x05], NesHex[coloraddr + 0x06], NesHex[coloraddr + 0x07], NesHex[coloraddr + 0x08], NesHex[coloraddr + 0x09], NesHex[coloraddr + 0x0A], NesHex[coloraddr + 0x0B], NesHex[coloraddr + 0x0C], NesHex[coloraddr + 0x0D], NesHex[coloraddr + 0x0E], NesHex[coloraddr + 0x0F]];
    var 行X = bg_data_行;
    var 列X = bg_data_列;
    var 起始X = bg_data_起始;
    let CGcanvas = document.getElementById("chr_BG0_Canvas");
    CGcanvas.style.width = "512px";
    CGcanvas.style.height = "256px";
    CGcanvas.width = 512; CGcanvas.height = 256;
    var CGctx = CGcanvas.getContext('2d');
    CGctx.fillStyle = 'black';
    CGctx.fillRect(0, 0, CGcanvas.width, CGcanvas.height);

    var xxx = 0;
    var yyy = 0;

    xxx = 起始X % 8 * 32;
    yyy = 起始X / 8 * 32;
    var xxxxx = 0;
    // 按顺序拼接小图块到大图上
    for (var i = 0; i < 行X * 列X; i++) {

        var p = 田字排列[i];
        //根据属性码取得颜色
        var shift = (0 & 0x02) | ((0 & 0x02) << 1);
        var paletteIndex = (p[0] >> shift) & 0x03;
        var 颜色1 = ReturnNesColor((colordata[paletteIndex * 4 + 0]));
        var 颜色2 = ReturnNesColor((colordata[paletteIndex * 4 + 1]));
        var 颜色3 = ReturnNesColor((colordata[paletteIndex * 4 + 2]));
        var 颜色4 = ReturnNesColor((colordata[paletteIndex * 4 + 3]));
        var colors = [颜色1, 颜色2, 颜色3, 颜色4];
        for (var y = 0; y < 4; y++) {
            for (var x = 0; x < 4; x++) {
                var num = chrDataOffset + chrPageindex * 0x1000 + p[y * 4 + x + 1] * 0x10;
                var bytes = [];
                for (var w = 0; w < 0x10; w++) {
                    bytes[w] = NesHex[num + w];
                }
                drawNESTile(bytes, xxx + x * 8, yyy + y * 8, colors, CGctx);
            }
        }
        xxx += 32;
        xxxxx++;
        if (xxxxx >= 列X) {
            xxx = 起始X % 8 * 32;
            yyy += 32;
            xxxxx = 0;
        }
    }
}

// 绘制NES Tile函数
function drawNESTile(tileData, xx, yy, color, ctx) {
    for (let y = 0; y < 8; y++) {
        const lowByte = tileData[y];
        const highByte = tileData[y + 8];
        for (let x = 0; x < 8; x++) {
            const bitLow = (lowByte >> (7 - x)) & 1;
            const bitHigh = (highByte >> (7 - x)) & 1;
            const colorIndex = (bitHigh << 1) | bitLow;
            ctx.fillStyle = color[colorIndex];
            ctx.fillRect(xx + x, yy + y, 1, 1);
        }
    }
}
