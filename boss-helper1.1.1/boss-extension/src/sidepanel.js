// ===== Boss海投助手 侧边栏 UI 逻辑 =====
const $ = id => document.getElementById(id);

// ===== Worker 后端地址（部署后替换 YOUR_SUBDOMAIN）=====
const API_BASE = 'https://boss.luckyioo.cc.cd';

// ===== BOSS直聘 URL 筛选维度选项（编码不准可在此调整）=====
const FILTER_OPTIONS = {
  jobType: [
    { val: '', label: '不限' },
    { val: '1901', label: '全职' },
    { val: '1902', label: '兼职' },
    { val: '1903', label: '临时' },
    { val: '1904', label: '自由职业' }
  ],
  experience: [
    { val: '', label: '不限' },
    { val: '101', label: '应届' },
    { val: '103', label: '1年内' },
    { val: '104', label: '1-3年' },
    { val: '105', label: '3-5年' },
    { val: '106', label: '5-10年' },
    { val: '107', label: '10年以上' }
  ],
  degree: [
    { val: '', label: '不限' },
    { val: '209', label: '初中及以下' },
    { val: '206', label: '高中' },
    { val: '208', label: '中专' },
    { val: '202', label: '大专' },
    { val: '203', label: '本科' },
    { val: '204', label: '硕士' },
    { val: '205', label: '博士' }
  ],
  scale: [
    { val: '', label: '不限' },
    { val: '301', label: '0-20人' },
    { val: '302', label: '20-99人' },
    { val: '303', label: '100-499人' },
    { val: '304', label: '500-999人' },
    { val: '305', label: '1000-9999人' },
    { val: '306', label: '10000人以上' }
  ]
};

// 4 个筛选维度当前值（单选）
let filterValues = { jobType: '', experience: '', degree: '', scale: '' };

function renderFilterGroup(key) {
  const container = document.querySelector('.filter-group[data-key="' + key + '"]');
  if (!container) return;
  const options = FILTER_OPTIONS[key] || [];
  const cur = filterValues[key] || '';

  container.innerHTML = options.map(opt => {
    const active = (opt.val === cur);
    return '<span class="chip chip-filter' + (active ? ' active' : '') + '" data-val="' + opt.val + '">' + opt.label + '</span>';
  }).join('');

  container.querySelectorAll('.chip-filter').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.val;
      filterValues[key] = (filterValues[key] === val) ? '' : val;
      renderFilterGroup(key);
    });
  });
}

['jobType', 'experience', 'degree', 'scale'].forEach(renderFilterGroup);

async function getClientId() {
  const data = await chrome.storage.local.get('clientId');
  return data.clientId || null;
}

const CFG_KEYS = [
  'keyword', 'city', 'count', 'dailyLimit',
  'useAutoSendImageResume',
  'imageResumes', 'excludeHeadhunters', 'excludeInterns', 'recruiterActivityStatus',
  'resumeText',
  'enableCompanyCheck', 'conversationStrategy',
  'hrInactiveDays', 'jobTracker', 'dailyStats',
  'blacklist', 'salaryRange', 'resumes', 'interviews',
  'smartWorkdayOnly', 'smartAvoidLunch', 'smartAdaptiveInterval', 'smartGreetingPrompt',
  'jobType', 'experience', 'degree', 'scale'
];

// 折叠面板
document.querySelectorAll('.card-h[data-toggle]').forEach(h => {
  h.addEventListener('click', () => {
    const body = $(h.dataset.toggle);
    body.classList.toggle('collapsed');
    h.classList.toggle('open');
  });
});

// 活跃状态 chips
let selectedActivity = ['不限'];
document.querySelectorAll('#activityChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const val = chip.dataset.val;
    if (val === '不限') {
      selectedActivity = ['不限'];
      document.querySelectorAll('#activityChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      selectedActivity = selectedActivity.filter(v => v !== '不限');
      if (selectedActivity.includes(val)) {
        selectedActivity = selectedActivity.filter(v => v !== val);
        chip.classList.remove('active');
      } else {
        selectedActivity.push(val);
        chip.classList.add('active');
      }
      document.querySelector('#activityChips .chip[data-val="不限"]').classList.remove('active');
      if (selectedActivity.length === 0) {
        selectedActivity = ['不限'];
        document.querySelector('#activityChips .chip[data-val="不限"]').classList.add('active');
      }
    }
  });
  if (chip.dataset.val === '不限') chip.classList.add('active');
});

