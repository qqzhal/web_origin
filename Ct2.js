$(document).ready(function () {
    $(document).pjax('a', '#main', {
        fragment: '#main'
    });
    LoadHtmlInner();
    $("#isfileload").html("All done. No File Load.");
});

//判断浏览器是否支持FileReader对象
var reader
if (FileReader) {
    reader = new FileReader();
} else {
    alert('您的浏览器不支持FileReader对象');
}
var NesHex = [];
var file2 = document.getElementById('Nesfileupload');

file2.onchange = function () {
    var uploadfilenames = $(this).val();
    NesHex = [];
    var file = file2.files[0];
    reader.readAsArrayBuffer(file); //二进制数组
    reader.onload = function () {
        var byts = new Uint8Array(reader.result);
        for (var i = 0; i < byts.length; i++) {
            NesHex.push(byts[i]);
        }
        filenamenes = getFileName(uploadfilenames);
        CheckNesHex(filenamenes);
        //alert(filenamenes);
    }
}

function CheckNesHex(fname) {
    IsCn = Is1v32 = false;
    if (NesHex[0x3D1F6] == 0xA2) {
        IsCn = true;
    }
    if (NesHex[0x3D1F6] == 0xFF) {
        Is1v32 = true;
    }
    $("#HackDiv").css("pointer-events", "auto");
    $("#btnsave").css("pointer-events", "auto");
    document.getElementById("checknes").innerText = " type:" + NesHex[0].toString(16) + " " + NesHex[1].toString(16) + " " + NesHex[2].toString(16);
    checkramtype(NesHex);
    TeamSelectChange(); showTeamEditbuttondiv(0);//队伍选择
    Add_TeamSelectChange();//球星添加
    Team_SC_Change();//袜子配色
    $('#AiPlayerSelect').val('0'); //AI
    document.getElementById("isfileload").innerText = "Load File:" + filenamenes;
    //BindCHRDataAndHTML();
    ChangeOrGetMusic(0); document.getElementById("MusicTeamNameList")[0].selected = true; getTeamMusicVal();//音乐初始化完毕执行
    LoadHex16();//16进制编辑器
    AiButtonClick("#aitab_0");
    showPlayerEditbuttondiv(0);//能力值
    document.getElementById("AiPlayerSelect")[0x22].selected = true;
    AiPlayersChange();//AI查看
    GetInstruct(); showInstructbuttondiv(0);//指令   
    $('#PlayerEditNameList').val('0'); PlayerEditSelectChange();//造型
    $('#playerAbilitySe').val('0'); GetPlayerData(0);//球员能力
    $('#playerGKAbilitySe').val('0'); GetPlayerData(1)//GK能力
    GetSkill();//必杀
    Changeskilladdtype();
    $('#_set_data').css('display', 'inline-block');
    $('#_run_game_div').css('display', 'block');
    PlayerVSModColorChange();//肖像部分
    IntoChrPage();//Chr简易编辑初始化
    showCHRbuttondiv(0); GetBGview(); $('#BGview_ID_0').get(0).selectedIndex = 0x17; GetBGview_BG(-1); It0528BG(); GetBGview_0528_05cc_list();//CHR选项+背景
    setTimeout(function () {
        document.getElementById("Vsmodelist2")[0].selected = true;
        bingDVSimg(2);
    }, 400);
}

$(function () {
    $("#menu .ctab").each(function (index) { //带参数遍历各个选项卡
        $(this).click(function () { //注册每个选卡的单击事件
            $("#menu li.tabFocus").removeClass("tabFocus"); //移除已选中的样式
            $(this).addClass("tabFocus"); //增加当前选中项的样式
            //显示选项卡对应的内容并隐藏未被选中的内容
            $("#content .ctab:eq(" + index + ")").show()
                .siblings().hide();
        });
    });
})

function showButtonDiv(type, x) {
    const types = {
        instruct: { hide: ["#Instructedit_a_0", "#Instructedit_a_1"], obj: "#Instructedit_x_" + x, af: "#Instructedit_a_" + x },
        team: { hide: ["#Teamedit_a_0", "#Teamedit_a_1"], obj: "#Teamedit_x_" + x, af: "#Teamedit_a_" + x },
        chr: { hide: ["#CHRTab", "#BGview", "#BGview_0528", "#SpriteView"], obj: "#chr_x_" + x, af: (x === 0 ? "#CHRTab" : x === 1 ? "#BGview" : x === 2 ? "#BGview_0528" : "#SpriteView") },
        player: { hide: ["#playeredit_a_0", "#playeredit_a_1", "#playeredit_a_2", "#playeredit_a_3"], obj: "#playeredit_x_" + x, af: "#playeredit_a_" + x },
        ai: { hide: ["#aitab0", "#aitab1", "#aitab2", "#aitab3", "#aitab4", "#aitab5", "#aitab6", "#aitab7"], obj: "#aitab_" + x, af: "#aitab" + x }
    };
    const config = types[type];
    if (!config) return;
    config.hide.forEach(id => $(id).css("display", "none"));
    const $obj = $(config.obj);
    $obj.siblings().css({ "color": "black", "font-weight": "normal" });
    $obj.css({ "color": "green", "font-weight": "bold" });
    $(config.af).css("display", "block");
    if (type === 'ai' && x === 4) showdiv(0);
    if (type === 'ai' && x === 5) showdiv(3);
    if (type === 'ai' && x === 6) showdiv(6);
}

