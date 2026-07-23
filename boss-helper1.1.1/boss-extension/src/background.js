// ===== Boss海投助手 Service Worker：编排 收集→投递→跨页面接力 =====
importScripts('/src/selectors.js');

// ===== Worker 后端地址（部署后替换 YOUR_SUBDOMAIN）=====
const API_BASE = 'https://boss.luckyioo.cc.cd';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => sleep(a + Math.random() * (b - a));

let state = {
  phase: 'idle', paused: false, aborted: false,
  jobs: [], queue: [], queueIndex: 0, results: [],
  processed: {}
};

// ── 风险控制 / 冷却退避系统 ──
const RiskManager = {
  consecutiveErrors: 0,
  baseDelay: 3000,
  maxDelay: 120000,
  dangerSigns: /验证|滑块|点击完成验证|安全验证|访问频率|频繁|异常|封禁|banned|captcha|verify/i,

  reset() { this.consecutiveErrors = 0; },

  onError(pageText) {
    this.consecutiveErrors++;
    if (pageText && this.dangerSigns.test(pageText)) {
      this.consecutiveErrors = Math.max(this.consecutiveErrors, 4); // 立即跳到大延迟
    }
    return this.getDelay();
  },

  onSuccess() {
    this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 2);
  },

  getDelay() {
    if (this.consecutiveErrors <= 0) return 3000;
    const exp = Math.min(this.consecutiveErrors, 6);
    const delay = this.baseDelay * Math.pow(2, exp - 1);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    return Math.min(Math.round(jitter), this.maxDelay);
  },

  isDangerous() { return this.consecutiveErrors >= 5; }
};

// ── HR 职级排序 ──
function scoreHRTitle(title) {
  if (!title) return 20;
  const t = title.toLowerCase();
  if (/创始人|法人|ceo|总裁|院长|合伙人/.test(t)) return 200;
  if (/总监|经理|主管/.test(t)) return 100;
  if (/hrbp|hrd/.test(t)) return 90;
  if (/招聘.*(主管|经理|负责人)/.test(t)) return 85;
  if (/hr|人事/.test(t)) return 50;
  if (/专员|助理/.test(t)) return 30;
  if (/猎头/.test(t)) return 10;
  return 20;
}

function rankJobsByHR(queue) {
  // 按公司分组，每个公司保留 HR 职级最高的岗位（排前面）
  const companyMap = {};
  for (const job of queue) {
    const norm = normalizeCompany(job.company || '');
    if (!companyMap[norm]) companyMap[norm] = job;
    else {
      const existing = scoreHRTitle(companyMap[norm].hrTitle);
      const current = scoreHRTitle(job.hrTitle);
      if (current > existing) companyMap[norm] = job;
    }
  }
  // 返回排序结果：HR职级高的在前
  return Object.values(companyMap).sort((a, b) =>
    scoreHRTitle(b.hrTitle) - scoreHRTitle(a.hrTitle)
  );
}

// ── 法人/老板识别 ──
function detectBoss(hrName, hrTitle, companyName) {
  if (!hrTitle) return false;
  const t = hrTitle.toLowerCase();
  // 头衔直判
  if (/法人|创始人|老板|ceo|总裁|总经理|院长|合伙人|董事长/.test(t)) return true;
  // 名字-公司名交叉匹配
  if (hrName && companyName) {
    const surname = hrName.charAt(0);
    if (surname && companyName.length >= 2 && companyName.includes(surname)) {
      // 排除常见词（科技、信息、网络等）
      if (!/科技|信息|网络|电子|软件|数据|互联|商务|咨询|贸易|实业/.test(companyName.slice(companyName.indexOf(surname), companyName.indexOf(surname) + 4))) {
        return true;
      }
    }
  }
  return false;
}

