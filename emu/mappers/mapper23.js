//mapper接收的 rom 没有文件头,已经在loadrom的时候 去掉了  rom.subarray(header.base);
//注意 变量函数等命名方式,需要复合 nes/pipu.js nes/nes.js nes/cpu.js js/debugger.js
//由于主程序与mapper之间有相互调用的情况,所以函数方法命名方式必须与当前jsnes模拟器一致
//getRomAdr 函数 js/debugger.js 调试的时候会用到
//公用 CRC32校验函数calcCRC32用法 calcCRC32(this.prgRom);

function Mapper23(nes, rom, header) {
    this.name = "Konami VRC2 type B";
    this.version = 1;
    this.nes = nes;
    this.rom = rom;
    this.h = header;

    let prgSize = header.banks * 0x4000;
    let chrSize = header.chrBanks * 0x2000;
    this.prgRom = rom.slice(0, prgSize);
    this.chrRom = chrSize > 0 ? rom.slice(prgSize, prgSize + chrSize) : null;
    this.chrRam = new Uint8Array(0x2000);

    // 记录四屏标志
    this.fourScreen = !!header.fourScreen;
    this.mirroring = this.fourScreen ? 4 :
        (typeof header.verticalMirroring !== "undefined"
            ? (header.verticalMirroring ? 0 : 1)
            : (header.mirroring || 0));

    // 完全匹配VirtuaNES的地址掩码
    this.addrMask = 0xF003;

    // 计算ROM CRC32，用于特殊游戏处理
    let prgCrc = calcCRC32(this.prgRom);

    // 特殊游戏处理（与VirtuaNES一致）
    if (prgCrc === 0x93794634) { // Akumajou Special Boku Dracula Kun(J)
        this.addrMask = 0xF00C;
        this.renderMethod = "PRE_ALL_RENDER";
        nes.renderMethod = "PRE_ALL_RENDER";
        if (nes.ppu) nes.ppu.renderMethod = "PRE_ALL_RENDER";
    }
    if (prgCrc === 0xdd53c4ae) { // Tiny Toon Adventures(J)
        this.renderMethod = "POST_ALL_RENDER";
        nes.renderMethod = "POST_ALL_RENDER";
        if (nes.ppu) nes.ppu.renderMethod = "POST_ALL_RENDER";
    }

    this.ppuRam = new Uint8Array(this.fourScreen ? 0x1000 : 0x800);
    this.prgRam = new Uint8Array(0x2000);

    // 8个1KB CHR bank，分高低位
    this.reg = new Array(10).fill(0);
    this.chrBank = new Array(8).fill(0);
    this.prgBank = new Array(4).fill(0);

    // IRQ相关
    this.irq_enable = 0;
    this.irq_counter = 0;
    this.irq_latch = 0;
    this.irq_clock = 0;

    // 设置PRG Bank (8KB) - 直接映射VirtuaNES的SetPROM_8K_Bank函数
    this.setPrgBank = function (bank, value) {
        if (bank >= 0 && bank < 4) {
            // 确保value在有效范围
            let maxBank = this.h.banks * 2; // 8KB单位
            if (value >= maxBank) value %= maxBank;
            this.prgBank[bank] = value;
        }
    };

    // 完全重写setChrBank函数以确保与VirtuaNES完全一致
    this.setChrBank = function (bank, value) {
        if (bank >= 0 && bank < 8) {
            // 精确匹配VirtuaNES的SetVROM_1K_Bank函数
            if (this.h.chrBanks > 0) {
                let maxBank = this.h.chrBanks * 8; // 1KB单位
                if (value >= maxBank) value %= maxBank;
            } else {
                // CHR-RAM模式下，限制值在0-7范围内
                value &= 0x07;
            }
            this.chrBank[bank] = value;
        }
    };

    // 重写setMirroring函数确保镜像设置完全一致
    this.setMirroring = function (mode) {
        switch (mode) {
            case 0: // VRAM_VMIRROR - 垂直镜像
                this.mirroring = 0;
                break;
            case 1: // VRAM_HMIRROR - 水平镜像
                this.mirroring = 1;
                break;
            case 2: // VRAM_MIRROR4L - 单屏模式0
                this.mirroring = 2;
                break;
            case 3: // VRAM_MIRROR4H - 单屏模式1
                this.mirroring = 3;
                break;
            default:
                this.mirroring = mode;
                break;
        }

        // 确保PPU知道镜像模式已更改 - 关键修复点
        if (this.nes && this.nes.ppu) {
            this.nes.ppu.mirroring = this.mirroring;
        }
    };

    this.reset = function (hard) {
        if (hard) {
            // 初始化内存
            for (let i = 0; i < this.chrRam.length; i++) this.chrRam[i] = 0;
            for (let i = 0; i < this.ppuRam.length; i++) this.ppuRam[i] = 0;
            for (let i = 0; i < this.prgRam.length; i++) this.prgRam[i] = 0;
        }

        // 精确匹配VirtuaNES的Reset函数
        for (let i = 0; i < 8; i++) {
            this.reg[i] = i;
        }
        this.reg[8] = 0;
        this.reg[9] = 1;

        this.irq_enable = 0;
        this.irq_counter = 0;
        this.irq_latch = 0;
        this.irq_clock = 0;

        // 按照VirtuaNES设置初始镜像模式
        this.mirroring = this.fourScreen ? 4 :
            (typeof this.h.verticalMirroring !== "undefined"
                ? (this.h.verticalMirroring ? 0 : 1)
                : (this.h.mirroring || 0));

        // 确保PPU知道当前镜像模式 - 关键修复点
        if (this.nes && this.nes.ppu) {
            this.nes.ppu.mirroring = this.mirroring;
        }

        // 设置初始PRG Bank
        let prgCount = this.h.banks * 2; // 8KB单位
        this.setPrgBank(0, 0);
        this.setPrgBank(1, 1);
        this.setPrgBank(2, prgCount - 2);
        this.setPrgBank(3, prgCount - 1);

        // 设置初始CHR Bank
        if (this.h.chrBanks > 0) {
            for (let i = 0; i < 8; i++) {
                this.setChrBank(i, i);
            }
        }
    };

    this.saveVars = [
        "name", "chrRam", "ppuRam", "prgRam", "reg", "mirroring", "prgBank", "chrBank",
        "irq_enable", "irq_counter", "irq_latch", "irq_clock"
    ];

    this.peak = function (adr) {
        if (adr >= 0x6000 && adr < 0x8000) return this.prgRam[adr & 0x1FFF];
        return this.read(adr);
    };

    this.read = function (adr) {
        if (adr >= 0x6000 && adr < 0x8000) return this.prgRam[adr & 0x1FFF];
        if (adr < 0x8000) return 0;

        // 精确匹配VirtuaNES的PRG读取
        let bank = (adr - 0x8000) >> 13; // 0, 1, 2, 3 (8KB 单位)
        let offset = adr & 0x1FFF;

        if (bank >= 0 && bank < 4) {
            let prgIdx = (this.prgBank[bank] * 0x2000) + offset;
            if (prgIdx >= 0 && prgIdx < this.prgRom.length) {
                return this.prgRom[prgIdx];
            }
        }
        return 0;
    };

    // 完全匹配VirtuaNES的Clock函数
    this.hsync = function (scanline) {
        if (this.irq_enable & 0x02) {
            this.irq_clock += 3;
            while (this.irq_clock >= 341) {
                this.irq_clock -= 341;
                this.irq_counter++;
                if (this.irq_counter === 0) {
                    this.irq_counter = this.irq_latch;
                    if (this.irq_enable & 0x02) {
                        this.nes.mapperIrqWanted = true;
                    }
                }
            }
        }
    };

    // 完全匹配VirtuaNES的Write函数
    this.write = function (adr, value) {
        // PRG RAM
        if (adr >= 0x6000 && adr < 0x8000) {
            this.prgRam[adr & 0x1FFF] = value;
            return;
        }

        // 精确匹配VirtuaNES的switch-case结构
        let a = adr & this.addrMask;
        switch (a) {
            case 0x8000: case 0x8004: case 0x8008: case 0x800C:
                if (this.reg[8]) {
                    this.reg[6] = value & 0x1F;
                    this.setPrgBank(0, this.reg[6]); // 映射到VirtuaNES的SetPROM_8K_Bank(6,data)
                } else {
                    this.reg[4] = value & 0x1F;
                    this.setPrgBank(0, this.reg[4]); // 映射到VirtuaNES的SetPROM_8K_Bank(4,data)
                }
                break;

            case 0x9000:
                if (value !== 0xFF) {
                    value &= 0x03;
                    // 完全匹配VirtuaNES的SetVRAM_Mirror调用
                    if (value === 0) this.setMirroring(0); // VRAM_VMIRROR
                    else if (value === 1) this.setMirroring(1); // VRAM_HMIRROR
                    else if (value === 2) this.setMirroring(2); // VRAM_MIRROR4L
                    else this.setMirroring(3); // VRAM_MIRROR4H
                }
                break;

            case 0x9008:
                this.reg[8] = value & 0x02;
                // 更新PRG bank 0
                if (this.reg[8]) {
                    this.setPrgBank(0, this.reg[6]);
                } else {
                    this.setPrgBank(0, this.reg[4]);
                }
                break;

            case 0xA000: case 0xA004: case 0xA008: case 0xA00C:
                this.reg[5] = value & 0x1F;
                this.setPrgBank(1, this.reg[5]); // 映射SetPROM_8K_Bank(5,data)
                break;

            case 0xB000:
                this.reg[0] = (this.reg[0] & 0xF0) | (value & 0x0F);
                this.setChrBank(0, this.reg[0]); // 映射SetVROM_1K_Bank(0,reg[0])
                break;
            case 0xB001: case 0xB004:
                this.reg[0] = (this.reg[0] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(0, this.reg[0]);
                break;
            case 0xB002: case 0xB008:
                this.reg[1] = (this.reg[1] & 0xF0) | (value & 0x0F);
                this.setChrBank(1, this.reg[1]);
                break;
            case 0xB003: case 0xB00C:
                this.reg[1] = (this.reg[1] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(1, this.reg[1]);
                break;

            case 0xC000:
                this.reg[2] = (this.reg[2] & 0xF0) | (value & 0x0F);
                this.setChrBank(2, this.reg[2]);
                break;
            case 0xC001: case 0xC004:
                this.reg[2] = (this.reg[2] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(2, this.reg[2]);
                break;
            case 0xC002: case 0xC008:
                this.reg[3] = (this.reg[3] & 0xF0) | (value & 0x0F);
                this.setChrBank(3, this.reg[3]);
                break;
            case 0xC003: case 0xC00C:
                this.reg[3] = (this.reg[3] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(3, this.reg[3]);
                break;

            case 0xD000:
                this.reg[4] = (this.reg[4] & 0xF0) | (value & 0x0F);
                this.setChrBank(4, this.reg[4]);
                break;
            case 0xD001: case 0xD004:
                this.reg[4] = (this.reg[4] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(4, this.reg[4]);
                break;
            case 0xD002: case 0xD008:
                this.reg[5] = (this.reg[5] & 0xF0) | (value & 0x0F);
                this.setChrBank(5, this.reg[5]);
                break;
            case 0xD003: case 0xD00C:
                this.reg[5] = (this.reg[5] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(5, this.reg[5]);
                break;

            case 0xE000:
                this.reg[6] = (this.reg[6] & 0xF0) | (value & 0x0F);
                this.setChrBank(6, this.reg[6]);
                break;
            case 0xE001: case 0xE004:
                this.reg[6] = (this.reg[6] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(6, this.reg[6]);
                break;
            case 0xE002: case 0xE008:
                this.reg[7] = (this.reg[7] & 0xF0) | (value & 0x0F);
                this.setChrBank(7, this.reg[7]);
                break;
            case 0xE003: case 0xE00C:
                this.reg[7] = (this.reg[7] & 0x0F) | ((value & 0x0F) << 4);
                this.setChrBank(7, this.reg[7]);
                break;

            // IRQ控制 - 完全匹配VirtuaNES
            case 0xF000:
                this.irq_latch = (this.irq_latch & 0xF0) | (value & 0x0F);
                this.nes.mapperIrqWanted = false; // 映射ClrIRQ(IRQ_MAPPER)
                break;
            case 0xF001: case 0xF004:
                this.irq_latch = (this.irq_latch & 0x0F) | ((value & 0x0F) << 4);
                this.nes.mapperIrqWanted = false;
                break;
            case 0xF002: case 0xF008:
                this.irq_enable = value & 0x03;
                this.irq_counter = this.irq_latch;
                this.irq_clock = 0;
                this.nes.mapperIrqWanted = false;
                break;
            case 0xF003: case 0xF00C:
                this.irq_enable = (this.irq_enable & 0x01) * 3;
                this.nes.mapperIrqWanted = false;
                break;
        }
    };

    // 修复ppuRead函数，确保名称表镜像计算正确
    this.ppuRead = function (adr) {
        adr &= 0x3FFF;
        if (adr < 0x2000) {
            if (this.h.chrBanks === 0) {
                // CHR-RAM
                return this.chrRam[adr & 0x1FFF];
            } else {
                // CHR-ROM
                let bank = (adr >> 10) & 7; // 8个1KB页面
                let offset = adr & 0x3FF;

                let chrIdx = (this.chrBank[bank] * 0x400) + offset;
                if (chrIdx >= 0 && chrIdx < this.chrRom.length) {
                    return this.chrRom[chrIdx];
                }
                return 0;
            }
        } else if (adr < 0x3F00) {
            // 名称表区域 - 恢复VirtuaNES风格的镜像计算
            let mirroredAdr;

            // 从0x2000开始的偏移量
            let ntAddr = adr & 0x0FFF;

            // 使用更精确的镜像计算
            switch (this.mirroring) {
                case 0: // 垂直镜像 (左右镜像)
                    // $2000=$2800, $2400=$2C00
                    mirroredAdr = ((ntAddr & 0x0400) >> 0) | (ntAddr & 0x03FF);
                    break;
                case 1: // 水平镜像 (上下镜像)
                    // $2000=$2400, $2800=$2C00
                    mirroredAdr = ((ntAddr & 0x0800) >> 1) | (ntAddr & 0x03FF);
                    break;
                case 2: // 单屏模式0 (只用$2000)
                    mirroredAdr = ntAddr & 0x03FF;
                    break;
                case 3: // 单屏模式1 (只用$2400)
                    mirroredAdr = 0x0400 | (ntAddr & 0x03FF);
                    break;
                case 4: // 四屏模式
                default:
                    mirroredAdr = ntAddr;
                    break;
            }

            // 确保不越界
            return this.ppuRam[mirroredAdr & (this.ppuRam.length - 1)];
        } else {
            // 调色板区域 - 由PPU处理
            return this.nes.ppu.readPalette(adr);
        }
    };

    // 修复ppuWrite函数，确保与ppuRead的镜像逻辑完全一致
    this.ppuWrite = function (adr, value) {
        adr &= 0x3FFF;
        if (adr < 0x2000) {
            // 仅当CHR-RAM时允许写入
            if (this.h.chrBanks === 0) {
                this.chrRam[adr & 0x1FFF] = value;
            }
        } else if (adr < 0x3F00) {
            // 名称表区域
            let mirroredAdr;

            // 从0x2000开始的偏移量
            let ntAddr = adr & 0x0FFF;

            // 使用与ppuRead相同的镜像计算
            switch (this.mirroring) {
                case 0: // 垂直镜像
                    mirroredAdr = ((ntAddr & 0x0400) >> 0) | (ntAddr & 0x03FF);
                    break;
                case 1: // 水平镜像
                    mirroredAdr = ((ntAddr & 0x0800) >> 1) | (ntAddr & 0x03FF);
                    break;
                case 2: // 单屏模式0
                    mirroredAdr = ntAddr & 0x03FF;
                    break;
                case 3: // 单屏模式1
                    mirroredAdr = 0x0400 | (ntAddr & 0x03FF);
                    break;
                case 4: // 四屏模式
                default:
                    mirroredAdr = ntAddr;
                    break;
            }

            // 确保不越界
            this.ppuRam[mirroredAdr & (this.ppuRam.length - 1)] = value;
        } else {
            // 调色板区域
            this.nes.ppu.writePalette(adr, value);
        }
    };

    this.ppuPeak = function (addr) {
        return this.ppuRead(addr);
    };

    // 修复严重的语法错误
    this.getRomAdr = function (adr) {
        if (adr < 0x8000) return -1;
        let bank = (adr - 0x8000) >> 13;
        let offset = adr & 0x1FFF;
        let prgBank = this.prgBank[bank];
        return (prgBank * 0x2000) + offset;
    };

    // 为调试增加的函数 - 可帮助查找问题
    this.debugState = function () {
        return {
            prgBanks: this.prgBank.slice(),
            chrBanks: this.chrBank.slice(),
            mirroring: this.mirroring,
            registers: this.reg.slice(),
            irq: {
                enable: this.irq_enable,
                counter: this.irq_counter,
                latch: this.irq_latch,
                clock: this.irq_clock
            }
        };
    };

    // 确保初始化
    this.reset(true);
}

mappers[23] = Mapper23;