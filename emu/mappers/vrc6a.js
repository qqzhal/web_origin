mappers[24] = function (nes, rom, header) {
    // 使用简单直接的结构，避免过度封装
    this.name = "Konami VRC6";
    this.version = 1;
    this.nes = nes;
    this.rom = rom;
    this.h = header;

    // 初始化内存
    this.chrRam = (header.chrBanks === 0) ? new Uint8Array(0x2000) : null;
    this.prgRam = new Uint8Array(0x2000);
    this.ppuRam = new Uint8Array(0x800);

    // IRQ 系统
    this.irqEnable = 0;
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqClock = 0;

    // 初始化bank映射
    this.prgBank = new Uint8Array(4); // 0=8000-9FFF, 1=A000-BFFF, 2=C000-DFFF, 3=E000-FFFF
    this.chrBank = new Uint8Array(8); // 8x1KB banks

    // 镜像模式 (0=垂直, 1=水平, 2=单页低, 3=单页高)
    this.mirroring = 0;

    // 关键: 直接设置POST_RENDER
    this.renderMethod = "POST_RENDER";
    // 强制应用渲染方法到全局和PPU
    if (this.nes) {
        this.nes.renderMethod = this.renderMethod;
        if (this.nes.ppu) {
            this.nes.ppu.renderMethod = this.renderMethod;
        }
    }

    // 设置PRG固定bank映射 (完全按照VirtuaNES)
    this.reset = function(hard) {
        // 重置IRQ
        this.irqEnable = 0;
        this.irqCounter = 0;
        this.irqLatch = 0;
        this.irqClock = 0;

        // SetPROM_32K_Bank(0, 1, PROM_8K_SIZE-2, PROM_8K_SIZE-1)
        const bankCount = this.h.banks * 2; // 8KB banks
        this.prgBank[0] = 0;               // $8000-$9FFF: 首个8KB
        this.prgBank[1] = 1;               // $A000-$BFFF: 第二个8KB  
        this.prgBank[2] = bankCount - 2;   // $C000-$DFFF: 倒数第二个8KB
        this.prgBank[3] = bankCount - 1;   // $E000-$FFFF: 最后一个8KB

        // SetVROM_8K_Bank(0)
        for (let i = 0; i < 8; i++) {
            this.chrBank[i] = 0;
        }

        // 默认垂直镜像
        this.mirroring = 0;

        // 重要: 再次确保所有地方都应用了POST_RENDER
        if (this.nes) {
            this.nes.renderMethod = this.renderMethod;
            if (this.nes.ppu) {
                this.nes.ppu.renderMethod = this.renderMethod;
            }
            this.nes.mapperIrqWanted = false;
        }
        
        console.log("VRC6 初始化完成 - PRG银行:", Array.from(this.prgBank));
    };

    // CPU读取 - 这里简化实现，只做必要的地址映射
    this.read = function(addr) {
        addr &= 0xFFFF;
        
        if (addr < 0x6000) {
            return 0;
        } else if (addr < 0x8000) {
            return this.prgRam[addr & 0x1FFF];
        } else {
            let bank;
            if (addr < 0xA000) {
                bank = this.prgBank[0];
            } else if (addr < 0xC000) {
                bank = this.prgBank[1]; 
            } else if (addr < 0xE000) {
                bank = this.prgBank[2];
            } else {
                bank = this.prgBank[3];
            }
            
            // 计算ROM物理地址
            const physAddr = (bank * 0x2000) + (addr & 0x1FFF);
            if (physAddr >= this.rom.length) {
                return 0;
            }
            
            return this.rom[physAddr];
        }
    };
    
    this.peak = function(addr) {
        return this.read(addr);
    };
    
    // 调试器需要使用的方法
    this.getRomAdr = function(addr) {
        if (addr < 0x8000) return -1;
        
        let bank;
        if (addr < 0xA000) {
            bank = this.prgBank[0];
        } else if (addr < 0xC000) {
            bank = this.prgBank[1]; 
        } else if (addr < 0xE000) {
            bank = this.prgBank[2];
        } else {
            bank = this.prgBank[3];
        }
        
        return (bank * 0x2000) + (addr & 0x1FFF);
    };
    
    // CPU写入 - 精确匹配VirtuaNES的Write方法
    this.write = function(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;
        
        if (addr < 0x6000) {
            return;
        } else if (addr < 0x8000) {
            this.prgRam[addr & 0x1FFF] = value;
            return;
        }
        
        // 完全按照VirtuaNES的Mapper024.cpp实现
        switch (addr & 0xF003) {
            case 0x8000:
                // SetPROM_16K_Bank(4, data) - 实际设置8KB banks
                this.prgBank[0] = value;
                break;
                
            case 0x9000: case 0x9001: case 0x9002:
            case 0xA000: case 0xA001: case 0xA002:
            case 0xB000: case 0xB001: case 0xB002:
                // nes->apu->ExWrite(addr, data)
                if (this.nes && this.nes.apu && typeof this.nes.apu.exWrite === "function") {
                    this.nes.apu.exWrite(addr, value);
                }
                break;
                
            case 0xB003:
                // 设置镜像模式
                const mirrorType = value & 0x0C;
                if (mirrorType === 0x00) {
                    this.mirroring = 0; // VRAM_VMIRROR  
                } else if (mirrorType === 0x04) {
                    this.mirroring = 1; // VRAM_HMIRROR
                } else if (mirrorType === 0x08) {
                    this.mirroring = 2; // VRAM_MIRROR4L
                } else if (mirrorType === 0x0C) {
                    this.mirroring = 3; // VRAM_MIRROR4H
                }
                break;
                
            case 0xC000:
                // SetPROM_8K_Bank(6, data)
                this.prgBank[2] = value;
                break;
                
            case 0xD000:
                this.chrBank[0] = value;
                break;
                
            case 0xD001:
                this.chrBank[1] = value;
                break;
                
            case 0xD002:
                this.chrBank[2] = value;
                break;
                
            case 0xD003:
                this.chrBank[3] = value;
                break;
                
            case 0xE000:
                this.chrBank[4] = value;
                break;
                
            case 0xE001:
                this.chrBank[5] = value;
                break;
                
            case 0xE002:
                this.chrBank[6] = value;
                break;
                
            case 0xE003:
                this.chrBank[7] = value;
                break;
                
            case 0xF000:
                this.irqLatch = value;
                break;
                
            case 0xF001:
                this.irqEnable = value & 0x03;
                if (this.irqEnable & 0x02) {
                    this.irqCounter = this.irqLatch;
                    this.irqClock = 0;
                }
                if (this.nes) this.nes.mapperIrqWanted = false;
                break;
                
            case 0xF002:
                this.irqEnable = (this.irqEnable & 0x01) * 3;
                if (this.nes) this.nes.mapperIrqWanted = false;
                break;
        }
    };
    
    // PPU接口
    this.ppuRead = function(addr) {
        addr &= 0x3FFF;
        
        if (addr < 0x2000) {
            if (this.h.chrBanks === 0) {
                // CHR-RAM
                const bank = this.chrBank[addr >> 10]; // 1KB banks
                const offset = addr & 0x3FF;
                const chrAddr = (bank * 0x400) + offset;
                
                if (chrAddr >= this.chrRam.length) return 0;
                return this.chrRam[chrAddr];
            } else {
                // CHR-ROM
                const bank = this.chrBank[addr >> 10]; // 1KB banks
                const offset = addr & 0x3FF;
                const chrAddr = (bank * 0x400) + offset;
                
                // 计算在rom中的偏移
                const prgSize = this.h.banks * 0x4000; // PRG-ROM大小
                const physAddr = prgSize + chrAddr;
                
                if (physAddr >= this.rom.length) return 0;
                return this.rom[physAddr];
            }
        } else {
            // 名称表访问
            return this.ppuRam[this.getMirroringAdr(addr)];
        }
    };
    
    this.ppuPeak = function(addr) {
        return this.ppuRead(addr);
    };
    
    this.ppuWrite = function(addr, value) {
        addr &= 0x3FFF;
        
        if (addr < 0x2000) {
            if (this.h.chrBanks === 0 && this.chrRam) {
                const bank = this.chrBank[addr >> 10];
                const offset = addr & 0x3FF;
                const chrAddr = (bank * 0x400) + offset;
                
                if (chrAddr < this.chrRam.length) {
                    this.chrRam[chrAddr] = value;
                }
            }
            // CHR-ROM不可写
        } else {
            // 名称表写入
            this.ppuRam[this.getMirroringAdr(addr)] = value;
        }
    };
    
    // 镜像地址计算 - 精确匹配VirtuaNES
    this.getMirroringAdr = function(addr) {
        addr &= 0x0FFF;
        
        switch (this.mirroring) {
            case 0: // 垂直镜像 (VRAM_VMIRROR)
                return (addr & 0x7FF);
            case 1: // 水平镜像 (VRAM_HMIRROR)
                return ((addr & 0x3FF) | ((addr & 0x800) >> 1));
            case 2: // 单页低 (VRAM_MIRROR4L)
                return (addr & 0x3FF);
            case 3: // 单页高 (VRAM_MIRROR4H)
                return (0x400 | (addr & 0x3FF));
            default:
                return (addr & 0x7FF);
        }
    };
    
    // IRQ时钟 - 精确匹配VirtuaNES的Clock方法
    this.clock = function(cycles) {
        if (this.irqEnable & 0x02) {
            this.irqClock += cycles;
            if (this.irqClock >= 0x72) {
                this.irqClock -= 0x72;
                if (this.irqCounter === 0xFF) {
                    this.irqCounter = this.irqLatch;
                    if (this.nes) this.nes.mapperIrqWanted = true;
                } else {
                    this.irqCounter++;
                }
            }
        }
    };
    
    // CPU周期调用
    this.cpuCycle = function(cycles) {
        this.clock(cycles);
    };
    
    // 状态保存变量
    this.saveVars = [
        "irqEnable", "irqCounter", "irqLatch", "irqClock",
        "prgBank", "chrBank", "mirroring", "prgRam", "chrRam", "ppuRam"
    ];
    
    // 立即执行重置
    this.reset(true);
};