// ── 小工具 ──
function log(text, level) {
  chrome.runtime.sendMessage({ type: 'LOG', text, level: level || 'info' }).catch(() => {});
}
function pushPhase() {
  chrome.runtime.sendMessage({ type: 'PHASE', phase: state.phase }).catch(() => {});
}
function progress(cur, total, label) {
  chrome.runtime.sendMessage({ type: 'PROGRESS', cur, total, label: label || '' }).catch(() => {});
}
function notifyJobStatus(job, index, status, error) {
  chrome.runtime.sendMessage({
    type: 'JOB_STATUS',
    index,
    jobId: job.id || '',
    company: job.company || '',
    name: job.name || '',
    status,
    error: error || ''
  }).catch(() => {});
}
async function getCfg() {
  return chrome.storage.local.get([
    'keyword', 'city', 'count', 'dailyLimit',
    'useAutoSendImageResume', 'imageResumes',
    'recruiterActivityStatus', 'excludeHeadhunters', 'excludeInterns',
    'resumeText',
    'enableCompanyCheck', 'enableCompanyResearch',
    'hrInactiveDays', 'conversationStrategy',
    'blacklist', 'salaryRange', 'smartWorkdayOnly', 'smartAvoidLunch', 'smartAdaptiveInterval', 'smartGreetingPrompt',
    'jobType', 'experience', 'degree', 'scale'
  ]);
}
function defaultCfg(cfg) {
  cfg.count = parseInt(cfg.count) || 20;
  return cfg;
}

// ── 城市解析 ──
function resolveCity(cfg) {
  const firstCity = (cfg.city || '').split(/[\/、,，\s]+/)[0].replace(/[市省]$/, '') || '';
  const code = CITY_MAP[firstCity] || '100010000';
  return { name: firstCity, code, found: code !== '100010000' || firstCity === '全国' };
}
function buildSearchUrl(cfg) {
  const c = resolveCity(cfg);
  return 'https://www.zhipin.com/web/geek/job?query=' + encodeURIComponent(cfg.keyword || '') + '&city=' + c.code;
}

// ── Tab 管理 ──
function waitTabComplete(tabId) {
  return new Promise(resolve => {
    function lis(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(lis);
        setTimeout(resolve, 1200);
      }
    }
    chrome.tabs.onUpdated.addListener(lis);
    chrome.tabs.get(tabId, t => {
      if (t && t.status === 'complete') { chrome.tabs.onUpdated.removeListener(lis); setTimeout(resolve, 1200); }
    });
  });
}
async function curUrl(tabId) {
  return new Promise(res => chrome.tabs.get(tabId, t => res((t && t.url) || '')));
}
async function ensureTab(url) {
  let tabs = await chrome.tabs.query({ url: '*://*.zhipin.com/*' });
  let tab = tabs[0];
  if (!tab) tab = await chrome.tabs.create({ url });
  else await chrome.tabs.update(tab.id, { url });
  await waitTabComplete(tab.id);
  await sleep(2000);
  return tab;
}
async function ensureInjected(tabId, file) {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['src/selectors.js', file] }); }
  catch (e) { /* already injected */ }
}
function sendToTab(tabId, msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, resp => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(resp || { success: false, error: 'no response' });
    });
  });
}

// ── AI 调用（通过 Worker 代理，仅检查余额不扣费）──
async function callAI(cfg, messages, maxTokens) {
  const clientIdData = await chrome.storage.local.get('clientId');
  const clientId = clientIdData.clientId || 'unknown';
  log('  [AI] 通过 Worker 代理发起请求...');

  const resp = await fetch(API_BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      messages,
      max_tokens: maxTokens || 500,
      temperature: 0.5
    })
  });

  const data = await resp.json();

  if (data.need_recharge) {
    throw new Error('余额不足，请充值后再使用');
  }
  if (!resp.ok) {
    throw new Error('AI 请求失败: ' + (data.error || resp.status));
  }
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('AI 响应格式异常');
  }

  return data.choices[0].message.content || '';
}

// ── 招呼语缓存（24h TTL）──
function greetingCacheKey(job) {
  // 缓存键：公司名_岗位全称（避免同岗位跨城市 ID 不同导致重复生成）
  const company = (job.company || '').trim();
  const name = (job.fullName || job.name || '').trim();
  const key = company + '_' + name;
  return 'greet_' + (key || job.id || '').replace(/[^a-zA-Z0-9一-龥]/g, '_').slice(0, 100);
}
async function getCachedGreeting(key) {
  const data = await chrome.storage.local.get(key);
  const cached = data[key];
  if (cached && cached.time && (Date.now() - cached.time < 24 * 3600 * 1000)) {
    return cached.text;
  }
  return null;
}
async function setCachedGreeting(key, text) {
  await chrome.storage.local.set({ [key]: { text, time: Date.now() } });
}

