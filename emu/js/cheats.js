var 指令文本 = ['射门', '抽射', '头球', '旋转射门', '旋转倒钩', '隼射', '隼抽射', '剃刀射门', '空中飓风', '双人射门', '双人飓风', '猎鹰射门', '猛虎射门', '新猛虎射门', '倒钩', '强力倒钩', '岬跳抽射', '旋转虎射', '飓风射门(超旋)', '佐野配合射门', '香蕉球', '奈依联合射门', '黄金之鹫', '魔幻冲击炮', '蛇形射门', '曲尺射门', '加农炮射门', '火焰射门', '炸弹头球', '大力头球', '火箭头球', '升龙脚', '脚后跟射门', '曲尺加农炮', '扎加罗射门', '传球', '旋转传球', '剃刀传球', '上旋传球', '过人', '挑球过人', '直线盘突', '魔幻突破', '分身过人', '高速突破', '刺猬盘带', '二过一', '黄金配合', '东邦配合', '双子攻击', '埃菲尔攻击', '停球', '漏球', '我方解围', '我方解围(暴力)', '挡球', '脸部挡球', '高空挡球', '大力挡球', '铲球', '高空铲球', '剃刀铲球', '大力铲球', '猛虎铲球', '铲球(暴力)', '截球', '高空断球', '敌方解围', '敌方解围(暴力)', '争抢', '争抢(暴力)', 'GK接球', '旋转扑', '分身扑', '大回转扑', 'GK击球', '三角扑', 'GK出击', 'GK防过人', 'GK防射门'];
// 比赛时间：[显示文本, 写入0x05F7的字节值]；该字节单位为10秒，'MM:SS'换算 = 分*6 + 秒/10
var gametime = [['00:00', 0x00], ['04:30', 0x1B], ['05:00', 0x1E], ['10:00', 0x3C], ['20:00', 0x78], ['30:00', 0xB4], ['35:00', 0xD2], ['40:00', 0xF0], ['42:30', 0xFF]];
// 进球数：[显示文本, 写入0x28/0x29的字节值]（与 天使之翼2.cht 的比分档位一致）
var 进球数列表 = [['99个进球', 0x63], ['80个进球', 0x50], ['60个进球', 0x3C], ['40个进球', 0x28], ['10个进球', 0x0A], ['5个进球', 0x05], ['3个进球', 0x03], ['2个进球', 0x02], ['1个进球', 0x01], ['0个进球', 0x00]];
//00
var playerstrtemp0 = '00 NPC';
//01-75
var playerstrtemp1 = '01 大空翼,02 雷纳托{守门员},03 利马,04 马里尼,05 阿马拉{圣保罗},06 多托尔{圣保罗},07 巴基斯塔,08 塔哈马塔,09 巴宾通{圣保罗},0A 吉乌,0B 普拉通,0C 浦边反次,0D 岸田猛,0E 中山政男,0F 森崎有三{守门员},10 高杉真吾,11 岬太郎,12 井泽守,13 泷一,14 石崎了,15 新田瞬,16 来生哲兵,17 立花政夫,18 立花和夫,19 佐野满,1A 日向小次郎,1B 早田诚,1C 次藤洋,1D 松山光,1E 反町一树,1F 泽田武志,20 三杉淳,21 若林源三{守门员},22 若岛津健{守门员},23 萨托尔斯蒂奇,24 利贝里奥,25 达·席尔瓦,26 曼昂{守门员},27 托尼尼奥,28 奈依,29 扎加罗,2A 迪乌塞乌,2B 卡洛斯,2C 桑塔玛利亚,2D 杰托里奥,2E 次藤洋{国见},2F 佐野满{国见},30 立花政夫{秋田商},31 立花和夫{秋田商},32 早田诚{立波},33 中西太一{守门员},34 三杉淳{武藏},35 松山光{富良野},36 日向小次郎{东邦},37 反町一树{东邦},38 泽田{东邦},39 若岛津健{东邦}{守门员},3A 兰皮昂,3B 拉蒙·比克多利诺,3C 达·席尔瓦{乌拉圭},3D 卡佩罗曼,3E 卡鲁茨,3F 梅兹,40 若林源三{汉堡}{守门员},41 日向小次郎{NPC.J.},42 新田瞬{NPC.J.},43 佐野满{NPC.J.},44 岬太郎{NPC.J.},45 三杉淳{NPC.J.},46 立花政夫{NPC.J.},47 立花和夫{NPC.J.},48 次藤洋{NPC.J.},49 石崎了{NPC.J.},4A 早田诚{NPC.J.},4B 松山光{NPC.J.},4C 若岛津健{NPC.J.}{守门员},4D 李汉内,4E 李汉坤,4F 夏,50 吉姆,51 麦哈,52 扎伊奇{守门员},53 罗利玛,54 罗伯逊,55 贝莱夫,56 拉辛{守门员},57 拿破仑,58 皮埃尔,59 埃斯帕尼亚,5A 兰皮欧{意大利},5B 海尔南迪斯{守门员},5C 依斯拉斯,5D 利布塔,5E 帕斯卡尔,5F 萨托尔斯蒂奇{阿根廷},60 迪亚斯,61 巴宾通{阿根廷},62 格尔班,63 施奈德,64 玛加斯,65 卡鲁茨{西德},66 梅兹{西德},67 谢斯塔,68 卡贝罗{西德},69 穆勒{守门员},6A 卡洛斯{巴西},6B 扎加罗{巴西},6C 利贝里奥{巴西},6D 奈依{巴西},6E 桑塔玛利亚{巴西},6F 托尼尼奥{巴西},70 多托尔{巴西},71 阿马拉{巴西},72 迪乌塞乌{巴西},73 杰托里奥{巴西},74 格尔迪斯{守门员},75 库因布拉';
//76-C7
var playerstrtemp2 = '76 弗卢米嫩塞 守门员,77 弗卢米嫩塞 后卫,78 弗卢米嫩塞 中卫、前锋,79 科林蒂安 守门员,7A 科林蒂安 后卫,7B 科林蒂安 中卫、前锋,7C 格雷米奥 后卫,7D 格雷米奥 中卫、前锋,7E 帕尔梅拉斯 守门员,7F 帕尔梅拉斯 后卫,80 帕尔梅拉斯 中卫、前锋,81 桑托斯 守门员,82 桑托斯 后卫,83 桑托斯 中卫、前锋,84 弗拉门戈 守门员,85 弗拉门戈 后卫,86 弗拉门戈 中卫、前锋,87 国见 守门员,88 国见 后卫,89 国见 中卫、前锋,8A 秋田商 守门员,8B 秋田商 后卫,8C 秋田商 中卫、前锋,8D 立波 后卫,8E 立波 中卫、前锋,8F 武藏 守门员,90 武藏 后卫,91 武藏 中卫、前锋,92 富良野 守门员,93 富良野 后卫,94 富良野 中卫、前锋,95 东邦 后卫,96 东邦 中卫、前锋,97 罗马 守门员,98 罗马 后卫,99 罗马 中卫、前锋,9A 乌拉圭 守门员,9B 乌拉圭 后卫,9C 乌拉圭 中卫、前锋,9D 汉堡 后卫,9E 汉堡 中卫、前锋,9F 叙利亚 守门员,A0 叙利亚 后卫,A1 叙利亚 中卫、前锋,A2 中国 守门员,A3 中国 后卫,A4 中国 中卫、前锋,A5 伊朗 守门员,A6 伊朗 后卫、前锋,A7 伊朗 中卫,A8 朝鲜 守门员,A9 朝鲜 后卫,AA 朝鲜 中卫、前锋,AB 沙特 守门员,AC 沙特 后卫,AD 沙特 中卫、前锋,AE 韩国 守门员,AF 韩国 后卫,B0 韩国 中卫、前锋,B1 瓦斯科·达·伽马 守门员,B2 瓦斯科·达·伽马 前锋、中后卫,B3 波兰 后卫,B4 波兰 中卫、前锋,B5 英格兰 守门员,B6 英格兰 后卫,B7 英格兰 中卫、前锋,B8 苏维埃 后卫,B9 苏维埃 中卫、前锋,BA 法国 守门员,BB 法国 后卫,BC 法国 中卫、前锋,BD 墨西哥 守门员,BE 墨西哥 后卫,BF 墨西哥 中卫、前锋,C0 意大利 后卫,C1 意大利 中卫、前锋,C2 荷兰 守门员,C3 荷兰 后卫,C4 荷兰 中卫、前锋,C5 阿根廷 守门员,C6 阿根廷 庶民,C7 西德 庶民';
var playerstr = (playerstrtemp0 + "," + playerstrtemp1 + "," + playerstrtemp2).split(",");
var teamlist = ['01关 弗卢米嫩塞', '02关 科林蒂安', '03关 格雷米奥', '04关 帕尔梅拉斯', '05关 桑托斯', '06关 弗拉门戈', '07关 国见', '08关 秋田', '09关 立波', '10关 武藏', '11关 富良野', '12关 东邦', '13关 罗马', '14关 乌拉圭', '15关 汉堡', '16关 日本', '17关 叙利亚', '18关 中国', '19关 伊朗', '20关 北朝鲜', '21关 沙特阿拉伯', '22关 韩国', '23关 瓦斯科·达·伽马', '24关 波兰', '25关 英格兰', '26关 苏联', '27关 法国', '28关 墨西哥', '29关 意大利', '30关 荷兰', '31关 阿根廷', '32关 西德', '33关 巴西', '34关 巴西(下)'];
var 射门指令=['00 射门','01 抽射','02 头球','03 旋转射门','04 旋转倒钩','05 隼射','06 隼抽射','07 剃刀射门','08 空中飓风','09 双人射门','0A 双人飓风','0B 猎鹰射门','0C 猛虎射门','0D 新猛虎射门','0E 倒钩','0F 强力倒钩','10 岬跳抽射','11 旋转虎射','12 飓风射门(超旋)','13 佐野配合射门','14 香蕉球','15 奈依联合射门','16 黄金之鹫','17 魔幻冲击炮','18 蛇形射门','19 曲尺射门','1A 加农炮射门','1B 火焰射门','1C 炸弹头球','1D 大力头球','1E 火箭头球','1F 升龙脚','20 脚后跟射门','21 曲尺加农炮','22 扎加罗射门','23','24','25','26','27','28','28','2A','2B','2C','2D','2E','2F'];
var 传球指令=['00 传球','01 旋转传球','02 剃刀传球','03 上旋传球','04','05','06','07','08','09','0A','0B','0C','0D','0E','0F'];
var 过人指令=['00 过人','01 挑球过人','02 直线盘突','03 魔幻突破','04 分身过人','05 高速突破','06 刺猬盘带','07','08','09','0A','0B','0C','0D','0E','0F'];
var 二过一指令=['00 二过一','01 黄金配合','02 东邦配合','03 双子攻击','04 埃菲尔攻击','05','06','07','08','09','0A','0B','0C','0D','0E','0F'];

