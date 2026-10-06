// NES模拟器滤镜系统
// 包含各种渲染滤镜的实现

// 三倍缓冲相关变量 (用于运动模糊/残影效果)
let tripleBufferEnabled = false;
let frameBuffer1 = null;
let frameBuffer2 = null;
let frameBuffer3 = null;
let renderBuffer1 = null;
let renderBuffer2 = null;
let renderBuffer3 = null;
let fbTexture1 = null;
let fbTexture2 = null;
let fbTexture3 = null;
let currentBufferIndex = 0;
// 六倍缓冲相关变量 (6x 动态缓冲)
let sixBufferEnabled = false;
let sixFrameBuffers = [];
let sixRenderBuffers = [];
let sixTextures = [];
let sixCurrentIndex = 0;

// 多倍缓冲相关变量 (可配置倍数)
let multiBufferEnabled = false;
let multiBufferCount = 3; // 默认3倍
let multiFrameBuffers = [];
let multiRenderBuffers = [];
let multiTextures = [];
let multiCurrentIndex = 0;

// NSTC / PLA 滤镜的着色器程序
let nstcProgram = null;
let palProgram = null;
// 可重用的 RGB 临时纹理，避免每帧创建/删除纹理
let reusableRgbTexture = null;
let reusableRgbData = null;
let sixBufferProgram = null;
let paletteTexture = null;

// 多倍缓冲着色器程序
let multiBufferProgram = null;

// 顶点着色器 (通用)
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// NSTC 片段着色器 (轻量 NTSC 风格色彩模糊 + 噪声模拟)
const nstcFragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_textureSize;
  varying vec2 v_texCoord;

  // 简单 NTSC 模拟：对水平邻域做轻度模糊并做色相偏移
  void main() {
    vec2 texel = 1.0 / u_textureSize;
    vec4 c = texture2D(u_texture, v_texCoord);

    // horizontal smear
    vec4 left = texture2D(u_texture, v_texCoord - vec2(texel.x, 0.0));
    vec4 right = texture2D(u_texture, v_texCoord + vec2(texel.x, 0.0));
    vec4 smear = (left + c + right) / 3.0;

    // tiny chroma shift: sample at slightly offset uv for chroma
    vec3 chroma = texture2D(u_texture, v_texCoord + vec2(texel.x * 0.5, 0.0)).rgb;

    // mix luminance from smear and chroma from shifted sample
    float lum = dot(smear.rgb, vec3(0.299, 0.587, 0.114));
    vec3 outColor = mix(vec3(lum), chroma, 0.35);

    // light noise to emulate analog softness
    float noise = (fract(sin(dot(gl_FragCoord.xy ,vec2(12.9898,78.233))) * 43758.5453) - 0.5) * 0.02;
    outColor += noise;

    gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
  }
`;

// PAL 色彩滤镜 (更真实的 PAL-like 模拟：色度模糊 + 轻微相位偏移 + 色度衰减)
const palFragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_textureSize;
  varying vec2 v_texCoord;

  void main() {
    vec2 texel = 1.0 / u_textureSize;

    // 采样当前像素和左右像素以模拟模拟信号中色度带宽有限的效果
    vec3 c = texture2D(u_texture, v_texCoord).rgb;
    vec3 l = texture2D(u_texture, v_texCoord - vec2(texel.x, 0.0)).rgb;
    vec3 r = texture2D(u_texture, v_texCoord + vec2(texel.x, 0.0)).rgb;

    // RGB -> YUV (BT.601 风格近似)
    float yC = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    float uC = -0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
    float vC = 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;

    float yL = 0.299 * l.r + 0.587 * l.g + 0.114 * l.b;
    float uL = -0.168736 * l.r - 0.331264 * l.g + 0.5 * l.b;
    float vL = 0.5 * l.r - 0.418688 * l.g - 0.081312 * l.b;

    float yR = 0.299 * r.r + 0.587 * r.g + 0.114 * r.b;
    float uR = -0.168736 * r.r - 0.331264 * r.g + 0.5 * r.b;
    float vR = 0.5 * r.r - 0.418688 * r.g - 0.081312 * r.b;

    // 对色度做水平模糊（模拟较窄的色带宽）并稍微降低色度强度
    float uAvg = (uL + uC + uR) / 3.0 * 0.92;
    float vAvg = (vL + vC + vR) / 3.0 * 0.92;

    // 加入小幅相位偏移，模拟PAL色度相位差
    float angle = 0.06; // 小角度偏移
    float uRot = uAvg * cos(angle) - vAvg * sin(angle);
    float vRot = uAvg * sin(angle) + vAvg * cos(angle);

    // YUV -> RGB (BT.601 反变换近似)
    vec3 outColor;
    outColor.r = yC + 1.402 * vRot;
    outColor.g = yC - 0.344136 * uRot - 0.714136 * vRot;
    outColor.b = yC + 1.772 * uRot;

    // 轻微降低饱和度并做小幅对比/亮度调整，让效果更自然
    float sat = 0.96;
    float lum = dot(outColor, vec3(0.299, 0.587, 0.114));
    outColor = mix(vec3(lum), outColor, sat);
    outColor = clamp(outColor * 1.01, 0.0, 1.0);

    gl_FragColor = vec4(outColor, 1.0);
  }
`;

