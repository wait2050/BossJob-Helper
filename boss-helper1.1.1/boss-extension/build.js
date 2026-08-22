// ===== Boss海投助手 插件代码混淆构建脚本 =====
// 用法：node build.js
// 产物：dist/ 目录，可直接加载到 Chrome

const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// 混淆配置：平衡保护强度与性能
// 文档：https://github.com/javascript-obfuscator/javascript-obfuscator
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,            // 控制流扁平化（让逻辑难追踪）
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,                // 注入死代码（干扰阅读）
  deadCodeInjectionThreshold: 0.3,
  stringArray: true,                      // 字符串数组化
  stringArrayEncoding: ['base64'],        // 字符串加密
  stringArrayThreshold: 0.75,
  identifierNamesGenerator: 'hexadecimal', // 变量名混淆为 _0x...
  transformObjectKeys: true,              // 对象键名混淆
  unicodeEscapeSequence: false,
  // 性能保护：不混淆这些（避免破坏 Chrome API 调用）
  reservedNames: [
    'chrome', 'document', 'window', 'navigator', 'fetch',
    'console', 'crypto', 'URL', 'Response', 'Request'
  ],
  reservedStrings: [
    'chrome://', 'chrome-extension://', 'https://boss.morpheus95.xyz', 'https://boss.luckyioo.cc.cd'
  ]
};

// 需要混淆的 JS 文件（在 src/ 下）
const JS_FILES = [
  'background.js',
  'sidepanel.js',
  'content-chat.js',
  'content-search.js',
  'selectors.js'
];

// 不混淆但需要复制的文件
const COPY_FILES = [
  'manifest.json',
  'src/sidepanel.html',
  'src/sidepanel.css'
];

// 需要复制的目录
const COPY_DIRS = ['icons'];

async function build() {
  console.log('🔨 开始混淆构建...\n');

  // 1. 清理 dist
  await fs.remove(DIST);
  await fs.ensureDir(DIST);
  await fs.ensureDir(path.join(DIST, 'src'));
  console.log('✓ 清理 dist/');

  // 2. 混淆 JS 文件
  console.log('\n📦 混淆 JS 文件：');
  for (const file of JS_FILES) {
    const srcPath = path.join(SRC, file);
    if (!await fs.pathExists(srcPath)) {
      console.log(`  ⚠ 跳过（不存在）：${file}`);
      continue;
    }
    const code = await fs.readFile(srcPath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
    const outPath = path.join(DIST, 'src', file);
    await fs.outputFile(outPath, result.getObfuscatedCode());
    const origSize = Buffer.byteLength(code);
    const obfSize = Buffer.byteLength(result.getObfuscatedCode());
    console.log(`  ✓ ${file}  ${formatSize(origSize)} → ${formatSize(obfSize)}`);
  }

  // 3. 复制非 JS 文件
  console.log('\n📋 复制资源文件：');
  for (const file of COPY_FILES) {
    const srcPath = path.join(ROOT, file);
    if (!await fs.pathExists(srcPath)) {
      console.log(`  ⚠ 跳过（不存在）：${file}`);
      continue;
    }
    // manifest.json 放在 dist 根目录，其他放 dist/src
    const outPath = file === 'manifest.json'
      ? path.join(DIST, 'manifest.json')
      : path.join(DIST, file);
    await fs.copy(srcPath, outPath);
    console.log(`  ✓ ${file}`);
  }

  // 4. 复制 icons 目录
  console.log('\n📁 复制目录：');
  for (const dir of COPY_DIRS) {
    const srcPath = path.join(ROOT, dir);
    if (!await fs.pathExists(srcPath)) continue;
    const outPath = path.join(DIST, dir);
    await fs.copy(srcPath, outPath);
    console.log(`  ✓ ${dir}/`);
  }

  console.log('\n✅ 构建完成！');
  console.log(`\n👉 加载方法：`);
  console.log(`   1. 打开 chrome://extensions`);
  console.log(`   2. 开启开发者模式`);
  console.log(`   3. 加载已解压的扩展程序 → 选择：`);
  console.log(`      ${DIST}\n`);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

build().catch(err => {
  console.error('\n❌ 构建失败：', err);
  process.exit(1);
});