// 策略选择器
let conversationStrategy = 'balanced';
document.querySelectorAll('.strategy-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    conversationStrategy = card.querySelector('input').value;
  });
});

// 图片简历
let imageResumes = [];
$('useAutoSendImageResume').addEventListener('change', () => {
  $('addImageBtn').style.display = $('useAutoSendImageResume').checked ? 'inline-block' : 'none';
  if (!$('useAutoSendImageResume').checked) $('imageResumeList').innerHTML = '';
});
$('addImageBtn').addEventListener('click', () => $('imageResumeInput').click());
$('imageResumeInput').addEventListener('change', (e) => {
  const files = e.target.files;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (ev) => {
      imageResumes.push({ path: file.name, data: ev.target.result });
      renderImageResumes();
    };
    reader.readAsDataURL(file);
  }
  e.target.value = '';
});
function renderImageResumes() {
  $('imageResumeList').innerHTML = imageResumes.map((r, i) =>
    '<div class="img-item"><span>' + r.path + '</span><button data-idx="' + i + '">删除</button></div>'
  ).join('');
  $('imageResumeList').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      imageResumes.splice(parseInt(btn.dataset.idx), 1);
      renderImageResumes();
    });
  });
}


// ── 薪资范围选择 ──
let salaryRange = '';
document.querySelectorAll('.chip-salary').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip-salary').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    salaryRange = chip.dataset.val;
  });
});

// ── 多份简历管理 ──
let resumes = [];
let currentResumeName = '';

function renderResumeSelector() {
  const sel = $('resumeSelector');
  sel.innerHTML = '<option value="">默认简历</option>' +
    resumes.map(r => '<option value="' + r.name + '">' + r.name + '</option>').join('');
  sel.value = currentResumeName;
}
$('resumeSelector').addEventListener('change', () => {
  const name = $('resumeSelector').value;
  if (!name) {
    currentResumeName = '';
    $('resumeText').value = '';
    $('resumeText').placeholder = '粘贴你的简历内容...';
    return;
  }
  const r = resumes.find(r => r.name === name);
  if (r) {
    currentResumeName = name;
    $('resumeText').value = r.text || '';
    if (r.analysis) renderAnalysisDisplay(r.analysis);
  }
});
$('deleteResumeBtn').addEventListener('click', () => {
  const name = currentResumeName;
  if (!name || !confirm('删除简历「' + name + '」？')) return;
  resumes = resumes.filter(r => r.name !== name);
  currentResumeName = '';
  $('resumeText').value = '';
  renderResumeSelector();
});

// ── 面试追踪 ──
let interviews = [];
function renderInterviews() {
  const list = $('interviewList');
  if (!interviews.length) {
    $('interviewCard').style.display = 'none';
    return;
  }
  $('interviewCard').style.display = 'block';
  list.innerHTML = interviews.map((iv, i) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #ffe0b2;">' +
    '<span>' + iv.company + ' - ' + iv.position + '<br><small style="color:#888">' + (iv.time || '待定') + '</small></span>' +
    '<button data-idx="' + i + '" class="iv-del" style="background:none;color:#c62828;font-size:11px;">X</button>' +
    '</div>'
  ).join('');
  list.querySelectorAll('.iv-del').forEach(btn => {
    btn.addEventListener('click', () => {
      interviews.splice(parseInt(btn.dataset.idx), 1);
      renderInterviews();
    });
  });
}
$('addInterviewBtn').addEventListener('click', () => {
  const company = prompt('公司名称：');
  if (!company) return;
  const position = prompt('岗位名称：');
  if (!position) return;
  const time = prompt('面试时间（如：7月3日 14:00）：') || '待定';
  interviews.push({ company, position, time, status: 'pending', addedAt: Date.now() });
  renderInterviews();
});