// ── 策略注入（三档在结构约束层面差异化）──
const STRATEGY_PROMPTS = {
  aggressive:
    '策略：自信主动。第二句必须包含量化成果数字（如提升XX%、服务XX万用户）。' +
    '第三句主动表达"期待深入交流"类意愿。整体语气笃定果断。',
  balanced:
    '策略：客观匹配。第二句陈述与岗位最相关的项目或职责经验。' +
    '第三句点明与JD要求的匹配点。整体语气诚恳踏实。',
  conservative:
    '策略：简洁克制。第二句仅陈述背景方向与岗位的契合，不展开细节。' +
    '第三句简短呼应JD方向即可。整体语气平等内敛，全文控制在40-55字。'
};

// ── 招呼语生成（带缓存）──
async function generateGreeting(cfg, job, jd) {
  const cacheKey = greetingCacheKey(job);
  const cached = await getCachedGreeting(cacheKey);
  if (cached && cached.trim()) {
    log('  [缓存] 命中历史招呼语: ' + cached.trim().slice(0, 30) + '...');
    return cached;
  }

  const resumeText = (cfg.resumeText || '').trim();
  const resumeAnalysis = (cfg.resumeAnalysis || '').trim();
  const smartPrompt = (cfg.smartGreetingPrompt || '').trim();
  const strategy = STRATEGY_PROMPTS[cfg.conversationStrategy] || STRATEGY_PROMPTS.balanced;
  const sys = '你是求职者本人，在BOSS直聘给HR发首条招呼语。你的回复将原样发送给HR。\n\n' +
    '【格式】\n' +
    '- 全文3句话，每句不超过25字，中文\n' +
    '- 不能用emoji、感叹号、问号、括号备注\n' +
    '- 结尾以句号结束\n\n' +
    '【结构】\n' +
    '- 第一句：岗位锚定——"您好，对贵司{岗位全称}很感兴趣"\n' +
    '- 第二句：经验直给——给出与该岗位强相关的一条经验。简历中有量化数字就用，没有就用定性描述，严禁编造数字\n' +
    '- 第三句：JD呼应——仅从JD的职责描述和任职要求部分提取技术栈或核心职责关键词，忽略福利待遇描述，说明匹配点\n\n' +
    '【语气】\n' +
    '- 像真人在打字，平等专业，不卑微讨好\n' +
    '- 绝对不能提问、不能索要面试、不能用"方便聊聊吗"等索取式表达\n' +
    '- ' + strategy;
  const jdText = (jd && jd.trim()) ? jd.trim().slice(0, 2000) : ((job.tags || []).join('、'));
  const jobTitle = job.fullName || job.name || '';
  const companyInfo = job.company ? ('（' + job.company + '）') : '';
  const salaryInfo = job.salary ? (' | 薪资：' + job.salary) : '';
  // 交叉引用：自定义提示词
  let extraBlocks = '';
  if (smartPrompt) extraBlocks += '\n\n【用户额外要求】\n' + smartPrompt;

  const user = '【我的简历】\n' + (resumeText || '无') + extraBlocks +
    '\n\n【目标岗位】' + jobTitle + companyInfo + salaryInfo +
    '\n\n【该岗位JD】\n' + jdText +
    '\n\n请直接输出招呼语本身，不要任何多余内容。';
  try {
    let greeting = await callAISmart(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], 2000);
    greeting = (greeting || '').trim();
    if (greeting) await setCachedGreeting(cacheKey, greeting);
    return greeting;
  } catch (e) {
    log('  招呼语生成异常: ' + e.message, 'error');
    return '';
  }
}

// ── 公司背景评估 ──
async function evaluateCompany(cfg, job, jd) {
  if (!cfg.enableCompanyCheck) return { score: 5, comment: '未启用公司评估' };
  const jdText = (jd || '').slice(0, 1500) || (job.tags || []).join('、');
  const sys = '你是资深招聘顾问。评估这个岗位JD的质量和靠谱度，1-10分。考虑：JD描述详细程度、薪资透明度、公司信息完整性、是否有明显red flag。只输出JSON: {"score":数字,"comment":"一句话理由"}';
  try {
    const raw = await callAISmart(cfg, [{ role: 'system', content: sys }, { role: 'user', content: '岗位：' + (job.name || '') + '\n公司：' + (job.company || '') + '\nJD：\n' + jdText }], 150);
    const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    if (p && typeof p.score === 'number') return { score: p.score, comment: p.comment || '' };
    return { score: 5, comment: '评估解析失败' };
  } catch (e) {
    return { score: 5, comment: '评估异常' };
  }
}

