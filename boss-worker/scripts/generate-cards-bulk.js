// 批量生成卡密 + 输出 wrangler bulk 上传文件 + 店铺列表
// 用法: node scripts/generate-cards-bulk.js [数量] [每张额度]
// 例:   node scripts/generate-cards-bulk.js 1000 100

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const count = parseInt(process.argv[2]) || 1000;
const credits = parseInt(process.argv[3]) || 100;

const KV_NAMESPACE_ID = 'a24b19824de24961b48270384f6bb613';

// 读取现有卡密列表，避免与旧卡密重复
const existingListPath = path.join(__dirname, '..', '卡密列表.txt');
const existingCodes = new Set();
if (fs.existsSync(existingListPath)) {
  fs.readFileSync(existingListPath, 'utf8')
    .split('\n').map(s => s.trim()).filter(Boolean).forEach(c => existingCodes.add(c));
  console.log(`# 已读取 ${existingCodes.size} 张旧卡密，将避免重复`);
}

const bulkEntries = [];   // wrangler bulk JSON
const plainCodes = [];    // 店铺列表
const generated = new Set();

let dupSkip = 0;
for (let i = 0; i < count; i++) {
  const code = 'BOSS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  // 极小概率重复：重试
  if (generated.has(code) || existingCodes.has(code)) { dupSkip++; i--; continue; }
  generated.add(code);

  const cardValue = JSON.stringify({ credits, used: false });
  bulkEntries.push({ key: 'card:' + code, value: cardValue });
  plainCodes.push(code);
}

// 输出文件
const outDir = __dirname;
const bulkFile = path.join(outDir, 'cards-bulk.json');
const plainFile = path.join(outDir, '..', `卡密列表-${count}.txt`);

fs.writeFileSync(bulkFile, JSON.stringify(bulkEntries));
fs.writeFileSync(plainFile, plainCodes.join('\n') + '\n');

console.log(`\n# ✅ 生成完成（跳过重复 ${dupSkip} 张）`);
console.log(`# 批量上传文件: ${bulkFile}  (${bulkEntries.length} 条)`);
console.log(`# 店铺列表文件: ${plainFile}`);
console.log(`\n# ── 执行下面的命令把卡密写入 KV ──`);
console.log(`cd ${path.join(outDir, '..')} && wrangler kv key put --namespace-id=${KV_NAMESPACE_ID} --bulk ${path.relative(path.join(outDir, '..'), bulkFile)}`);
console.log(`\n# ── 店铺列表（共 ${plainCodes.length} 张，复制到发卡平台后台） ──`);
console.log(plainCodes.join('\n'));
