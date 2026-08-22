// ===== Tauri 桌面版 Background 引擎 =====
// 在 panel-webview 上下文中运行，通过 Tauri IPC 与 boss-webview 交互

const getTauri = () => window.__TAURI__;
const invoke = (cmd, args) => (window.__TAURI__ ? window.__TAURI__.core.invoke(cmd, args) : Promise.reject('No Tauri'));
const emit = (evt, payload) => (window.__TAURI__ ? window.__TAURI__.event.emit(evt, payload) : Promise.resolve());
const listen = (evt, handler) => (window.__TAURI__ ? window.__TAURI__.event.listen(evt, handler) : Promise.resolve(() => {}));

// ===== Worker 后端地址 =====
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
      this.consecutiveErrors = Math.max(this.consecutiveErrors, 4);
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
  return Object.values(companyMap).sort((a, b) =>
    scoreHRTitle(b.hrTitle) - scoreHRTitle(a.hrTitle)
  );
}

// ── 法人/老板识别 ──
function detectBoss(hrName, hrTitle, companyName) {
  if (!hrTitle) return false;
  const t = hrTitle.toLowerCase();
  if (/法人|创始人|老板|ceo|总裁|总经理|院长|合伙人|董事长/.test(t)) return true;
  if (hrName && companyName) {
    const surname = hrName.charAt(0);
    if (surname && companyName.length >= 2 && companyName.includes(surname)) {
      if (!/科技|信息|网络|电子|软件|数据|互联|商务|咨询|贸易|实业/.test(companyName.slice(companyName.indexOf(surname), companyName.indexOf(surname) + 4))) {
        return true;
      }
    }
  }
  return false;
}

// ── 小工具 ──
function log(text, level) {
  emit('background-to-panel', { type: 'LOG', text, level: level || 'info' });
}
function pushPhase() {
  emit('background-to-panel', { type: 'PHASE', phase: state.phase });
}
function progress(cur, total, label) {
  emit('background-to-panel', { type: 'PROGRESS', cur, total, label: label || '' });
}
function notifyJobStatus(job, index, status, error) {
  emit('background-to-panel', {
    type: 'JOB_STATUS',
    index,
    jobId: job.id || '',
    company: job.company || '',
    name: job.name || '',
    status,
    error: error || ''
  });
}