// 六倍缓冲片段着色器：接收 6 个采样器并按权重混合
const sixBufferFragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture0;
  uniform sampler2D u_texture1;
  uniform sampler2D u_texture2;
  uniform sampler2D u_texture3;
  uniform sampler2D u_texture4;
  uniform sampler2D u_texture5;
  uniform float u_weight0;
  uniform float u_weight1;
  uniform float u_weight2;
  uniform float u_weight3;
  uniform float u_weight4;
  uniform float u_weight5;
  varying vec2 v_texCoord;

  void main() {
    vec4 c0 = texture2D(u_texture0, v_texCoord);
    vec4 c1 = texture2D(u_texture1, v_texCoord);
    vec4 c2 = texture2D(u_texture2, v_texCoord);
    vec4 c3 = texture2D(u_texture3, v_texCoord);
    vec4 c4 = texture2D(u_texture4, v_texCoord);
    vec4 c5 = texture2D(u_texture5, v_texCoord);

    vec4 outColor = c0 * u_weight0 + c1 * u_weight1 + c2 * u_weight2 + c3 * u_weight3 + c4 * u_weight4 + c5 * u_weight5;
    gl_FragColor = outColor;
  }
`;

// 已删除旧的复杂着色器实现，当前仅保留 NSTC 与 PAL 两个着色器实现以简化维护

// 三倍缓冲片段着色器 (运动模糊/残影效果)
const tripleBufferFragmentShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture1;
  uniform sampler2D u_texture2;
  uniform sampler2D u_texture3;
  uniform float u_mixWeight1;
  uniform float u_mixWeight2;
  uniform float u_mixWeight3;
  varying vec2 v_texCoord;

  void main() {
    vec4 color1 = texture2D(u_texture1, v_texCoord);
    vec4 color2 = texture2D(u_texture2, v_texCoord);
    vec4 color3 = texture2D(u_texture3, v_texCoord);

    // 加权混合三个帧来创建残影效果
    vec4 finalColor = color1 * u_mixWeight1 +
                     color2 * u_mixWeight2 +
                     color3 * u_mixWeight3;

    gl_FragColor = finalColor;
  }
`;

// 创建着色器程序
function createShaderProgram(vertexSource, fragmentSource) {
  if (!gl) return null;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.error('Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
    return null;
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error('Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader program linking failed:', gl.getProgramInfoLog(program));
    return null;
  }

  return program;
}

