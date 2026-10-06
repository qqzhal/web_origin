var musicdata1 = 0x3D0BC; //【音乐】赛中队伍音乐=0x3D0BC
var musicdata2 = 0x0133; //【音乐】圣保罗、南葛、日本会议音乐=0x0133
var musicdata3 = 0x013B; //   【音乐】巴西会议音乐=0x013B
var musicdata4 = 0x3D1F7; //  【音乐】赛中-最后五分钟=0x3D1F7   //7D1F7
var musicdata5 = 0x3D0A4; //【音乐】进球-最后五分钟=0x3D0A4    //7D0A4
var musicdata6 = 0x3460C; //【音乐】犯规-最后五分钟=0x3460C
var musicdata7 = 0x21C54; //【音乐】我方进球=0x21C54
var musicdata8 = 0x21C48; //【音乐】敌方进球=0x21C48
var musicdata9 = 0x59; //【音乐】LOGO界面=0x59
var musicdata10 = 0xBFB8; //【音乐】升级=0xBFB8
var musicdata11 = 0xC027; //【音乐】输球=0xC027
var musicdata12 = 0x237DF; //【音乐】开场解说=0x237DF
var musicdata13 = 0x26E3; //【音乐】中场休息会议=0x26E3

$(document).ready(function () {
    BulidMusicTabHtml();
});

function getTeamMusicVal() {
    if (IsCn == true) {
        musicdata4 = 0x7D1F7;
        musicdata5 = 0x7D0A4;
        musicdata1 = 0x7D0BC;
        musicdata10 = 0xAA93;
    }
    else {
        musicdata4 = 0x3D1F7;
        musicdata5 = 0x3D0A4;
        musicdata1 = 0x3D0BC;
        musicdata10 = 0xBFB8;
    }
    var teammusicnowdata = $('#MusicTeamNameList').get(0).selectedIndex;
    $('#MusicNameList1').val(NesHex[musicdata1 + teammusicnowdata]);
}

function ChangeOrGetMusic(type) {
    var teammusicnowdata = $('#MusicTeamNameList').get(0).selectedIndex;
    if (IsCn == true) {
        musicdata4 = 0x7D1F7;
        musicdata5 = 0x7D0A4;
        musicdata1 = 0x7D0BC;
        musicdata10 = 0xAA93;
    }
    else {
        musicdata4 = 0x3D1F7;
        musicdata5 = 0x3D0A4;
        musicdata1 = 0x3D0BC;
        musicdata10 = 0xBFB8;
    }
    var musicbytedata = [(musicdata1 + teammusicnowdata), musicdata2, musicdata3, musicdata4, musicdata5, musicdata6, musicdata7, musicdata8, musicdata9, musicdata10, musicdata11, musicdata12, musicdata13];

    if (type == 1) //修改
    {
        try {
            for (var i = 0; i < musicbytedata.length; i++) {
                NesHex[musicbytedata[i]] = $("#MusicNameList" + (i + 1)).val();
            }
            alertMsg("#isfileload", "green", "音乐修改成功~");
        } catch (e) {
            alertMsg("#isfileload", "red", "音乐修改失败!");
        }
    }
    else //刷新
    {
        for (var i = 0; i < musicbytedata.length; i++) {
            $("#MusicNameList" + (i + 1)).val(NesHex[musicbytedata[i]]);
        }
    }
}

var MusicTypeLoad = false;

// NSF player variables
var myNsfPlayer;
var myNsfAudioHandler;
var myNsfLoaded = false;
var myNsfCurrentSong = 1;
var myNsfLoopId = 0;
var myNsfLastFrameTime = 0;
var myNsfFrameResidue = 0;
var pendingPlay = false;
var pendingMidcount = -1;
var lastPlayTime = 0;
var myNsfPausedByVisibility = false;

