// CT2 工具面板 - 提供写内存 (poke) 与触发 CPU 执行的简易 UI
(function(){
  function createCT2ToolsUI(){
    // 如果已经存在则不重复创建
    if(document.getElementById('ct2ToolsContainer')) return;

    const container = document.createElement('div');
    container.id = 'ct2ToolsContainer';
    container.style.cssText = `position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%);
      background: rgba(12,13,15,0.95); color: #fff; z-index: 11000; border:1px solid #444; border-radius:8px; width:520px; max-width:calc(100vw - 24px);`;

    const content = document.createElement('div');
    content.style.cssText = 'padding:12px; font-family: Arial, Helvetica, sans-serif; font-size:13px;';

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>CT2 工具面板</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="ct2ToolsClose" style="background:#e53935;color:#fff;border:none;padding:6px 8px;border-radius:6px;">关闭</button>
        </div>
      </div>
      <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;">
        <div id="ct2_mapperInfo" style="font-size:12px;color:#cfd8dc;flex:1">Mapper: 未检测</div>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="ct2_frames" placeholder="帧数 (例如 5)" style="width:80px;padding:6px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
          <button id="ct2_runFrames" style="padding:6px;border-radius:6px;background:#388E3C;border:none;color:#fff;">运行帧</button>
        </div>
      </div>

      <div style="margin-bottom:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <div style="font-size:12px;color:#cfd8dc;margin-bottom:6px;">内存写入 (十六进制)</div>
          <input id="ct2_addr" placeholder="地址 (例如 0448)" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
          <input id="ct2_val" placeholder="值 (例如 80 或 0x80)" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;margin-top:6px;">
          <button id="ct2_write" style="margin-top:8px;padding:8px;border-radius:6px;background:#1976D2;border:none;color:#fff;width:100%;">写入内存 (window.nes.write)</button>
        </div>
        <div>
          <div style="font-size:12px;color:#cfd8dc;margin-bottom:6px;">CPU 触发（跳转/JSR）</div>
          <select id="ct2_execMode" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;margin-bottom:6px;">
            <option value="jmp">JMP (直接跳转)</option>
            <option value="jsr">JSR (子程序调用)</option>
            <option value="setpc">SET PC (直接设置 PC 寄存器)</option>
          </select>
          <input id="ct2_execAddr" placeholder="地址 (例如 0x8000 或 8000)" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;margin-bottom:6px;">
          <button id="ct2_exec" style="padding:8px;border-radius:6px;background:#4CAF50;border:none;color:#fff;width:100%;">执行</button>
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:12px;color:#cfd8dc;margin-bottom:6px;">预设动作</div>
        <select id="ct2_presets" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;margin-bottom:6px;">
          <option value="">-- 选择预设 --</option>
        </select>
        <button id="ct2_applyPreset" style="padding:8px;border-radius:6px;background:#FF9800;border:none;color:#111;width:100%;">应用预设</button>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input id="ct2_attack_action" placeholder="动作值 (043B，默认 2)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
          <input id="ct2_attack_sub" placeholder="子类型 (043C，默认 0)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
        </div>
        <button id="ct2_trigger_attack" style="margin-top:6px;padding:8px;border-radius:6px;background:#8E24AA;border:none;color:#fff;width:100%;">一键 安全触发 (043B/043C)</button>
      </div>

      <div style="font-size:12px;color:#cfd8dc;margin-bottom:6px;">日志</div>
      <div id="ct2_log" style="height:140px;overflow:auto;background:#0b0b0b;border:1px solid #222;padding:8px;border-radius:6px;font-family:monospace;font-size:12px;color:#9e9e9e;"></div>
      <div style="margin-top:8px;border-top:1px solid #222;padding-top:8px;">
        <div style="font-size:12px;color:#cfd8dc;margin-bottom:6px;">高级操作 (仅在本面板打开时生效)</div>
        <div style="display:flex;gap:8px;margin-bottom:6px;">
          <input id="ct2_bank" placeholder="PRG bank (十进制或 0x 格式)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
          <input id="ct2_target" placeholder="JSR 目标地址 (例如 0x8000)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ct2_snapshot" style="padding:8px;border-radius:6px;background:#607D8B;border:none;color:#fff;">快照 RAM</button>
          <button id="ct2_restore" style="padding:8px;border-radius:6px;background:#9E9E9E;border:none;color:#111;">恢复 RAM</button>
          <button id="ct2_saveState" style="padding:8px;border-radius:6px;background:#455A64;border:none;color:#fff;">保存 状态</button>
          <button id="ct2_restoreState" style="padding:8px;border-radius:6px;background:#BDBDBD;border:none;color:#111;">恢复 状态</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input id="ct2_helper" placeholder="helper 地址 (默认 0xC4B9)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;font-family:monospace;">
          <button id="ct2_helper_jsr" style="padding:8px;border-radius:6px;background:#D32F2F;border:none;color:#fff;flex:1;">调用 helper 并 JSR (savestate)</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="ct2_dump_snap" style="padding:8px;border-radius:6px;background:#1976D2;border:none;color:#fff;flex:1;">抓取 RAM/寄存器/Mapper 快照</button>
          <button id="ct2_dump_clear" style="padding:8px;border-radius:6px;background:#9E9E9E;border:none;color:#111;flex:1;">清空日志</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="ct2_stack_dump" style="padding:8px;border-radius:6px;background:#0288D1;border:none;color:#fff;flex:1;">抓取 堆栈 快照 (SP/0x0100-0x01FF)</button>
          <button id="ct2_stack_prefill" style="padding:8px;border-radius:6px;background:#7B1FA2;border:none;color:#fff;flex:1;">预填充 堆栈 (写入 0x0100-0x01FF)</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="ct2_stack_inject_trigger" style="padding:8px;border-radius:6px;background:#388E3C;border:none;color:#fff;flex:1;">准备 堆栈 并 触发 (写入 指针 -> 模拟 A)</button>
          <button id="ct2_stack_inject_clear" style="padding:8px;border-radius:6px;background:#9E9E9E;border:none;color:#111;flex:1;">清除 注入 区域 (恢复 0x0100-0x01FF 若有快照)</button>
        </div>
        <div style="font-size:11px;color:#cfd8dc;margin-top:6px;">提示：此操作会修改 PRG 映射并强制 CPU 执行，具有破坏性。仅在熟悉 ROM 内部结构时使用。</div>
      </div>
    `;

    container.appendChild(content);
    document.body.appendChild(container);

    // Draggable header
    const header = content.querySelector('div');
    let dragging = false; let startX=0, startY=0, origX=0, origY=0;
    header.style.cursor = 'move';
    header.addEventListener('pointerdown', (e)=>{
      dragging = true; startX = e.clientX; startY = e.clientY;
      const rect = container.getBoundingClientRect(); origX = rect.left; origY = rect.top;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
    function onPointerMove(e){ if(!dragging) return; container.style.left = (origX + (e.clientX - startX)) + 'px'; container.style.top = (origY + (e.clientY - startY)) + 'px'; container.style.transform = ''; }
    function onPointerUp(){ dragging=false; document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); }

  // Elements (use container.querySelector to ensure we grab elements inside the created panel)
    const closeBtn = container.querySelector('#ct2ToolsClose');
    const writeBtn = container.querySelector('#ct2_write');
    const addrIn = container.querySelector('#ct2_addr');
    const valIn = container.querySelector('#ct2_val');
    const execBtn = container.querySelector('#ct2_exec');
    const execMode = container.querySelector('#ct2_execMode');
    const execAddr = container.querySelector('#ct2_execAddr');
    const logDiv = container.querySelector('#ct2_log');
    const presetsSel = container.querySelector('#ct2_presets');
    const applyPresetBtn = container.querySelector('#ct2_applyPreset');
  const mapperInfoDiv = container.querySelector('#ct2_mapperInfo');
  const framesIn = container.querySelector('#ct2_frames');
  const runFramesBtn = container.querySelector('#ct2_runFrames');

  closeBtn.onclick = ()=>{ activeWhileOpen = false; container.remove(); };

    function log(msg){ const time = new Date().toLocaleTimeString(); logDiv.innerHTML = `<div>[${time}] ${escapeHtml(msg)}</div>` + logDiv.innerHTML; }
    function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    // presets - small demo list (可扩展)
    const presets = [
      { name: '示例: 触发技能标志 0x0448=0x80', codes: [{address:0x0448, value:0x80}] },
      { name: '示例: 置玩家索引 0x0441=0x00', codes: [{address:0x0441, value:0x00}] }
    ];
    presets.forEach((p,idx)=>{ const o = document.createElement('option'); o.value = idx; o.textContent = p.name; presetsSel.appendChild(o); });
    applyPresetBtn.onclick = ()=>{
      const sel = presetsSel.value; if(sel === ''){ log('请选择预设'); return; }
      const p = presets[parseInt(sel,10)]; if(!p) return;
      p.codes.forEach(c => {
        try{
          if(window.nes && typeof window.nes.write === 'function'){
            window.nes.write(c.address, c.value);
          } else if(window.nes && window.nes.ram && c.address < 0x2000){
            window.nes.ram[c.address & 0x7ff] = c.value & 0xFF;
          }
          log(`应用预设: 0x${c.address.toString(16)} = 0x${c.value.toString(16)}`);
        }catch(e){ log('预设写入异常: ' + e.message); }
      });
    };

  // 一键安全触发 (写入 0x043B/0x043C 并调用处理子程序 sub_D67C)
  const triggerBtn = container.querySelector('#ct2_trigger_attack');
  const attackActionIn = container.querySelector('#ct2_attack_action');
  const attackSubIn = container.querySelector('#ct2_attack_sub');
    triggerBtn.onclick = async ()=>{
      if(!activeWhileOpen){ log('面板未激活，操作被拒绝'); return; }
      if(!window.nes){ log('nes 未找到'); return; }
      // defaults
      const aRaw = (attackActionIn.value && attackActionIn.value.trim()) ? attackActionIn.value.trim() : '2';
      const sRaw = (attackSubIn.value && attackSubIn.value.trim()) ? attackSubIn.value.trim() : '0';
      const aVal = parseNum(aRaw);
      const sVal = parseNum(sRaw);
      if(Number.isNaN(aVal) || Number.isNaN(sVal)){ log('动作或子类型解析失败'); return; }
      if(!confirm(`将保存 savestate -> 写入 0x043B=0x${aVal.toString(16)} 0x043C=0x${sVal.toString(16)} -> JSR 0xD67C -> 运行若干帧。继续？`)) return;

      // save full state if possible
      let beforeState = null;
      try{ if(typeof window.nes.getState === 'function') beforeState = window.nes.getState(); }catch(e){ beforeState = null; }

      try{
        // write action/sub
        if(window.nes && typeof window.nes.write === 'function'){
          window.nes.write(0x043B, aVal & 0xFF);
          window.nes.write(0x043C, sVal & 0xFF);
          log(`写入: 0x043B=0x${(aVal&0xFF).toString(16)}, 0x043C=0x${(sVal&0xFF).toString(16)}`);
        } else if(window.nes && window.nes.ram){
          window.nes.ram[0x043B & 0x7ff] = aVal & 0xFF;
          window.nes.ram[0x043C & 0x7ff] = sVal & 0xFF;
          log('写入到 nes.ram (回退路径)');
        } else throw new Error('写内存接口不可用');

        // 补写在手动按 A 时观察到的关键前置 RAM（根据快照差分）
        // ram_061E (0x061E) = 0x00, ram_061F (0x061F) = 0x05, ram_0621 (0x0621) = 0xA0
        const preWrites = [ [0x061E, 0x00], [0x061F, 0x05], [0x0621, 0xA0] ];
        preWrites.forEach(([addr,val])=>{
          try{
            if(window.nes && typeof window.nes.write === 'function') window.nes.write(addr, val & 0xFF);
            else if(window.nes && window.nes.ram) window.nes.ram[addr & 0x7ff] = val & 0xFF;
            log(`预写入: 0x${addr.toString(16)} = 0x${(val&0xFF).toString(16)}`);
          }catch(e){ log(`预写入 0x${addr.toString(16)} 失败: ${e.message}`); }
        });

        // 安全触发：不要直接 JSR 到 sub_D67C（会跳过上层的 PHA/PLA/栈预置，导致后续 PLA 弹出垃圾并崩溃）
        // 我们改为模拟按键输入（写入 ram_btn_press = con_btn_A），让游戏走正常输入处理路径来调用 sub_D67C
        // ram_btn_press 在 ASM 中以绝对地址 0x001E 被访问，con_btn_A = 0x80
        const BTN_ADDR = 0x001E;
        const CON_BTN_A = 0x80;
        try{
          if(window.nes && typeof window.nes.write === 'function'){
            window.nes.write(BTN_ADDR, CON_BTN_A);
          } else if(window.nes && window.nes.ram){
            window.nes.ram[BTN_ADDR & 0x7ff] = CON_BTN_A;
          } else {
            throw new Error('写入按键接口不可用');
          }
          log(`模拟按键: ram_btn_press(0x${BTN_ADDR.toString(16)}) = 0x${CON_BTN_A.toString(16)}`);

          // 运行若干帧以让游戏处理这个按键并在正确的上下文中调用 sub_D67C
          if(typeof window.nes.runFrame === 'function'){
            const runCount = Math.max(3, parseInt(framesIn.value,10) || 5);
            for(let i=0;i<runCount;i++){ window.nes.runFrame(); }
            log(`已运行 ${runCount} 帧 (等待输入处理)`);
          }

          // 清除按键（避免持续按下影响后续逻辑）
          if(window.nes && typeof window.nes.write === 'function'){
            window.nes.write(BTN_ADDR, 0x00);
          } else if(window.nes && window.nes.ram){
            window.nes.ram[BTN_ADDR & 0x7ff] = 0x00;
          }
          log('已清除模拟按键');
        }catch(e){ throw e; }

        log('触发完成，若需要可手动恢复 savestate');
      }catch(e){
        log('触发过程中发生错误: ' + e.message);
        if(beforeState && typeof window.nes.setState === 'function'){
          try{ window.nes.setState(beforeState); log('发生错误，已恢复 savestate'); }catch(se){ log('恢复 savestate 失败: '+se.message); }
        }
      }
    };

    // 初始日志一行
    log('CT2 工具面板已打开');

    // 显示 mapper 信息（如果已载入 ROM）
    try{
      if(window.nes && window.nes.mapper){
        let mname = window.nes.mapper.name || ('mapper' + (window.nes.mapper.h && window.nes.mapper.h.mapper ? window.nes.mapper.h.mapper : ''));
        let prgBanks = window.nes.mapper.h ? window.nes.mapper.h.banks : '？';
        let chrBanks = window.nes.mapper.h ? window.nes.mapper.h.chrBanks : '？';
        mapperInfoDiv.textContent = `Mapper: ${mname} | PRG ${prgBanks} banks | CHR ${chrBanks} banks`;
        log(`检测到 mapper: ${mname}`);
      } else {
        mapperInfoDiv.textContent = 'Mapper: 未检测到 (请确保 ROM 已载入)';
      }
    }catch(e){ mapperInfoDiv.textContent = 'Mapper: 检测失败'; }

    // 运行若干帧（前提：NES 已初始化）
    runFramesBtn.onclick = ()=>{
      const raw = framesIn.value.trim(); if(!raw) { log('请输入要运行的帧数'); return; }
      const n = parseInt(raw,10); if(Number.isNaN(n) || n <= 0){ log('帧数无效'); return; }
      if(!window.nes || typeof window.nes.runFrame !== 'function'){ log('NES runFrame 接口不可用'); return; }
      log(`开始运行 ${n} 帧`);
      try{
        for(let i=0;i<n;i++){ window.nes.runFrame(); }
        log(`已运行 ${n} 帧`);
      }catch(e){ log('运行帧时异常: ' + e.message); }
    };

  // advanced controls
  const bankIn = container.querySelector('#ct2_bank');
  const targetIn = container.querySelector('#ct2_target');
  const snapshotBtn = container.querySelector('#ct2_snapshot');
  const restoreBtn = container.querySelector('#ct2_restore');
  const bankJsrBtn = container.querySelector('#ct2_bankjsr');

    // Active flag: only allow advanced actions while panel exists/open
    let activeWhileOpen = true;

    // snapshot/restore support
    let ramSnapshot = null;
    snapshotBtn.onclick = ()=>{
      if(!window.nes){ log('nes 未找到，无法快照'); return; }
      ramSnapshot = new Uint8Array(window.nes.ram.length);
      ramSnapshot.set(window.nes.ram);
      log('RAM 快照已保存');
    };
    restoreBtn.onclick = ()=>{
      if(!ramSnapshot){ log('没有可用快照'); return; }
      if(!window.nes){ log('nes 未找到，无法恢复'); return; }
      window.nes.ram.set(ramSnapshot);
      log('RAM 已恢复 (快照)');
    };

  // savestate (完整状态) 支持
  let savedState = null;
  const saveStateBtn = container.querySelector('#ct2_saveState');
  const restoreStateBtn = container.querySelector('#ct2_restoreState');
    saveStateBtn.onclick = ()=>{
      if(!window.nes || typeof window.nes.getState !== 'function'){ log('nes.getState 不可用'); return; }
      try{ savedState = window.nes.getState(); log('已保存完整状态 (savestate)'); }catch(e){ log('保存状态失败: '+e.message); }
    };
    restoreStateBtn.onclick = ()=>{
      if(!savedState){ log('没有已保存的状态'); return; }
      if(!window.nes || typeof window.nes.setState !== 'function'){ log('nes.setState 不可用'); return; }
      try{ window.nes.setState(savedState); log('已恢复完整状态 (savestate)'); }catch(e){ log('恢复状态失败: '+e.message); }
    };

  // helper + JSR 流程
  const helperIn = container.querySelector('#ct2_helper');
  const helperJsrBtn = container.querySelector('#ct2_helper_jsr');
    // 默认 helper 地址（从 ASM 中确认的 sub_0x03C4C9 标签，在 ROM bank FF 中偏移 C4B9）
    if(helperIn.value.trim() === '') helperIn.value = '0xC4B9';
    helperJsrBtn.onclick = ()=>{
      if(!activeWhileOpen){ log('面板未激活，操作被拒绝'); return; }
      if(!window.nes){ log('nes 未找到'); return; }
      // parse helper and target
      const helperRaw = helperIn.value.trim(); const targetRaw = targetIn.value.trim();
      if(!helperRaw){ log('请输入 helper 地址'); return; }
      if(!targetRaw){ log('请输入目标地址 (JSR 到此)'); return; }
      const helperAddr = parseNum(helperRaw);
      const targetAddr = parseNum(targetRaw);
      if(Number.isNaN(helperAddr) || Number.isNaN(targetAddr)){ log('helper 或目标地址解析失败'); return; }

      if(!confirm(`将保存状态 -> 调用 helper(0x${helperAddr.toString(16)}) -> JSR 0x${targetAddr.toString(16)}。继续？`)) return;

      // 保存完整状态以便回滚
      let localState = null;
      try{ if(typeof window.nes.getState === 'function') localState = window.nes.getState(); }catch(e){ localState = null; }

      // 某些 helper 期望 X/寄存器含有 bank 编号 (参见 ASM: helper 使用 STX ram_for_5115), 所以我们尽量保持 X = bankIn (若填写)
      const bankVal = parseNum(bankIn.value || '0');
      try{
        if(typeof window.nes.getState === 'function') savedState = window.nes.getState();
      }catch(e){ savedState = null; }

      try{
        // set X register if possible
        if(window.nes && window.nes.cpu && window.nes.cpu.r){
          window.nes.cpu.r[1] = bankVal & 0xFF; // X = bank
          log(`设置 CPU.X = ${bankVal}`);
        }

        // call helper
        if(window.nes && window.nes.cpu && typeof window.nes.cpu.jsr === 'function'){
          window.nes.cpu.jsr(helperAddr & 0xFFFF);
          log(`JSR helper -> 0x${helperAddr.toString(16)}`);
        } else if(window.nes && window.nes.cpu && window.nes.cpu.br){
          window.nes.cpu.br[0] = helperAddr & 0xFFFF;
          log(`设置 PC -> helper 0x${helperAddr.toString(16)}`);
        } else { throw new Error('CPU JSR 接口不可用'); }

        // 执行若干帧以让 helper 完成 bank 切换（通常 helper 执行很快，但我们运行一帧以确保映射生效）
        if(typeof window.nes.runFrame === 'function'){
          window.nes.runFrame();
          log('运行 1 帧以等待 helper 完成');
        }

        // 再次 JSR 到用户目标地址
        if(window.nes && window.nes.cpu && typeof window.nes.cpu.jsr === 'function'){
          window.nes.cpu.jsr(targetAddr & 0xFFFF);
          log(`JSR -> 0x${targetAddr.toString(16)}`);
        } else if(window.nes && window.nes.cpu && window.nes.cpu.br){
          window.nes.cpu.br[0] = targetAddr & 0xFFFF;
          log(`设置 PC -> 0x${targetAddr.toString(16)}`);
        }

      }catch(e){
        log('执行 helper/JSR 过程中出错: ' + e.message);
        if(localState && typeof window.nes.setState === 'function'){
          try{ window.nes.setState(localState); log('发生错误，已还原 savestate'); }catch(se){ log('还原 savestate 失败: '+se.message); }
        }
      }
    };

    // 抓取 RAM/CPU/Mapper 快照，便于在玩家正常按键触发动作时收集前/后状态
    const dumpBtn = container.querySelector('#ct2_dump_snap');
    const dumpClearBtn = container.querySelector('#ct2_dump_clear');
    dumpClearBtn.onclick = ()=>{ logDiv.innerHTML=''; log('日志已清空'); };
    dumpBtn.onclick = ()=>{
      if(!window.nes){ log('nes 未找到，无法抓取'); return; }
      try{
        // 要抓取的 RAM 区间（零页、0x0400-0x047F、0x0600-0x06FF）
        const ranges = [ [0x0000,0x007F], [0x0400,0x047F], [0x0600,0x06FF] ];
        const out = [];
        if(window.nes.ram){
          ranges.forEach(r => {
            const [a,b] = r;
            let s = `RAM 0x${a.toString(16).padStart(4,'0')}-0x${b.toString(16).padStart(4,'0')}: `;
            const parts = [];
            for(let addr=a; addr<=b; addr++){
              const v = window.nes.ram[addr & 0x7ff];
              parts.push(v.toString(16).padStart(2,'0'));
              if(parts.length >= 16){ s += parts.join(' ') + '\n'; parts.length = 0; }
            }
            if(parts.length) s += parts.join(' ');
            out.push(s);
          });
        } else {
          out.push('nes.ram 不可用');
        }

        // mapper info
        if(window.nes && window.nes.mapper){
          try{
            const m = window.nes.mapper;
            out.push(`Mapper: ${m.name || 'unknown'}`);
            if(m.bankRegs) out.push('bankRegs: ' + m.bankRegs.map(x=>('0x'+(x&0xFF).toString(16).padStart(2,'0'))).join(' '));
            if(typeof m.setPrgBanks === 'function') out.push('mapper.setPrgBanks: available');
          }catch(e){ out.push('读取 mapper 信息失败: '+e.message); }
        }

        // CPU registers (若可用)
        if(window.nes && window.nes.cpu && window.nes.cpu.r){
          try{
            const r = window.nes.cpu.r; // r[0]=A? depends on impl; we'll print raw
            out.push('CPU regs (raw r[]): ' + r.map(x=>('0x'+(x&0xFF).toString(16).padStart(2,'0'))).join(' '));
          }catch(e){ out.push('读取 CPU 寄存器失败: '+e.message); }
        } else if(window.nes && window.nes.cpu){
          // try to read br / pc
          try{ if(window.nes.cpu.br) out.push('CPU.br[0] PC: 0x'+(window.nes.cpu.br[0]&0xFFFF).toString(16)); }catch(e){}
        }

        out.forEach(l => log(l));
        log('快照抓取完成。建议：在游戏中正常按 A 触发一次动作，然后再次点击本按钮以获取触发前后的对比。');
      }catch(e){ log('抓取快照失败: ' + e.message); }
    };

    // Stack dump & prefill handlers
    const stackDumpBtn = container.querySelector('#ct2_stack_dump');
    const stackPrefillBtn = container.querySelector('#ct2_stack_prefill');
    // Helper to read stack bytes from 0x0100-0x01FF (NES stack sits there).
    function readStackRange(){
      const out = [];
      try{
        // Attempt to read SP from exposed cpu.sp, else try cpu.r layout fallback
        let spReported = null;
        if(window.nes && window.nes.cpu && typeof window.nes.cpu.sp !== 'undefined'){
          spReported = window.nes.cpu.sp & 0xFF;
        } else if(window.nes && window.nes.cpu && Array.isArray(window.nes.cpu.r) && window.nes.cpu.r.length >= 4){
          // common layout: r = [A,X,Y,SP]
          spReported = window.nes.cpu.r[3] & 0xFF;
        }
        if(spReported !== null) out.push(`CPU SP: 0x${spReported.toString(16).padStart(2,'0')}`);

        // Read full stack page if nes.ram available
        if(window.nes && window.nes.ram){
          let s = '';
          for(let addr=0x0100; addr<=0x01FF; addr++){
            const v = window.nes.ram[addr & 0x7ff];
            s += v.toString(16).padStart(2,'0') + ' ';
            if(((addr-0x0100+1) % 16) === 0){ out.push(`STACK 0x${(addr-15).toString(16).padStart(4,'0')}: ` + s.trim()); s = ''; }
          }
          // push any remaining
          if(s.length) out.push('STACK tail: ' + s.trim());
        } else {
          out.push('无法读取堆栈：nes.ram 不可用');
        }
      }catch(e){ out.push('读取堆栈失败: '+e.message); }
      return out;
    }

    stackDumpBtn.onclick = ()=>{
      if(!window.nes){ log('nes 未找到，无法抓取堆栈'); return; }
      const lines = readStackRange(); lines.forEach(l=>log(l)); log('堆栈快照完成');
    };

    // Prefill stack memory - destructive: write given byte pattern across 0x0100-0x01FF
    stackPrefillBtn.onclick = ()=>{
      if(!window.nes){ log('nes 未找到，无法预填充堆栈'); return; }
      if(!confirm('警告：此操作将覆盖 0x0100-0x01FF 的堆栈区域并可能导致游戏崩溃。建议先保存 savestate。继续？')) return;
      // save ram snapshot to restore later if needed
      let savedRam = null; if(window.nes && window.nes.ram){ savedRam = new Uint8Array(window.nes.ram.length); savedRam.set(window.nes.ram); }
      const patternHex = prompt('请输入要写入堆栈的字节（十六进制，例如 FF 或 00），默认 FF：','FF');
      if(!patternHex) { log('用户取消预填充'); return; }
      const b = parseInt(patternHex.trim(),16) & 0xFF;
      try{
        for(let addr=0x0100; addr<=0x01FF; addr++){
          if(typeof window.nes.write === 'function') window.nes.write(addr, b);
          else if(window.nes.ram) window.nes.ram[addr & 0x7ff] = b;
        }
        log(`已将 0x0100-0x01FF 填充为 0x${b.toString(16).padStart(2,'0')}`);
        if(savedRam){ if(confirm('是否立即恢复先前 RAM 快照？ 取消则保持预填充状态。')){ window.nes.ram.set(savedRam); log('已恢复先前 RAM 快照'); } }
      }catch(e){ log('预填充堆栈失败: '+e.message); if(savedRam && window.nes && window.nes.ram){ window.nes.ram.set(savedRam); log('已恢复先前 RAM 快照 (因失败)'); } }
    };

    // Inject pointer bytes onto stack so PLA/PLA sequence will produce our desired address
    const stackInjectBtn = container.querySelector('#ct2_stack_inject_trigger');
    const stackInjectClearBtn = container.querySelector('#ct2_stack_inject_clear');
    // store a ram backup when injecting so we can restore
    let _injectBackupRam = null;
    stackInjectBtn.onclick = ()=>{
      if(!window.nes){ log('nes 未找到，无法注入堆栈'); return; }
      if(!confirm('将注入两个字节到 CPU 堆栈（PLA/PLA 将读取），建议先保存 savestate。继续？')) return;
      // ask user for target address to inject (hex)
      const addrRaw = prompt('请输入要注入为返回/跳转地址的 16 位十六进制地址（例如 D792）:','D792');
      if(!addrRaw){ log('用户取消注入'); return; }
      const addr = parseInt(addrRaw.trim(),16) & 0xFFFF;
      if(Number.isNaN(addr)){ log('地址解析失败'); return; }
      // compute low/high
      const low = addr & 0xFF; const high = (addr>>8)&0xFF;
      // save ram backup
      if(window.nes && window.nes.ram){ _injectBackupRam = new Uint8Array(window.nes.ram.length); _injectBackupRam.set(window.nes.ram); }
      // find SP; many emulators expose nes.cpu.sp, else assume 0xFF (stack top)
      let sp = 0xFF;
      try{ if(window.nes && window.nes.cpu && typeof window.nes.cpu.sp !== 'undefined') sp = window.nes.cpu.sp & 0xFF; }catch(e){}
      // PLA will pull byte from 0x0100 + (SP+1) then next PLA from 0x0100 + (SP+2)
      const addr1 = 0x0100 + ((sp + 1) & 0xFF);
      const addr2 = 0x0100 + ((sp + 2) & 0xFF);
      try{
        if(typeof window.nes.write === 'function'){
          window.nes.write(addr1, low); window.nes.write(addr2, high);
        } else if(window.nes && window.nes.ram){ window.nes.ram[addr1 & 0x7ff] = low; window.nes.ram[addr2 & 0x7ff] = high; }
        log(`注入到堆栈: [0x${addr1.toString(16)}]=0x${low.toString(16)} [0x${addr2.toString(16)}]=0x${high.toString(16)} (基于 SP=0x${sp.toString(16)})`);

        // simulate A press and run frames (reuse BTN_ADDR logic)
        const BTN_ADDR = 0x001E; const CON_BTN_A = 0x80;
        if(typeof window.nes.write === 'function') window.nes.write(BTN_ADDR, CON_BTN_A); else if(window.nes.ram) window.nes.ram[BTN_ADDR & 0x7ff] = CON_BTN_A;
        log('已模拟按键 (A)');
        if(typeof window.nes.runFrame === 'function'){
          const runCount = Math.max(2, parseInt(framesIn.value,10) || 5);
          for(let i=0;i<runCount;i++) window.nes.runFrame();
          log(`已运行 ${runCount} 帧 (等待处理注入)`);
        }
        // clear button press
        if(typeof window.nes.write === 'function') window.nes.write(BTN_ADDR, 0); else if(window.nes.ram) window.nes.ram[BTN_ADDR & 0x7ff] = 0;
        log('已清除模拟按键');
      }catch(e){ log('注入失败: ' + e.message); if(_injectBackupRam && window.nes && window.nes.ram){ window.nes.ram.set(_injectBackupRam); log('已恢复注入前 RAM 快照 (因为失败)'); } }
    };

    stackInjectClearBtn.onclick = ()=>{
      if(!window.nes || !window.nes.ram){ log('无法恢复：nes.ram 不可用'); return; }
      if(!_injectBackupRam){ log('没有可用的注入前备份'); return; }
      window.nes.ram.set(_injectBackupRam);
      log('已恢复注入前的 RAM 备份（包含堆栈区域）');
      _injectBackupRam = null;
    };

    // helper: parse number (支持 0x 前缀)
    function parseNum(s){ if(typeof s !== 'string') return NaN; s = s.trim(); if(s.startsWith('0x')||s.startsWith('0X')) return parseInt(s,16); return parseInt(s,10); }

    // mapper-specific bank setters
    function setPrgBankMapper(bank){
      if(!window.nes || !window.nes.mapper) return false;
      const mapper = window.nes.mapper;
      // MMC3 (mapper 4) 支持通过 bankRegs 设置
      if(mapper.name && mapper.name.toUpperCase().indexOf('MMC3')>=0){
        try{
          mapper.bankRegs[6] = bank & 0xFF;
          mapper.bankRegs[7] = (bank+1) & 0xFF;
          mapper.setPrgBanks();
          log(`MMC3: 设置 bankRegs[6]=${mapper.bankRegs[6]} bankRegs[7]=${mapper.bankRegs[7]}`);
          return true;
        }catch(e){ log('MMC3 设置失败: '+e.message); }
      }
      // UXROM (mapper 2)：通常通过写 0x8000 地址来切换低 16KB
      if(mapper.name && mapper.name.toUpperCase().indexOf('UXROM')>=0){
        try{
          window.nes.write(0x8000, bank & 0xFF);
          log('UXROM: 写 0x8000 切换 bank');
          return true;
        }catch(e){ log('UXROM 设置失败: '+e.message); }
      }
      // 其他 mapper: 如果实现了 setPrgBanks 或者 bankRegs, 尝试直接设置
      if(typeof mapper.setPrgBanks === 'function'){
        try{ if(mapper.bankRegs) mapper.bankRegs[6] = bank & 0xFF; mapper.setPrgBanks(); log('调用 mapper.setPrgBanks'); return true; }catch(e){}
      }
      return false;
    }

    bankJsrBtn.onclick = ()=>{
      if(!activeWhileOpen){ log('面板未激活，操作被拒绝'); return; }
      if(!window.nes){ log('nes 未找到'); return; }
      const b = parseNum(bankIn.value);
      const t = parseNum(targetIn.value);
      if(Number.isNaN(b) || Number.isNaN(t)){ log('bank 或目标地址解析失败'); return; }
      if(!confirm(`将尝试设置 PRG bank=${b}，并 JSR 到 0x${t.toString(16)}。继续？`)) return;

      // snapshot before destructive op
      let beforeRam = new Uint8Array(window.nes.ram.length); beforeRam.set(window.nes.ram);

      // try mapper-set first
      const ok = setPrgBankMapper(b);
      if(!ok){ log('警告：无法通过 mapper 接口切换 PRG bank，仍将尝试直接调用 JSR（可能失败）'); }

      // small delay to let mapping take effect on next cycle (if any)
      setTimeout(()=>{
        try{
          if(window.nes && window.nes.cpu && typeof window.nes.cpu.jsr === 'function'){
            window.nes.cpu.jsr(t & 0xFFFF);
            log(`已执行 CPU.jsr -> 0x${t.toString(16)}`);
          } else if(window.nes && window.nes.cpu && window.nes.cpu.br){
            // fallback: set PC to target (less safe)
            window.nes.cpu.br[0] = t & 0xFFFF;
            log(`已设置 PC -> 0x${t.toString(16)}`);
          } else {
            log('找不到 CPU 执行接口，操作结束');
          }
        }catch(e){
          log('执行 JSR 时发生异常: ' + e.message);
          // restore ram on failure
          window.nes.ram.set(beforeRam);
          log('在异常后已恢复 RAM 快照');
        }
      }, 50);
    };
  }

  // 绑定菜单按钮（页面可能尚未完成加载）
  function ensureBinding(){ const btn = document.getElementById('ct2ToolsBtn'); if(btn){ btn.onclick = function(){
      // 如果 nes 与 mapper 已就绪则允许打开面板；否则尝试根据 loaded 回退提示
      if(window.nes && window.nes.mapper){ createCT2ToolsUI(); return; }
      if(!window.loaded){ alert('请在载入 ROM 后使用此面板 (或确保 emulator 初始化完成)'); return; }
      createCT2ToolsUI();
    }; return true; } return false; }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ ensureBinding(); });
  } else { ensureBinding(); }
})();