// 初始化着色器程序
function initShaderPrograms() {
  // 创建并初始化 NSTC 与 PAL 着色器程序
  nstcProgram = createShaderProgram(vertexShaderSource, nstcFragmentShaderSource);
  palProgram = createShaderProgram(vertexShaderSource, palFragmentShaderSource);
  sixBufferProgram = createShaderProgram(vertexShaderSource, sixBufferFragmentShaderSource);
  multiBufferProgram = sixBufferProgram; // 重用sixBuffer的程序

  if (nstcProgram) {
    gl.useProgram(nstcProgram);
    const textureSizeLocation = gl.getUniformLocation(nstcProgram, 'u_textureSize');
    if (textureSizeLocation) gl.uniform2f(textureSizeLocation, 256.0, 240.0);
  }

  if (palProgram) {
    gl.useProgram(palProgram);
    const textureSizeLocation = gl.getUniformLocation(palProgram, 'u_textureSize');
    if (textureSizeLocation) gl.uniform2f(textureSizeLocation, 256.0, 240.0);
  }

  if (sixBufferProgram) {
    gl.useProgram(sixBufferProgram);
    // sixBufferProgram 不需要立即设置静态 uniform
  }

  // 初始化 NES 调色板纹理 (1 x 64)
  if (gl && !paletteTexture) {
    // 标准的 NES 64 色调色板 (RGB 值 0-255)
    const nesPalette = new Uint8Array([
      124,124,124,255, 0,0,252,255, 0,0,188,255, 68,40,188,255, 148,0,132,255, 168,0,32,255, 168,16,0,255, 136,20,0,255,
      80,48,0,255, 0,120,0,255, 0,104,0,255, 0,88,0,255, 0,64,64,255, 0,0,0,255, 0,0,0,255, 0,0,0,255,
      188,188,188,255, 0,120,248,255, 0,88,248,255, 104,68,252,255, 216,0,204,255, 228,0,88,255, 248,56,0,255, 228,92,16,255,
      172,124,0,255, 0,184,0,255, 0,168,0,255, 0,168,68,255, 0,136,136,255, 0,0,0,255, 0,0,0,255, 0,0,0,255,
      248,248,248,255, 60,188,252,255, 104,136,252,255, 152,120,248,255, 248,120,248,255, 248,88,152,255, 248,120,88,255, 252,160,68,255,
      248,184,0,255, 184,248,24,255, 88,216,84,255, 88,248,152,255, 0,232,216,255, 120,120,120,255, 0,0,0,255, 0,0,0,255,
      252,252,252,255, 164,228,252,255, 184,184,248,255, 216,184,248,255, 248,184,248,255, 248,164,192,255, 240,208,176,255, 252,224,168,255,
      248,216,120,255, 216,248,120,255, 184,248,184,255, 184,248,216,255, 0,252,252,255, 248,216,248,255, 0,0,0,255, 0,0,0,255
    ]);

    paletteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    // 设置为不使用 mipmap 的邻近过滤
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 上传为 1 x 64 RGBA 纹理
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, nesPalette);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // 将 palette 大小告知着色器
    if (palProgram) {
      gl.useProgram(palProgram);
      // u_paletteSize removed, fixed to 64
    }
  }
}

// 使用三倍缓冲进行渲染 (创建运动模糊/残影效果)
function renderWithTripleBuffering() {
  if (!gl || !tripleBufferEnabled) return;

  // 获取当前和之前的缓冲区
  const buffers = [frameBuffer1, frameBuffer2, frameBuffer3];
  const textures = [fbTexture1, fbTexture2, fbTexture3];

  const currentBuffer = buffers[currentBufferIndex];

  // 第一步：渲染当前帧到当前缓冲区
  gl.bindFramebuffer(gl.FRAMEBUFFER, currentBuffer);
  gl.viewport(0, 0, 256, 240);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 使用默认WebGL程序渲染当前帧到帧缓冲区
  gl.useProgram(glProgram);
  // 把像素数据上传到当前帧缓冲所绑定的纹理，而不是主屏幕纹理
  gl.bindTexture(gl.TEXTURE_2D, textures[currentBufferIndex]);
  // 更新已分配纹理的像素数据，使用 texSubImage2D 避免重新分配
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imgData.data));
  // 注意：不要在绑定了当前帧缓冲附着的纹理时去绘制（shader 可能会采样该纹理），
  // 这会造成 "Feedback loop formed between Framebuffer and active Texture" 错误。
  // texImage2D 已经把像素上传到纹理，后续的屏幕渲染在解绑帧缓冲后进行（第二步）。

  // 第二步：渲染到屏幕，混合三个缓冲区创建残影效果
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, c.width, c.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 使用自定义着色器进行混合
  const program = createShaderProgram(vertexShaderSource, tripleBufferFragmentShaderSource);
  if (program) {
    gl.useProgram(program);

    // 设置纹理uniforms
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture1'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture2'), 1);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture3'), 2);

    // 设置混合权重 (当前帧权重最高，前几帧逐渐降低)
    const mixWeights = [0.5, 0.3, 0.2]; // 可以调整这些值来控制残影强度
    gl.uniform1f(gl.getUniformLocation(program, 'u_mixWeight1'), mixWeights[0]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_mixWeight2'), mixWeights[1]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_mixWeight3'), mixWeights[2]);

    // 绑定三个纹理到不同的纹理单元
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[currentBufferIndex]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[(currentBufferIndex + 2) % 3]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures[(currentBufferIndex + 1) % 3]);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 更新缓冲区索引
  currentBufferIndex = (currentBufferIndex + 1) % 3;
}