// ── 载入/保存配置 ──
function loadCfg() {
  chrome.storage.local.get(CFG_KEYS.concat(['imageResumeData']), d => {
    if (d.keyword) $('keyword').value = d.keyword;
    if (d.city) $('city').value = d.city;
    if (d.count) $('count').value = d.count;
    if (d.dailyLimit) $('dailyLimit').value = d.dailyLimit;
    $('useAutoSendImageResume').checked = d.useAutoSendImageResume === true;
    $('excludeHeadhunters').checked = d.excludeHeadhunters === true;
    $('excludeInterns').checked = d.excludeInterns === true;
    $('enableCompanyCheck').checked = d.enableCompanyCheck === true;
    if (d.conversationStrategy) {
      conversationStrategy = d.conversationStrategy;
      document.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('active'));
      const stratCard = document.querySelector('.strategy-card input[value="' + d.conversationStrategy + '"]');
      if (stratCard) stratCard.closest('.strategy-card').classList.add('active');
    }
    if (d.recruiterActivityStatus) selectedActivity = d.recruiterActivityStatus;
    $('hrInactiveDays').value = d.hrInactiveDays || 14;
    $('smartWorkdayOnly').checked = d.smartWorkdayOnly !== false;
    $('smartAvoidLunch').checked = d.smartAvoidLunch !== false;
    $('smartAdaptiveInterval').checked = d.smartAdaptiveInterval !== false;
    if (d.smartGreetingPrompt) $('smartGreetingPrompt').value = d.smartGreetingPrompt;
    if (d.blacklist) $('blacklist').value = d.blacklist;
    if (d.salaryRange) {
      salaryRange = d.salaryRange;
      document.querySelectorAll('.chip-salary').forEach(c => {
        c.classList.toggle('active', c.dataset.val === d.salaryRange);
      });
    }
    if (d.resumes) { resumes = d.resumes; renderResumeSelector(); }
    if (d.interviews) { interviews = d.interviews; renderInterviews(); }
    if (d.resumeText) $('resumeText').value = d.resumeText;
    if (d.imageResumes) { imageResumes = d.imageResumes; renderImageResumes(); }
    if ($('useAutoSendImageResume').checked) $('addImageBtn').style.display = 'inline-block';
    // 4 个筛选维度
    filterValues.jobType = d.jobType || '';
    filterValues.experience = d.experience || '';
    filterValues.degree = d.degree || '';
    filterValues.scale = d.scale || '';
    ['jobType', 'experience', 'degree', 'scale'].forEach(renderFilterGroup);
  });
}

async function saveCfg() {
  const obj = {
    keyword: $('keyword').value.trim(),
    city: $('city').value.trim(),
    count: parseInt($('count').value) || 20,
    dailyLimit: parseInt($('dailyLimit').value) || 100,
    useAutoSendImageResume: $('useAutoSendImageResume').checked,
    imageResumes,
    excludeHeadhunters: $('excludeHeadhunters').checked,
    excludeInterns: $('excludeInterns').checked,
    recruiterActivityStatus: selectedActivity,
    resumeText: $('resumeText').value.trim(),
    enableCompanyCheck: $('enableCompanyCheck').checked,
    conversationStrategy,
    hrInactiveDays: parseInt($('hrInactiveDays').value) || 14,
    smartWorkdayOnly: $('smartWorkdayOnly').checked,
    smartAvoidLunch: $('smartAvoidLunch').checked,
    smartAdaptiveInterval: $('smartAdaptiveInterval').checked,
    smartGreetingPrompt: $('smartGreetingPrompt').value.trim(),
    blacklist: $('blacklist').value.trim(),
    salaryRange,
    resumes,
    interviews,
    jobType: filterValues.jobType || '',
    experience: filterValues.experience || '',
    degree: filterValues.degree || '',
    scale: filterValues.scale || ''
  };
  await chrome.storage.local.set(obj);
}

