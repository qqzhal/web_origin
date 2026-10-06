# hook/ — CT2 采集脚本目录

模拟器增强脚本目录（与 `js/` 模拟器自有功能区分）。每个脚本独立 IIFE，
不改动任何模拟器 JS 的逻辑，仅在 `emu/index.html` 尾部加一行 `<script>` 挂载。

## ct2_recorder.js — 比赛事件采集器（v2）

为 `ct2_disasm` 反汇编工程的中文注释提供动态证据。参考原型：
`ct2_disasm/tools0/log_cmds_full.lua`（FCEUX 版指令面板日志），迁移到 web 内核并增强。

### 采集内容

| 类型 | 触发 | 内容 |
|---|---|---|
| CMD | 写钩子命中 $043B/$043C/$043D/$043E/$0441/$0442 | 攻指令/攻必杀/守指令/守必杀/球权/对位，旧值→新值+解码+触发PC+ROM定位+[玩家]/[引擎]标记 |
| SCORE | 轮询 $28/$29 | 比分变化 |
| BALL | 轮询 $05FB | 持球方易主 |
| STAGE | 轮询 $0026 | 关卡切换 |
| INPUT | 包装 setButtonPressed | A 键按下沿（附当时面板快照） |
| SNAP | 门将扑救锚点（**默认关闭**：`ENABLE_SNAP=false`，门将技能字段地址已定位、使命完成；需再捕捉时改 `true`） | $0300-$04FF RAM 快照（hex），扑救期间每 500ms 一份，事后 diff 抓技能字段 |
| SYS | 启动/ROM载入 | 会话与 ROM 版本（banks 数：32=origin / 80=game / 96=game2） |

[玩家]/[引擎] 判定：A 键按下后 500ms 内的写入 = 玩家确认（`who:'P'`），其余 = 引擎演算/AI（`who:'E'`）。

### 全平台启用（v18 起）

实测开销 <1%（热路径每条写内存指令只多一次数组比较），**手机/平板/电脑全平台开启采集**。
极端低端设备吃力时可把脚本内 `ENABLED` 改 `false` 整体关闭。
手机端注意：切后台时会额外保存一版数据（iOS 杀后台不走 beforeunload）；
不同设备的 localStorage 相互独立，各自生成独立会话，服务器数据天然按设备分组。

### 数据通道

1. **localStorage 自动攒数**（键 `ct2HookRecords`/`ct2HookSnaps`/`ct2HookSession`）：
   每 5 秒节流落盘 + beforeunload 兜底，页面刷新不丢；环形上限 8000 条/快照 200 份。
   同一会话跨刷新续传（session 持久化，超 6 小时自动换新会话）。
2. **自动上传** `../server/log_api.php`（默认开，30 秒增量批量，失败退避重试，不影响游戏）。
   服务器按 `UNIQUE(session_id, seq)` 幂等去重，存 MySQL `tszy2` 库的 `HookSession`/`HookLog` 表。

### 控制台 API（window.CT2Hook）

```js
CT2Hook.status()        // {session, romTag, records, snaps, uploadedUpTo, pending, hook}
CT2Hook.exportJSON()    // 全部记录导出为 JSON 字符串
CT2Hook.download()      // 触发浏览器下载 ct2_hook_<session>.json
CT2Hook.upload()        // 立即上传增量（返回 Promise）
CT2Hook.clear()         // 清空本地记录并开启新会话（必须换会话，见下方"已修复的坑"）
CT2Hook.newSession()    // 手动开启新会话（= clear）
CT2Hook.setAutoUpload(b)// 开关自动上传
CT2Hook.pause() / resume()
```

页面左下角有迷你面板（REC 状态 + 条数 + 上传/下载/清空按钮）。

### 记录字段与 src0 对齐

每条 CMD 记录的定位字段（web 内核独有，FCEUX Lua 拿不到 mapper 寄存器）：

- `pc`：触发写入的 CPU 地址（注意：写钩子触发时 PC 已推进到下一条指令，
  与 FCEUX 的时序未必逐字节一致，锚点匹配用 ±3 容差，raw 值已入日志可事后校准）
- `prg`：mapper195 `getRomAdr(pc)` 实时换算的 PRG 数据偏移（+16 = .nes 文件偏移）
- `hint`：src0 标签提示——$C000-$DFFF → `FIX_C_xxxx`，≥$E000 → `FIX_E_xxxx`，
  $8000-$BFFF → `bank_XX / B_XX_YYYY`（8K 库号 + $8000 基址库内偏移）

Python 对齐脚本按 `prg >> 13` 得 8K 库号定位 `src0/banks/bank_XX.asm`，库内偏移
`(prg & 0x1fff) | 0x8000` 匹配标签行。