// 初始化三倍缓冲系统
function initTripleBuffering() {
  if (!gl) return false;

  console.log('Initializing triple buffering system for motion blur');

  try {
    // 创建三个帧缓冲区
    frameBuffer1 = gl.createFramebuffer();
    frameBuffer2 = gl.createFramebuffer();
    frameBuffer3 = gl.createFramebuffer();

    // 创建三个纹理
    fbTexture1 = gl.createTexture();
    fbTexture2 = gl.createTexture();
    fbTexture3 = gl.createTexture();

    // 创建三个渲染缓冲区
    renderBuffer1 = gl.createRenderbuffer();
    renderBuffer2 = gl.createRenderbuffer();
    renderBuffer3 = gl.createRenderbuffer();

    const textures = [fbTexture1, fbTexture2, fbTexture3];
    const framebuffers = [frameBuffer1, frameBuffer2, frameBuffer3];
    const renderbuffers = [renderBuffer1, renderBuffer2, renderBuffer3];

    for (let i = 0; i < 3; i++) {
      const texture = textures[i];
      const framebuffer = framebuffers[i];
      const renderbuffer = renderbuffers[i];

      // 设置纹理
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 240, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // 设置帧缓冲区
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      // 设置渲染缓冲区（深度缓冲区）
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 256, 240);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

      // 检查帧缓冲区完整性
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer not complete for buffer', i);
        cleanupTripleBuffering();
        return false;
      }
    }

    // 解绑
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    currentBufferIndex = 0;
    console.log('Triple buffering system initialized successfully');
    return true;

  } catch (e) {
    console.error('Failed to initialize triple buffering:', e);
    cleanupTripleBuffering();
    return false;
  }
}

// 清理三倍缓冲系统
function cleanupTripleBuffering() {
  if (!gl) return;

  console.log('Cleaning up triple buffering system');

  // 删除帧缓冲区
  if (frameBuffer1) gl.deleteFramebuffer(frameBuffer1);
  if (frameBuffer2) gl.deleteFramebuffer(frameBuffer2);
  if (frameBuffer3) gl.deleteFramebuffer(frameBuffer3);

  // 删除纹理
  if (fbTexture1) gl.deleteTexture(fbTexture1);
  if (fbTexture2) gl.deleteTexture(fbTexture2);
  if (fbTexture3) gl.deleteTexture(fbTexture3);

  // 删除渲染缓冲区
  if (renderBuffer1) gl.deleteRenderbuffer(renderBuffer1);
  if (renderBuffer2) gl.deleteRenderbuffer(renderBuffer2);
  if (renderBuffer3) gl.deleteRenderbuffer(renderBuffer3);

  // 重置变量
  frameBuffer1 = frameBuffer2 = frameBuffer3 = null;
  fbTexture1 = fbTexture2 = fbTexture3 = null;
  renderBuffer1 = renderBuffer2 = renderBuffer3 = null;
  currentBufferIndex = 0;
  tripleBufferEnabled = false;
}