// 日志
function addLog(text, level) {
  const log = $('log');
  const div = document.createElement('div');
  div.className = level || 'info';
  div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
$('clearLog').addEventListener('click', () => { $('log').innerHTML = ''; });

// 运行控制
function setRunning(run) {
  $('btnCollect').textContent = run ? '运行中...' : '开始收集 + 投递';
  $('btnCollect').disabled = run;
  $('btnPause').disabled = !run;
  $('btnStop').disabled = !run;
}

$('btnCollect').addEventListener('click', async () => {
  await saveCfg();
  if (!$('keyword').value.trim()) return addLog('请先填写岗位关键词', 'error');
  setRunning(true);
  $('phaseText').textContent = '收集中...';
  addLog('开始收集 + 投递', 'info');
  chrome.runtime.sendMessage({ type: 'START_COLLECT' });
});

$('btnPause').addEventListener('click', () => {
  if ($('btnPause').textContent === '暂停') {
    chrome.runtime.sendMessage({ type: 'PAUSE' });
    $('btnPause').textContent = '继续';
  } else {
    chrome.runtime.sendMessage({ type: 'RESUME' });
    $('btnPause').textContent = '暂停';
  }
});

$('btnStop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP' });
  setRunning(false);
  $('phaseText').textContent = '已停止';
});

$('btnReset').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET' });
  setRunning(false);
  $('phaseText').textContent = '就绪';
  $('log').innerHTML = '';
});

// ── 审核确认 ──
let reviewQueue = [];

function showReviewList(queue) {
  reviewQueue = queue;
  $('reviewCard').style.display = 'block';
  $('reviewCount').textContent = queue.length + ' 个岗位';
  $('selAll').checked = true;
  renderReviewList();
}

function renderReviewList(filtered) {
  const list = filtered || reviewQueue;

  // 按公司聚合：同公司多岗位折叠显示
  const companyGroups = {};
  const companyOrder = [];
  for (const j of list) {
    const key = (j.company || '未知').replace(/\s/g, '');
    if (!companyGroups[key]) { companyGroups[key] = []; companyOrder.push(key); }
    companyGroups[key].push(j);
  }

  let html = '';
  let globalIdx = 0;
  for (const key of companyOrder) {
    const jobs = companyGroups[key];
    const company = jobs[0].company || '未知';
    if (jobs.length > 1) {
      html += '<div style="background:#f8fafc;padding:4px 8px;margin:4px 0;border-radius:4px;font-size:11px;color:#555;cursor:pointer;" class="company-group-header" data-key="' + key + '">🏢 ' + company + ' (' + jobs.length + '个岗位) ▸</div>';
      html += '<div class="company-group-body" data-key="' + key + '" style="display:none;">';
    }
    for (const j of jobs) {
      const i = globalIdx++;
      const bossBadge = j.isBoss ? '<span style="background:#fff3e0;color:#e65100;padding:0 4px;border-radius:3px;font-size:10px;margin-left:4px;">👔直招</span>' : '';
      const hrInfo = j.hrTitle ? ' · ' + (j.hrName || '') + ' ' + j.hrTitle : '';
      html += '<label class="review-item" style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;cursor:pointer;" data-idx="' + i + '">' +
        '<input type="checkbox" class="review-cb" data-idx="' + i + '" checked style="margin-top:2px;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;"><b>' + (j.name || '未知') + '</b>' + bossBadge + '</span>' +
        '<span class="job-status-badge pending" id="job-status-badge-' + i + '">待投递</span>' +
        '</div>' +
        '<span style="color:#666;font-size:11px;">' + (j.salary || '') + ' · ' + (j.location || j.city || '') + hrInfo + '</span>' +
        '</div></label>';
    }
    if (jobs.length > 1) html += '</div>';
  }

  $('reviewList').innerHTML = html || '<div style="color:#888;text-align:center;padding:12px;">无匹配岗位</div>';

  // 折叠展开
  $('reviewList').querySelectorAll('.company-group-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = $('reviewList').querySelector('.company-group-body[data-key="' + h.dataset.key + '"]');
      const visible = body.style.display !== 'none';
      body.style.display = visible ? 'none' : 'block';
      h.innerHTML = h.innerHTML.replace(visible ? '▸' : '▾', visible ? '▾' : '▸');
      h.innerHTML = h.innerHTML.replace(visible ? '▾' : '▸', visible ? '▸' : '▾');
    });
  });

  $('reviewList').querySelectorAll('.review-cb').forEach(cb => {
    cb.addEventListener('change', () => updateSelAll());
  });
}

function updateSelAll() {
  const cbs = $('reviewList').querySelectorAll('.review-cb');
  const allChecked = Array.from(cbs).every(c => c.checked);
  $('selAll').checked = allChecked;
}