var 挡球指令=['00 挡球','01 脸部挡球','02 高空挡球','03 大力挡球','04','05','06','07','08','09','0A','0B','0C','0D','0E','0F'];
var 铲球指令=['00 铲球','01 高空铲球','02 剃刀铲球','03 大力铲球','04 猛虎铲球','05 铲球(暴力)','06','07','08','09','0A','0B','0C','0D','0E','0F'];
var 截球指令=['00 截球','01 高空断球','02','03','04','05','06','07','08','09','0A','0B','0C','0D','0E','0F'];   

// 1. cheats_ct2 结构调整为 [{ enabled, name, codes: [{address, value, compare}] }]
// 我方11名球员等级选项（等级 -> RAM值）
var 等级列表 = [
  {text: '99级', value: 0x62},
  {text: '80级', value: 0x50},
  {text: '75级', value: 0x4B},
  {text: '70级', value: 0x46},
  {text: '65级', value: 0x41},
  {text: '60级', value: 0x3C},
  {text: '55级', value: 0x37},
  {text: '50级', value: 0x32},
  {text: '45级', value: 0x2D},
  {text: '40级', value: 0x28},
  {text: '35级', value: 0x23},
  {text: '33级', value: 0x21},
  {text: '30级', value: 0x1E},
  {text: '28级', value: 0x1C},
  {text: '25级', value: 0x19},
  {text: '23级', value: 0x17},
  {text: '20级', value: 0x14},
  {text: '18级', value: 0x12},
  {text: '15级', value: 0x0F},
  {text: '13级', value: 0x0D},
  {text: '10级', value: 0x0A},
  {text: '8级', value: 0x08},
  {text: '5级', value: 0x05},
  {text: '3级', value: 0x03}
];
// 我方经验+等级档位（10名球员经验值16位小端 + 11名球员等级）
var 经验等级档位 = [
  {text: '3级208', expLo: 0xD0, expHi: 0x00, lv: 0x02},
  {text: '5级528', expLo: 0x10, expHi: 0x02, lv: 0x04},
  {text: '8级1280', expLo: 0x00, expHi: 0x05, lv: 0x07},
  {text: '10级1920', expLo: 0x80, expHi: 0x07, lv: 0x09},
  {text: '13级3120', expLo: 0x30, expHi: 0x0C, lv: 0x0C},
  {text: '15级4000', expLo: 0xA0, expHi: 0x0F, lv: 0x0E},
  {text: '18级5456', expLo: 0x50, expHi: 0x15, lv: 0x11},
  {text: '20级6576', expLo: 0xB0, expHi: 0x19, lv: 0x13},
  {text: '23级8400', expLo: 0xD0, expHi: 0x20, lv: 0x16},
  {text: '25级9672', expLo: 0xC8, expHi: 0x25, lv: 0x18},
  {text: '28级11640', expLo: 0x78, expHi: 0x2D, lv: 0x1B},
  {text: '30级13000', expLo: 0xC8, expHi: 0x32, lv: 0x1D},
  {text: '33级15152', expLo: 0x30, expHi: 0x3B, lv: 0x20},
  {text: '35级16632', expLo: 0xF8, expHi: 0x40, lv: 0x22},
  {text: '38级19176', expLo: 0xE8, expHi: 0x4A, lv: 0x25},
  {text: '40级20912', expLo: 0xB0, expHi: 0x51, lv: 0x27},
  {text: '42级22784', expLo: 0x00, expHi: 0x59, lv: 0x29},
  {text: '45级26000', expLo: 0x90, expHi: 0x65, lv: 0x2C},
  {text: '48级29440', expLo: 0x00, expHi: 0x73, lv: 0x2F},
  {text: '50级31952', expLo: 0xD0, expHi: 0x7C, lv: 0x31},
  {text: '52级34688', expLo: 0x80, expHi: 0x87, lv: 0x33},
  {text: '55级39632', expLo: 0xD0, expHi: 0x9A, lv: 0x36},
  {text: '58级45504', expLo: 0xC0, expHi: 0xB1, lv: 0x39},
  {text: '60级49668', expLo: 0x04, expHi: 0xC2, lv: 0x3B},
  {text: '62级55200', expLo: 0xA0, expHi: 0xD7, lv: 0x3D},
  {text: '64级65535', expLo: 0xFF, expHi: 0xFF, lv: 0x3F}
];
// 对方等级档位：复用经验等级档位的 lv 值，文本去掉经验值部分
var 对方等级档位 = 经验等级档位.map(function (o) { return {text: o.text.split('级')[0] + '级', lv: o.lv}; });
var cheats_ct2 = [
    {
      enabled: false,
      name: "我方经验+等级",
      tiers: 经验等级档位,
      codes: [
        {address: 0x0454, value: 0xB0, key: 'expLo'}, {address: 0x0455, value: 0x51, key: 'expHi'},
        {address: 0x0456, value: 0xB0, key: 'expLo'}, {address: 0x0457, value: 0x51, key: 'expHi'},
        {address: 0x0458, value: 0xB0, key: 'expLo'}, {address: 0x0459, value: 0x51, key: 'expHi'},
        {address: 0x045A, value: 0xB0, key: 'expLo'}, {address: 0x045B, value: 0x51, key: 'expHi'},
        {address: 0x045C, value: 0xB0, key: 'expLo'}, {address: 0x045D, value: 0x51, key: 'expHi'},
        {address: 0x045E, value: 0xB0, key: 'expLo'}, {address: 0x045F, value: 0x51, key: 'expHi'},
        {address: 0x0460, value: 0xB0, key: 'expLo'}, {address: 0x0461, value: 0x51, key: 'expHi'},
        {address: 0x0462, value: 0xB0, key: 'expLo'}, {address: 0x0463, value: 0x51, key: 'expHi'},
        {address: 0x0464, value: 0xB0, key: 'expLo'}, {address: 0x0465, value: 0x51, key: 'expHi'},
        {address: 0x0466, value: 0xB0, key: 'expLo'}, {address: 0x0467, value: 0x51, key: 'expHi'},
        {address: 0x0303, value: 0x27, key: 'lv'}, {address: 0x030F, value: 0x27, key: 'lv'},
        {address: 0x031B, value: 0x27, key: 'lv'}, {address: 0x0327, value: 0x27, key: 'lv'},
        {address: 0x0333, value: 0x27, key: 'lv'}, {address: 0x033F, value: 0x27, key: 'lv'},
        {address: 0x034B, value: 0x27, key: 'lv'}, {address: 0x0357, value: 0x27, key: 'lv'},
        {address: 0x0363, value: 0x27, key: 'lv'}, {address: 0x036F, value: 0x27, key: 'lv'},
        {address: 0x037B, value: 0x27, key: 'lv'}
      ]
    },
    {
      enabled: false,
      name: "对方11名球员等级",
      tiers: 对方等级档位,
      codes: [
        {address: 0x0387, value: 0x3F, key: 'lv'}, {address: 0x0393, value: 0x3F, key: 'lv'},
        {address: 0x039F, value: 0x3F, key: 'lv'}, {address: 0x03AB, value: 0x3F, key: 'lv'},
        {address: 0x03B7, value: 0x3F, key: 'lv'}, {address: 0x03C3, value: 0x3F, key: 'lv'},
        {address: 0x03CF, value: 0x3F, key: 'lv'}, {address: 0x03DB, value: 0x3F, key: 'lv'},
        {address: 0x03E7, value: 0x3F, key: 'lv'}, {address: 0x03F3, value: 0x3F, key: 'lv'},
        {address: 0x03FF, value: 0x3F, key: 'lv'}
      ]
    },
    {enabled: false, name: "选关", codes: [{address: 0x0026, value: 0x00}]},
    //{enabled: false, name: "射门指令", codes: [{address: 0x043C, value: 0x00}]},
    {enabled: false, name: "比赛时间", codes: [{address: 0x05F7, value: 0xB4}]},
    {enabled: false, name: "我方进球数", codes: [{address: 0x0028, value: 0x00}]},
    {enabled: false, name: "敌方进球数", codes: [{address: 0x0029, value: 0x00}]}, 
    /*
    {enabled: false, name: "我方GK选人", codes: [{address: 0x0300, value: 0x21}]},
    {enabled: false, name: "我方02号选人", codes: [{address: 0x030C, value: 0x15}]},
    {enabled: false, name: "我方03号选人", codes: [{address: 0x0318, value: 0x15}]},
    {enabled: false, name: "我方04号选人", codes: [{address: 0x0324, value: 0x15}]},
    {enabled: false, name: "我方05号选人", codes: [{address: 0x0330, value: 0x15}]},
    {enabled: false, name: "我方06号选人", codes: [{address: 0x033C, value: 0x15}]},
    {enabled: false, name: "我方07号选人", codes: [{address: 0x0348, value: 0x15}]},
    {enabled: false, name: "我方08号选人", codes: [{address: 0x0354, value: 0x15}]},
    {enabled: false, name: "我方09号选人", codes: [{address: 0x0360, value: 0x15}]},
    {enabled: false, name: "我方10号选人", codes: [{address: 0x036C, value: 0x15}]},
    {enabled: false, name: "我方11号选人", codes: [{address: 0x0378, value: 0x15}]},
    */
    /*
    {
      enabled: false,
      name: "我方11名球员等级",
      codes: [
        {address: 0x0303, value: 0x62}, {address: 0x030F, value: 0x62},
        {address: 0x031B, value: 0x62}, {address: 0x0327, value: 0x62},
        {address: 0x0333, value: 0x62}, {address: 0x033F, value: 0x62},
        {address: 0x034B, value: 0x62}, {address: 0x0357, value: 0x62},
        {address: 0x0363, value: 0x62}, {address: 0x036F, value: 0x62},
        {address: 0x037B, value: 0x62}
      ]
    },
    */
    {enabled: false, name: "锁定场地（传说之翼）1正0反", codes: [{address: 0x6356, value: 0x01}]},
    {enabled: false, name: "锁定场地（纵横天下）1正0反", codes: [{address: 0x7F61, value: 0x01}]},
];