// 六倍缓冲的清理函数
function cleanupSixBuffering() {
  if (!gl) return;

  console.log('Cleaning up six buffering system');

  for (let i = 0; i < sixFrameBuffers.length; i++) {
    const fb = sixFrameBuffers[i];
    const tex = sixTextures[i];
    const rb = sixRenderBuffers[i];
    if (fb) gl.deleteFramebuffer(fb);
    if (tex) gl.deleteTexture(tex);
    if (rb) gl.deleteRenderbuffer(rb);
  }

  sixFrameBuffers = [];
  sixTextures = [];
  sixRenderBuffers = [];
  sixCurrentIndex = 0;
  sixBufferEnabled = false;
}

// 多倍缓冲的清理函数
function cleanupMultiBuffering() {
  if (!gl) return;

  console.log('Cleaning up multi buffering system');

  for (let i = 0; i < multiFrameBuffers.length; i++) {
    const fb = multiFrameBuffers[i];
    const tex = multiTextures[i];
    const rb = multiRenderBuffers[i];
    if (fb) gl.deleteFramebuffer(fb);
    if (tex) gl.deleteTexture(tex);
    if (rb) gl.deleteRenderbuffer(rb);
  }

  multiFrameBuffers = [];
  multiTextures = [];
  multiRenderBuffers = [];
  multiCurrentIndex = 0;
  multiBufferEnabled = false;
}

// 初始化六倍缓冲系统
function initSixBuffering() {
  if (!gl) return false;

  console.log('Initializing six buffering system for motion blur');

  try {
    // 清理已有的六倍缓冲（如果有）
    cleanupSixBuffering();

    sixFrameBuffers = [];
    sixTextures = [];
    sixRenderBuffers = [];

    for (let i = 0; i < 6; i++) {
      const framebuffer = gl.createFramebuffer();
      const texture = gl.createTexture();
      const renderbuffer = gl.createRenderbuffer();

      sixFrameBuffers.push(framebuffer);
      sixTextures.push(texture);
      sixRenderBuffers.push(renderbuffer);

      // 设置纹理
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 240, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // 设置帧缓冲区
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      // 设置渲染缓冲区（深度缓冲区）
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 256, 240);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

      // 检查帧缓冲区完整性
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer not complete for six-buffer index', i);
        cleanupSixBuffering();
        return false;
      }
    }

    // 解绑
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    sixCurrentIndex = 0;
    console.log('Six buffering system initialized successfully');
    return true;

  } catch (e) {
    console.error('Failed to initialize six buffering:', e);
    cleanupSixBuffering();
    return false;
  }
}

// 初始化多倍缓冲系统
function initMultiBuffering() {
  if (!gl) return false;

  console.log('Initializing multi buffering system for motion blur, count:', multiBufferCount);

  try {
    // 清理已有的多倍缓冲
    cleanupMultiBuffering();

    multiFrameBuffers = [];
    multiTextures = [];
    multiRenderBuffers = [];

    for (let i = 0; i < multiBufferCount; i++) {
      const framebuffer = gl.createFramebuffer();
      const texture = gl.createTexture();
      const renderbuffer = gl.createRenderbuffer();

      multiFrameBuffers.push(framebuffer);
      multiTextures.push(texture);
      multiRenderBuffers.push(renderbuffer);

      // 设置纹理
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 240, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // 设置帧缓冲区
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      // 设置渲染缓冲区（深度缓冲区）
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 256, 240);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

      // 检查帧缓冲区完整性
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer not complete for multi-buffer index', i);
        cleanupMultiBuffering();
        return false;
      }
    }

    // 解绑
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    multiCurrentIndex = 0;
    console.log('Multi buffering system initialized successfully');
    return true;

  } catch (e) {
    console.error('Failed to initialize multi buffering:', e);
    cleanupMultiBuffering();
    return false;
  }
}