// ── AI 调用（统一走 Worker 代理）──
async function callAISmart(cfg, messages, maxTokens) {
  return callAI(cfg, messages, maxTokens);
}

// ── AI 缓存键（通用）──
function aiCacheKey(prefix, text) {
  return 'ai_ck_' + prefix + '_' + (text || '').slice(0, 60).replace(/[^a-zA-Z0-9]/g, '_');
}
async function getAiCache(key) {
  const data = await chrome.storage.local.get(key);
  const c = data[key];
  if (c && c.time && (Date.now() - c.time < 24 * 3600 * 1000)) return c.text;
  return null;
}
async function setAiCache(key, text) {
  await chrome.storage.local.set({ [key]: { text, time: Date.now() } });
}

// ── 公司去重 ──
function normalizeCompany(name) {
  return (name || '').replace(/[（(].*?[）)]/g, '').replace(/有限(责任)?公司|股份有限(责任)?公司|集团有限公司?|有限公司/g, '').replace(/\s/g, '').toLowerCase();
}
function parseInactiveDays(activeTime) {
  if (!activeTime || activeTime === '在线' || activeTime === '刚刚活跃') return 0;
  if (activeTime.includes('今日')) return 1;
  if (activeTime.includes('3日内')) return 3;
  if (activeTime.includes('本周')) return 7;
  if (activeTime.includes('2周')) return 14;
  const mM = activeTime.match(/(\d+)月/); if (mM) return parseInt(mM[1]) * 30;
  const mD = activeTime.match(/(\d+)天/); if (mD) return parseInt(mD[1]);
  return 0;
}

// ── 每日上限检测 ──
async function checkDailyLimit(cfg) {
  const limit = cfg.dailyLimit || 100;
  const today = new Date().toDateString();
  const key = 'dailyStats_' + today.replace(/\s/g, '_');
  const stats = await chrome.storage.local.get(key);
  const count = (stats[key] || 0);
  return { reached: count >= limit, count, limit, key };
}
async function incrDailyCount(key) {
  const stats = await chrome.storage.local.get(key);
  const count = (stats[key] || 0) + 1;
  await chrome.storage.local.set({ [key]: count });
}

// ── 高峰时段检测 ──
function isPeakHour() {
  const h = new Date().getHours();
  return CONFIG.PEAK_HOURS.some(p => h >= p.start && h < p.end);
}

// ── 多城市解析 ──
function parseCities(cityStr) {
  if (!cityStr || !cityStr.trim()) return [{ name: '全国', code: '100010000' }];
  return cityStr.split(/[\/、,，\s]+/).filter(Boolean).map(c => {
    const name = c.replace(/[市省]$/, '') || '';
    const code = CITY_MAP[name] || '100010000';
    return { name, code, found: code !== '100010000' || name === '全国' };
  });
}
function buildSearchUrlForCity(cfg, cityObj) {
  let url = 'https://www.zhipin.com/web/geek/job?query=' + encodeURIComponent(cfg.keyword || '') + '&city=' + cityObj.code;
  if (cfg.salaryRange) url += '&salary=' + cfg.salaryRange;
  if (cfg.jobType) url += '&job_type=' + cfg.jobType;
  if (cfg.experience) url += '&experience=' + cfg.experience;
  if (cfg.degree) url += '&degree=' + cfg.degree;
  if (cfg.scale) url += '&scale=' + cfg.scale;
  return url;
}

// ── 仪表盘追踪 ──
async function updateJobTracker(field, increment) {
  const d = await chrome.storage.local.get('jobTracker');
  const t = d.jobTracker || { total: 0, applied: 0, interviewing: 0, rejected: 0 };
  if (increment) t[field] = (t[field] || 0) + 1;
  else t[field] = (t[field] || 0);
  await chrome.storage.local.set({ jobTracker: t });
}