function playmusic(pid) {
    // Prevent rapid clicks
    if (performance.now() - lastPlayTime < 500) return;
    lastPlayTime = performance.now();

    var midstr = $(pid).attr('musid');
    var midtxt = $("#" + midstr).find("option:selected").text();
    var midcount = -1;
    if (midtxt.indexOf(']') >= 1) {
        var syo = midtxt.substring(midtxt.length - 2);
        midcount = hex2int(syo)+1;
    } else if (midtxt.indexOf('—') >= 0) {
        var syo = midtxt.substring(0, 2);
        midcount = hex2int(syo)+1;
    }
    if (midcount == -1 || midcount == 0) {
        return;
    }

    if (MusicTypeLoad == false) {
        pendingPlay = true;
        pendingMidcount = midcount;
        // Define log function if not exists
        if (typeof window.log !== 'function') {
            window.log = console.log;
        }
        // Load scripts by appending to head to avoid jQuery's AJAX loading
        var scripts = [
            'emu/lib/tempnsf.js',
            'emu/nes/mappers.js',
            'emu/nes/cpu.js',
            'emu/nes/apu.js',
            'emu/js/audio.js',
            'emu/js/nsfmapper.js',
            'emu/js/nsf.js',
            'emu/js/nsfmain.js'
        ];
        var loadedCount = 0;
        scripts.forEach(function(src) {
            var script = document.createElement('script');
            script.src = src + cssjsvernob;
            script.defer = true;
            script.onload = function() {
                loadedCount++;
                if (loadedCount === scripts.length) {
                    // All scripts loaded
                    if (typeof tempnsf !== 'undefined' && typeof inputnsfdata !== 'undefined' && typeof NsfPlayer !== 'undefined' && typeof AudioHandler !== 'undefined') {
                        // Build NSF data from tempnsf and inputnsfdata
                        var nsfData = new Uint8Array(tempnsf);
                        for (var i = 0; i < inputnsfdata.length; i++) {
                            nsfData[0x2083 + i] = inputnsfdata[i];
                        }
                        myNsfPlayer = new NsfPlayer();
                        myNsfAudioHandler = new AudioHandler();
                        // Try to resume audio context on user interaction
                        if (myNsfAudioHandler.hasAudio) {
                            myNsfAudioHandler.actx.resume().then(() => {
                                //console.log('成功加载NSF播放器.');
                            }).catch((e) => {
                                //console.log('Failed to resume audio context:', e);
                            });
                        }
                        MusicTypeLoad = true;
                        if (pendingPlay) {
                            pendingPlay = false;
                            midcount = pendingMidcount;
                            pendingMidcount = -1;
                            // Play after loading
                            if (!myNsfLoaded) {
                                if (myNsfPlayer.loadNsf(nsfData)) {
                                    myNsfLoaded = true;
                                    myNsfCurrentSong = midcount;
                                    myNsfPlayer.playSong(midcount);
                                    // Pre-fill audio buffer
                                    for (var i = 0; i < 3; i++) {
                                        myNsfPlayer.runFrame();
                                        myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
                                        myNsfAudioHandler.nextBuffer();
                                    }
                                    if (myNsfAudioHandler.hasAudio) {
                                        myNsfAudioHandler.start();
                                        myNsfLastFrameTime = performance.now();
                                        myNsfFrameResidue = 0;
                                        myNsfLoopId = requestAnimationFrame(myNsfUpdate);
                                    }
                                } else {
                                    console.log("NSF文件载入失败.");
                                }
                            } else {
                                // If already loaded, just play the song
                                myNsfCurrentSong = midcount;
                                myNsfPlayer.playSong(midcount);
                                // Pre-fill audio buffer
                                for (var i = 0; i < 3; i++) {
                                    myNsfPlayer.runFrame();
                                    myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
                                    myNsfAudioHandler.nextBuffer();
                                }
                                if (!myNsfLoopId && myNsfAudioHandler.hasAudio) {
                                    myNsfAudioHandler.start();
                                    myNsfLastFrameTime = performance.now();
                                    myNsfFrameResidue = 0;
                                    myNsfLoopId = requestAnimationFrame(myNsfUpdate);
                                }
                            }
                        }
                    } else {
                        console.log("NSF播放器脚本或临时NSF数据加载失败.");
                    }
                }
            };
            script.onerror = function() {
                console.log("脚本加载失败: " + src);
            };
            document.head.appendChild(script);
        });
        $("#musicloadplaydiv").html(""); // Clear the div
        return; // Exit, will play after loading
    }

    if (!myNsfPlayer || !myNsfAudioHandler) {
        console.log("NSF播放器未初始化.");
        return;
    }

    // Load NSF file if not loaded
    if (!myNsfLoaded) {
        // Build NSF data from tempnsf and inputnsfdata
        var nsfData = new Uint8Array(tempnsf);
        for (var i = 0; i < inputnsfdata.length; i++) {
            nsfData[0x2083 + i] = inputnsfdata[i];
        }
        if (myNsfPlayer.loadNsf(nsfData)) {
            myNsfLoaded = true;
            myNsfCurrentSong = midcount;
            myNsfPlayer.playSong(midcount);
            // Pre-fill audio buffer
            for (var i = 0; i < 3; i++) {
                myNsfPlayer.runFrame();
                myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
                myNsfAudioHandler.nextBuffer();
            }
            if (myNsfAudioHandler.hasAudio) {
                myNsfAudioHandler.start();
                myNsfLastFrameTime = performance.now();
                myNsfFrameResidue = 0;
                myNsfLoopId = requestAnimationFrame(myNsfUpdate);
            }
        } else {
            console.log("NSF文件载入失败.");
        }
    } else {
        // If already loaded, just play the song
        myNsfCurrentSong = midcount;
        myNsfPlayer.playSong(midcount);
        // Pre-fill audio buffer
        for (var i = 0; i < 3; i++) {
            myNsfPlayer.runFrame();
            myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
            myNsfAudioHandler.nextBuffer();
        }
        if (!myNsfLoopId && myNsfAudioHandler.hasAudio) {
            myNsfAudioHandler.start();
            myNsfLastFrameTime = performance.now();
            myNsfFrameResidue = 0;
            myNsfLoopId = requestAnimationFrame(myNsfUpdate);
        }
    }
}

