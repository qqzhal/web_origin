var 指令文本 = ['射门', '抽射', '头球', '旋转射门', '旋转倒钩', '隼射', '隼抽射', '剃刀射门', '空中飓风', '双人射门', '双人飓风', '猎鹰射门', '猛虎射门', '新猛虎射门', '倒钩', '强力倒钩', '岬跳抽射', '旋转虎射', '飓风射门(超旋)', '佐野配合射门', '香蕉球', '奈依联合射门', '黄金之鹫', '魔幻冲击炮', '蛇形射门', '曲尺射门', '加农炮射门', '火焰射门', '炸弹头球', '大力头球', '火箭头球', '升龙脚', '脚后跟射门', '曲尺加农炮', '扎加罗射门', '传球', '旋转传球', '剃刀传球', '上旋传球', '过人', '挑球过人', '直线盘突', '魔幻突破', '分身过人', '高速突破', '刺猬盘带', '二过一', '黄金配合', '东邦配合', '双子攻击', '埃菲尔攻击', '停球', '漏球', '我方解围', '我方解围(暴力)', '挡球', '脸部挡球', '高空挡球', '大力挡球', '铲球', '高空铲球', '剃刀铲球', '大力铲球', '猛虎铲球', '铲球(暴力)', '截球', '高空断球', '敌方解围', '敌方解围(暴力)', '争抢', '争抢(暴力)', 'GK接球', '旋转扑', '分身扑', '大回转扑', 'GK击球', '三角扑', 'GK出击', 'GK防过人', 'GK防射门'];
var gametime = ['00:00', '00:10', '00:20', '00:30', '00:40', '00:50', '01:00', '01:10', '01:20', '01:30', '01:40', '01:50', '02:00', '02:10', '02:20', '02:30', '02:40', '02:50', '03:00', '03:10', '03:20', '03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30', '04:40', '04:50', '05:00', '05:10', '05:20', '05:30', '05:40', '05:50', '06:00', '06:10', '06:20', '06:30', '06:40', '06:50', '07:00', '07:10', '07:20', '07:30', '07:40', '07:50', '08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00', '09:10', '09:20', '09:30', '09:40', '09:50', '10:00', '10:10', '10:20', '10:30', '10:40', '10:50', '11:00', '11:10', '11:20', '11:30', '11:40', '11:50', '12:00', '12:10', '12:20', '12:30', '12:40', '12:50', '13:00', '13:10', '13:20', '13:30', '13:40', '13:50', '14:00', '14:10', '14:20', '14:30', '14:40', '14:50', '15:00', '15:10', '15:20', '15:30', '15:40', '15:50', '16:00', '16:10', '16:20', '16:30', '16:40', '16:50', '17:00', '17:10', '17:20', '17:30', '17:40', '17:50', '18:00', '18:10', '18:20', '18:30', '18:40', '18:50', '19:00', '19:10', '19:20', '19:30', '19:40', '19:50', '20:00', '20:10', '20:20', '20:30', '20:40', '20:50', '21:00', '21:10', '21:20', '21:30', '21:40', '21:50', '22:00', '22:10', '22:20', '22:30', '22:40', '22:50', '23:00', '23:10', '23:20', '23:30', '23:40', '23:50', '24:00', '24:10', '24:20', '24:30', '24:40', '24:50', '25:00', '25:10', '25:20', '25:30', '25:40', '25:50', '26:00', '26:10', '26:20', '26:30', '26:40', '26:50', '27:00', '27:10', '27:20', '27:30', '27:40', '27:50', '28:00', '28:10', '28:20', '28:30', '28:40', '28:50', '29:00', '29:10', '29:20', '29:30', '29:40', '29:50', '30:00', '30:10', '30:20', '30:30', '30:40', '30:50', '31:00', '31:10', '31:20', '31:30', '31:40', '31:50', '32:00', '32:10', '32:20', '32:30', '32:40', '32:50', '33:00', '33:10', '33:20', '33:30', '33:40', '33:50', '34:00', '34:10', '34:20', '34:30', '34:40', '34:50', '35:00', '35:10', '35:20', '35:30', '35:40', '35:50', '36:00', '36:10', '36:20', '36:30', '36:40', '36:50', '37:00', '37:10', '37:20', '37:30', '37:40', '37:50', '38:00', '38:10', '38:20', '38:30', '38:40', '38:50', '39:00', '39:10', '39:20', '39:30', '39:40', '39:50', '40:00', '40:10', '40:20', '40:30', '40:40', '40:50', '41:00', '41:10', '41:20', '41:30', '41:40', '41:50', '42:00', '42:10', '42:20', '42:30'];
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
var cheats_ct2 = [
    {enabled: false, name: "选关", codes: [{address: 0x0026, value: 0x00}]},
    {enabled: false, name: "射门指令", codes: [{address: 0x043C, value: 0x00}]},
    {enabled: false, name: "比赛时间", codes: [{address: 0x05F7, value: 0xB4}]},
    {enabled: false, name: "我方进球数", codes: [{address: 0x0028, value: 0x00}]},
    {enabled: false, name: "敌方进球数", codes: [{address: 0x0029, value: 0x00}]},   
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
    {enabled: false, name: "我方11号选人", codes: [{address: 0x0378, value: 0x15}]}
];