// 使用六倍缓冲进行渲染 (创建更强的残影/运动模糊)
function renderWithSixBuffering() {
  if (!gl || !sixBufferEnabled) return;
  const buffers = sixFrameBuffers;
  const textures = sixTextures;

  const currentBuffer = buffers[sixCurrentIndex];

  // 第一步：把当前像素上传到当前缓冲的纹理（不要在绑定该帧缓冲时绘制）
  gl.bindFramebuffer(gl.FRAMEBUFFER, currentBuffer);
  gl.viewport(0, 0, 256, 240);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 上传像素数据到当前缓冲所绑定的纹理（已分配），使用 texSubImage2D
  gl.useProgram(glProgram);
  gl.bindTexture(gl.TEXTURE_2D, textures[sixCurrentIndex]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imgData.data));

  // 第二步：解绑帧缓冲，一次性用 sixBufferProgram 绘制并混合六个历史纹理
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, c.width, c.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (sixBufferProgram) {
    gl.useProgram(sixBufferProgram);

    // 绑定 6 个纹理到纹理单元 0..5
    const texUniforms = ['u_texture0','u_texture1','u_texture2','u_texture3','u_texture4','u_texture5'];
    for (let i = 0; i < 6; i++) {
      gl.activeTexture(gl['TEXTURE' + i]);
      gl.bindTexture(gl.TEXTURE_2D, textures[(sixCurrentIndex + i) % 6]);
      const loc = gl.getUniformLocation(sixBufferProgram, texUniforms[i]);
      if (loc) gl.uniform1i(loc, i);
    }

    // 设置权重（可调），权重和接近 1
    const weights = [0.35, 0.25, 0.15, 0.10, 0.08, 0.07];
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight0'), weights[0]);
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight1'), weights[1]);
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight2'), weights[2]);
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight3'), weights[3]);
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight4'), weights[4]);
    gl.uniform1f(gl.getUniformLocation(sixBufferProgram, 'u_weight5'), weights[5]);

    // 单次绘制完成六帧混合
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  sixCurrentIndex = (sixCurrentIndex + 1) % 6;
}

// 使用多倍缓冲进行渲染
function renderWithMultiBuffering() {
  if (!gl || !multiBufferEnabled) return;
  const buffers = multiFrameBuffers;
  const textures = multiTextures;

  const currentBuffer = buffers[multiCurrentIndex];

  // 第一步：把当前像素上传到当前缓冲的纹理
  gl.bindFramebuffer(gl.FRAMEBUFFER, currentBuffer);
  gl.viewport(0, 0, 256, 240);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 上传像素数据到当前缓冲所绑定的纹理
  gl.useProgram(glProgram);
  gl.bindTexture(gl.TEXTURE_2D, textures[multiCurrentIndex]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imgData.data));

  // 第二步：解绑帧缓冲，用 multiBufferProgram 绘制并混合
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, c.width, c.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (multiBufferProgram) {
    gl.useProgram(multiBufferProgram);

    // 绑定纹理到纹理单元 0..5，根据count
    const texUniforms = ['u_texture0','u_texture1','u_texture2','u_texture3','u_texture4','u_texture5'];
    const weightUniforms = ['u_weight0','u_weight1','u_weight2','u_weight3','u_weight4','u_weight5'];
    
    // 默认权重，根据count调整
    let weights = [];
    if (multiBufferCount === 3) {
      weights = [0.5, 0.3, 0.2, 0, 0, 0];
    } else if (multiBufferCount === 6) {
      weights = [0.35, 0.25, 0.15, 0.10, 0.08, 0.07];
    } else {
      // 默认6
      weights = [0.35, 0.25, 0.15, 0.10, 0.08, 0.07];
    }

    for (let i = 0; i < 6; i++) {
      if (i < multiBufferCount) {
        gl.activeTexture(gl['TEXTURE' + i]);
        gl.bindTexture(gl.TEXTURE_2D, textures[(multiCurrentIndex + i) % multiBufferCount]);
        const loc = gl.getUniformLocation(multiBufferProgram, texUniforms[i]);
        if (loc) gl.uniform1i(loc, i);
        const wloc = gl.getUniformLocation(multiBufferProgram, weightUniforms[i]);
        if (wloc) gl.uniform1f(wloc, weights[i]);
      } else {
        // 设置为0
        const wloc = gl.getUniformLocation(multiBufferProgram, weightUniforms[i]);
        if (wloc) gl.uniform1f(wloc, 0.0);
      }
    }

    // 单次绘制完成混合
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  multiCurrentIndex = (multiCurrentIndex + 1) % multiBufferCount;
}