function showInstructbuttondiv(x) { showButtonDiv('instruct', x); }
function showTeamEditbuttondiv(x) { showButtonDiv('team', x); }
function showCHRbuttondiv(x) { showButtonDiv('chr', x); }
function showPlayerEditbuttondiv(x) { showButtonDiv('player', x); }
function showAIbuttondiv(x) { showButtonDiv('ai', x); }

function AiButtonClick(obj) {
    $("#aitab0").css("display", "none");
    $("#aitab1").css("display", "none");
    $("#aitab2").css("display", "none");
    $("#aitab3").css("display", "none");
    $("#aitab4").css("display", "none");
    $("#aitab5").css("display", "none");
    $("#aitab6").css("display", "none");
    $("#aitab7").css("display", "none");
    var idname = $(obj).attr("af");
    $(obj).siblings().css("color", "black");
    $(obj).siblings().css("font-weight", "normal");
    $(obj).css("color", "green");
    $(obj).css("font-weight", "bold");
    $(idname).css("display", "block");
}



function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('GameSavesDB', 1);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('RomStore')) {
                db.createObjectStore('RomStore', { keyPath: 'id' });
            }
        };

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            reject('IndexedDB 初始化失败: ' + event.target.errorCode);
        };
    });
}


async function SetOldData() {
    const txt = $("#isfileload").text();
    if (!window.indexedDB) {
        $("#isfileload").text("浏览器不支持 IndexedDB");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
        return;
    }

    if (NesHex.length <= 0) {
        $("#isfileload").text("No file load.");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
        return;
    }

    try {
        const db = await initIndexedDB();
        const transaction = db.transaction(['RomStore'], 'readwrite');
        const store = transaction.objectStore('RomStore');

        // 删除旧数据
        store.delete('RomData');
        store.delete('RomName');

        // 存储新数据
        store.put({ id: 'RomData', data: NesHex });
        store.put({ id: 'RomName', data: filenamenes });

        transaction.oncomplete = function () {
            console.log('ROM 数据已成功存储到 IndexedDB');
            $("#isfileload").text("Ok. Data Saved.");
            setTimeout(() => {
                $("#isfileload").text(txt);
            }, 1000);
        };

        transaction.onerror = function (event) {
            console.error('存储到 IndexedDB 失败:', event.target.error);
        };
    } catch (error) {
        console.error(error);
        $("#isfileload").text("IndexedDB 操作失败");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
    }
}

async function PlayNes() {
    const txt = $("#isfileload").text();
    if (!window.indexedDB) {
        $("#isfileload").text("浏览器不支持 IndexedDB");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
        return;
    }

    if (NesHex.length <= 0) {
        $("#isfileload").text("No ROM can play.");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
        return;
    }

    try {
        const db = await initIndexedDB();
        const transaction = db.transaction(['RomStore'], 'readwrite');
        const store = transaction.objectStore('RomStore');

        // 删除旧数据
        store.delete('RomDataToplay');
        store.delete('RomDataToplay_name');

        // 存储新数据
        store.put({ id: 'RomDataToplay', data: NesHex });
        store.put({ id: 'RomDataToplay_name', data: filenamenes });

        transaction.oncomplete = function () {
            console.log('ROM 数据已成功存储到 IndexedDB');
            window.open('emu/index.html?debug=true');
        };

        transaction.onerror = function (event) {
            console.error('存储到 IndexedDB 失败:', event.target.error);
        };
    } catch (error) {
        console.error(error);
        $("#isfileload").text("IndexedDB 操作失败");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
    }
}

async function LoadOldData() {
    const txt = $("#isfileload").text();
    if (!window.indexedDB) {
        $("#isfileload").text("浏览器不支持 IndexedDB");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
        return;
    }

    try {
        const db = await initIndexedDB();
        const transaction = db.transaction(['RomStore'], 'readonly');
        const store = transaction.objectStore('RomStore');

        const romDataRequest = store.get('RomData');
        const romNameRequest = store.get('RomName');

        transaction.oncomplete = function () {
            const romData = romDataRequest.result?.data;
            const romName = romNameRequest.result?.data;

            if (!romData) {
                $("#isfileload").text("No RomData in your web browser's.");
                setTimeout(() => {
                    $("#isfileload").text(txt);
                }, 1000);
                return;
            }

            NesHex = romData;
            filenamenes = romName || 'localStorage.nes';
            CheckNesHex();
            $("#isfileload").text("Data read successfully");
            setTimeout(() => {
                $("#isfileload").text(filenamenes);
            }, 1000);
        };

        transaction.onerror = function (event) {
            console.error('读取 IndexedDB 数据失败:', event.target.error);
            $("#isfileload").text("IndexedDB 操作失败");
            setTimeout(() => {
                $("#isfileload").text(txt);
            }, 1000);
        };
    } catch (error) {
        console.error(error);
        $("#isfileload").text("IndexedDB 操作失败");
        setTimeout(() => {
            $("#isfileload").text(txt);
        }, 1000);
    }
}