// ── 流程 1：收集 + 筛选（多城市）──
async function runCollect() {
  state.aborted = false; state.paused = false;
  state.jobs = []; state.queue = []; state.results = [];
  state.phase = 'collecting'; pushPhase();
  const cfg = defaultCfg(await getCfg());
  if (!cfg.keyword) { log('请先填写岗位关键词', 'error'); state.phase = 'idle'; pushPhase(); return; }

  // 高峰时段检测
  if (!isPeakHour()) {
    log('⚠ 当前非最佳投递时段（上午9-11点、下午2-5点），继续运行...', 'warn');
  }

  // 每日上限检测
  const daily = await checkDailyLimit(cfg);
  if (daily.reached) {
    log('今日投递已达上限（' + daily.limit + '），请明天再试', 'warn');
    state.phase = 'idle'; pushPhase(); return;
  }
  log('今日已投递：' + daily.count + ' / ' + daily.limit);

  // 多城市收集
  const cities = parseCities(cfg.city);
  log('关键词：' + cfg.keyword + ' | 城市：' + cities.map(c => c.name).join('、'));

  const allJobs = [];
  for (const cityObj of cities) {
    if (state.aborted) break;
    log('🏙 切换城市：' + cityObj.name + (cityObj.found ? '' : '（未识别，按全国）'));
    const url = buildSearchUrlForCity(cfg, cityObj);
    const tab = await ensureTab(url);
    await ensureInjected(tab.id, 'src/content-search.js');

    const r = await sendToTab(tab.id, {
      type: 'SCRAPE',
      count: cfg.count || 20
    });
    if (r && r.success && r.jobs) {
      allJobs.push(...r.jobs.map(j => ({ ...j, city: cityObj.name })));
      log('  ' + cityObj.name + '：收集到 ' + r.jobs.length + ' 个岗位');
    }
    await rand(2000, 4000);
  }
  state.jobs = allJobs;
  await updateJobTracker('total', true);
  log('共收集 ' + state.jobs.length + ' 个岗位（' + cities.length + ' 个城市）', 'success');
  if (!state.jobs.length) { state.phase = 'idle'; pushPhase(); return; }

  // 筛选
  state.phase = 'screening'; pushPhase();
  const { appliedCompanies, appliedHistory } = await chrome.storage.local.get(['appliedCompanies', 'appliedHistory']);
  const companySet = new Set((appliedCompanies || '').split(',').filter(Boolean));
  const historyList = appliedHistory || [];

  // 建立岗位 ID 与 规范化(公司_岗位)的已投递集合
  const appliedJobIds = new Set(historyList.map(h => h.id).filter(Boolean));
  const appliedJobKeys = new Set(historyList.map(h => normalizeCompany(h.company || '') + '_' + (h.name || '').trim().toLowerCase()));

  state.queue = [];
  let countHeadhunter = 0;
  let countInterns = 0;
  let countInactive = 0;
  let countBlacklist = 0;
  let countDuplicateJob = 0;
  let countDuplicateCompany = 0;

  for (const job of state.jobs) {
    if (state.aborted) break;

    // 排除猎头
    const isHeadhunter = (job.tags || []).some(t => t.includes('猎头'));
    if (cfg.excludeHeadhunters && isHeadhunter) {
      countHeadhunter++;
      continue;
    }

    // 排除实习生
    const jobNameLower = (job.name || '').toLowerCase();
    if (cfg.excludeInterns && (jobNameLower.includes('实习') || jobNameLower.includes('intern'))) {
      countInterns++;
      continue;
    }

    // HR 不活跃限制
    if (cfg.hrInactiveDays > 0 && job.activeTime) {
      const days = parseInactiveDays(job.activeTime);
      if (days > cfg.hrInactiveDays) {
        countInactive++;
        continue;
      }
    }

    // 公司黑名单
    const blacklist = (cfg.blacklist || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (blacklist.length > 0) {
      const companyLower = (job.company || '').toLowerCase();
      if (blacklist.some(b => companyLower.includes(b.toLowerCase()))) {
        countBlacklist++;
        continue;
      }
    }

    // 岗位/公司去重校验
    const normComp = normalizeCompany(job.company || '');
    const normName = (job.name || '').trim().toLowerCase();
    const jobKey = normComp + '_' + normName;

    // 1. 岗位级去重 (匹配 ID 或 匹配 公司_岗位名称)
    if ((job.id && appliedJobIds.has(job.id)) || appliedJobKeys.has(jobKey)) {
      countDuplicateJob++;
      continue;
    }

    // 2. 公司级去重
    if (normComp && companySet.has(normComp)) {
      countDuplicateCompany++;
      continue;
    }

    // 法人识别
    if (detectBoss(job.hrName, job.hrTitle, job.company)) {
      job.isBoss = true;
    }
    state.queue.push({ ...job });
  }

  // 打印过滤详情
  if (countHeadhunter > 0) log('  - 过滤猎头岗位: ' + countHeadhunter + ' 个', 'warn');
  if (countInterns > 0) log('  - 过滤实习生岗位: ' + countInterns + ' 个', 'warn');
  if (countInactive > 0) log('  - 过滤 HR 不活跃岗位: ' + countInactive + ' 个', 'warn');
  if (countBlacklist > 0) log('  - 过滤黑名单公司: ' + countBlacklist + ' 个', 'warn');
  if (countDuplicateJob > 0) log('  - 过滤已投递过的历史岗位: ' + countDuplicateJob + ' 个', 'warn');
  if (countDuplicateCompany > 0) log('  - 过滤已投递过的重复公司: ' + countDuplicateCompany + ' 个', 'warn');

  // HR 职级排序 + 去重：每公司只保留 HR 职级最高的岗位
  const beforeRank = state.queue.length;
  state.queue = rankJobsByHR(state.queue);
  const bossCount = state.queue.filter(j => j.isBoss).length;
  const rankLog = beforeRank > state.queue.length ? '（去重+排序，保留' + state.queue.length + '个）' : '';
  if (bossCount > 0) log('👔 检测到 ' + bossCount + ' 个法人/老板直招岗位', 'success');
  log('筛选完成：匹配 ' + state.queue.length + ' / ' + state.jobs.length + ' ' + rankLog, 'success');

  // 保存
  await chrome.storage.local.set({ sw_queue: state.queue, sw_queue_index: 0 });

  state.phase = 'review'; pushPhase();
  chrome.runtime.sendMessage({ type: 'QUEUE_READY', queue: state.queue }).catch(() => {});
}

// ── 流程 2：投递 ──
async function runDeliver() {
  state.aborted = false; state.paused = false; state.results = [];
  state.phase = 'delivering'; pushPhase();

  // 从 storage 恢复（SW 可能被回收）
  if (!state.queue.length) {
    const d = await chrome.storage.local.get(['sw_queue', 'sw_queue_index']);
    state.queue = d.sw_queue || [];
    state.queueIndex = d.sw_queue_index || 0;
  }
  const cfg = defaultCfg(await getCfg());
  log('🚀 开始投递，当前配置：' + JSON.stringify({
    '排除实习生': cfg.excludeInterns === true,
    '仅工作日': cfg.smartWorkdayOnly !== false,
    '避午休': cfg.smartAvoidLunch !== false,
    '自适应间隔': cfg.smartAdaptiveInterval !== false
  }));
  const searchUrl = buildSearchUrl(cfg);

  const total = state.queue.length;
  for (let i = state.queueIndex; i < total; i++) {
    if (state.aborted || state.paused) break;

    const now = new Date();

    // 1. 仅工作日投递
    if (cfg.smartWorkdayOnly !== false) {
      const dow = now.getDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) {
        log('⏸ 周末暂停投递（已开启仅工作日），周一自动恢复', 'warn');
        state.paused = true;
        break;
      }
    }

    // 2. 避开午休时段
    if (cfg.smartAvoidLunch !== false) {
      const hour = now.getHours();
      if (hour >= 12 && hour < 14) {
        log('⏸ 午休时段暂停（12-14点），14点后恢复', 'warn');
        await sleep(60000); // wait 1 min
        i--;
        continue;
      }
    }

    // 3. 自适应间隔
    if (cfg.smartAdaptiveInterval !== false) {
      if (i > 0 && i % 3 === 0) {
        log('  智能间隔：休息30秒...');
        await sleep(30000);
      }
    }

    // 每日上限检查
    const daily = await checkDailyLimit(cfg);
    if (daily.reached) { log('今日投递已达上限（' + daily.limit + '）', 'warn'); break; }

    const job = state.queue[i];
    notifyJobStatus(job, i, 'delivering');
    log('[' + (i + 1) + '/' + total + '] ' + job.name + ' - ' + (job.company || ''));

    // 1. 打开岗位详情页或搜索页，读取 JD
    const targetUrl = job.link || searchUrl;
    log('  打开岗位页面: ' + targetUrl);
    const tab = await ensureTab(targetUrl);
    await ensureInjected(tab.id, 'src/content-search.js');
    log('  读取岗位JD...');
    const jdr = await sendToTab(tab.id, { type: 'OPEN_JD', job });
    const jd = (jdr && jdr.jd) || '';
    // 提取岗位全称（用于招呼语岗位锚定句 + 缓存键）
    if (jdr && jdr.fullName) job.fullName = jdr.fullName;

    // 2. 公司背景评估 (已彻底关闭此功能)
        if (false) {
      const evalR = await evaluateCompany(cfg, job, jd);
      log('  公司评估：' + evalR.score + '/10 - ' + evalR.comment);
      if (evalR.score <= CONFIG.COMPANY_CHECK.REJECT_THRESHOLD) {
        log('  ✗ 公司评分过低（' + evalR.score + '/10），跳过', 'warn');
        progress(i + 1, total, '投递');
        continue;
      }
    }

    // 3. 生成招呼语
    log('  生成招呼语...');
    let greeting = '';
    try { greeting = await generateGreeting(cfg, job, jd); } catch (e) { log('  生成失败：' + e.message, 'error'); }
    if (!greeting) {
      log('  招呼语为空，跳过', 'warn');
      notifyJobStatus(job, i, 'failed', '招呼语为空');
      progress(i + 1, total, '投递');
      continue;
    }

    // 3. 点击"立即沟通" → 跳转聊天页
    log('  建立联系...');
    const r3 = await sendToTab(tab.id, { type: 'GO_CHAT', job, greeting, cfg });
    const chatUrlFromTab = r3 && r3.chatUrl;

    // 等待并定位聊天页（当前页重定向，或打开了新标签页）
    let chatTab = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      const currentUrl = await curUrl(tab.id);
      if (currentUrl.includes('/web/geek/chat')) {
        chatTab = tab;
        break;
      }
      // 广度查询所有标签页，手动过滤以避免 Chrome API 的严格匹配限制
      const allTabs = await chrome.tabs.query({});
      const matched = allTabs.filter(t => t.url && t.url.includes('/web/geek/chat'));
      if (matched.length > 0) {
        chatTab = matched[0];
        await chrome.tabs.update(chatTab.id, { active: true });
        break;
      }
      await sleep(500);
    }

    // 兜底方案：如果页面没有跳转也未打开新标签页，且抓取到了直接聊天链接，则通过后台强制打开
    if (!chatTab && chatUrlFromTab) {
      log('  检测到标签页未成功跳转，尝试强制创建新聊天标签页...', 'warn');
      chatTab = await chrome.tabs.create({ url: chatUrlFromTab });
      await chrome.tabs.update(chatTab.id, { active: true });
    }

    if (!chatTab) {
      log('  未进入聊天页，跳过', 'error');
      notifyJobStatus(job, i, 'failed', '未能进入聊天页');
      progress(i + 1, total, '投递');
      continue;
    }

    const oldTabId = tab.id;
    if (chatTab.id !== oldTabId) {
      // 如果打开了新标签页，关闭旧的岗位详情页
      chrome.tabs.remove(oldTabId).catch(() => {});
      tab = chatTab;
    }

    await waitTabComplete(tab.id);
    await sleep(1500);

    // 4. 在聊天页发送
    await ensureInjected(tab.id, 'src/content-chat.js');
    log('  发送招呼语 + 简历...');
    const r2 = await sendToTab(tab.id, {
      type: 'SEND_ALL',
      job,
      greeting,
      useAutoSendImageResume: cfg.useAutoSendImageResume,
      imageResumes: cfg.imageResumes || []
    });

    if (r2 && r2.success) {
      log('  ✓ 投递成功', 'success');
      notifyJobStatus(job, i, 'success');
      state.results.push({ id: job.id, name: job.name, ok: true });
      await incrDailyCount(daily.key);
      await updateJobTracker('applied', true);
      RiskManager.onSuccess();
      // ===== 新增：投递成功后扣除 1 点额度 =====
      try {
        const clientIdData = await chrome.storage.local.get('clientId');
        const deductResp = await fetch(API_BASE + '/api/deduct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientIdData.clientId })
        });
        const deductData = await deductResp.json();
        if (deductData.success) {
          chrome.runtime.sendMessage({
            type: 'CREDITS_UPDATE',
            credits: deductData.credits,
            total_delivered: deductData.total_delivered
          }).catch(() => {});
          log('  额度 -1，剩余 ' + deductData.credits + ' 个岗位');
        }
      } catch (e) { /* 扣费失败不影响投递结果 */ }
      const normComp = normalizeCompany(job.company || '');
      const storageData = await chrome.storage.local.get(['appliedHistory', 'appliedCompanies']);
      const currentHistory = storageData.appliedHistory || [];
      const currentCompaniesSet = new Set((storageData.appliedCompanies || '').split(',').filter(Boolean));

      // 构建历史记录条目
      const newHistoryItem = {
        id: job.id || '',
        name: job.name || '',
        company: job.company || '',
        salary: job.salary || '',
        hrName: job.hrName || '',
        hrTitle: job.hrTitle || '',
        applyTime: Date.now()
      };

      // 避免重复追加同一记录
      const existsIndex = currentHistory.findIndex(h => (job.id && h.id === job.id) || (h.company === job.company && h.name === job.name));
      if (existsIndex >= 0) {
        currentHistory[existsIndex] = newHistoryItem;
      } else {
        currentHistory.unshift(newHistoryItem);
      }

      if (normComp) currentCompaniesSet.add(normComp);

      await chrome.storage.local.set({
        appliedHistory: currentHistory,
        appliedCompanies: Array.from(currentCompaniesSet).join(',')
      });
    } else {
      const errMsg = (r2 && r2.error) || '';
      const pageText = (r2 && r2.pageText) || '';
      log('  失败：' + errMsg, 'error');
      notifyJobStatus(job, i, 'failed', errMsg || '发送未确认');
      state.results.push({ id: job.id, name: job.name, ok: false, msg: errMsg });
      const riskDelay = RiskManager.onError(pageText);
      if (RiskManager.isDangerous()) {
        log('⚠ 检测到风控信号！自动降速至 ' + Math.round(riskDelay/1000) + 's 间隔', 'warn');
        if (RiskManager.consecutiveErrors >= 6) {
          log('🛑 连续异常过多，暂停投递。请稍后手动恢复', 'error');
          state.paused = true;
          break;
        }
      }
    }

    state.queueIndex = i + 1;
    await chrome.storage.local.set({ sw_queue_index: i + 1 });
    progress(i + 1, total, '投递');

    // 使用风险感知延迟替代固定延迟
    const dynamicDelay = RiskManager.getDelay();
    await sleep(dynamicDelay);
  }

  const ok = state.results.filter(r => r.ok).length;
  const fail = state.results.length - ok;
  state.phase = 'done'; pushPhase();
  log('投递完成：成功 ' + ok + ' | 失败 ' + fail, 'success');
  await chrome.storage.local.remove(['sw_queue', 'sw_queue_index']);
  chrome.runtime.sendMessage({ type: 'DONE', ok, fail }).catch(() => {});
}