document.getElementById('ct2cheat').onclick = function() {
    const cheatDiv = document.getElementById('cheatdiv');
    const dropdown = document.getElementById('menu-dropdown');
    const backdrop = document.getElementById('menu-backdrop');
    const toggle = document.getElementById('menu-toggle');

    // 先显示并转移焦点到金手指面板，避免 aria-hidden 时焦点仍在菜单内
    if (cheatDiv) {
        cheatDiv.style.display = 'block';
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

function bindCheat() {
    if (!document.getElementById('cheatdiv')) {
        const cheatDiv = document.createElement('div');
        cheatDiv.id = 'cheatdiv';
        cheatDiv.style.display = 'none';
        cheatDiv.style.position = 'fixed';
        cheatDiv.style.left = '50%';
        cheatDiv.style.top = '50%';
        cheatDiv.style.transform = 'translate(-50%,-50%)';
        cheatDiv.style.background = '#222';
        cheatDiv.style.color = '#fff';
        cheatDiv.style.padding = '24px 32px 16px 32px';
        cheatDiv.style.borderRadius = '12px';
        cheatDiv.style.boxShadow = '0 4px 24px #000a';
        cheatDiv.style.zIndex = 20020; // 高于菜单与遮罩，确保可点击
        cheatDiv.style.minWidth = '320px';
        cheatDiv.style.maxWidth = '90vw';
        cheatDiv.style.maxHeight = '80vh';
        cheatDiv.style.overflowY = 'auto';
        cheatDiv.tabIndex = -1; // 允许转移焦点到面板，配合 aria-hidden 顺序避免警告

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerText = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '8px';
        closeBtn.style.right = '12px';
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.border = 'none';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = function() {
            cheatDiv.style.display = 'none';
        };
        cheatDiv.appendChild(closeBtn);

        // 标题
        const title = document.createElement('div');
        title.innerHTML = "<b>天使之翼2专用金手指</b><br><small>勾选后点击应用即可生效，部分功能需在比赛中使用</small>";
        title.style.marginBottom = '12px';
        cheatDiv.appendChild(title);

        // 全部取消
        const cancelAll = document.createElement('button');
        cancelAll.innerText = '全部取消';
        cancelAll.style.marginBottom = '8px';
        cancelAll.onclick = function () {
            cheatDiv.querySelectorAll('input[type=checkbox][data-ct2cheat]').forEach(cb => cb.checked = false);
        };
        cheatDiv.appendChild(cancelAll);

        // 应用按钮
        const applyBtn = document.createElement('button');
        applyBtn.innerText = '应用金手指';
        applyBtn.style.marginTop = '8px';
        applyBtn.onclick = function() {
            applyCT2Cheats();
        };
        cheatDiv.appendChild(applyBtn);

        // 金手指列表
        const cheatsList = document.createElement('div');
        cheatsList.id = 'ct2cheatlist';
        cheatsList.style.margin = '10px 0 10px 0';
        cheatDiv.appendChild(cheatsList);

        var container = document.getElementById('fullscreenContainer') || document.body;
        container.appendChild(cheatDiv);
    }

    // 渲染金手指项
    const cheatsList = document.getElementById('ct2cheatlist');
    if (cheatsList) {
        cheatsList.innerHTML = '';
        cheats_ct2.forEach((item, idx) => {
            const line = document.createElement('div');
            line.style.marginBottom = '4px';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.ct2cheat = '1';
            cb.id = 'ct2cheat_cb_' + idx;
            cb.checked = !!item.enabled;
            line.appendChild(cb);

            const label = document.createElement('label');
            label.htmlFor = cb.id;
            label.innerText = item.name;
            label.style.marginLeft = '6px';
            line.appendChild(label);

            // select 下拉框
            const select = document.createElement('select');
            select.style.marginLeft = '10px';
            let options = [];
            // 根据金手指类型填充 options
            if (item.name === "选关") {
                options = teamlist.map((txt, i) => ({text: txt, value: i}));
            } else if (item.name === "射门指令") {
                options = 指令文本.map((txt, i) => ({text: txt, value: i}));
            } else if (item.name === "比赛时间") {
                options = gametime.map((txt, i) => ({text: txt, value: i}));
            } else if (item.name === "我方进球数" || item.name === "敌方进球数") {
                options = Array.from({length: 256}, (_, i) => ({text: i, value: i}));
            } else if (/我方(GK|0[2-9]|1[0-1])号选人/.test(item.name)||/我方(GK|0[2-9]|1[0-1])选人/.test(item.name)) {
                options = playerstr.map((txt, i) => ({text: txt, value: i}));
            }
            // 默认选中当前 value
            if (options.length > 0) {
                options.forEach(opt => {
                    const op = document.createElement('option');
                    op.value = opt.value;
                    op.text = opt.text;
                    // 取第一个 code 的 value
                    if (item.codes && item.codes[0] && opt.value == item.codes[0].value) {
                        op.selected = true;
                    }
                    select.appendChild(op);
                });
                // select 变更时，更新 cheats_ct2
                select.onchange = function() {
                    if (item.codes && item.codes[0]) {
                        item.codes[0].value = Number(this.value);
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