$('selAll').addEventListener('change', () => {
  $('reviewList').querySelectorAll('.review-cb').forEach(cb => { cb.checked = $('selAll').checked; });
});

$('btnDeliver').addEventListener('click', async () => {
  const cbs = $('reviewList').querySelectorAll('.review-cb');
  const selected = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.dataset.idx);
      if (idx >= 0 && idx < reviewQueue.length) selected.push(reviewQueue[idx]);
    }
  });
  if (!selected.length) return addLog('请至少勾选一个岗位', 'warn');

  addLog('开始投递 ' + selected.length + ' 个选中岗位', 'info');
  // 保持 reviewCard 显示，但在投递过程中禁用按钮与勾选
  $('btnDeliver').disabled = true;
  $('btnDeliver').textContent = '🚀 正在投递...';
  $('reviewList').querySelectorAll('.review-cb').forEach(cb => cb.disabled = true);
  $('selAll').disabled = true;
  setRunning(true);
  $('phaseText').textContent = '投递中...';

  // 更新 SW 中的队列为选中岗位
  await chrome.storage.local.set({ sw_queue: selected, sw_queue_index: 0 });
  chrome.runtime.sendMessage({ type: 'START_DELIVER' });
});

// 接收 Background 消息
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'CREDITS_UPDATE') {
    $('creditsDisplay').textContent = msg.credits;
    if (typeof msg.total_delivered === 'number') {
      $('totalDelivered').textContent = msg.total_delivered;
    }
  }
  if (msg.type === 'LOG') { addLog(msg.text, msg.level); }
  if (msg.type === 'JOB_STATUS') {
    const badge = document.getElementById('job-status-badge-' + msg.index);
    if (badge) {
      if (msg.status === 'delivering') {
        badge.className = 'job-status-badge delivering';
        badge.textContent = '⏳ 投递中...';
      } else if (msg.status === 'success') {
        badge.className = 'job-status-badge success';
        badge.textContent = '✓ 成功';
      } else if (msg.status === 'failed') {
        badge.className = 'job-status-badge failed';
        badge.textContent = '✕ 失败';
        badge.title = msg.error || '发送未确认';
      }
    }
  }
  if (msg.type === 'PHASE') {
    const map = { idle: '就绪', collecting: '收集中...', screening: '筛选中...', review: '待确认', delivering: '投递中...', done: '完成' };
    $('phaseText').textContent = map[msg.phase] || msg.phase;
    if (msg.phase === 'done' || msg.phase === 'idle') {
      setRunning(false);
      unlockReviewControls();
    }
  }
  if (msg.type === 'PROGRESS') {
    $('progText').textContent = msg.cur + '/' + msg.total + ' ' + msg.label;
  }
  if (msg.type === 'QUEUE_READY') {
    addLog('筛选完成：匹配 ' + msg.queue.length + ' 个岗位', 'success');
    showReviewList(msg.queue);
  }
  if (msg.type === 'DONE') {
    addLog('投递完成：成功 ' + msg.ok + ' | 失败 ' + msg.fail, msg.ok > 0 ? 'success' : 'warn');
    setRunning(false);
    unlockReviewControls();
  }
});

function unlockReviewControls() {
  if ($('btnDeliver')) {
    $('btnDeliver').disabled = false;
    $('btnDeliver').textContent = '投递选中';
  }
  $('reviewList').querySelectorAll('.review-cb').forEach(cb => cb.disabled = false);
  if ($('selAll')) $('selAll').disabled = false;
}