document.getElementById('ct2cheat').onclick = function() {
    const cheatDiv = document.getElementById('cheatdiv');
    const dropdown = document.getElementById('menu-dropdown');
    const backdrop = document.getElementById('menu-backdrop');
    const toggle = document.getElementById('menu-toggle');

    // 先显示并转移焦点到金手指面板，避免 aria-hidden 时焦点仍在菜单内
    if (cheatDiv) {
        cheatDiv.style.display = 'flex';
        try { cheatDiv.focus({ preventScroll: true }); } catch (e) { try { cheatDiv.focus(); } catch (e2) {} }
    }

    // 再关闭菜单弹层与遮罩
    if (dropdown) {
        dropdown.classList.remove('show');
        dropdown.setAttribute('aria-hidden', 'true');
        dropdown.setAttribute('hidden', '');
        dropdown.style.top = '';
        dropdown.style.bottom = '';
        dropdown.style.left = '';
        dropdown.style.right = '';
    }
    if (backdrop) {
        backdrop.classList.remove('show');
        backdrop.setAttribute('hidden', '');
    }
    if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
    }
};

// 金手指面板样式（只注入一次；视觉风格与 menus.css 的菜单弹层保持一致）
function injectCheatStyles() {
    if (document.getElementById('ct2cheat-style')) return;
    const style = document.createElement('style');
    style.id = 'ct2cheat-style';
    style.textContent = `
    #cheatdiv {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      flex-direction: column;
      width: min(560px, 92vw);
      max-height: min(80vh, 640px);
      padding: 18px 20px 16px;
      background: linear-gradient(165deg, rgba(30, 36, 48, 0.97), rgba(11, 15, 20, 0.98));
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      z-index: 20020; /* 高于菜单与遮罩，确保可点击 */
      overflow: hidden;
      animation: ct2-pop 0.22s ease;
      user-select: none;
      -webkit-user-select: none;
    }
    #cheatdiv * { box-sizing: border-box; }
    @keyframes ct2-pop {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    .ct2-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex: none;
    }
    .ct2-title-main {
      display: block;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: linear-gradient(90deg, #ffd54a, #ffb347);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .ct2-title-sub {
      display: block;
      margin-top: 5px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.55);
    }
    .ct2-close {
      appearance: none;
      background: rgba(255, 255, 255, 0.12);
      border: none;
      color: #fff;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      transition: background 0.2s ease, transform 0.1s ease;
    }
    .ct2-close:hover { background: rgba(255, 255, 255, 0.28); }
    .ct2-close:active { transform: scale(0.92); }
    .ct2-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 12px 2px 14px;
      padding-right: 4px;
    }
    .ct2-list::-webkit-scrollbar { width: 8px; }
    .ct2-list::-webkit-scrollbar-track { background: transparent; }
    .ct2-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 4px; }
    .ct2-list::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.32); }
    .ct2-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .ct2-item:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .ct2-item input[type=checkbox] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #ffd54a;
      cursor: pointer;
      flex: none;
    }
    .ct2-item label {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      cursor: pointer;
    }
    .ct2-item select {
      appearance: none;
      background: rgba(255, 255, 255, 0.08) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 8px center;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 6px;
      padding: 5px 24px 5px 9px;
      font-size: 12px;
      max-width: 168px;
      cursor: pointer;
      flex: none;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .ct2-item select:hover {
      background-color: rgba(255, 255, 255, 0.14);
      border-color: rgba(255, 255, 255, 0.32);
    }
    .ct2-item select option { color: #111; background: #fff; }
    .ct2-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex: none;
    }
    .ct2-btn {
      appearance: none;
      border: none;
      border-radius: 8px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3px;
      cursor: pointer;
      transition: filter 0.15s ease, background 0.15s ease, color 0.15s ease, transform 0.08s ease;
    }
    .ct2-btn:active { transform: scale(0.96); }
    .ct2-btn-primary {
      background: linear-gradient(135deg, #2ecc71, #1ea85c);
      color: #fff;
      box-shadow: 0 4px 14px rgba(46, 204, 113, 0.28);
    }
    .ct2-btn-primary:hover { filter: brightness(1.12); }
    .ct2-btn-ghost {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .ct2-btn-ghost:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
    @media (max-width: 640px) {
      #cheatdiv { width: 94vw; padding: 14px 14px 12px; }
      .ct2-item select { max-width: 132px; }
      .ct2-btn { padding: 10px 16px; font-size: 14px; }
    }
  `;
    document.head.appendChild(style);
}