async function getCfg() {
  return chromeStorageLocal.get([
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
  cfg = cfg || {};
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

// ── Tab 管理（Tauri 适配）──
async function waitTabComplete(tabId) {
  await sleep(2000);
}

async function curUrl(tabId) {
  await invoke('eval_in_boss', { script: `window.__TAURI__.event.emit('boss-eval-result', { url: window.location.href })` });
  return new Promise(resolve => {
    const unlisten = listen('boss-eval-result', (event) => {
      unlisten.then(fn => fn());
      resolve(event.payload.url || '');
    });
    setTimeout(() => resolve(''), 3000);
  });
}

async function ensureTab(url) {
  await invoke('navigate_to', { url });
  await sleep(3000);
  return { id: 'boss-webview' };
}

async function ensureInjected(tabId, file) {
  if (file.includes('content-search')) {
    await invoke('inject_content_search');
  } else if (file.includes('content-chat')) {
    await invoke('inject_content_chat');
  }
}

async function sendToTab(tabId, msg) {
  let script = '';
  if (msg.type === 'SCRAPE') {
    script = `(async () => {
      try {
        const jobs = await window.__bossSearch.scrape(${msg.count || 20});
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: { success: true, jobs } });
        }
      } catch (e) {
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: { success: false, error: e.toString() } });
        }
      }
    })()`;
  } else if (msg.type === 'OPEN_JD') {
    script = `(async () => {
      try {
        const r = await window.__bossSearch.openJD(${JSON.stringify(msg.job)});
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: r });
        }
      } catch (e) {
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: { success: false, error: e.toString() } });
        }
      }
    })()`;
  } else if (msg.type === 'GO_CHAT') {
    script = `(async () => {
      try {
        const r = await window.__bossSearch.goChat(${JSON.stringify(msg.job)}, ${JSON.stringify(msg.greeting)}, ${JSON.stringify(msg.cfg)});
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: r });
        }
      } catch (e) {
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: { success: false, error: e.toString() } });
        }
      }
    })()`;
  } else if (msg.type === 'SEND_ALL') {
    script = `(async () => {
      try {
        const r = await window.__bossChat.sendAll(${JSON.stringify(msg)});
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: r });
        }
      } catch (e) {
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
          window.__TAURI_INTERNALS__.invoke('return_eval_result', { result: { success: false, error: e.toString() } });
        }
      }
    })()`;
  }
  if (script) {
    await invoke('eval_in_boss', { script });
    return new Promise((resolve) => {
      const unlisten = listen('boss-eval-result', (event) => {
        unlisten.then(fn => fn());
        resolve(event.payload);
      });
      setTimeout(() => resolve({ success: false, error: 'timeout' }), 15000);
    });
  }
  return { success: false, error: 'unknown message type' };
}

// ── AI 调用（通过 Worker 代理）──
async function callAI(cfg, messages, maxTokens) {
  const clientIdData = await chromeStorageLocal.get('clientId');
  const clientId = clientIdData.clientId || 'unknown';
  log('  [AI] 发起请求...');

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
  if (data.need_recharge) throw new Error('余额不足，请充值后再使用');
  if (!resp.ok) throw new Error('AI 请求失败: ' + (data.error || resp.status));
  if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('AI 响应格式异常');

  return data.choices[0].message.content || '';
}

function greetingCacheKey(job) {
  const company = (job.company || '').trim();
  const name = (job.fullName || job.name || '').trim();
  const key = company + '_' + name;
  return 'greet_' + (key || job.id || '').replace(/[^a-zA-Z0-9一-龥]/g, '_').slice(0, 100);
}

async function getCachedGreeting(key) {
  const data = await chromeStorageLocal.get(key);
  const cached = data[key];
  if (cached && cached.time && (Date.now() - cached.time < 24 * 3600 * 1000)) return cached.text;
  return null;
}

async function setCachedGreeting(key, text) {
  await chromeStorageLocal.set({ [key]: { text, time: Date.now() } });
}

const STRATEGY_PROMPTS = {
  aggressive: '策略：自信主动。第二句必须包含量化成果数字。第三句主动表达"期待深入交流"类意愿。整体语气笃定果断。',
  balanced: '策略：客观匹配。第二句陈述与岗位最相关的项目或职责经验。第三句点明与JD要求的匹配点。整体语气诚恳踏实。',
  conservative: '策略：简洁克制。第二句仅陈述背景方向与岗位的契合。第三句简短呼应JD方向。全文控制在40-55字。'
};

async function generateGreeting(cfg, job, jd) {
  const cacheKey = greetingCacheKey(job);
  const cached = await getCachedGreeting(cacheKey);
  if (cached && cached.trim()) {
    log('  [缓存] 命中历史招呼语: ' + cached.trim().slice(0, 30) + '...');
    return cached;
  }

  const resumeText = (cfg.resumeText || '').trim();
  const smartPrompt = (cfg.smartGreetingPrompt || '').trim();
  const strategy = STRATEGY_PROMPTS[cfg.conversationStrategy] || STRATEGY_PROMPTS.balanced;
  const sys = '你是求职者本人，在BOSS直聘给HR发首条招呼语。你的回复将原样发送给HR。\n\n' +
    '【格式】\n' +
    '- 全文3句话，每句不超过25字，中文\n' +
    '- 不能用emoji、感叹号、问号、括号备注\n' +
    '- 结尾以句号结束\n\n' +
    '【结构】\n' +
    '- 第一句：岗位锚定——"您好，对贵司{岗位全称}很感兴趣"\n' +
    '- 第二句：经验直给——给出与该岗位强相关的一条经验\n' +
    '- 第三句：JD呼应——说明匹配点\n\n' +
    '【语气】\n' +
    '- 平等专业\n' +
    '- ' + strategy;
  const jdText = (jd && jd.trim()) ? jd.trim().slice(0, 2000) : ((job.tags || []).join('、'));
  const jobTitle = job.fullName || job.name || '';
  const companyInfo = job.company ? ('（' + job.company + '）') : '';
  const salaryInfo = job.salary ? (' | 薪资：' + job.salary) : '';
  let extraBlocks = smartPrompt ? ('\n\n【用户额外要求】\n' + smartPrompt) : '';

  const user = '【我的简历】\n' + (resumeText || '无') + extraBlocks +
    '\n\n【目标岗位】' + jobTitle + companyInfo + salaryInfo +
    '\n\n【该岗位JD】\n' + jdText +
    '\n\n请直接输出招呼语本身，不要任何多余内容。';
  try {
    let greeting = await callAI(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], 2000);
    greeting = (greeting || '').trim();
    if (greeting) await setCachedGreeting(cacheKey, greeting);
    return greeting;
  } catch (e) {
    log('  招呼语生成异常: ' + e.message, 'error');
    return '';
  }
}

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

async function checkDailyLimit(cfg) {
  const limit = cfg.dailyLimit || 100;
  const today = new Date().toDateString();
  const key = 'dailyStats_' + today.replace(/\s/g, '_');
  const stats = await chromeStorageLocal.get(key);
  const count = (stats[key] || 0);
  return { reached: count >= limit, count, limit, key };
}

async function incrDailyCount(key) {
  const stats = await chromeStorageLocal.get(key);
  const count = (stats[key] || 0) + 1;
  await chromeStorageLocal.set({ [key]: count });
}

function isPeakHour() {
  const h = new Date().getHours();
  return CONFIG.PEAK_HOURS.some(p => h >= p.start && h < p.end);
}

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

async function updateJobTracker(field, increment) {
  const d = await chromeStorageLocal.get('jobTracker');
  const t = d.jobTracker || { total: 0, applied: 0, interviewing: 0, rejected: 0 };
  if (increment) t[field] = (t[field] || 0) + 1;
  else t[field] = (t[field] || 0);
  await chromeStorageLocal.set({ jobTracker: t });
}

// ── 流程 1：收集 + 筛选 ──
async function runCollect() {
  state.aborted = false; state.paused = false;
  state.jobs = []; state.queue = []; state.results = [];
  state.phase = 'collecting'; pushPhase();
  const cfg = defaultCfg(await getCfg());
  if (!cfg.keyword) { log('请先填写岗位关键词', 'error'); state.phase = 'idle'; pushPhase(); return; }

  if (!isPeakHour()) {
    log('⚠ 当前非最佳投递时段（上午9-11点、下午2-5点），继续运行...', 'warn');
  }

  const daily = await checkDailyLimit(cfg);
  if (daily.reached) {
    log('今日投递已达上限（' + daily.limit + '），请明天再试', 'warn');
    state.phase = 'idle'; pushPhase(); return;
  }
  log('今日已投递：' + daily.count + ' / ' + daily.limit);

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
  const { appliedCompanies, appliedHistory } = await chromeStorageLocal.get(['appliedCompanies', 'appliedHistory']);
  const companySet = new Set((appliedCompanies || '').split(',').filter(Boolean));
  const historyList = appliedHistory || [];

  const appliedJobIds = new Set(historyList.map(h => h.id).filter(Boolean));
  const appliedJobKeys = new Set(historyList.map(h => normalizeCompany(h.company || '') + '_' + (h.name || '').trim().toLowerCase()));

  state.queue = [];
  let countHeadhunter = 0, countInterns = 0, countInactive = 0, countBlacklist = 0, countDuplicateJob = 0, countDuplicateCompany = 0;

  for (const job of state.jobs) {
    if (state.aborted) break;

    const isHeadhunter = (job.tags || []).some(t => t.includes('猎头'));
    if (cfg.excludeHeadhunters && isHeadhunter) { countHeadhunter++; continue; }

    const jobNameLower = (job.name || '').toLowerCase();
    if (cfg.excludeInterns && (jobNameLower.includes('实习') || jobNameLower.includes('intern'))) { countInterns++; continue; }

    if (cfg.hrInactiveDays > 0 && job.activeTime) {
      const days = parseInactiveDays(job.activeTime);
      if (days > cfg.hrInactiveDays) { countInactive++; continue; }
    }

    const blacklist = (cfg.blacklist || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (blacklist.length > 0) {
      const companyLower = (job.company || '').toLowerCase();
      if (blacklist.some(b => companyLower.includes(b.toLowerCase()))) { countBlacklist++; continue; }
    }

    const normComp = normalizeCompany(job.company || '');
    const normName = (job.name || '').trim().toLowerCase();
    const jobKey = normComp + '_' + normName;

    if ((job.id && appliedJobIds.has(job.id)) || appliedJobKeys.has(jobKey)) { countDuplicateJob++; continue; }
    if (normComp && companySet.has(normComp)) { countDuplicateCompany++; continue; }

    if (detectBoss(job.hrName, job.hrTitle, job.company)) {
      job.isBoss = true;
    }
    state.queue.push({ ...job });
  }

  if (countHeadhunter > 0) log('  - 过滤猎头岗位: ' + countHeadhunter + ' 个', 'warn');
  if (countInterns > 0) log('  - 过滤实习生岗位: ' + countInterns + ' 个', 'warn');
  if (countInactive > 0) log('  - 过滤 HR 不活跃岗位: ' + countInactive + ' 个', 'warn');
  if (countBlacklist > 0) log('  - 过滤黑名单公司: ' + countBlacklist + ' 个', 'warn');
  if (countDuplicateJob > 0) log('  - 过滤已投递过的历史岗位: ' + countDuplicateJob + ' 个', 'warn');
  if (countDuplicateCompany > 0) log('  - 过滤已投递过的重复公司: ' + countDuplicateCompany + ' 个', 'warn');

  const beforeRank = state.queue.length;
  state.queue = rankJobsByHR(state.queue);
  const bossCount = state.queue.filter(j => j.isBoss).length;
  const rankLog = beforeRank > state.queue.length ? '（去重+排序，保留' + state.queue.length + '个）' : '';
  if (bossCount > 0) log('👔 检测到 ' + bossCount + ' 个法人/老板直招岗位', 'success');
  log('筛选完成：匹配 ' + state.queue.length + ' / ' + state.jobs.length + ' ' + rankLog, 'success');

  await chromeStorageLocal.set({ sw_queue: state.queue, sw_queue_index: 0 });

  state.phase = 'review'; pushPhase();
  emit('background-to-panel', { type: 'QUEUE_READY', queue: state.queue });
}

// ── 流程 2：投递 ──
async function runDeliver() {
  state.aborted = false; state.paused = false; state.results = [];
  state.phase = 'delivering'; pushPhase();

  if (!state.queue.length) {
    const d = await chromeStorageLocal.get(['sw_queue', 'sw_queue_index']);
    state.queue = d.sw_queue || [];
    state.queueIndex = d.sw_queue_index || 0;
  }
  const cfg = defaultCfg(await getCfg());
  log('🚀 开始投递...');
  const searchUrl = buildSearchUrl(cfg);

  const total = state.queue.length;
  for (let i = state.queueIndex; i < total; i++) {
    if (state.aborted || state.paused) break;

    const now = new Date();
    if (cfg.smartWorkdayOnly !== false) {
      const dow = now.getDay();
      if (dow === 0 || dow === 6) {
        log('⏸ 周末暂停投递，周一自动恢复', 'warn');
        state.paused = true;
        break;
      }
    }

    if (cfg.smartAvoidLunch !== false) {
      const hour = now.getHours();
      if (hour >= 12 && hour < 14) {
        log('⏸ 午休时段暂停（12-14点），14点后恢复', 'warn');
        await sleep(60000);
        i--;
        continue;
      }
    }

    if (cfg.smartAdaptiveInterval !== false) {
      if (i > 0 && i % 3 === 0) {
        log('  智能间隔：休息30秒...');
        await sleep(30000);
      }
    }

    const daily = await checkDailyLimit(cfg);
    if (daily.reached) { log('今日投递已达上限（' + daily.limit + '）', 'warn'); break; }

    const job = state.queue[i];
    notifyJobStatus(job, i, 'delivering');
    log('[' + (i + 1) + '/' + total + '] ' + job.name + ' - ' + (job.company || ''));

    const targetUrl = job.link || searchUrl;
    log('  打开岗位页面: ' + targetUrl);
    const tab = await ensureTab(targetUrl);
    await ensureInjected(tab.id, 'src/content-search.js');
    log('  读取岗位JD...');
    const jdr = await sendToTab(tab.id, { type: 'OPEN_JD', job });
    const jd = (jdr && jdr.jd) || '';
    if (jdr && jdr.fullName) job.fullName = jdr.fullName;

    log('  生成招呼语...');
    let greeting = '';
    try { greeting = await generateGreeting(cfg, job, jd); } catch (e) { log('  生成失败：' + e.message, 'error'); }
    if (!greeting) {
      log('  招呼语为空，跳过', 'warn');
      notifyJobStatus(job, i, 'failed', '招呼语为空');
      progress(i + 1, total, '投递');
      continue;
    }

    log('  建立联系...');
    const r3 = await sendToTab(tab.id, { type: 'GO_CHAT', job, greeting, cfg });
    const chatUrlFromTab = r3 && r3.chatUrl;

    let chatTab = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      const currentUrl = await curUrl(tab.id);
      if (currentUrl.includes('/web/geek/chat')) {
        chatTab = tab;
        break;
      }
      await sleep(500);
    }

    if (!chatTab && chatUrlFromTab) {
      log('  检测到页面未成功跳转，尝试强制导航到聊天页...', 'warn');
      await invoke('navigate_to', { url: chatUrlFromTab });
      await sleep(3000);
      chatTab = tab;
    }

    await waitTabComplete(tab.id);
    await sleep(1500);

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

      try {
        const clientIdData = await chromeStorageLocal.get('clientId');
        const deductResp = await fetch(API_BASE + '/api/deduct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientIdData.clientId })
        });
        const deductData = await deductResp.json();
        if (deductData.success) {
          emit('background-to-panel', {
            type: 'CREDITS_UPDATE',
            credits: deductData.credits,
            total_delivered: deductData.total_delivered
          });
          log('  额度 -1，剩余 ' + deductData.credits + ' 个岗位');
        }
      } catch (e) {}

      const normComp = normalizeCompany(job.company || '');
      const storageData = await chromeStorageLocal.get(['appliedHistory', 'appliedCompanies']);
      const currentHistory = storageData.appliedHistory || [];
      const currentCompaniesSet = new Set((storageData.appliedCompanies || '').split(',').filter(Boolean));

      const newHistoryItem = {
        id: job.id || '',
        name: job.name || '',
        company: job.company || '',
        salary: job.salary || '',
        hrName: job.hrName || '',
        hrTitle: job.hrTitle || '',
        applyTime: Date.now()
      };

      const existsIndex = currentHistory.findIndex(h => (job.id && h.id === job.id) || (h.company === job.company && h.name === job.name));
      if (existsIndex >= 0) {
        currentHistory[existsIndex] = newHistoryItem;
      } else {
        currentHistory.unshift(newHistoryItem);
      }

      if (normComp) currentCompaniesSet.add(normComp);

      await chromeStorageLocal.set({
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
          log('🛑 连续异常过多，暂停投递。', 'error');
          state.paused = true;
          break;
        }
      }
    }

    state.queueIndex = i + 1;
    await chromeStorageLocal.set({ sw_queue_index: i + 1 });
    progress(i + 1, total, '投递');

    const dynamicDelay = RiskManager.getDelay();
    await sleep(dynamicDelay);
  }

  const ok = state.results.filter(r => r.ok).length;
  const fail = state.results.length - ok;
  state.phase = 'done'; pushPhase();
  log('投递完成：成功 ' + ok + ' | 失败 ' + fail, 'success');
  await chromeStorageLocal.remove(['sw_queue', 'sw_queue_index']);
  emit('background-to-panel', { type: 'DONE', ok, fail });
}

// ── 消息监听初始化 ──
function initBackgroundListeners() {
  listen('panel-to-background', (event) => {
    const msg = event.payload;
    if (!msg) return;
    if (msg.type === 'START_COLLECT') { runCollect(); }
    if (msg.type === 'START_DELIVER') {
      chromeStorageLocal.get(['sw_queue', 'sw_queue_index']).then(d => {
        if (d.sw_queue && d.sw_queue.length) { state.queue = d.sw_queue; state.queueIndex = 0; }
        runDeliver();
      });
    }
    if (msg.type === 'PAUSE') { state.paused = true; log('已暂停', 'warn'); }
    if (msg.type === 'RESUME') { state.paused = false; runDeliver(); }
    if (msg.type === 'STOP') { state.aborted = true; state.paused = false; log('已停止', 'warn'); state.phase = 'idle'; pushPhase(); }
    if (msg.type === 'RESET') {
      state.queue = []; state.queueIndex = 0; state.jobs = []; state.results = [];
      chromeStorageLocal.remove(['sw_queue', 'sw_queue_index']);
      state.phase = 'idle'; pushPhase();
      log('已重置', 'warn');
    }
  });
}

initBackgroundListeners();
