// 统一的 AudioContext
let _mainAudioContext = null;
let _audioWorkletLoaded = false;
let _useAudioWorklet = true;

function getSharedAudioContext() {
    if (!_mainAudioContext || _mainAudioContext.state === 'closed') {
        try {
            const Ac = window.AudioContext || window.webkitAudioContext;
            if (Ac) {
                // 使用系统默认采样率，让浏览器优化
                _mainAudioContext = new Ac();
                //log('创建新的共享 AudioContext (系统默认采样率)', 'audio');
            }
        } catch (e) {
            console.error('无法创建共享 AudioContext', e);
            _mainAudioContext = null;
        }
    }
    return _mainAudioContext;
}

// AudioWorkletProcessor code as string for offline compatibility
const audioProcessorCode = `
// AudioWorkletProcessor for audio processing
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 16384; // 默认值，会通过消息更新
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;
    this.amplify = 1; // 平滑当前放大倍数
    this.targetAmplify = 1; // 目标放大倍数，用于平滑过渡
    this.port.onmessage = (event) => {
      if (event.data.type === 'buffer') {
        this.handleBuffer(event.data.samples);
      } else if (event.data.type === 'amplify') {
        // 不直接赋值，使用 targetAmplify 以做平滑
        this.targetAmplify = Number(event.data.value) || 1;
      } else if (event.data.type === 'bufferSize') {
        this.setBufferSize(event.data.size);
      }
    };
  }

  setBufferSize(size) {
    if (size !== this.bufferSize) {
      this.bufferSize = size;
      this.buffer = new Float32Array(this.bufferSize);
      this.writePos = 0;
      this.readPos = 0;
    }
  }

  handleBuffer(samples) {
    const sampleCount = samples.length;
    const capacity = this.buffer.length;
    let free = (this.readPos - this.writePos - 1 + capacity) % capacity;

    if (free < sampleCount) {
      // 如果空间不足，丢弃最旧的一小部分样本以腾出空间（避免大幅度跳变）
      const skip = Math.min(sampleCount - free, Math.floor(capacity / 8));
      this.readPos = (this.readPos + skip) % capacity;
    }

    for (let i = 0; i < sampleCount; i++) {
      // 限幅并写入
      const v = samples[i];
      this.buffer[this.writePos] = (v > 1 ? 1 : (v < -1 ? -1 : v));
      this.writePos = (this.writePos + 1) % capacity;
    }
  }

  process(inputs, outputs) {
    const outputChannels = outputs[0];
    const channelCount = outputChannels.length || 1;
    const frameLen = outputChannels[0].length;

    // 平滑 amplify（每帧逐步逼近目标值）
    this.amplify += (this.targetAmplify - this.amplify) * 0.02;

    for (let i = 0; i < frameLen; i++) {
      // 计算可用样本数量
      const capacity = this.buffer.length;
      const available = (this.writePos - this.readPos + capacity) % capacity;

      let currentSample;
      if (available <= 0) {
        // 缓冲区空，使用 lastSample（避免突然变小）
        currentSample = this.lastSample;
      } else {
        currentSample = this.buffer[this.readPos];
        this.readPos = (this.readPos + 1) % capacity;
      }

      // 简单平滑：用 last 和 current 做插值以减缓波动
      const sample = (this.lastSample + currentSample) * 0.5;
      let out = sample * this.amplify;

      // 限幅输出
      if (out > 1) out = 1;
      else if (out < -1) out = -1;

      // 写入所有输出通道（如果是立体声，复制到左右声道）
      for (let ch = 0; ch < channelCount; ch++) {
        outputChannels[ch][i] = out;
      }

      this.lastSample = currentSample;
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
`;

async function loadAudioWorklet(actx) {
    if (_audioWorkletLoaded) return;
    try {
        const encodedCode = btoa(unescape(encodeURIComponent(audioProcessorCode)));
        const dataUrl = `data:application/javascript;base64,${encodedCode}`;
        await actx.audioWorklet.addModule(dataUrl);
        _audioWorkletLoaded = true;
    } catch (e) {
        _useAudioWorklet = false;
        throw e;
    }
}

