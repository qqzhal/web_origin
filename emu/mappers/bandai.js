//mapper接收的 rom 没有文件头,已经在loadrom的时候 去掉了  rom.subarray(header.base);
//注意 变量函数等命名方式,需要符合 nes/pipu.js nes/nes.js nes/cpu.js js/debugger.js
//由于主程序与mapper之间有相互调用的情况,所以函数方法命名方式必须与当前jsnes模拟器一致

mappers[16] = function (nes, rom, header) {
    // 保存基础信息
    this.nes = nes;
    this.rom = rom;
    this.h = header;

    // 游戏信息映射表 - 基于VirtuaNES实现
    const GAME_INFO = {
        // Famicom Jump 2
        "0x3f15d20d": { patch: 1, eeprom_type: 0xFF, name: "Famicom Jump 2(J)" },
        "0xf76aa523": { patch: 1, eeprom_type: 0xFF, name: "Famicom Jump 2(J)" },

        // Dragon Ball Z
        "0x31cd9903": { irq_type: 1, name: "Dragon Ball Z(J)" },
        "0x2e991109": { irq_type: 1, eeprom_type: 1, name: "Dragon Ball Z外传(J)" },

        // SD Gundam
        "0x9552e8df": { irq_type: 1, eeprom_type: 1, name: "SD Gundam Gaiden(J)" },
        "0x1d6f27f7": { irq_type: 1, eeprom_type: 1, name: "SD Gundam Gaiden(J)" },

        // Rokudenashi Blues
        "0x6f3ed9e0": { irq_type: 1, eeprom_type: 1, name: "Rokudenashi Blues(J)" },

        // 其他游戏可根据需要添加
    };

    // 计算标准CRC32 - 使用与VirtuaNES一致的算法
    function crc32(data) {
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
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // 计算PRG ROM的CRC32校验和
    let prgSize = header.banks * 0x4000;
    let prgCrc = calcCRC32(rom.slice(0, prgSize));
    let crcHex = "0x" + prgCrc.toString(16);

    // 初始化基础变量
    this.patch = 0;
    this.irq_type = 0;
    this.eeprom_type = 0;
    this.romCRC = prgCrc;

    // 适用游戏特定设置
    if (GAME_INFO[crcHex]) {
        const info = GAME_INFO[crcHex];
        if (info.patch !== undefined) this.patch = info.patch;
        if (info.irq_type !== undefined) this.irq_type = info.irq_type;
        if (info.eeprom_type !== undefined) this.eeprom_type = info.eeprom_type;
        console.log(`检测到游戏: ${info.name || "未知"}`);
    }


    // 识别是否使用CHR RAM而非ROM
    const useChrRam = header.chrBanks === 0;

    // 内存分配
    this.chrRam = new Uint8Array(0x2000);  // 8KB CHR RAM
    this.chrRom = null;

    // CHR ROM存在时加载
    if (!useChrRam && rom.length > prgSize) {
        this.chrRom = rom.slice(prgSize);

        // 检查CHR ROM是否为空
        let isEmpty = true;
        for (let i = 0; i < Math.min(1024, this.chrRom.length); i++) {
            if (this.chrRom[i] !== 0) {
                isEmpty = false;
                break;
            }
        }

        // CHR ROM校验
        const chrCrc = crc32(this.chrRom);
        console.log(`Mapper 16: 加载完整CHR ROM: ${this.chrRom.length} bytes, PRG_CRC=${prgCrc.toString(16)}, CHR_CRC=${chrCrc.toString(16)}`);

        if (isEmpty) {
            console.log(" 警告: CHR ROM数据似乎全是0，可能数据损坏或需重置NVRAM");
        }
    }

    this.prgRam = new Uint8Array(0x2000);  // 8KB PRG RAM
    this.eeprom = new Uint8Array(384);      // EEPROM存储
    this.ppuRam = new Uint8Array(0x800);    // 2KB PPU RAM

    // 初始化EEPROM处理器
    if (this.eeprom_type === 0) {
        this.x24c01 = new X24C01(this.prgRam);
        this.x24c02 = { Read: () => 1, Write: () => { } };
    } else if (this.eeprom_type === 1) {
        this.x24c01 = { Read: () => 1, Write: () => { } };
        this.x24c02 = new X24C02(this.prgRam);
    } else if (this.eeprom_type === 2) {
        this.x24c02 = new X24C02(this.prgRam);
        this.x24c01 = new X24C01(this.prgRam.subarray(256));
    } else {
        this.x24c01 = { Read: () => 1, Write: () => { } };
        this.x24c02 = { Read: () => 1, Write: () => { } };
    }

    // 寄存器初始化
    this.reg = [0, 0, 0];
    this.patchReg = [0, 0, 0];
    this.chrRegs = new Uint8Array(8);

    // IRQ控制寄存器
    this.irq_enable = 0;
    this.irq_counter = 0;
    this.irq_latch = 0;

    // 内存映射变量
    this.prgBanks = [0, 1, header.banks - 2, header.banks - 1];
    this.mirrorMode = 0;

    // 保存状态变量列表
    this.saveVars = [
        "patch", "irq_type", "eeprom_type", "chrRam", "prgRam",
        "eeprom", "ppuRam", "reg", "patchReg", "chrRegs",
        "irq_enable", "irq_counter", "irq_latch", "prgBanks",
        "mirrorMode"
    ];

    // PRG Bank设置函数
    this.setPrgBanks = function (isReset) {
        if (this.patch) {
            // 补丁模式 - 用于Famicom Jump 2
            let base = (this.patchReg[0] & 1) * 0x20 + (this.patchReg[2] & 0x1F) * 2;
            this.prgBanks[0] = base + 0;
            this.prgBanks[1] = base + 1;
            let base2 = (this.patchReg[1] & 1) * 0x20 + 0x1E;
            this.prgBanks[2] = base2;
            this.prgBanks[3] = base2 + 1;
        } else {
            // 标准模式
            if (isReset) {
                this.prgBanks[0] = 0;
                this.prgBanks[1] = 1;
            } else {
                let bank = this.reg[2] & 0x0F;
                // 正确设置32KB逻辑bank
                this.prgBanks[0] = bank * 2;     // 第一个16KB区域
                this.prgBanks[1] = bank * 2 + 1; // 第二个16KB区域
            }
            // 固定最后两个bank到ROM末尾
            this.prgBanks[2] = this.h.banks - 2;
            this.prgBanks[3] = this.h.banks - 1;
        }
    };

    // CHR Bank初始化函数
    this.setChrBanks = function () {
        for (let i = 0; i < 8; i++) {
            this.chrRegs[i] = i;
        }
    };

    // 重置函数
    this.reset = function (hard) {
        // 寄存器重置
        this.reg[0] = this.reg[1] = this.reg[2] = 0;
        this.patchReg[0] = this.patchReg[1] = this.patchReg[2] = 0;

        // IRQ状态重置
        this.irq_enable = 0;
        this.irq_counter = 0;
        this.irq_latch = 0;

        // 设置镜像模式
        this.mirrorMode = header.verticalMirroring ? 0 : 1;

        // 初始化内存映射
        this.setPrgBanks(true);
        this.setChrBanks();

        // 硬重置清空RAM
        if (hard) {
            if (!this.h.battery) {
                for (let i = 0; i < this.prgRam.length; i++) this.prgRam[i] = 0;
                for (let i = 0; i < this.eeprom.length; i++) this.eeprom[i] = 0;
            }
            for (let i = 0; i < this.chrRam.length; i++) this.chrRam[i] = 0;
            for (let i = 0; i < this.ppuRam.length; i++) this.ppuRam[i] = 0;
        }
    };

    // PPU读取函数
    this.ppuRead = function (adr) {
        if (adr < 0x2000) {
            // CHR ROM/RAM区域
            if (this.h.chrBanks === 0) {
                // CHR RAM模式
                return this.chrRam[adr & 0x1FFF];
            } else {
                // CHR ROM模式
                let bankIdx = (adr >> 10) & 0x07; // 8个1KB bank
                let bankNum = this.chrRegs[bankIdx];
                let offset = adr & 0x3FF;

                // 计算实际CHR ROM地址 (每个bank 1KB = 0x400字节)
                let chrPos = (bankNum * 0x400) + offset;

                // 确保地址有效
                if (this.chrRom && chrPos >= 0 && chrPos < this.chrRom.length) {
                    return this.chrRom[chrPos];
                }
                return 0;
            }
        } else {
            // 名称表区域 ($2000-$3FFF)
            let mirrorAdr = this.getMirroringAdr(adr);
            if (mirrorAdr >= 0 && mirrorAdr < this.ppuRam.length) {
                return this.ppuRam[mirrorAdr];
            }
            return 0;
        }
    };

    // PPU写入函数
    this.ppuWrite = function (adr, value) {
        if (adr < 0x2000) {
            if (this.h.chrBanks === 0) {
                this.chrRam[adr & 0x1FFF] = value;
            }
        } else {
            let mirroredAddr = this.getMirroringAdr(adr);
            if (mirroredAddr >= 0 && mirroredAddr < this.ppuRam.length) {
                this.ppuRam[mirroredAddr] = value;
            }
        }
    };

    // 镜像地址计算函数 - 符合VirtuaNES实现
    this.getMirroringAdr = function (adr) {
        if (adr < 0x2000) return adr;

        // 名称表地址: $2000-$3EFF
        let addr = (adr - 0x2000) & 0x0FFF;

        // 根据mirrorMode确定正确的镜像
        switch (this.mirrorMode) {
            case 0: // 垂直镜像
                return addr & 0x7FF;
            case 1: // 水平镜像
                return ((addr & 0x800) >> 1) | (addr & 0x3FF);
            case 2: // 单屏低位
                return addr & 0x3FF;
            case 3: // 单屏高位
                return 0x400 | (addr & 0x3FF);
            default:
                return addr & 0x7FF;
        }
    };

    // CPU读取函数
    this.read = function (adr) {
        if (adr < 0x8000) {
            if (adr >= 0x6000 && adr < 0x8000) {
                return this.prgRam[adr & 0x1FFF];
            }
            return this.readLow(adr);
        }
        let romAdr = this.getRomAdr(adr);
        if (romAdr >= 0 && romAdr < this.rom.length) {
            return this.rom[romAdr];
        }
        return 0;
    };

    // 低地址读取 - 主要用于EEPROM访问
    this.readLow = function (addr) {
        if (!this.patch) {
            if ((addr & 0x00FF) === 0x0000) {
                let ret = 0;
                if (this.eeprom_type === 0) {
                    ret = this.x24c01.Read();
                } else if (this.eeprom_type === 1) {
                    ret = this.x24c02.Read();
                } else if (this.eeprom_type === 2) {
                    ret = this.x24c02.Read() & this.x24c01.Read();
                }
                return (ret ? 0x10 : 0);
            }
        }
        return 0x00;
    };

    // CPU写入函数 - 完全重写以符合VirtuaNES
    this.write = function (adr, value) {
        if (adr < 0x6000) {
            if ((adr & 0x00FF) === 0) {
                this.reg[0] = value;
                if (this.eeprom_type === 0 || this.eeprom_type === 2) {
                    this.x24c01.Write((value & 0x08) ? 0xFF : 0, (this.reg[1] & 0x40) ? 0xFF : 0);
                }
                return;
            }
            return;
        }

        if (adr >= 0x6000 && adr < 0x8000) {
            this.prgRam[adr & 0x1FFF] = value;
            return;
        }

        if (adr >= 0x8000) {
            if (this.patch) {
                this.writeSubB(adr, value);
            } else {
                this.writeSubA(adr, value);
            }
        }
    };

    // 标准Mapper 16写入函数
    this.writeSubA = function (addr, value) {
        switch (addr & 0x000F) {
            case 0x0000:
            case 0x0001:
            case 0x0002:
            case 0x0003:
            case 0x0004:
            case 0x0005:
            case 0x0006:
            case 0x0007:
                if (this.h.chrBanks > 0) {
                    this.chrRegs[addr & 0x0007] = value;
                }
                if (this.eeprom_type === 2) {
                    this.reg[0] = value;
                    this.x24c01.Write((value & 0x08) ? 0xFF : 0, (this.reg[1] & 0x40) ? 0xFF : 0);
                }
                break;

            case 0x0008:
                this.reg[2] = value;
                this.setPrgBanks(false);
                break;

            case 0x0009:
                value &= 0x03;
                this.mirrorMode = value;
                break;

            case 0x000A:
                this.irq_enable = value & 0x01;
                this.irq_counter = this.irq_latch;
                this.nes.mapperIrqWanted = false;
                break;

            case 0x000B:
                this.irq_latch = (this.irq_latch & 0xFF00) | value;
                this.irq_counter = (this.irq_counter & 0xFF00) | value;
                break;

            case 0x000C:
                this.irq_latch = ((value & 0xFF) << 8) | (this.irq_latch & 0x00FF);
                this.irq_counter = ((value & 0xFF) << 8) | (this.irq_counter & 0x00FF);
                break;

            case 0x000D:
                if (this.eeprom_type === 0) {
                    this.x24c01.Write((value & 0x20) ? 0xFF : 0, (value & 0x40) ? 0xFF : 0);
                } else if (this.eeprom_type === 1) {
                    this.x24c02.Write((value & 0x20) ? 0xFF : 0, (value & 0x40) ? 0xFF : 0);
                } else if (this.eeprom_type === 2) {
                    this.reg[1] = value;
                    this.x24c02.Write((value & 0x20) ? 0xFF : 0, (value & 0x40) ? 0xFF : 0);
                    this.x24c01.Write((this.reg[0] & 0x08) ? 0xFF : 0, (value & 0x40) ? 0xFF : 0);
                }
                break;
        }
    };

    // Famicom Jump 2特殊写入函数
    this.writeSubB = function (addr, value) {
        switch (addr) {
            case 0x8000:
            case 0x8001:
            case 0x8002:
            case 0x8003:
                this.patchReg[0] = value;
                this.setPrgBanks(false);
                break;

            case 0x8004:
            case 0x8005:
            case 0x8006:
            case 0x8007:
                this.patchReg[1] = value;
                this.setPrgBanks(false);
                break;

            case 0x8008:
                if (this.h.chrBanks > 0) {
                    this.chrRegs[0] = value;
                }
                break;

            case 0x8009:
                if (this.h.chrBanks > 0) {
                    this.chrRegs[1] = value;
                }
                break;

            case 0x800A:
                this.patchReg[2] = value;
                this.setPrgBanks(false);
                break;

            case 0x800B:
                value &= 0x03;
                this.mirrorMode = value;
                break;

            case 0x800C:
                // EEPROM控制
                break;

            case 0x800D:
                // 未使用
                break;
        }
    };

    // 扫描线IRQ处理 - 符合VirtuaNES实现
    this.hsync = function (scanline) {
        if (this.irq_enable && this.irq_type === 1) {
            if (this.irq_counter <= 113) {
                this.nes.mapperIrqWanted = true;
                this.irq_counter = this.irq_latch;
            } else {
                this.irq_counter -= 113;
            }

        }
    };

    // CPU时钟IRQ处理
    this.clock = function (cycles) {
        if (this.irq_enable && this.irq_type === 0) {
            if ((this.irq_counter -= cycles) <= 0) {
                this.nes.mapperIrqWanted = true;
                this.irq_counter &= 0xFFFF;  // 防止溢出
            }
        }
    };

    // 获取ROM地址
    this.getRomAdr = function (adr) {
        let bank;
        if (adr >= 0x8000 && adr < 0xA000) {
            bank = this.prgBanks[0];
        } else if (adr >= 0xA000 && adr < 0xC000) {
            bank = this.prgBanks[1];
        } else if (adr >= 0xC000 && adr < 0xE000) {
            bank = this.prgBanks[2];
        } else {
            bank = this.prgBanks[3];
        }
        return (bank * 0x2000) + (adr & 0x1FFF);
    };

    // 直接读取函数
    this.peak = function (adr) {
        return this.read(adr);
    };

    // PPU直接读取
    this.ppuPeak = function (adr) {
        return this.ppuRead(adr);
    };

    // 保存状态函数
    this.saveState = function () {
        let state = {};
        for (let i = 0; i < this.saveVars.length; i++) {
            let name = this.saveVars[i];
            let val = this[name];
            if (val instanceof Uint8Array || val instanceof Uint16Array) {
                state[name] = Array.from(val);
            } else {
                state[name] = val;
            }
        }
        return state;
    };

    // 加载状态函数
    this.loadState = function (state) {
        for (let i = 0; i < this.saveVars.length; i++) {
            let name = this.saveVars[i];
            let val = this[name];
            if (val instanceof Uint8Array) {
                this[name] = new Uint8Array(state[name]);
            } else if (val instanceof Uint16Array) {
                this[name] = new Uint16Array(state[name]);
            } else {
                this[name] = state[name];
            }
        }
    };

    // 电池存取函数
    this.getBattery = function () {
        return Array.from(this.prgRam);
    };

    this.setBattery = function (data) {
        if (data && Array.isArray(data) && data.length === this.prgRam.length) {
            this.prgRam = new Uint8Array(data);
            return true;
        }
        return false;
    };

    // 初始化执行
    this.reset(true);
};

// 24C01 EEPROM模拟器
function X24C01(ram) {
    this.ram = ram;
    this.address = 0;
    this.rw = 0;
    this.cmd = 0;
    this.stat = 0;
    this.bdata = 0;
    this.sda = 0;
    this.scl = 0;
    this.out = 0;

    this.Read = function () {
        return this.out;
    };

    this.Write = function (sda, scl) {
        if (this.scl === 0 && scl === 1) {
            if (this.stat === 1 || this.stat === 2) {
                this.bdata <<= 1;
                this.bdata |= (sda ? 1 : 0);
            }
            if (this.stat === 0 && this.sda === 1 && sda === 0) {
                this.stat = 1;
                this.bdata = 0;
            }
        } else if (this.scl === 1 && scl === 0) {
            if (this.stat === 1) {
                if ((this.bdata & 0xF0) === 0xA0) {
                    this.cmd = this.bdata;
                    if ((this.cmd & 0x01) === 0) {
                        this.rw = 0;
                        this.address = 0;
                        this.stat = 2;
                        this.bdata = 0;
                    } else {
                        this.rw = 1;
                        this.out = 0;
                        if (this.address < 128) {
                            this.out = (this.ram[this.address] & 0x01);
                        }
                        this.address = (this.address + 1) & 0x7F;
                    }
                } else {
                    this.stat = 0;
                }
            } else if (this.stat === 2 && this.rw === 0) {
                this.address = this.bdata & 0x7F;
                this.stat = 3;
                this.bdata = 0;
            } else if (this.stat === 3 && this.rw === 0) {
                if (this.address < 128) {
                    this.ram[this.address] = this.bdata;
                }
                this.address = (this.address + 1) & 0x7F;
                this.stat = 2;
                this.bdata = 0;
            }
        }
        this.sda = sda;
        this.scl = scl;
    };
}

// 24C02 EEPROM模拟器 - 256字节容量
function X24C02(ram) {
    this.ram = ram;
    this.address = 0;
    this.rw = 0;
    this.cmd = 0;
    this.stat = 0;
    this.bdata = 0;
    this.sda = 0;
    this.scl = 0;
    this.out = 0;

    this.Read = function () {
        return this.out;
    };

    this.Write = function (sda, scl) {
        if (this.scl === 0 && scl === 1) {
            if (this.stat === 1 || this.stat === 2) {
                this.bdata <<= 1;
                this.bdata |= (sda ? 1 : 0);
            }
            if (this.stat === 0 && this.sda === 1 && sda === 0) {
                this.stat = 1;
                this.bdata = 0;
            }
        } else if (this.scl === 1 && scl === 0) {
            if (this.stat === 1) {
                if ((this.bdata & 0xF0) === 0xA0) {
                    this.cmd = this.bdata;
                    if ((this.cmd & 0x01) === 0) {
                        this.rw = 0;
                        this.address = 0;
                        this.stat = 2;
                        this.bdata = 0;
                    } else {
                        this.rw = 1;
                        this.out = 0;
                        if (this.address < 256) {
                            this.out = (this.ram[this.address] & 0x01);
                        }
                        this.address = (this.address + 1) & 0xFF;
                    }
                } else {
                    this.stat = 0;
                }
            } else if (this.stat === 2 && this.rw === 0) {
                this.address = this.bdata & 0xFF;
                this.stat = 3;
                this.bdata = 0;
            } else if (this.stat === 3 && this.rw === 0) {
                if (this.address < 256) {
                    this.ram[this.address] = this.bdata;
                }
                this.address = (this.address + 1) & 0xFF;
                this.stat = 2;
                this.bdata = 0;
            }
        }
        this.sda = sda;
        this.scl = scl;
    };
}