// ── 消息入口 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CONTENT_LOG') { log(msg.text, msg.level); sendResponse({ ok: true }); return; }
  if (msg.type === 'START_COLLECT') { runCollect(); sendResponse({ ok: true }); return; }
  if (msg.type === 'START_DELIVER') {
    chrome.storage.local.get(['sw_queue', 'sw_queue_index'], (d) => {
      if (d.sw_queue && d.sw_queue.length) { state.queue = d.sw_queue; state.queueIndex = 0; }
      runDeliver();
    });
    sendResponse({ ok: true }); return;
  }
  if (msg.type === 'PAUSE') { state.paused = true; log('已暂停', 'warn'); sendResponse({ ok: true }); return; }
  if (msg.type === 'RESUME') { state.paused = false; runDeliver(); sendResponse({ ok: true }); return; }
  if (msg.type === 'STOP') { state.aborted = true; state.paused = false; log('已停止', 'warn'); state.phase = 'idle'; pushPhase(); sendResponse({ ok: true }); return; }
  if (msg.type === 'RESET') {
    state.queue = []; state.queueIndex = 0; state.jobs = []; state.results = [];
    chrome.storage.local.remove(['sw_queue', 'sw_queue_index']);
    state.phase = 'idle'; pushPhase();
    log('已重置', 'warn'); sendResponse({ ok: true }); return;
  }
  if (msg.type === 'GET_STATE') { sendResponse({ phase: state.phase, queue: state.queue, queueIndex: state.queueIndex }); return; }
  if (msg.type === 'AI_CHAT_REQUEST') {
    (async () => {
      try {
        const cfg = await getCfg();
        const result = await callAI(cfg, msg.messages, msg.max_tokens || 150);
        sendResponse({ success: true, content: result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // 保持 sendResponse 异步通道
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
try { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}); } catch (e) {}