// ── 仪表盘刷新 ──
async function updateDashboard() {
  const today = new Date().toDateString().replace(/\s/g, '_');
  const dailyKey = 'dailyStats_' + today;
  const data = await chrome.storage.local.get(['jobTracker', dailyKey]);
  const tracker = data.jobTracker || { total: 0, applied: 0, interviewing: 0, rejected: 0 };

  document.querySelector('#dashStats').innerHTML =
    '<div class="dash-chip">总岗位 <b>' + (tracker.total || 0) + '</b></div>' +
    '<div class="dash-chip applied">已投递 <b>' + (tracker.applied || 0) + '</b></div>' +
    '<div class="dash-chip interview">面试中 <b>' + (tracker.interviewing || 0) + '</b></div>' +
    '<div class="dash-chip rejected">已拒绝 <b>' + (tracker.rejected || 0) + '</b></div>';

  const greets = data[dailyKey] || 0;
  const replies = 0;
  const interviews = 0;
  const maxVal = Math.max(greets, 1);

  document.querySelector('#funnel').innerHTML =
    '<div class="funnel-bar"><span>今日投递</span><div style="flex:1;background:#eee;border-radius:3px;height:14px;overflow:hidden"><div style="width:' + (greets/maxVal*100) + '%;background:#4285f4;height:100%;border-radius:3px"></div></div><b style="color:#4285f4">' + greets + '</b></div>' +
    '<div class="funnel-bar"><span>HR回复</span><div style="flex:1;background:#eee;border-radius:3px;height:14px;overflow:hidden"><div style="width:' + (replies/maxVal*100) + '%;background:#34a853;height:100%;border-radius:3px"></div></div><b style="color:#34a853">' + replies + '</b></div>' +
    '<div class="funnel-bar"><span>面试邀约</span><div style="flex:1;background:#eee;border-radius:3px;height:14px;overflow:hidden"><div style="width:' + (interviews/maxVal*100) + '%;background:#ea4335;height:100%;border-radius:3px"></div></div><b style="color:#ea4335">' + interviews + '</b></div>';
}

// ===== 额度与充值 =====
// 查询余额
async function refreshCredits() {
  const clientId = await getClientId();
  try {
    const resp = await fetch(API_BASE + '/api/credits?client_id=' + clientId);
    const data = await resp.json();
    $('creditsDisplay').textContent = data.credits ?? '--';
    $('totalDelivered').textContent = data.total_delivered ?? 0;
    // 邀请统计
    const cnt = data.invite_count || 0;
    $('inviteCount').textContent = cnt;
    $('inviteEarned').textContent = cnt * 10;
  } catch (e) {
    $('creditsDisplay').textContent = '网络错误';
  }
}

// 卡密充值
$('rechargeBtn').addEventListener('click', async () => {
  const code = $('rechargeCode').value.trim();
  if (!code) return addLog('请输入充值码', 'warn');
  const clientId = await getClientId();
  $('rechargeBtn').disabled = true;
  $('rechargeBtn').textContent = '充值中...';
  try {
    const resp = await fetch(API_BASE + '/api/recharge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, code })
    });
    const data = await resp.json();
    if (data.success) {
      addLog(data.message, 'success');
      $('creditsDisplay').textContent = data.credits;
      $('rechargeCode').value = '';
    } else {
      addLog('充值失败: ' + data.error, 'error');
    }
  } catch (e) {
    addLog('网络错误: ' + e.message, 'error');
  }
  $('rechargeBtn').disabled = false;
  $('rechargeBtn').textContent = '充值';
});

// 复制设备 ID
$('copyClientId').addEventListener('click', () => {
  navigator.clipboard.writeText($('clientId').value);
  addLog('已复制设备 ID', 'success');
});

// ===== 邀请好友（链接模式）=====
// 复制邀请链接
$('copyInviteLink').addEventListener('click', async () => {
  const clientId = await getClientId();
  const link = API_BASE + '/r?from=' + clientId;
  navigator.clipboard.writeText(link);
  addLog('已复制邀请链接，发到朋友圈/微信群即可', 'success');
});

// 检测当前 tab URL 是否带 invite 参数（从邀请链接点进来）
async function checkInviteFromUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const url = new URL(tab.url);
    const inviteCode = url.searchParams.get('invite');
    if (!inviteCode) return;

    // 防重复：同个邀请码只处理一次
    const { processedInvite } = await chrome.storage.local.get('processedInvite');
    if (processedInvite === inviteCode) return;

    const clientId = await getClientId();
    const resp = await fetch(API_BASE + '/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, invite_code: inviteCode })
    });
    const data = await resp.json();
    if (data.success) {
      addLog(data.message, 'success');
      $('creditsDisplay').textContent = data.credits;
      // 清除 URL 中的 invite 参数，防止重复触发
      const cleanUrl = url.origin + url.pathname + url.hash;
      chrome.tabs.update(tab.id, { url: cleanUrl });
    } else {
      addLog('邀请处理: ' + data.error, 'info');
    }
    // 标记已处理（无论成败，避免反复请求）
    await chrome.storage.local.set({ processedInvite: inviteCode });
    await refreshCredits();
  } catch (e) {
    console.log('检查邀请链接失败:', e);
  }
}