// 使用滤镜渲染 (将 RGBA 数据转换为 RGB 并应用 2x 缩放滤镜)
function renderWithFilter() {
  if (!gl || !window.imgData) return;

  const filter = window.currentFilter || 'none';

  // 将 RGBA 数据转换为 RGB 数据 (去掉 alpha 通道)
  const rgbaData = window.imgData.data;
  if (!reusableRgbData || reusableRgbData.length !== 256 * 240 * 3) {
    reusableRgbData = new Uint8Array(256 * 240 * 3); // RGB 数据
  }
  const rgbData = reusableRgbData;

  for (let i = 0, j = 0; i < rgbaData.length; i += 4, j += 3) {
    rgbData[j] = rgbaData[i];     // R
    rgbData[j + 1] = rgbaData[i + 1]; // G
    rgbData[j + 2] = rgbaData[i + 2]; // B
    // 忽略 alpha 通道
  }

  // 使用可重用的 RGB 纹理并更新像素数据，避免每帧创建/删除纹理
  if (!reusableRgbTexture) {
    // 兜底：若尚未初始化，则创建并分配
    reusableRgbTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, reusableRgbTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 240, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_2D, reusableRgbTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGB, gl.UNSIGNED_BYTE, rgbData);

  // 获取canvas的实际大小并设置正确的视口
  const canvas = gl.canvas;
  gl.viewport(0, 0, canvas.width, canvas.height);

  // 根据滤镜类型选择着色器程序
  let program = null;
  switch (filter) {
    case 'NSTC':
      program = nstcProgram;
      break;
    case 'PAL':
      program = palProgram;
      break;
    default:
      // 回退到普通渲染
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      // 更新主纹理像素数据（已在初始化时分配），使用 texSubImage2D 避免重新分配
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 240, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imgData.data));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
  }

  if (program) {
    gl.useProgram(program);


    // 设置纹理 uniform，使用可重用的 RGB 纹理
    const textureLocation = gl.getUniformLocation(program, 'u_texture');
    if (textureLocation) gl.uniform1i(textureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, reusableRgbTexture);

    // 设置纹理大小 uniform
    const textureSizeLocation = gl.getUniformLocation(program, 'u_textureSize');
    gl.uniform2f(textureSizeLocation, 256.0, 240.0);

    // 渲染
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 保留 reusableRgbTexture 以供下一帧复用
}