### AI 配合工作流

- **被动采集**：AI 开页面载 ROM 挂好钩子 → 用户踢球 → AI `CT2Hook.upload()` 或
  直接 HTTP 拉 `server/log_api.php?action=download&session=xxx` → Python 对齐 → 注释提案
- **AI 自主**：poke $0026 跳关遍历、savestate 差分实验（门将扑救快照流已内置）
- **定向协作**：AI 发现事件缺口（无点球/无手球）后给用户"操作剧本"

### 已修复的坑（改这里之前先读）

1. **钩子链成环（致命）**：`nes.onwrite` 是单例属性，本脚本与 `ramwatch.js` 都用
   "抢头式"自愈定时器包装。ramwatch 旧版自愈只查"头是不是自己"不查整条链，两个脚本
   互相插头形成 `recorder → ramwatch → recorder → ...` 循环链——每条 CPU 写内存指令
   无限递归爆栈，而 `cpu.js` 的写路径 try/catch **静默吞异常**，所有 RAM 写入静默失败，
   表现为"游戏能开但逻辑全废"（PC 照样在动，极具迷惑性）。已修：两边 ensureHook 都
   遍历整条链查重（`chainHas`），链里有自己就不动。新增钩子脚本必须遵守同一约定。
2. **读档替换 nes.ram**：`setObjState` 读档时 `nes.ram` 会被换成新 Uint8Array(0x8000)，
   写钩子里不能缓存 ram 引用，每次都要 `ram = n.ram` 刷新。
3. **UI 高频刷新**：指令面板高峰期每秒数百条记录，pushRec 内不做 DOM 更新，
   由 1 秒定时器统一刷新面板文本。
4. **clear 必须换会话**：服务端按 `UNIQUE(session_id, seq)` 幂等去重，若清空本地后
   沿用旧会话，新记录 seq 从 1 重计会全部撞上旧数据的去重约束，上传永远被忽略。
   所以 `clear()` = `newSession()`（清数据 + 换会话 id，服务端旧会话数据不受影响）。

### 数据副本关系

上传是复制不是移动：本地 localStorage（主缓冲，环形 8000 条）清空只靠"清空"按钮；
服务器 MySQL 是只增副本（永不自动删除，AI 随时可拉）；`download()` 是把本地当前
数据一次性导出成文件，与服务器无关。本地被环形上限挤掉的最老记录，服务器上仍有。

### server/log_api.php

单文件 API（风格同 `server/index.php`），token 用 `.env` 的 `SYNC_TOKEN`（请求头 `X-Sync-Token`）：

- `?action=status`：概况
- `?action=upload`（POST）：`{session, meta:{romTag,ua,start}, items:[...]}`，幂等
- `?action=sessions`：会话列表（含条数/时间范围）
- `?action=download&session=xxx[&after_id=0][&limit=2000]`：增量拉取，行内含客户端全量字段

### 部署到正式服务器（ct2.qgsqw.com）的清单

- 需要 `HookSession` / `HookLog` 两张表——**本地与远程库均已建好**
  （远程 39.107.159.145 MySQL 8.0.46，2026-09-16 执行；幂等语句见
  `log_api.php` 的 `db()`，`CREATE TABLE IF NOT EXISTS` 随时可重放）
- 上传 `server/log_api.php` + `server/log_view.php`（游戏过程展示页）+
  `server/6502_table.php`（反汇编表）+ **`server/data/` 整目录**（约 26MB：
  三份 ROM + src0/src/src2 反汇编副本，自包含，服务器无需本机任何文件）。
  **注意 `.env` 是"重复键取最后一次"**——服务器上的 `.env` 若照搬本地的双段结构，
  PHP 会连到服务器自己的 localhost，部署时删掉本地参数块或调整顺序
- 上传 `emu/hook/ct2_recorder.js` + `emu/index.html` 的挂载行（RAM 便签 ramwatch.js 可选）
- AI 端拉取远程数据：`python tools0/fetch_hook_log.py --base https://ct2.qgsqw.com/server/log_api.php --list`
- 客户端到服务器的 MySQL 连接需 `--ssl-mode=DISABLED`（8.0 服务端与 5.7 客户端 SSL 协商报错）
- src0 反汇编加了中文注释后想同步到展示页：重新
  `cp ct2_disasm/srcX/banks/*.asm web/server/data/srcX/` 即可

## ramwatch.js

RAM 监视悬浮便签（v6+）：WATCH_LIST 维护监听地址，显示 RAM 真实值 vs 金手指生效读值、
写入/变化记录。钩子自愈逻辑已与 ct2_recorder.js 对齐（整链查重）。