// ===== 登录 / 注册逻辑 =====
let codeCountdown = 0;

function showLoginMsg(msg, type) {
  const el = $('loginMsg');
  el.textContent = msg;
  el.className = 'login-msg ' + (type || '');
}

// 发送验证码
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) return showLoginMsg('请输入邮箱', 'err');
  $('sendCodeBtn').disabled = true;
  $('sendCodeBtn').textContent = '发送中...';
  try {
    const resp = await fetch(API_BASE + '/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await resp.json();
    if (data.success) {
      // 开发模式：验证码直接返回（未配邮件服务时）
      if (data.dev_code) {
        $('loginCode').value = data.dev_code;
        showLoginMsg('开发模式：验证码 ' + data.dev_code, 'ok');
      } else {
        showLoginMsg('验证码已发送到邮箱', 'ok');
      }
      // 60 秒倒计时
      codeCountdown = 60;
      const timer = setInterval(() => {
        if (codeCountdown <= 0) {
          clearInterval(timer);
          $('sendCodeBtn').disabled = false;
          $('sendCodeBtn').textContent = '发送验证码';
          return;
        }
        $('sendCodeBtn').textContent = codeCountdown + 's';
        codeCountdown--;
      }, 1000);
    } else {
      showLoginMsg(data.error, 'err');
      $('sendCodeBtn').disabled = false;
      $('sendCodeBtn').textContent = '发送验证码';
    }
  } catch (e) {
    showLoginMsg('网络错误: ' + e.message, 'err');
    $('sendCodeBtn').disabled = false;
    $('sendCodeBtn').textContent = '发送验证码';
  }
});

// 登录 / 注册
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const code = $('loginCode').value.trim();
  if (!email) return showLoginMsg('请输入邮箱', 'err');
  if (!code) return showLoginMsg('请输入验证码', 'err');
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = '登录中...';
  try {
    const resp = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await resp.json();
    if (data.success) {
      await chrome.storage.local.set({
        sessionToken: data.token,
        clientId: data.client_id,
        email
      });
      showLoginMsg(data.message, 'ok');
      await showMainPanel(data.client_id);
    } else {
      showLoginMsg(data.error, 'err');
    }
  } catch (e) {
    showLoginMsg('网络错误: ' + e.message, 'err');
  }
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = '登录 / 注册';
});

// 退出登录
$('logoutBtn').addEventListener('click', async () => {
  if (!confirm('确定退出登录？退出后需重新验证邮箱登录')) return;
  await chrome.storage.local.remove(['sessionToken', 'clientId', 'email']);
  $('loginPanel').style.display = 'flex';
  $('mainPanel').style.display = 'none';
  $('loginEmail').value = '';
  $('loginCode').value = '';
  showLoginMsg('', '');
});

// 显示主界面
async function showMainPanel(clientId) {
  $('loginPanel').style.display = 'none';
  $('mainPanel').style.display = 'block';
  $('clientId').value = clientId;
  $('inviteLink').value = API_BASE + '/r?from=' + clientId;
  await refreshCredits();
  await checkInviteFromUrl();
}

// ===== 已投递历史记录管理 =====
let appliedHistory = [];

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

async function loadAndRenderHistory() {
  const data = await chrome.storage.local.get(['appliedHistory']);
  appliedHistory = data.appliedHistory || [];
  renderHistoryList();
}