// 应用当前选择的滤镜效果
function applyFilter() {
  const filter = window.currentFilter || 'none';
  //console.log('Applying filter:', filter);

  if (!isWebGL) {
    //console.log('WebGL not available, using no filter');
    return;
  }

  // 确保着色器程序已初始化（只需 NSTC 与 PAL）
  if (!nstcProgram || !palProgram) {
    initShaderPrograms();
  }

  switch (filter) {
    case 'none':
      if (gl) {
        // 完全重置WebGL状态，确保从多倍缓冲切换过来时状态正确
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, c.width, c.height);
        gl.useProgram(glProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        // 重置其他纹理单元（多倍缓冲可能使用了多个）
        for (let i = 1; i <= 5; i++) {
          gl.activeTexture(gl['TEXTURE' + i]);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
        // 回到TEXTURE0
        gl.activeTexture(gl.TEXTURE0);
      }
      if (multiBufferEnabled) {
        cleanupMultiBuffering();
      }
      break;

    case 'multiBuffer':
      console.log('Applying multi buffer filter - motion blur/ghosting effect, count:', multiBufferCount);
      if (gl && initMultiBuffering()) {
        multiBufferEnabled = true;
      } else {
        multiBufferEnabled = false;
      }
      break;
    case 'NSTC':
      console.log('Applying NSTC filter - NTSC style');
      if (gl && nstcProgram) {
        gl.useProgram(nstcProgram);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
      if (multiBufferEnabled) cleanupMultiBuffering();
      break;
    case 'PAL':
      console.log('Applying PAL filter - YUV color conversion');
      if (gl && palProgram) {
        gl.useProgram(palProgram);
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
      if (multiBufferEnabled) cleanupMultiBuffering();
      break;

    // 已移除旧的像素缩放与边缘平滑滤镜实现（使用 NSTC / PAL 替代）
  }
}

// 更新滤镜选择状态，根据WebGL可用性启用/禁用选项
function updateFilterSelectState() {
  const filterSelect = document.getElementById('filterSelect');
  if (!filterSelect) return;

  const options = filterSelect.options;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    // 仅对存在的 WebGL 滤镜选项启用/禁用控制
    if (option.value === 'multiBuffer' || option.value === 'NSTC' || option.value === 'PAL') {
      option.disabled = !isWebGL;
    } else {
      option.disabled = false;
    }
  }

  // 如果当前选择的滤镜被禁用，切换到none
  if (filterSelect.options[filterSelect.selectedIndex] && filterSelect.options[filterSelect.selectedIndex].disabled) {
    filterSelect.value = 'none';
    window.currentFilter = 'none';
    try { localStorage.setItem('currentFilter', 'none'); } catch (e) {}
    applyFilter();
  }
}

// 初始化滤镜系统
function initFilters() {
  // 恢复保存的设置
  try {
    const savedCount = localStorage.getItem('multiBufferCount');
    if (savedCount) multiBufferCount = parseInt(savedCount);
  } catch (e) {}

  // 初始化着色器程序
  initShaderPrograms();

  // 初始化可重用的 RGB 纹理（一次性分配）
  if (gl && !reusableRgbTexture) {
    reusableRgbTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, reusableRgbTexture);
    // 初次分配内存
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 240, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // 绑定滤镜选择控件
  const filterSelect = document.getElementById('filterSelect');
  if (filterSelect) {
    filterSelect.value = window.currentFilter || 'none';
    updateFilterSelectState();
    filterSelect.addEventListener('change', function () {
      window.currentFilter = this.value;
      console.log('Filter changed to:', this.value);
      try { localStorage.setItem('currentFilter', window.currentFilter); } catch (e) {}
      // 显示/隐藏倍数选择
      const multiBufferRow = document.getElementById('multiBufferRow');
      if (multiBufferRow) {
        multiBufferRow.style.display = (this.value === 'multiBuffer') ? 'grid' : 'none';
      }
      applyFilter();
    });
  }

  // 绑定倍数选择控件
  const multiBufferSelect = document.getElementById('multiBufferSelect');
  if (multiBufferSelect) {
    multiBufferSelect.value = multiBufferCount.toString();
    multiBufferSelect.addEventListener('change', function () {
      multiBufferCount = parseInt(this.value);
      console.log('Multi buffer count changed to:', multiBufferCount);
      try { localStorage.setItem('multiBufferCount', multiBufferCount); } catch (e) {}
      if (window.currentFilter === 'multiBuffer') {
        applyFilter(); // 重新初始化缓冲
      }
    });
  }

  // 注意：不在此处自动应用滤镜，等待游戏加载完成后再调用
}

// 导出滤镜相关的函数和变量
const FilterSystem = {
  renderWithMultiBuffering,
  initMultiBuffering,
  cleanupMultiBuffering,
  applyFilter,
  updateFilterSelectState,
  initFilters,
  renderWithFilter
};

// Expose multiBufferEnabled as a dynamic getter so external code sees the current internal state
Object.defineProperty(FilterSystem, 'multiBufferEnabled', {
  get: function() { return multiBufferEnabled; },
  enumerable: true
});

FilterSystem.renderWithMultiBuffering = renderWithMultiBuffering;

window.FilterSystem = FilterSystem;