// Old variables no longer used
// var ctx;
// var nsfPlayer;
// var nsffile;

/*$(document).ready(function(){  

 // ctx = new AudioContext();

 // nsfPlayer = createNsfPlayer(ctx);

});*/

function CloseMusic(scontss) {
    if (myNsfAudioHandler) {
        myNsfAudioHandler.stop();
    }
    if (myNsfLoopId) {
        cancelAnimationFrame(myNsfLoopId);
        myNsfLoopId = 0;
    }
}

function myNsfUpdate() {
    if (!myNsfLoaded) return;

    var now = performance.now();
    var elapsed = now - myNsfLastFrameTime;
    // 如果elapsed太大，避免卡死
    if (elapsed > 200) elapsed = 200;
    myNsfLastFrameTime = now;

    // 60帧每秒，每帧约16.6667ms
    var nsfFrames = (elapsed + myNsfFrameResidue) / (1000 / 60);
    var framesToRun = Math.floor(nsfFrames);
    myNsfFrameResidue = (elapsed + myNsfFrameResidue) - framesToRun * (1000 / 60);

    if (framesToRun > 0) {
        for (var i = 0; i < framesToRun; i++) {
            myNsfRunFrame();
        }
    }
    myNsfLoopId = requestAnimationFrame(myNsfUpdate);
}

function myNsfRunFrame() {
    if (!myNsfLoaded) return;
    myNsfPlayer.runFrame();
    myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
    myNsfAudioHandler.nextBuffer();
}

function BulidMusicTabHtml() {
    $("#MusicEditTab ").empty();
    var musicstrs = ["队伍音乐:", "赛前会议:", "巴西会议:", "最后5分:", "5分进球:", "5分犯规:", "我方进球:", "敌方进球:", "LOGO音乐:", "升级音乐:", "战败音乐:", "解说音乐:", "中场会议:"];
    var temp1 = musicstrs[0] +"<select id='MusicTeamNameList' onchange='getTeamMusicVal()'></select><button musid='MusicNameList1' onclick='playmusic(this)'>播放队伍音乐</button><br><select id='MusicNameList1'></select><br>";
    var musictab = temp1+"<table style='border:1px solid' class='autotd'>";
    //musictab += "<tr><td>队伍名称:</td><td><select id='MusicTeamNameList' onchange='getTeamMusicVal()'></select></td></tr>";
    for (var i = 1; i < musicstrs.length; i++) {
        musictab += "<tr><td><button musid='MusicNameList" + (i + 1) + "' onclick='playmusic(this)'>试听</button></td><td>" + musicstrs[i] + "</td><td><select id='MusicNameList" + (i + 1) + "'></select></td></tr>";
    }
    musictab += "</table>";
    musictab += "<span>使用新的NSF播放器.(首次播放可能出现卡顿或杂音)</span><br>";
    musictab += "<button onclick='ChangeOrGetMusic(1)'>修改</button>  <button onclick='ChangeOrGetMusic(0)'>刷新</button>  <button onclick='CloseMusic()'>关闭音乐</button>";
    musictab += "<div id='musicloadplaydiv'></div>";
    musictab += "";

    $("#MusicEditTab ").html(musictab);

    for (var i = 0; i < teamlist.length; i++) {
        fillSelectlist_x($("#MusicTeamNameList"),i,teamlist[i]);
    }

    for (var w = 1; w <= 13; w++) {
        for (var i = 0; i < musicArr.length; i++) {
            fillSelectlist_x($("#MusicNameList" + w),i,musicArr[i]);
        }
    }

    $('#MusicTeamNameList').val('0000000');
    $('#MusicNameList1').val('0000000');
}

// Handle page visibility change to pause/resume music
(function () {
    document.addEventListener('visibilitychange', function () {
        if (!myNsfLoaded) return;
        if (document.hidden) {
            if (myNsfLoopId) { // Currently playing
                CloseMusic();
                myNsfPausedByVisibility = true;
            }
        } else {
            if (myNsfPausedByVisibility && myNsfLoaded) {
                // Resume playback
                // Pre-fill audio buffer
                for (var i = 0; i < 3; i++) {
                    myNsfPlayer.runFrame();
                    myNsfPlayer.getSamples(myNsfAudioHandler.sampleBuffer, myNsfAudioHandler.samplesPerFrame);
                    myNsfAudioHandler.nextBuffer();
                }
                if (myNsfAudioHandler.hasAudio) {
                    myNsfAudioHandler.start();
                    myNsfLastFrameTime = performance.now();
                    myNsfFrameResidue = 0;
                    myNsfLoopId = requestAnimationFrame(myNsfUpdate);
                }
                myNsfPausedByVisibility = false;
            }
        }
    });
})();