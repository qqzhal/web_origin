function Ppu(nes) {

  // memory handler
  this.nes = nes;

  // nametable memory stored in mapper to simplify code

  // palette memory
  this.paletteRam = new Uint8Array(0x20);

  // oam memory
  this.oamRam = new Uint8Array(0x100);

  // sprite buffers
  this.secondaryOam = new Uint8Array(0x100); // 增加到256字节，支持最多64个精灵
  this.spriteTiles = new Uint8Array(0x100); // 增加到256字节，支持最多64个精灵（每个精灵需要2个条目）

  // final pixel output
  this.pixelOutput = new Uint16Array(256 * 240);

  // 新增：暴露renderMethod
  this.renderMethod = nes.renderMethod || null;

  // 添加 setMirroring 方法
  this.setMirroring = function (mode) {
    // 根据镜像模式设置内部状态
    this.mirrorMode = mode;

    // 更新 getMirroringAdr 方法的行为
    switch (mode) {
      case this.nes.rom.VERTICAL_MIRRORING:
        // 垂直镜像：$2000=$2800, $2400=$2C00
        this.getMirroringAdr = function (adr) {
          adr = (adr - 0x2000) & 0x0FFF;
          return adr & 0x7FF;
        };
        break;
      case this.nes.rom.HORIZONTAL_MIRRORING:
        // 水平镜像：$2000=$2400, $2800=$2C00
        this.getMirroringAdr = function (adr) {
          adr = (adr - 0x2000) & 0x0FFF;
          return (adr & 0x3FF) | ((adr & 0x800) >> 1);
        };
        break;
      case this.nes.rom.FOUR_SCREEN_MIRRORING:
        // 四屏镜像：所有名称表独立
        this.getMirroringAdr = function (adr) {
          return (adr - 0x2000) & 0x0FFF;
        };
        break;
      case this.nes.rom.SINGLE_SCREEN_MIRRORING_LOW:
        // 单屏镜像 (低)：所有名称表映射到第一个名称表
        this.getMirroringAdr = function (adr) {
          return (adr - 0x2000) & 0x3FF;
        };
        break;
      case this.nes.rom.SINGLE_SCREEN_MIRRORING_HIGH:
        // 单屏镜像 (高)：所有名称表映射到第二个名称表
        this.getMirroringAdr = function (adr) {
          return ((adr - 0x2000) & 0x3FF) + 0x400;
        };
        break;
      default:
        // 默认垂直镜像
        this.getMirroringAdr = function (adr) {
          adr = (adr - 0x2000) & 0x0FFF;
          return adr & 0x7FF;
        };
    }
  };

  // 初始默认为垂直镜像
  this.mirrorMode = 0;

  this.reset = function () {
    for (let i = 0; i < this.paletteRam.length; i++) {
      this.paletteRam[i] = 0;
    }
    for (let i = 0; i < this.oamRam.length; i++) {
      this.oamRam[i] = 0;
    }
    for (let i = 0; i < 0x100; i++) {
      this.secondaryOam[i] = 0;
    }
    for (let i = 0; i < 0x100; i++) {
      this.spriteTiles[i] = 0;
    }
    for (let i = 0; i < this.pixelOutput.length; i++) {
      this.pixelOutput[i] = 0;
    }

    // scrolling / vram address
    this.t = 0; // temporary vram address
    this.v = 0; // vram address
    this.w = 0; // write flag
    this.x = 0; // fine x scroll

    // dot position
    this.line = 0;
    this.dot = 0;
    this.evenFrame = true;

    // rest
    this.oamAddress = 0; // oam address
    this.readBuffer = 0; // 2007 buffer;

    // for PPUSTAUS
    this.spriteZero = false;
    this.spriteOverflow = false;
    this.inVblank = false;

    // for PPUCTRL
    this.vramIncrement = 1;
    this.spritePatternBase = 0;
    this.bgPatternBase = 0;
    this.spriteHeight = 8;
    this.slave = false;
    this.generateNmi = false;

    // for PPUMASK
    this.greyScale = false;
    this.bgInLeft = false;        // 左边缘8像素背景显示
    this.sprInLeft = false;       // 左边缘8像素精灵显示
    this.bgRendering = false;     // 背景渲染启用
    this.sprRendering = false;    // 精灵渲染启用
    this.emphasis = 0;           // 色调强调

    // internal operation
    this.atl = 0;
    this.atr = 0;
    this.tl = 0;
    this.th = 0;
    this.spriteZeroIn = false;
    this.spriteCount = 0;
  }
  this.reset();
  this.saveVars = [
    "paletteRam", "oamRam", "secondaryOam", "spriteTiles", "t", "v",
    "w", "x", "line", "dot", "evenFrame", "oamAddress", "readBuffer",
    "spriteZero", "spriteOverflow", "inVblank", "vramIncrement",
    "spritePatternBase", "bgPatternBase", "spriteHeight", "slave",
    "generateNmi", "greyScale", "bgInLeft", "sprInLeft", "bgRendering",
    "sprRendering", "emphasis", "atl", "atr", "tl", "th", "spriteZeroIn",
    "spriteCount"
  ];

  this.cycle = function () {

    if (this.line < 240) {
      // visible frame
      if (this.dot < 256) {
        this.generateDot();
        if (((this.dot + 1) & 0x7) === 0) {
          // dot 7, 15, 23, 31 etc
          if (this.bgRendering || this.sprRendering) {
            this.readTileBuffers();
            this.incrementVx();
          }
        }
      } else if (this.dot === 256) {
        if (this.bgRendering || this.sprRendering) {
          this.incrementVy();
        }
      } else if (this.dot === 257) {
        if (this.bgRendering || this.sprRendering) {
          // copy x parts from t to v
          this.v &= 0x7be0;
          this.v |= (this.t & 0x41f);
        }
      } else if (this.dot === 270) {
        // clear sprite buffers
        this.spriteZeroIn = false;
        this.spriteCount = 0;
        if (this.bgRendering || this.sprRendering) {
          // do sprite evaluation for NEXT line
          this.evaluateSprites(this.line + 1);
        }
      } else if (this.dot === 321 || this.dot === 329) {
        if (this.bgRendering || this.sprRendering) {
          this.readTileBuffers();
          this.incrementVx();
        }
      }
    } else if (this.line === 241) {
      if (this.dot === 1) {
        this.inVblank = true;
        if (this.generateNmi) {
          this.nes.cpu.nmiWanted = true;
        }
        if (this.bgRendering || this.sprRendering) {
          this.evenFrame = !this.evenFrame; // flip frame state
        } else {
          this.evenFrame = true; // not in rendering, all frames are even
        }
      }
    } else if (this.line === 261) {
      // pre render line
      if (this.dot === 1) {
        this.inVblank = false;
        this.spriteZero = false;
        this.spriteOverflow = false;
      } else if (this.dot === 257) {
        if (this.bgRendering || this.sprRendering) {
          // copy x parts from t to v
          this.v &= 0x7be0;
          this.v |= (this.t & 0x41f);
        }
      } else if (this.dot === 270) {
        // clear sprite buffers from sprites evaluated on line 239
        this.spriteZeroIn = false;
        this.spriteCount = 0;
        if (this.bgRendering || this.sprRendering) {
          // Evaluate sprites for first visible scanline (line 0)
          this.evaluateSprites(0);
        }
      } else if (this.dot === 280) {
        if (this.bgRendering || this.sprRendering) {
          // copy y parts from t to v
          this.v &= 0x41f;
          this.v |= (this.t & 0x7be0);
        }
      } else if (this.dot === 321 || this.dot === 329) {
        if (this.bgRendering || this.sprRendering) {
          this.readTileBuffers();
          this.incrementVx();
        }
      }
    }

    this.dot++;
    if (this.dot === 341 || (
      this.dot === 340 && this.line === 261 && !this.evenFrame
    )) {
      // if we loop (1 early on odd frames on line 261)
      this.dot = 0;
      // 确保只在这里调用hsync，避免与Mapper23重复调用
      if (this.nes && this.nes.mapper && typeof this.nes.mapper.hsync === "function") {
        this.nes.mapper.hsync(this.line);
      }
      this.line++;
      if (this.line === 262) {
        this.line = 0;
      }
    }
  }

  // 验证是否是精灵
  this.isSprite = function (index) {
    const spriteBase = index * 4;
    if (spriteBase >= this.oamRam.length) {
      return false; // 超出 OAM 范围
    }

    const y = this.oamRam[spriteBase]; // 精灵的 Y 坐标
    const x = this.oamRam[spriteBase + 3]; // 精灵的 X 坐标

    return true; // 是有效的精灵
  };

  // 获取精灵的 CHR 地址
  this.getSpriteChrAddr = function (index) {
    const spriteBase = index * 4;
    if (spriteBase >= this.oamRam.length) {
      return null; // 超出 OAM 范围
    }

    const tileNum = this.oamRam[spriteBase + 1]; // 精灵的图块编号
    const patternBase = this.spritePatternBase; // 精灵图案表基地址

    // 如果精灵高度为 16 像素，需要调整 tileNum 的计算
    if (this.spriteHeight === 16) {
      const bank = (tileNum & 0x01) * 0x1000; // 高度为 16 时，使用 bank 位
      return bank + (tileNum & 0xFE) * 16; // 每个图块占 16 字节
    }

    return patternBase + tileNum * 16; // 每个图块占 16 字节
  };


  this.evaluateSprites = function (targetLine) {
    if (typeof targetLine !== 'number') targetLine = this.line;
    // 每次评估前清零 secondaryOam 和 spriteTiles，防止残留
    for (let i = 0; i < 0x100; i++) {
      this.secondaryOam[i] = 0;
    }
    for (let i = 0; i < 0x80; i++) {
      this.spriteTiles[i] = 0;
    }
    this.spriteCount = 0;

    // PPU 在本行的 270 周期评估“下一行”的精灵
    for (let i = 0; i < 256; i += 4) {
      let sprY = this.oamRam[i];
      // OAM 中的 Y 比实际显示位置小 1，因此 targetLine 要与 (sprY+1) 比较
      let sprRow = targetLine - (sprY + 1);
      if (sprRow >= 0 && sprRow < this.spriteHeight) {
        // 如果不限制活动块，则移除8个精灵的限制
        const maxSprites = (window.unlimitedSprites) ? 64 : 8;
        if (this.spriteCount === maxSprites) {
          // 当达到最大精灵数量时设置溢出标志（除了不限制精灵模式）
          if (!window.unlimitedSprites || this.spriteCount > 8) {
            this.spriteOverflow = true;
          }
          break;
        } else {
          if (i === 0) {
            // sprite zero
            this.spriteZeroIn = true;
          }
          // 确保不会超出缓冲区范围
          if (this.spriteCount * 4 + 3 >= this.secondaryOam.length) {
            break;
          }
          
          this.secondaryOam[this.spriteCount * 4] = this.oamRam[i];
          this.secondaryOam[this.spriteCount * 4 + 1] = this.oamRam[i + 1];
          this.secondaryOam[this.spriteCount * 4 + 2] = this.oamRam[i + 2];
          this.secondaryOam[this.spriteCount * 4 + 3] = this.oamRam[i + 3];
          if ((this.oamRam[i + 2] & 0x80) > 0) {
            sprRow = this.spriteHeight - 1 - sprRow;
          }
          let base = this.spritePatternBase;
          let tileNum = this.oamRam[i + 1];
          if (this.spriteHeight === 16) {
            base = (tileNum & 0x1) * 0x1000;
            tileNum = (tileNum & 0xfe);
            tileNum += (sprRow & 0x8) >> 3;
            sprRow &= 0x7;
          }
          // 确保不会超出spriteTiles缓冲区范围（每个精灵需要2个连续条目）
          if (this.spriteCount * 2 + 1 >= this.spriteTiles.length) {
            break;
          }
          
          this.spriteTiles[this.spriteCount * 2] = this.readInternal(
            base + tileNum * 16 + sprRow
          );
          this.spriteTiles[this.spriteCount * 2 + 1] = this.readInternal(
            base + tileNum * 16 + sprRow + 8
          );
          this.spriteCount++;
        }
      }
    }
    // garbage fetch if not all slots were filled
    let base = this.spriteHeight === 16 ? 0x1000 : this.spritePatternBase;
    const maxSprites = (window.unlimitedSprites) ? 64 : 8;
    if (this.spriteCount < maxSprites) {
      for (let k = this.spriteCount; k < maxSprites; k++) {
        this.readInternal(base + 0xFF); // 使用标准垃圾获取地址
      }
    }
  }

  this.readTileBuffers = function () {
    let tileNum = this.readInternal(0x2000 + (this.v & 0xfff));

    this.atl = this.atr;
    let attAdr = 0x23c0;
    attAdr |= (this.v & 0x1c) >> 2;
    attAdr |= (this.v & 0x380) >> 4;
    attAdr |= (this.v & 0xc00);
    this.atr = this.readInternal(attAdr);
    if ((this.v & 0x40) > 0) {
      // bottom half
      this.atr >>= 4;
    }
    this.atr &= 0xf;
    if ((this.v & 0x02) > 0) {
      // right half
      this.atr >>= 2;
    }
    this.atr &= 0x3;

    let fineY = (this.v & 0x7000) >> 12;
    this.tl &= 0xff;
    this.tl <<= 8;
    this.tl |= this.readInternal(this.bgPatternBase + tileNum * 16 + fineY);
    this.th &= 0xff;
    this.th <<= 8;
    this.th |= this.readInternal(
      this.bgPatternBase + tileNum * 16 + fineY + 8
    );
  }

  this.generateDot = function () {
    // 获取当前使用的渲染方法
    let renderMethod = this.nes && this.nes.renderMethod ? this.nes.renderMethod : null;
    if (this.renderMethod) renderMethod = this.renderMethod; // 优先使用自身的renderMethod

    // 检查是否在可见区域
    let lineBetween = this.line >= 0 && this.line < 240;
    let dotBetween = this.dot >= 0 && this.dot < 256;
    let inVisibleArea = lineBetween && dotBetween;

    // TILE_RENDER 渲染处理 - 优先其他特殊渲染之前
    if (renderMethod === "TILE_RENDER" && inVisibleArea) {
      this.handleRender(true, true); // 强制背景和精灵渲染
      return; // 直接返回，不执行后续逻辑
    }

    // PRE_ALL_RENDER 处理
    if (renderMethod === "PRE_ALL_RENDER" && inVisibleArea) {
      this.handleRender(true, true); // 强制背景和精灵渲染
      return; // 直接返回，不执行后续逻辑
    }

    // POST_RENDER 处理
    if (renderMethod === "POST_RENDER" && inVisibleArea) {
      this.handleRender(true, true); // 强制背景和精灵渲染
      return; // 直接返回，不执行后续逻辑
    }

    // POST_ALL_RENDER 处理
    if (renderMethod === "POST_ALL_RENDER" && inVisibleArea) {
      this.handleRender(true, true); // 强制背景和精灵渲染
      return; // 直接返回，不执行后续逻辑
    }

    // SCANLINE_RENDER 处理 - 逐行渲染方式
    if (renderMethod === "SCANLINE_RENDER" && inVisibleArea) {
      // 只有当扫描线变化时才渲染
      if (this.dot === 0) {
        this.handleRender(true, true);
      }
      return;
    }

    // BG_SP_PRIORITY 处理 - 特殊精灵优先级处理
    if (renderMethod === "BG_SP_PRIORITY" && inVisibleArea) {
      // 特殊精灵优先级逻辑
      this.handleRenderWithPriority();
      return;
    }

    // 默认渲染逻辑
    this.handleRender(this.bgRendering, this.sprRendering);
  };

  // 新增：通用渲染处理函数
  this.handleRender = function (forceBgRendering, forceSprRendering) {
    // 保存原始渲染状态
    const originalBgRendering = this.bgRendering;
    const originalSprRendering = this.sprRendering;

    // 根据参数强制设置渲染状态
    this.bgRendering = forceBgRendering;
    this.sprRendering = forceSprRendering;

    let i = this.dot & 0x7;
    let bgPixel = 0;
    let sprPixel = 0;
    let sprNum = -1;
    let sprPriority = 0;

    // 精灵渲染优化：缓存精灵数据，避免重复计算
    if (this.dot > 7 || this.sprInLeft) {
      const maxSprites = (window.unlimitedSprites) ? this.spriteCount : Math.min(this.spriteCount, 8);
      for (let j = 0; j < maxSprites; j++) {
        // 确保不会超出spriteTiles数组边界（每个精灵需要2个连续条目）
        if (j * 2 + 1 >= this.spriteTiles.length) {
          break;
        }
        let xPos = this.secondaryOam[j * 4 + 3];
        let xCol = this.dot - xPos;
        if (xCol >= 0 && xCol < 8) {
          let shift = (this.secondaryOam[j * 4 + 2] & 0x40) ? xCol : 7 - xCol;
          let pixel = ((this.spriteTiles[j * 2] >> shift) & 1) | (((this.spriteTiles[j * 2 + 1] >> shift) & 1) << 1);
          if (pixel > 0) {
            sprPixel = (pixel | ((this.secondaryOam[j * 4 + 2] & 0x3) << 2)) & 0xF;
            sprPriority = (this.secondaryOam[j * 4 + 2] & 0x20) >> 5;
            sprNum = j;
            break; // 找到第一个就停止，优化性能
          }
        }
      }
    }

    // 背景渲染
    if (this.dot > 7 || this.bgInLeft) {
      let shiftAmount = 15 - i - this.x;
      bgPixel = ((this.tl >> shiftAmount) & 1) | (((this.th >> shiftAmount) & 1) << 1);
      if (bgPixel > 0) {
        bgPixel += ((this.x + i > 7) ? this.atr : this.atl) * 4;
      }
    }

    // 优先级处理
    let finalColor;
    if (bgPixel === 0) {
      finalColor = sprPixel > 0 ? this.readPalette((sprPixel + 0x10) & 0x1F) : this.readPalette(0);
    } else {
      if (sprPixel > 0) {
        if (sprNum === 0 && this.spriteZeroIn && this.dot !== 255) {
          this.spriteZero = true;
        }
        finalColor = sprPriority === 0 ? this.readPalette((sprPixel + 0x10) & 0x1F) : this.readPalette(bgPixel);
      } else {
        finalColor = this.readPalette(bgPixel);
      }
    }

    // 写入最终像素颜色
    this.pixelOutput[this.line * 256 + this.dot] = (this.emphasis << 6) | (finalColor & 0x3f);

    // 恢复原始渲染状态
    this.bgRendering = originalBgRendering;
    this.sprRendering = originalSprRendering;
  };


  // 新增：处理特殊精灵优先级的渲染方法
  this.handleRenderWithPriority = function () {
    // 保存原始渲染状态
    const originalBgRendering = this.bgRendering;
    const originalSprRendering = this.sprRendering;

    // 强制启用渲染
    this.bgRendering = true;
    this.sprRendering = true;

    let i = this.dot & 0x7;
    let bgPixel = 0;
    let sprPixel = 0;
    let sprNum = -1;
    let sprPriority = 0;

    // 精灵渲染 - 标准部分
    if (this.dot > 7 || this.sprInLeft) {
      const maxSprites = (window.unlimitedSprites) ? this.spriteCount : Math.min(this.spriteCount, 8);
      for (let j = 0; j < maxSprites; j++) {
        // 确保不会超出spriteTiles数组边界（每个精灵需要2个连续条目）
        if (j * 2 + 1 >= this.spriteTiles.length) {
          break;
        }
        let xPos = this.secondaryOam[j * 4 + 3];
        let xCol = this.dot - xPos;
        if (xCol >= 0 && xCol < 8) {
          let shift = (this.secondaryOam[j * 4 + 2] & 0x40) ? xCol : 7 - xCol;
          let pixel = ((this.spriteTiles[j * 2] >> shift) & 1) | (((this.spriteTiles[j * 2 + 1] >> shift) & 1) << 1);
          if (pixel > 0) {
            sprPixel = (pixel | ((this.secondaryOam[j * 4 + 2] & 0x3) << 2)) & 0xF;
            // 特殊精灵优先级处理 - 根据精灵类型覆盖标准优先级
            if ((this.secondaryOam[j * 4 + 1] & 0x20) === 0x20) {
              // 特殊标记的精灵始终前景显示
              sprPriority = 0;
            } else {
              sprPriority = (this.secondaryOam[j * 4 + 2] & 0x20) >> 5;
            }
            sprNum = j;
            break;
          }
        }
      }
    }

    // 背景渲染 - 保持标准
    if (this.dot > 7 || this.bgInLeft) {
      let shiftAmount = 15 - i - this.x;
      bgPixel = ((this.tl >> shiftAmount) & 1) | (((this.th >> shiftAmount) & 1) << 1);
      if (bgPixel > 0) {
        bgPixel += ((this.x + i > 7) ? this.atr : this.atl) * 4;
      }
    }

    // 特殊优先级处理
    let finalColor;
    if (bgPixel === 0) {
      finalColor = sprPixel > 0 ? this.readPalette((sprPixel + 0x10) & 0x1F) : this.readPalette(0);
    } else {
      if (sprPixel > 0) {
        if (sprNum === 0 && this.spriteZeroIn && this.dot !== 255) {
          this.spriteZero = true;
        }
        finalColor = sprPriority === 0 ? this.readPalette((sprPixel + 0x10) & 0x1F) : this.readPalette(bgPixel);
      } else {
        finalColor = this.readPalette(bgPixel);
      }
    }

    // 写入最终像素颜色
    this.pixelOutput[this.line * 256 + this.dot] = (this.emphasis << 6) | (finalColor & 0x3f);

    // 恢复原始渲染状态
    this.bgRendering = originalBgRendering;
    this.sprRendering = originalSprRendering;
  };

  this.setFrame = function (finalArray) {
    // 普通逐像素渲染
    for (let i = 0; i < this.pixelOutput.length; i++) {
      let color = this.nesPal[this.pixelOutput[i] & 0x3f];
      let r = color[0], g = color[1], b = color[2];
      // from https://forums.nesdev.com/viewtopic.php?f=3&t=18416#p233708
      if ((this.pixelOutput[i] & 0x40) > 0) {
        // emphasize red
        r = r * 1.1;
        g = g * 0.9;
        b = b * 0.9;
      }
      if ((this.pixelOutput[i] & 0x80) > 0) {
        // emphasize green
        r = r * 0.9;
        g = g * 1.1;
        b = b * 0.9;
      }
      if ((this.pixelOutput[i] & 0x100) > 0) {
        // emphasize blue
        r = r * 0.9;
        g = g * 0.9;
        b = b * 1.1;
      }
      r = (r > 255 ? 255 : r) & 0xff;
      g = (g > 255 ? 255 : g) & 0xff;
      b = (b > 255 ? 255 : b) & 0xff;
      finalArray[i * 4] = r;
      finalArray[i * 4 + 1] = g;
      finalArray[i * 4 + 2] = b;
      finalArray[i * 4 + 3] = 255;
    }


  }

  // from https://wiki.nesdev.com/w/index.php/PPU_scrolling
  this.incrementVx = function () {
    if ((this.v & 0x1f) === 0x1f) {
      this.v &= 0x7fe0;
      this.v ^= 0x400;
    } else {
      this.v++;
    }
  }
  this.incrementVy = function () {
    if ((this.v & 0x7000) !== 0x7000) {
      this.v += 0x1000;
    } else {
      this.v &= 0xfff;
      let coarseY = (this.v & 0x3e0) >> 5;
      if (coarseY === 29) {
        coarseY = 0;
        this.v ^= 0x800;
      } else if (coarseY === 31) {
        coarseY = 0;
      } else {
        coarseY++;
      }
      this.v &= 0x7c1f;
      this.v |= (coarseY << 5);
    }
  }

  this.readInternal = function (adr) {
    adr &= 0x3fff;

    // 特殊处理：确保在背景滚动时mapper23能正确处理名称表镜像
    if ((adr >= 0x2000 && adr < 0x3000) &&
      this.nes && this.nes.mapper &&
      (this.nes.mapper.name === "Konami VRC2 type B")) {
      // 使用mapper自身的镜像逻辑
      return this.nes.mapper.ppuRead(adr);
    }

    return this.nes.mapper.ppuRead(adr);
  }

  this.writeInternal = function (adr, value) {
    adr &= 0x3fff;
    this.nes.mapper.ppuWrite(adr, value);
  }

  this.readPalette = function (adr) {
    let palAdr = adr & 0x1f;
    if (palAdr >= 0x10 && (palAdr & 0x3) === 0) {
      // 0x10, 0x14, 0x18 and 0x1c are mirrored to 0, 4, 8 and 0xc
      palAdr -= 0x10;
    }
    let ret = this.paletteRam[palAdr];
    if (this.greyScale) {
      ret &= 0x30;
    }
    return ret;
  }

  this.writePalette = function (adr, value) {
    let palAdr = adr & 0x1f;
    if (palAdr >= 0x10 && (palAdr & 0x3) === 0) {
      // 0x10, 0x14, 0x18 and 0x1c are mirrored to 0, 4, 8 and 0xc
      palAdr -= 0x10;
    }
    this.paletteRam[palAdr] = value;
  }

  this.peakram = function (adr) {
    // 支持直接窥探PPU内存所有区间
    if (adr >= 0x0000 && adr <= 0x3FFF) {
      // 图案表/名称表/调色板
      if (adr >= 0x3F00) {
        return this.readPalette(adr);
      }
      return this.readInternalram(adr);
    }
  }

  this.readInternalram = function (adr) {
    adr &= 0x3fff;
    return this.nes.mapper.ppuPeak(adr);
  }



  this.peak = function (adr) {
    switch (adr) {
      case 0:
      case 1: {
        // PPUCTRL, PPUMASK
        return 0; // not readable
      }
      case 2: {
        // PPUSTATUS
        let ret = 0;
        if (this.inVblank) {
          ret |= 0x80;
        }
        ret |= this.spriteZero ? 0x40 : 0;
        ret |= this.spriteOverflow ? 0x20 : 0;
        return ret;
      }
      case 3: {
        // OAMADDR
        return 0; // not readable
      }
      case 4: {
        // OAMDATA
        return this.oamRam[this.oamAddress];
      }
      case 5:
      case 6: {
        // PPUSCROLL, PPUADDR
        return 0; // not readable
      }
      case 7: {
        // PPUDATA
        let adr = this.v & 0x3fff;
        let temp = this.readBuffer;
        if (adr >= 0x3f00) {
          // read palette in temp
          temp = this.readPalette(adr);
        }
        return temp;
      }
      default: return 0;
    }
  }

  this.read = function (adr) {
    switch (adr) {
      case 0: {
        // PPUCTRL
        return 0; // not readable
      }
      case 1: {
        // PPUMASK
        return 0; // not readable
      }
      case 2: {
        // PPUSTATUS
        this.w = 0;
        let ret = 0;
        if (this.inVblank) {
          ret |= 0x80;
          this.inVblank = false;
        }
        ret |= this.spriteZero ? 0x40 : 0;
        ret |= this.spriteOverflow ? 0x20 : 0;
        return ret;
      }
      case 3: {
        // OAMADDR
        return 0; // not readable
      }
      case 4: {
        // OAMDATA
        return this.oamRam[this.oamAddress];
      }
      case 5: {
        // PPUSCROLL
        return 0; // not readable
      }
      case 6: {
        // PPUADDR
        return 0; // not readable
      }
      case 7: {
        // PPUDATA
        let adr = this.v & 0x3fff;
        if (
          (this.bgRendering || this.sprRendering) &&
          (this.line < 240 || this.line === 261)
        ) {
          // while rendering, vram is incremented strangely
          this.incrementVy();
          this.incrementVx();
        } else {
          this.v += this.vramIncrement;
          this.v &= 0x7fff;
        }
        let temp = this.readBuffer;
        if (adr >= 0x3f00) {
          // read palette in temp
          temp = this.readPalette(adr);
        }
        this.readBuffer = this.readInternal(adr);
        return temp;
      }
      default: return 0;
    }
  }

  this.write = function (adr, value) {
    adr &= 0x7;

    switch (adr) {
      case 0: {
        // PPUCTRL
        this.t &= 0x73ff;
        this.t |= (value & 0x3) << 10;

        this.vramIncrement = (value & 0x04) > 0 ? 32 : 1;
        this.spritePatternBase = (value & 0x08) > 0 ? 0x1000 : 0;
        this.bgPatternBase = (value & 0x10) > 0 ? 0x1000 : 0;
        this.spriteHeight = (value & 0x20) > 0 ? 16 : 8;
        let oldNmi = this.generateNmi;
        this.slave = (value & 0x40) > 0;
        this.generateNmi = (value & 0x80) > 0;

        if (this.generateNmi && !oldNmi && this.inVblank) {
          // immediate nmi if enabled during vblank
          this.nes.cpu.nmiWanted = true;
        }
        return;
      }
      case 1: {
        // PPUMASK
        this.greyScale = (value & 0x01) > 0;
        this.bgInLeft = (value & 0x02) > 0;
        this.sprInLeft = (value & 0x04) > 0;
        this.bgRendering = (value & 0x08) > 0;
        this.sprRendering = (value & 0x10) > 0;
        this.emphasis = (value & 0xe0) >> 5;

        // 特殊处理：如果是龙珠Z外传，确保渲染标志始终为true
        if (this.nes && this.nes.mapper && this.nes.mapper.isDBZ) {
          this.bgRendering = true;
          this.sprRendering = true;
        }
        return;
      }
      case 2: {
        // PPUSTATUS
        return; // not writable
      }
      case 3: {
        // OAMADDR
        this.oamAddress = value;
        return;
      }
      case 4: {
        // OAMDATA
        this.oamRam[this.oamAddress++] = value;
        this.oamAddress &= 0xff;
        return;
      }
      case 5: {
        // PPUSCROLL
        if (this.w === 0) {
          this.t &= 0x7fe0;
          this.t |= (value & 0xf8) >> 3;
          this.x = value & 0x7;
          this.w = 1;
        } else {
          this.t &= 0x0c1f;
          this.t |= (value & 0x7) << 12;
          this.t |= (value & 0xf8) << 2;
          this.w = 0;
        }
        return;
      }
      case 6: {
        // PPUADDR
        if (this.w === 0) {
          this.t &= 0xff;
          this.t |= (value & 0x3f) << 8;
          this.w = 1;
        } else {
          this.t &= 0x7f00;
          this.t |= value;
          this.v = this.t;
          this.w = 0;
        }
        return;
      }
      case 7: {
        // PPUDATA
        let adr = this.v & 0x3fff;
        if (
          (this.bgRendering || this.sprRendering) &&
          (this.line < 240 || this.line === 261)
        ) {
          // while rendering, vram is incremented strangely
          this.incrementVy();
          this.incrementVx();
        } else {
          this.v += this.vramIncrement;
          this.v &= 0x7fff;
        }
        if (adr >= 0x3f00) {
          // write palette
          this.writePalette(adr, value);
          return;
        }
        this.writeInternal(adr, value);
        return;
      }
    }
  }

  // from https://wiki.nesdev.com/w/index.php/PPU_palettes (savtool palette)
  this.nesPal = [
    [101, 101, 101], [0, 45, 105], [19, 31, 127], [60, 19, 124], [96, 11, 98], [115, 10, 55], [113, 15, 7], [90, 26, 0], [52, 40, 0], [11, 52, 0], [0, 60, 0], [0, 61, 16], [0, 56, 64], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [174, 174, 174], [15, 99, 179], [64, 81, 208], [120, 65, 204], [167, 54, 169], [192, 52, 112], [189, 60, 48], [159, 74, 0], [109, 92, 0], [54, 109, 0], [7, 119, 4], [0, 121, 61], [0, 114, 125], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [254, 254, 255], [93, 179, 255], [143, 161, 255], [200, 144, 255], [247, 133, 250], [255, 131, 192], [255, 139, 127], [239, 154, 73], [189, 172, 44], [133, 188, 47], [85, 199, 83], [60, 201, 140], [62, 194, 205], [78, 78, 78], [0, 0, 0], [0, 0, 0],
    [254, 254, 255], [188, 223, 255], [209, 216, 255], [232, 209, 255], [251, 205, 253], [255, 204, 229], [255, 207, 202], [248, 213, 180], [228, 220, 168], [204, 227, 169], [185, 232, 184], [174, 232, 208], [175, 229, 234], [182, 182, 182], [0, 0, 0], [0, 0, 0]
  ];

  // 新增：支持外部设置调色板
  this.setPalette = function (rgbArr) {
    if (!Array.isArray(rgbArr) || rgbArr.length !== 64) return;
    this.nesPal = rgbArr.map(function (val) {
      return [
        (val >> 16) & 0xFF,
        (val >> 8) & 0xFF,
        val & 0xFF
      ];
    });
    // 强制刷新一帧
    if (typeof window.applyNesFilter === "function") {
      setTimeout(window.applyNesFilter, 0);
    }
  };

}

// 删除或替换现有的getMirroringAdr方法，因为它现在在setMirroring中动态设置
Ppu.prototype.getMirroringAdr = function (adr) {
  // 这个实现会被setMirroring方法替换
  adr = (adr - 0x2000) & 0x0FFF;
  return adr & 0x7FF; // 默认垂直镜像
};