function bindCheat() {
    if (!document.getElementById('cheatdiv')) {
        injectCheatStyles();

        const cheatDiv = document.createElement('div');
        cheatDiv.id = 'cheatdiv';
        cheatDiv.style.display = 'none';
        cheatDiv.tabIndex = -1; // 允许转移焦点到面板，配合 aria-hidden 顺序避免警告

        // 头部：标题 + 关闭按钮
        const header = document.createElement('div');
        header.className = 'ct2-header';

        const title = document.createElement('div');
        title.className = 'ct2-title';
        title.innerHTML = '<span class="ct2-title-main">天使之翼2专用金手指</span><span class="ct2-title-sub">勾选后点击「应用金手指」即可生效，部分功能需在比赛中使用</span>';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ct2-close';
        closeBtn.type = 'button';
        closeBtn.innerText = '×';
        closeBtn.setAttribute('aria-label', '关闭');
        closeBtn.onclick = function() {
            cheatDiv.style.display = 'none';
        };
        header.appendChild(closeBtn);

        cheatDiv.appendChild(header);

        // 金手指列表
        const cheatsList = document.createElement('div');
        cheatsList.id = 'ct2cheatlist';
        cheatsList.className = 'ct2-list';
        cheatDiv.appendChild(cheatsList);

        // 底部操作栏：全部取消 + 应用
        const footer = document.createElement('div');
        footer.className = 'ct2-footer';

        const cancelAll = document.createElement('button');
        cancelAll.className = 'ct2-btn ct2-btn-ghost';
        cancelAll.type = 'button';
        cancelAll.innerText = '全部取消';
        cancelAll.onclick = function () {
            cheatDiv.querySelectorAll('input[type=checkbox][data-ct2cheat]').forEach(cb => cb.checked = false);
        };
        footer.appendChild(cancelAll);

        const applyBtn = document.createElement('button');
        applyBtn.className = 'ct2-btn ct2-btn-primary';
        applyBtn.type = 'button';
        applyBtn.innerText = '应用金手指';
        applyBtn.onclick = function() {
            applyCT2Cheats();
        };
        footer.appendChild(applyBtn);

        cheatDiv.appendChild(footer);

        var container = document.getElementById('fullscreenContainer') || document.body;
        container.appendChild(cheatDiv);
    }

    // 渲染金手指项
    const cheatsList = document.getElementById('ct2cheatlist');
    if (cheatsList) {
        cheatsList.innerHTML = '';
        cheats_ct2.forEach((item, idx) => {
            const line = document.createElement('div');
            line.className = 'ct2-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.ct2cheat = '1';
            cb.id = 'ct2cheat_cb_' + idx;
            cb.checked = !!item.enabled;
            line.appendChild(cb);

            const label = document.createElement('label');
            label.htmlFor = cb.id;
            label.innerText = item.name;
            line.appendChild(label);

            // select 下拉框
            const select = document.createElement('select');
            let options = [];
            // 根据金手指类型填充 options
            if (item.name === "选关") {
                options = teamlist.map((txt, i) => ({text: txt, value: i}));
            } else if (item.name === "射门指令") {
                options = 指令文本.map((txt, i) => ({text: txt, value: i}));
            } else if (item.name === "比赛时间") {
                options = gametime.map(([txt, v]) => ({text: txt, value: v}));
            } else if (item.name === "我方进球数" || item.name === "敌方进球数") {
                options = 进球数列表.map(([txt, v]) => ({text: txt, value: v}));
            } else if (item.name === "我方11名球员等级") {
                options = 等级列表.map(o => ({text: o.text, value: o.value}));
            } else if (item.tiers) {
                // 档位型多字段金手指：选项值为档位索引
                options = item.tiers.map((o, i) => ({text: o.text, value: i}));
            } else if (/我方(GK|0[2-9]|1[0-1])号选人/.test(item.name)||/我方(GK|0[2-9]|1[0-1])选人/.test(item.name)) {
                options = playerstr.map((txt, i) => ({text: txt, value: i}));
            }
            // 默认选中当前 value
            if (options.length > 0) {
                options.forEach(opt => {
                    const op = document.createElement('option');
                    op.value = opt.value;
                    op.text = opt.text;
                    if (item.tiers) {
                        // 档位型多字段金手指，默认选中最高档（最后一个）
                        op.selected = (opt.value === options.length - 1);
                    } else if (item.codes && item.codes[0] && opt.value == item.codes[0].value) {
                        // 取第一个 code 的 value
                        op.selected = true;
                    }
                    select.appendChild(op);
                });
                // select 变更时，更新 cheats_ct2
                select.onchange = function() {
                    if (item.tiers) {
                        // 档位型多字段金手指：按每个 code 的 key 从档位取对应值
                        const slot = item.tiers[Number(this.value)];
                        if (slot && item.codes && item.codes.length) {
                            item.codes.forEach(code => {
                                if (code.key) code.value = slot[code.key];
                            });
                            nes.setCT2Cheats(cheats_ct2);
                        }
                    } else if (item.codes && item.codes.length) {
                        // 多地址金手指（如球员等级）需同步更新所有 codes
                        item.codes.forEach(code => { code.value = Number(this.value); });
                        nes.setCT2Cheats(cheats_ct2);
                    }
                };
                line.appendChild(select);
            }

            cheatsList.appendChild(line);
        });
    }
}

// 应用金手指到游戏
function applyCT2Cheats() {
    // 读取勾选状态
    const cbs = document.querySelectorAll('input[type=checkbox][data-ct2cheat]');
    cbs.forEach((cb, idx) => {
        cheats_ct2[idx].enabled = cb.checked;
    });
   nes.setCT2Cheats(cheats_ct2);
    log('金手指已应用！', "chectCT2");
}

// 初始化
bindCheat();
if (typeof nes !== 'undefined') {
    nes.setCT2Cheats(cheats_ct2);
}