## 当前状态与待办（2026-09-16 暂停点，供续接）

### 已完成
- 采集器 v7：指令面板/比分/球权/关卡/A键监听 + localStorage 攒数 + 自动上传，
  服务器（本地 + 远程 39.107.159.145）`HookSession`/`HookLog` 表已建
- $0026 已升级为写钩子监听（v6 起，带 PC + src0 标签提示；解码：0x00-0x20=第1-33关，
  0x21+ 标"超出原版33关!"）——传说之翼已实测捕到新增关卡值 **0x22=第35关**（Smu2vdap4 会话）
- 门将扑救快照流默认关闭（`ENABLE_SNAP=false`，技能字段地址已定位，使命完成）
- 取数/分析工具：`ct2_disasm/tools0/fetch_hook_log.py`（--list/--session/--all，归一化
  成本地导出同款 JSON 到 out0/hook_logs/）+ `analyze_hook_log.py`（出报告，核心是
  "写入者聚类"表=src0 注释素材）

### 未完成（明天续接）
1. ~~v7 单例锁接管验证~~ **已完成（2026-09-16 续接）**：leader/待命互斥 ✓、
   leader 死亡后待命页 ≤6s 接管 ✓、接管后 UI 正常刷新 ✓（v8 修复 buildUi 防重入——
   待命时已建面板，接管复用而非重建）。另发现 IAB 环境僵尸页面永久刷新旧锁键，
   v9 将锁键升级为 `ct2HookLeader2` 使其失效（真实浏览器无此问题，正常不用换键）。
   **注意**：页面可能缓存旧 index.html，验证时用 `?v=N` 参数强制绕缓存
2. **背景**：00:12/00:23 两个会话（Smu2vdap4/Smu2vrune）CMD=0，根因是多页面
   共享 localStorage 互踩覆盖（v7 心跳锁已修机制），这两个会话 BALL/INPUT/SCORE 仍有效
3. **待用户配合**：正式踢一场完整 origin（多射门/扑救/吃牌场景，**只开一个页面**），
   然后拉数据看写入者聚类 → 直接回填 `src0/banks/bank_1A`（比赛逻辑）/`bank_1C`
   （指令切换）的中文注释
4. **关卡分析线索**：v6+ 的关卡写入点（写 $0026 的 PC）攒几次数据后，顺藤摸
   "关卡数上限判断"（原版封顶 0x20 的 CMP），即 hack 扩关卡的关键改造点
5. **远程部署**：清单见上文，服务器 .env 记得删本地参数块（loadEnv 取最后一次出现）

### 踩坑记录（改代码前必读）
- 钩子链成环（致命，已修）：onwrite 单例 + 多脚本抢头，详见上文"已修复的坑"
- 读档替换 nes.ram（已修）：写钩子里每次 `ram = n.ram` 刷新
- localStorage 多页面互踩（已修）：v7 心跳锁单例采集，`ct2HookLeader` 键，
  心跳 2s/过期 6s/抢锁后 300ms 回读验证防竞态
- IAB 测试注意：tab.close() 不一定杀 JS，多 tab 测试先确认目标页面真实存活状态

## ramwatch.js v2 增强（2026-09-21）：写入 PC 标注 + PC 捕捉字段

在 WATCH_LIST 轮询监视基础上增强（不新增钩子文件）：

- **写入 PC 标注**：所有「写」日志行尾 `@XXXX` = 写入时刻 CPU PC（取指后位置 = 写入指令
  的下一条地址）。实现：写回调内读 `nes.cpu.br[0]`（同 ct2_recorder 手法）。
  用途：和反汇编对照、识别噪音源（如记分牌移位循环 PC=$CD34 一带的 `ROR $6C`）。
- **PC 捕捉字段**：WATCH_LIST 条目加可选 `pc` / `nth` 字段即成为捕捉行（行内金色「捕」列）。
  `pc` 数字=精确匹配、`[lo,hi]`=区间；`nth`=每第 N 次命中锁存一次（默认 1）。
  命中时变化记录记金色「锁」行 `锁 名字(地址) = 值 @PC`。
  用途：被大量代码复用的地址（如 $006C 被记分牌移位/多次乘法轮流写）只锁存
  "来自特定 PC 的那次写入"。示例：
  `{ addr: 0x006C, name: '防守数值', pc: [0x8D90, 0x8D93], nth: 1 }`

使用流程（$006C 防守数值）：先射门几次 → 看「写 $006C」日志里真值（值=界面显示数）
那行的 `@XXXX` → 把该 PC 填进条目 `pc` 字段 → 之后每次解算「捕」列自动刷新。

