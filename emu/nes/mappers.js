//mapper接收的 rom 没有文件头,已经在loadrom的时候 去掉了  rom.subarray(header.base);
//注意 变量函数等命名方式,需要符合 nes/pipu.js nes/nes.js nes/cpu.js js/debugger.js
//由于主程序与mapper之间有相互调用的情况,所以函数方法命名方式必须与当前jsnes模拟器一致
//getRomAdr/ppuPeak 等函数 js/debugger.js 调试的时候会用到
//公用 CRC32校验函数calcCRC32用法 calcCRC32(this.prgRom);

let mappers = {
};
let loadingScripts = {}; // 新增：记录正在加载的mapper
// CRC32计算函数，用于特殊游戏识别
calcCRC32 = function (data) {
  let crcTable = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  //console.log("CRC32:", "0x" + ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0").toLowerCase());
  return (crc ^ 0xFFFFFFFF) >>> 0;
};
// 动态加载mapper，支持依赖（如195/198/74依赖4）
function loadMapper(mapperId, callback, _loading) {
  if (mappers[mapperId]) {
    callback();
    return;
  }
  // 支持常见mapper文件名（0~256）
  let mapperFileMap = {
    0: "nrom",
    1: "mmc1",
    2: "uxrom",
    3: "cnrom",
    4: "mmc3",
    7: "aorom",

    16: "bandai",
    23: "mapper23",
    24: "vrc6a",

    74: "mapper74",
    195: "mapper195",
    198: "mapper198"
  };
  // 依赖关系表（0~256）
  let mapperDeps = {
    4: undefined,
    74: 4,
    195: 4,
    198: 4,
  };
  // 防止循环依赖
  _loading = _loading || {};
  // 先加载依赖
  let dep = mapperDeps[mapperId];
  if (dep !== undefined && !mappers[dep]) {
    if (_loading[mapperId]) {
      callback(new Error("循环依赖: mapper" + mapperId));
      return;
    }
    // 递归加载依赖时，不提前设置_loading[mapperId]
    loadMapper(dep, function (err) {
      if (err) {
        callback(err);
        return;
      }
      // 依赖加载完再加载自身
      loadMapper(mapperId, callback, _loading);
    }, _loading);
    return;
  }
  // 到这里才真正开始加载自身，防止递归时误判
  if (_loading[mapperId]) {
    callback(new Error("循环依赖: mapper" + mapperId));
    return;
  }
  _loading[mapperId] = true;

  // 已有则直接回调
  if (mappers[mapperId]) {
    callback();
    return;
  }
  let file = mapperFileMap[mapperId] || ("mapper" + mapperId);
  let path = "mappers/" + file + ".js?v45";
  // 防止重复插入同一个script
  if (!loadingScripts[mapperId]) {
    loadingScripts[mapperId] = true;
    let script = document.createElement("script");
    script.src = path;
    script.onload = () => {
      // 等待脚本真正注册到 mappers
      let tryCount = 0;
      let maxTry = 50; // 最多等5秒
      function waitForRegister() {
        // 关键：依赖的 mappers[dep] 也要有值
        let dep = mapperDeps[mapperId];
        if ((dep === undefined || mappers[dep]) && mappers[mapperId]) {
          callback();
        } else if (++tryCount > maxTry) {
          callback(new Error("加载mapper失败: " + path + " 未注册或依赖未就绪"));
        } else {
          setTimeout(waitForRegister, 100);
        }
      }
      waitForRegister();
    };
    script.onerror = () => {
      callback(new Error("加载mapper失败: " + path));
    };
    document.head.appendChild(script);
  } else {
    // 已经在加载中，只等待注册
    let tryCount = 0;
    let maxTry = 50; // 最多等5秒
    function waitForRegister() {
      // 关键：依赖的 mappers[dep] 也要有值
      let dep = mapperDeps[mapperId];
      if ((dep === undefined || mappers[dep]) && mappers[mapperId]) {
        callback();
      } else if (++tryCount > maxTry) {
        callback(new Error("加载mapper失败: " + path + " 未注册或依赖未就绪"));
      } else {
        setTimeout(waitForRegister, 100);
      }
    }
    waitForRegister();
  }
}

// the mapper files will add to this array