// 简化的线性插值函数
function linearInterpolate(y1, y2, mu) {
    return y1 * (1 - mu) + y2 * mu;
}

function AudioHandler() {

  this.hasAudio = true;
  this.actx = getSharedAudioContext();

  if(!this.actx) {
    this.hasAudio = false;
  } else {
    // 检测平台：移动设备增加缓冲区
    this.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 使用实际设备采样率以尽量减少重采样（移动端优先使用实际采样率以降低延迟）
  const actualSampleRate = this.actx.sampleRate;
  // 设置默认采样率和缓冲区大小：移动端使用实际采样率并且使用较小缓冲以减少延迟
  this.targetSampleRate = this.isMobile ? actualSampleRate : 44100;
  this.bufferSize = this.isMobile ? 8192 : 16384; // 缩小移动端缓冲以降低延迟

  // 根据目标采样率计算每帧样本数
  const frameRate = 60;
  this.samplesPerFrame = Math.floor(this.targetSampleRate / frameRate);
  this.resampleRatio = actualSampleRate / this.targetSampleRate;

  // 使用 Float32Array 降低内存与拷贝开销（AudioWorklet 使用 Float32）
  this.sampleBuffer = new Float32Array(this.samplesPerFrame);

    // 初始化缓冲区和位置（用于 ScriptProcessorNode）
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;

    this.workletNode = undefined;
    this.scriptNode = undefined;
  }

  this.resume = function() {
    if(this.hasAudio) {
      try { this.actx.resume(); } catch (e) { /* ignore resume errors */ }
    }
  }

  this.start = async function() {
    if(!this.hasAudio) return;

    try {
      if (_useAudioWorklet) {
        await loadAudioWorklet(this.actx);
        this.workletNode = new AudioWorkletNode(this.actx, 'audio-processor');
        // 发送缓冲区大小
        this.workletNode.port.postMessage({
          type: 'bufferSize',
          size: this.bufferSize
        });
        this.workletNode.connect(this.actx.destination);
      } else {
        // 回退到 ScriptProcessorNode
        this.scriptNode = this.actx.createScriptProcessor(2048, 0, 1);
        this.scriptNode.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);

          for(let i = 0; i < output.length; i++) {
            // 简单的线性插值
            const currentSample = this.buffer[this.readPos];
            const sample = linearInterpolate(this.lastSample, currentSample, 0.5);

            // 应用放大
            let out = sample;
            if (window.__nsfAudioAmplify && typeof window.__nsfAudioAmplify === 'number') {
              out *= window.__nsfAudioAmplify;
            }

            output[i] = Math.max(-1, Math.min(1, out));
            this.lastSample = currentSample;
            this.readPos = (this.readPos + 1) % this.bufferSize;
          }
        };
        this.scriptNode.connect(this.actx.destination);
      }
    } catch (e) {
      console.error('启动 AudioWorkletNode 失败', e);
      this.hasAudio = false;
    }
  }

  this.nextBuffer = function() {
    if(!this.hasAudio) return;

    // 计算需要写入的实际样本数（基于系统采样率）
    const actualSamplesNeeded = Math.floor(this.samplesPerFrame * this.resampleRatio);

    // 调试输出（只在第一次调用或采样率改变时输出）
    if (!this._lastDebugOutput || this._lastDebugOutput !== this.targetSampleRate) {
      this._lastDebugOutput = this.targetSampleRate;
    }

    if (_useAudioWorklet && this.workletNode) {
      // 创建重采样缓冲区（Float32），尽量使用可转移的 ArrayBuffer 发送以避免复制
      const resampledBuffer = new Float32Array(actualSamplesNeeded);

      // 简单的线性插值重采样
      for (let i = 0; i < actualSamplesNeeded; i++) {
        const srcIndex = (i / this.resampleRatio);
        const srcIndexInt = Math.floor(srcIndex);
        const fraction = srcIndex - srcIndexInt;

        if (srcIndexInt < this.samplesPerFrame - 1) {
          const sample1 = this.sampleBuffer[srcIndexInt];
          const sample2 = this.sampleBuffer[srcIndexInt + 1];
          resampledBuffer[i] = sample1 * (1 - fraction) + sample2 * fraction;
        } else {
          resampledBuffer[i] = this.sampleBuffer[this.samplesPerFrame - 1];
        }
      }

      // 发送重采样样本到 AudioWorklet（尽量 transfer）
      try {
        this.workletNode.port.postMessage({ type: 'buffer', samples: resampledBuffer }, [resampledBuffer.buffer]);
      } catch (e) {
        // 如果 transfer 不被支持，退回到普通 postMessage
        this.workletNode.port.postMessage({ type: 'buffer', samples: resampledBuffer });
      }

      // 发送放大设置
      if (window.__nsfAudioAmplify && typeof window.__nsfAudioAmplify === 'number') {
        this.workletNode.port.postMessage({ type: 'amplify', value: window.__nsfAudioAmplify });
      }
    } else if (this.scriptNode) {
      // ScriptProcessorNode: 直接写入缓冲区
      const sampleCount = actualSamplesNeeded;
      const sampleArray = this.sampleBuffer;

      const capacity = this.buffer.length;
      let free = (this.readPos - this.writePos - 1 + capacity) % capacity;

      // 如果缓冲区空间不足，跳过一些旧样本
      if(free < sampleCount) {
        const skip = Math.min(sampleCount - free, capacity / 4);
        this.readPos = (this.readPos + skip) % capacity;
      }

      // 将重采样样本写入缓冲区
      for(let i = 0; i < sampleCount; i++) {
        const srcIndex = (i / this.resampleRatio);
        const srcIndexInt = Math.floor(srcIndex);
        const fraction = srcIndex - srcIndexInt;

        let sample;
        if (srcIndexInt < this.samplesPerFrame - 1) {
          const sample1 = sampleArray[srcIndexInt];
          const sample2 = sampleArray[srcIndexInt + 1];
          sample = sample1 * (1 - fraction) + sample2 * fraction;
        } else {
          sample = sampleArray[this.samplesPerFrame - 1];
        }

        this.buffer[this.writePos] = Math.max(-1, Math.min(1, sample));
        this.writePos = (this.writePos + 1) % capacity;
      }
    }
  }

  this.stop = function() {
    if(!this.hasAudio) return;
    if(this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = undefined;
    }
    if(this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = undefined;
    }
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;
  }

  this.pause = function() {
      if (this.workletNode) {
          try {
              this.workletNode.disconnect();
          } catch(e) {}
      }
      if (this.scriptNode) {
          try {
              this.scriptNode.disconnect();
          } catch(e) {}
      }
  }

  this.unpause = function() {
      if (this.workletNode && this.actx) {
          try {
            this.workletNode.connect(this.actx.destination);
          } catch(e) {}
      }
      if (this.scriptNode && this.actx) {
          try {
            this.scriptNode.connect(this.actx.destination);
          } catch(e) {}
      }
  }

  // 设置目标采样率
  this.setSampleRate = function(sampleRate) {
    if (!this.hasAudio) return;
    const oldSampleRate = this.targetSampleRate;
    this.targetSampleRate = parseInt(sampleRate);

    // 如果采样率没有改变，直接返回
    if (oldSampleRate === this.targetSampleRate) return;
    const actualSampleRate = this.actx.sampleRate;
    const frameRate = 60;
    this.samplesPerFrame = Math.floor(this.targetSampleRate / frameRate);
    this.resampleRatio = actualSampleRate / this.targetSampleRate;
  this.sampleBuffer = new Float32Array(this.samplesPerFrame);

    // 重启音频处理以应用新设置
    this.stop();
    this.start();
  }

  // 设置缓冲区大小
  this.setBufferSize = function(bufferSize) {
    if (!this.hasAudio) return;
    this.bufferSize = parseInt(bufferSize);
    // 停止当前音频处理
    this.stop();
    // 重新初始化缓冲区
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;
    // 重新启动音频处理
    this.start();
  }
}