function renderHistoryList() {
  const listEl = $('historyList');
  if (!listEl) return;
  const searchVal = ($('historySearch').value || '').trim().toLowerCase();
  
  const filtered = appliedHistory.filter(item => {
    if (!searchVal) return true;
    const titleMatch = (item.name || '').toLowerCase().includes(searchVal);
    const companyMatch = (item.company || '').toLowerCase().includes(searchVal);
    return titleMatch || companyMatch;
  });

  $('historyCountText').textContent = '共 ' + appliedHistory.length + ' 条' + (searchVal ? ` (筛选出 ${filtered.length} 条)` : '');

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:#aaa;text-align:center;padding:12px 0;">' + (searchVal ? '未搜索到相关投递历史' : '暂无已投递历史') + '</div>';
    return;
  }

  // 按时间降序
  const sorted = [...filtered].sort((a, b) => (b.applyTime || 0) - (a.applyTime || 0));

  listEl.innerHTML = sorted.map((item, idx) => {
    const metaParts = [];
    if (item.company) metaParts.push(item.company);
    if (item.hrName || item.hrTitle) metaParts.push((item.hrName || '') + (item.hrTitle ? ` (${item.hrTitle})` : ''));
    if (item.salary) metaParts.push(item.salary);

    return `
      <div class="history-item" data-id="${item.id || ''}" data-key="${encodeURIComponent((item.company || '') + '_' + (item.name || ''))}">
        <div class="history-info">
          <div class="history-title" title="${item.name || ''}">${item.name || '未知岗位'}</div>
          <div class="history-meta">${metaParts.join(' · ')}</div>
          <div class="history-time">⏱ ${formatDate(item.applyTime)}</div>
        </div>
        <button class="history-del-btn" title="删除此记录（删除后可重新投递）" data-id="${item.id || ''}" data-index="${idx}">✕</button>
      </div>
    `;
  }).join('');

  // 绑定删除按钮事件
  listEl.querySelectorAll('.history-del-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const itemEl = btn.closest('.history-item');
      const itemKey = decodeURIComponent(itemEl.dataset.key || '');
      
      // 删除此条记录
      appliedHistory = appliedHistory.filter(item => {
        if (id && item.id) return item.id !== id;
        return ((item.company || '') + '_' + (item.name || '')) !== itemKey;
      });

      // 重新生成 appliedCompanies set 保证同步
      const companySet = new Set(appliedHistory.map(item => item.company ? item.company.replace(/[（(].*?[）)]/g, '').replace(/有限(责任)?公司|股份有限(责任)?公司|集团有限公司?|有限公司/g, '').replace(/\s/g, '').toLowerCase() : '').filter(Boolean));
      
      await chrome.storage.local.set({
        appliedHistory,
        appliedCompanies: Array.from(companySet).join(',')
      });

      addLog('已从历史记录中移除该岗位（再次运行将可重新投递）', 'info');
      renderHistoryList();
    });
  });
}

// 搜索筛选事件
$('historySearch').addEventListener('input', () => {
  renderHistoryList();
});

// 清空历史按钮
$('btnClearHistory').addEventListener('click', async () => {
  if (appliedHistory.length === 0) return addLog('历史记录本就为空', 'info');
  if (!confirm('确定要清空全部已投递历史记录吗？\n清空后再次运行海投将不再自动过滤这些历史岗位/公司！')) return;

  appliedHistory = [];
  await chrome.storage.local.set({
    appliedHistory: [],
    appliedCompanies: ''
  });

  addLog('已清空全部投递历史', 'success');
  renderHistoryList();
});

// 监听 storage 变化自动刷新历史与统计
chrome.storage.onChanged.addListener((changes) => {
  if (changes.appliedHistory) {
    appliedHistory = changes.appliedHistory.newValue || [];
    renderHistoryList();
  }
  if (changes.jobTracker) {
    updateDashboard();
  }
});

// 初始化：检查登录状态
loadCfg();
updateDashboard();
loadAndRenderHistory();
(async () => {
  const { sessionToken } = await chrome.storage.local.get('sessionToken');
  if (!sessionToken) {
    $('loginPanel').style.display = 'flex';
    $('mainPanel').style.display = 'none';
    return;
  }
  // 检查 session 是否有效
  try {
    const resp = await fetch(API_BASE + '/api/auth/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken })
    });
    const data = await resp.json();
    if (data.valid) {
      await chrome.storage.local.set({ clientId: data.client_id });
      await showMainPanel(data.client_id);
    } else {
      await chrome.storage.local.remove(['sessionToken', 'clientId']);
      $('loginPanel').style.display = 'flex';
      $('mainPanel').style.display = 'none';
    }
  } catch (e) {
    // 网络错误时尝试用已有 clientId（离线模式）
    const clientId = await getClientId();
    if (clientId) {
      await showMainPanel(clientId);
    } else {
      $('loginPanel').style.display = 'flex';
      $('mainPanel').style.display = 'none';
    }
  }
})();