背景：$006C 是零页公用草稿（原版反汇编 ram_006C_temp），射门解算瞬间它是
"攻方随机加权 × 守方抵抗 >> 8"的乘积中间字节（fceux trace 已 7/7 验证与界面一致），
其余时间被记分牌移位等代码复用，纯轮询必然时对时错，必须按写入 PC 锚定。

### ramwatch v2.1：pcMark 标记 PC 字段（2026-09-21 实战校准）

实测发现更稳的捕捉锚点：$006C 的射门解算真值（如 0E=14 / 15=21，来自 @$CD34 的移位循环）
写完后，清场代码**固定写 00 @$CD15**。因此数第 N 次（pc+nth）不可靠，改用标记 PC：

```js
{ addr: 0x006C, name: '防守数值', pcMark: [0xCD13, 0xCD15] }
```

语义：当该地址出现来自标记 PC 区间的写入（即清场写 00）时，锁存**它的前一条写入**。
一条「锁」日志会带被捕获那条写入自己的 @PC（应为 $CD34 附近），便于核对。
若连续两条都是标记写（前一条也是 00@CD15），后一条自动跳过不锁。

### ramwatch v2.2：变化记录复制按钮（2026-09-21）

变化记录标题栏新增「复制」按钮：把当前记录导出为纯文本（一行一条：时间 + 类型 + 地址 + 值 + @PC），
clipboard API 不可用（http 环境）时自动回退 execCommand。替换掉同日的 group 分组合并方案（已移除）。

### ramwatch v2.3：pcMark 支持多标记（2026-09-21）

实测门将/射门与普通球员对抗的收尾写入 PC 不同（射门=清场写 00 @$CD15；球员对抗为另一 PC），
`pcMark` 升级为支持多标记，任一命中即锁存前一条写入：

```js
{ addr: 0x006C, name: '防守数值', pcMark: [[0xCD13, 0xCD15], [球员标记lo, hi]] }
```

单标记旧写法 `[lo,hi]` 与精确数字写法仍兼容。寻找球员标记 PC 的方法：过人遭遇时看
「写 $006C」日志，真值（=界面显示数）那一行**后面紧跟**的固定写入的 @PC 即为标记。

### ramwatch v2.4：stable 稳定锁存（2026-09-21，推荐用于防守数值）

实测发现 pcMark(CD15) 规则锁存的时机是"下一轮渲染开始"（清场 = 下一个防守者登场），
内容正确但**实时错位一位**（「捕」列总显示上一个防守者的值）。而防守值在自己的显示
窗口内会稳定保持数秒，因此新增 stable 字段——轮询发现"值变化后保持 stable 毫秒不动"
即锁存，与界面显示完全同步：

```js
{ addr: 0x006C, name: '防守数值', stable: 600 }
```

stable 与 pcMark 二选一：stable 对齐实时显示；pcMark 精确到事件但晚一轮。门将/普通
球员/多人遭遇通用，实测 [6,5,6,5] / [5,5,4,10] 两个四人遭遇序列全部正确捕获。

### ramwatch v2.5：$006C 最终形态——双条目分工（2026-09-21）

实测门将（射门）与普通球员（过人）两个场景的 $006C 行为不同，单一机制无法通吃：

- **射门/门将**：动画全程 $6C 被移位循环不停改写，防守值只在解算瞬间一闪而过 →
  用 `pcMark:[0xCD13,0xCD15]` 按清场 PC 锚定（稳定，已多次验证）
- **过人/普通球员**：防守值算完后稳定保持整个显示窗口 → 用 `stable:400` 轮询稳定锁存
  （与界面同步；600 偏慢改 400，移位链一帧内跑完所以安全）

最终配置为两条并存，名字区分场景：「门将防守」（pcMark）+「球员防守」（stable）。
球员防守行在门将射门时也可能锁到值（若解算后值恰好稳定），以「锁」日志 @PC 为准。

### ramwatch v2.6：guard 辅助判断 + 折叠条「锁」优先（2026-09-21）

问题：stable 规则无法区分防守者——门将射门时 $6C 同样会稳定，导致「球员防守」在门将
场景误锁，手机端折叠条被不重要的行占据。

**guard 字段**（WATCH_LIST 可选，锁存前校验 RAM 条件，数组=AND）：

```js
{ addr: 0x006C, name: '门将防守', pcMark: [0xCD13, 0xCD15],
  guard: [{ addr: 0x0442, any: [0x00, 0x0B] }] },   // 防守者是门将才锁
{ addr: 0x006C, name: '球员防守', stable: 400,
  guard: [{ addr: 0x0442, none: [0x00, 0x0B] }] },  // 防守者是普通球员才锁
```