// ExternalAudioHandler: 独立于主 AudioHandler 的音频处理器，供外部NSF播放使用
function ExternalAudioHandler() {
  this.actx = getSharedAudioContext();
  this.hasAudio = !!this.actx;

  // If audio is not available, create stub methods to prevent errors
  if (!this.hasAudio) {
    this.sampleBuffer = new Float64Array(0);
    this.samplesPerFrame = 0;
    this.start = function() { log('Cannot start ExternalAudioHandler: no audio.', 'music'); };
    this.stop = function() {};
    this.nextBuffer = function() {};
    this.resume = function() {};
    return;
  }

  // If audio is available, proceed with full initialization
  try {
    // 检测平台：移动设备增加缓冲区
    this.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 使用实际设备采样率以尽量减少重采样（移动端优先使用实际采样率以降低延迟）
  const actualSampleRate = this.actx.sampleRate;
  // 设置默认采样率和缓冲区大小：移动端使用实际采样率并且使用较小缓冲以减少延迟
  this.targetSampleRate = this.isMobile ? actualSampleRate : 44100;
  this.bufferSize = this.isMobile ? 8192 : 16384; // 缩小移动端缓冲以降低延迟

  // 根据目标采样率计算每帧样本数
  const frameRate = 60;
  this.samplesPerFrame = Math.floor(this.targetSampleRate / frameRate);
  this.resampleRatio = actualSampleRate / this.targetSampleRate;

  // 使用 Float32Array 降低内存与拷贝开销（AudioWorklet 使用 Float32）
  this.sampleBuffer = new Float32Array(this.samplesPerFrame);

    // 初始化缓冲区和位置（用于 ScriptProcessorNode）
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;

    this.workletNode = undefined;
    this.scriptNode = undefined;
  } catch (e) {
      console.error("Error initializing ExternalAudioHandler:", e);
      this.hasAudio = false;
      this.start = function() { log('Cannot start ExternalAudioHandler: setup failed.', 'music'); };
      this.stop = function() {};
      this.nextBuffer = function() {};
      this.resume = function() {};
      return;
  }

  this.resume = function() {
    if (!this.hasAudio) return;
    try { this.actx.resume(); } catch (e) {}
  };

  this.start = async function() {
    if (!this.hasAudio || !this.actx || this.actx.state === 'closed') {
      return;
    }
    if (this.workletNode || this.scriptNode) {
        return;
    }
    try {
      if (_useAudioWorklet) {
        await loadAudioWorklet(this.actx);
        this.workletNode = new AudioWorkletNode(this.actx, 'audio-processor');
        // 发送缓冲区大小
        this.workletNode.port.postMessage({
          type: 'bufferSize',
          size: this.bufferSize
        });
        this.workletNode.connect(this.actx.destination);
      } else {
        // 回退到 ScriptProcessorNode
        this.scriptNode = this.actx.createScriptProcessor(2048, 0, 1);
        this.scriptNode.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);

          for (let i = 0; i < output.length; i++) {
            const currentSample = this.buffer[this.readPos];
            const sample = linearInterpolate(this.lastSample, currentSample, 0.5);

            let out = sample;
            if (window.__nsfAudioAmplify && typeof window.__nsfAudioAmplify === 'number') {
              out *= window.__nsfAudioAmplify;
            }

            output[i] = Math.max(-1, Math.min(1, out));
            this.lastSample = currentSample;
            this.readPos = (this.readPos + 1) % this.bufferSize;
          }
        };
        this.scriptNode.connect(this.actx.destination);
      }
    } catch (e) {
        console.warn('ExternalAudioHandler.start error', e);
        this.hasAudio = false;
    }
  };

  this.nextBuffer = function() {
    if (!this.hasAudio) return;

    // 计算需要写入的实际样本数（基于系统采样率）
    const actualSamplesNeeded = Math.floor(this.samplesPerFrame * this.resampleRatio);

    // 调试输出（只在第一次调用或采样率改变时输出）
    if (!this._lastDebugOutput || this._lastDebugOutput !== this.targetSampleRate) {
      this._lastDebugOutput = this.targetSampleRate;
    }

    if (_useAudioWorklet && this.workletNode) {
      // 创建重采样缓冲区（Float32），尽量使用可转移的 ArrayBuffer 发送以避免复制
      const resampledBuffer = new Float32Array(actualSamplesNeeded);

      // 简单的线性插值重采样
      for (let i = 0; i < actualSamplesNeeded; i++) {
        const srcIndex = (i / this.resampleRatio);
        const srcIndexInt = Math.floor(srcIndex);
        const fraction = srcIndex - srcIndexInt;

        if (srcIndexInt < this.samplesPerFrame - 1) {
          const sample1 = this.sampleBuffer[srcIndexInt];
          const sample2 = this.sampleBuffer[srcIndexInt + 1];
          resampledBuffer[i] = sample1 * (1 - fraction) + sample2 * fraction;
        } else {
          resampledBuffer[i] = this.sampleBuffer[this.samplesPerFrame - 1];
        }
      }

      // 发送重采样样本到 AudioWorklet（尽量 transfer）
      try {
        this.workletNode.port.postMessage({ type: 'buffer', samples: resampledBuffer }, [resampledBuffer.buffer]);
      } catch (e) {
        this.workletNode.port.postMessage({ type: 'buffer', samples: resampledBuffer });
      }

      // 发送放大设置
      if (window.__nsfAudioAmplify && typeof window.__nsfAudioAmplify === 'number') {
        this.workletNode.port.postMessage({ type: 'amplify', value: window.__nsfAudioAmplify });
      }
    } else if (this.scriptNode) {
      // ScriptProcessorNode: 直接写入缓冲区
      const sampleCount = actualSamplesNeeded;
      const sampleArray = this.sampleBuffer;

      const capacity = this.buffer.length;
      let free = (this.readPos - this.writePos - 1 + capacity) % capacity;

      if(free < sampleCount) {
        const skip = Math.min(sampleCount - free, capacity / 4);
        this.readPos = (this.readPos + skip) % capacity;
      }

      // 将重采样样本写入缓冲区
      for (let i = 0; i < sampleCount; i++) {
        const srcIndex = (i / this.resampleRatio);
        const srcIndexInt = Math.floor(srcIndex);
        const fraction = srcIndex - srcIndexInt;

        let sample;
        if (srcIndexInt < this.samplesPerFrame - 1) {
          const sample1 = sampleArray[srcIndexInt];
          const sample2 = sampleArray[srcIndexInt + 1];
          sample = sample1 * (1 - fraction) + sample2 * fraction;
        } else {
          sample = sampleArray[this.samplesPerFrame - 1];
        }

        this.buffer[this.writePos] = Math.max(-1, Math.min(1, sample));
        this.writePos = (this.writePos + 1) % capacity;
      }
    }
  };

  this.stop = function() {
    if (!this.hasAudio) return;
    try {
      if (this.workletNode) {
        this.workletNode.disconnect();
        this.workletNode = undefined;
      }
      if (this.scriptNode) {
        this.scriptNode.disconnect();
        this.scriptNode = undefined;
      }
    } catch (e) {}
    this.writePos = 0; this.readPos = 0; this.lastSample = 0;
  };

  // 设置目标采样率
  this.setSampleRate = function(sampleRate) {
    if (!this.hasAudio) return;
    const oldSampleRate = this.targetSampleRate;
    this.targetSampleRate = parseInt(sampleRate);

    // 如果采样率没有改变，直接返回
    if (oldSampleRate === this.targetSampleRate) return;

    const actualSampleRate = this.actx.sampleRate;
    const frameRate = 60;
    this.samplesPerFrame = Math.floor(this.targetSampleRate / frameRate);
    this.resampleRatio = actualSampleRate / this.targetSampleRate;
    this.sampleBuffer = new Float64Array(this.samplesPerFrame);

    // 重启音频处理以应用新设置
    this.stop();
    this.start();
  };

  // 设置缓冲区大小
  this.setBufferSize = function(bufferSize) {
    if (!this.hasAudio) return;
    this.bufferSize = parseInt(bufferSize);
    // 停止当前音频处理
    this.stop();
    // 重新初始化缓冲区
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.lastSample = 0;
    // 重新启动音频处理
    this.start();
  };
}