依据：$0442 = 无球方球员号（ct2_recorder「对位」字段；反汇编 sub_8D06 门将分支
BEQ 0 / CPY #$0B 判定）。`any`/`none`/`eq`/`ne` 四种条件，数组条目 AND 组合。

**折叠条优先级**改为「锁」>「写」>「变」：捕捉值不会被后续写日志顶掉。

### ramwatch v2.7：门将防守武装窗（2026-09-21，修复球员行动误判）

$0442∈{0,0x0B} 是状态不是事件——门将碰球后长时间保持，其他球员行动期间 CD15 锁被误放行。
新增 `arm` 武装窗：锁存仅在"门将接管→球离门将手"序列内生效（锚点与 ct2_recorder SNAP 同源，
±3 容差）：开拍 = 写 $0442 @PC≈$8509；收尾 = 写 $0441 @PC≈$8E71/$DE17；maxMs 兜底超时。

```js
{ addr: 0x006C, name: '门将防守', pcMark: [0xCD13, 0xCD15],
  guard: [{ addr: 0x0442, any: [0x0B] }],
  arm: { maxMs: 40000, on: { addr: 0x0442, pc: [0x8509] },
         off: { addr: 0x0441, pc: [0x8E71, 0xDE17] } } }
```

guard 收窄为 any:[0x0B]（只攻对方球门，0x00=我方门将易与零值混淆已排除）。

### ramwatch v2.8：标题版本号 + 门将防守改锚 $0071（2026-09-21）

- 标题显示版本号（RAM 监视 v2.8），确认浏览器加载的是新代码（防缓存误判）
- 门将防守锚点更换：不再用 pcMark(CD15)（每轮渲染清场都触发，混入其他轮次残留），
  改为 pc 模式锚定 sub_8D06 结尾的 STA $71（1A:8D90，PC 落在 8D91-8D93）——
  每次守方解算恰好写一次，值 = min(对抗乘积>>8, $FF) = 界面显示的门将防守数，
  叠加 guard($0442=0x0B 敌门将) + arm(接管序列) 三重过滤

### ramwatch v2.9：silent 静默条目（2026-09-21）

$0071（守方解算出口）是通用对抗例程的出口地址，带球/拼抢时高频触发——「写」日志刷屏
属于正常信号但干扰阅读。WATCH_LIST 条目新增 `silent: true`：该地址不记「写/变」日志，
只参与捕捉锁存（锁存仍受 guard + arm 过滤）。「锁」行自带 @PC 便于核对。

### ramwatch v2.11：ctx 情境快照升级（2026-09-21，依据 Smu3j4vqz 实战报告）

- **锚点实战验证**：会话报告确认 $0442 对位写入聚类 `0F→0B @8509 ×6`（门将接管=arm 开拍）、
  `球权 13→03 @8E71 ×12`（球离手=arm 收尾），武装窗两锚点与实战完全吻合
- **$0442 值域结构确认**：0=我门 / 0x0B=敌门 / 01-0A=我方球员 / 0C-14=敌方球员
- **ctx「防」字段升级**：显示阵营归属（我门/敌门/我03/敌0D），不再只显示编号
- **修复**：ctx「权」字段——$05FB 在动画期间是移位状态码（$E8/$B4 等），非 0/0x0B 时
  原样显示原始值（与 ct2_recorder ballName 一致），不再错标阵营

## 核心新增：__vramTrap 花屏诊断写入流捕捉（nes.js，2026-09-21）

nes.js 写路径新增静默环形缓冲（65536 条，约覆盖最近 15 秒写入流），记录 CPU →
PPU 端口($2000/$2006/$2007) 与 切库寄存器(≥$8000) 的写入流（含 PC 与目标地址）。
**默认关闭（零开销）**，抓花屏时控制台：

```js
__vramTrap.on()              // 开启监听
// …复现 我方防守→铲球→按A …花屏出现的瞬间：
__vramTrap.mark('花屏')
__vramTrap.dumpMark(4000, 2000)   // 回看花屏前~后写入流
__vramTrap.stat()                 // 按 PC+区域 统计写 BG 次数（异常高者=嫌疑代码）
__vramTrap.off()                  // 用完关闭
```

实测每帧 PPU+切库写入约 55-75 条（Smu91nkuf 后续 dump），常开开销也仅 0.1% 量级；
已实测确认：花屏后游戏 vblank 不再写 BG 数据（稳态循环无 2007 数据写），
元凶写入发生在花屏瞬间，回看标记前后即可定位。
