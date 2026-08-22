// ===== 默认选择器字典 (本地兜底) =====
const DEFAULT_SELECTORS = {
  jobs: {
    jobCard: 'li.job-card-box, .job-card-box, [class*="job-card"]',
    jobName: '.job-name',
    jobSalary: '.salary, .job-salary',
    tagList: '.tag-list li, .job-tag, [class*="tag"]',
    company: 'a[href*="/gongsi/"], .boss-info, .company-text .name a, .company-text .name, .company-text, .company-name a, .company-name, [class*="company-name"]',
    immediateChatBtn: 'a.op-btn-chat, .op-btn-chat',
    jobDetailBox: '.job-detail-box, [class*="job-detail"], .detail-content',
    jobDesc: '.job-sec-text, [class*="job-sec"], [class*="job-desc"]',
    bossActiveTime: '.boss-active-time',
    bossOnlineTag: '.boss-online-tag',
    headhuntingIcon: '.job-tag-icon',
    nextPage: '.options-pages .next:not(.disabled), .pagination .next:not(.disabled)',
    jobArea: '.job-area, .job-location'
  },
  chat: {
    userList: '.user-list-content li, .user-item, [class*="user-list"] li',
    userName: '.geek-name, .name-text, [class*="name"]',
    userCompany: '.title-box .name-box, [class*="company"]',
    chatInput: '#chat-input, div.chat-input, [contenteditable="true"]',
    btnSend: 'button.btn-send, .btn-send',
    imageUpload: '.btn-sendimg input[type=file], .toolbar input[type=file]',
    messageSent: '.item-myself, .message-self',
    toolbarBtns: '.toolbar-btn',
    resumeBtn: '.toolbar-btn', // 通过 textContent === "发简历" 筛选
    greetingModal: '.default-btn.cancel-btn'  // textContent === "留在此页"
  }
};

// 动态代理选择器，优先使用云端推送的 remote_selectors
let activeSelectors = JSON.parse(JSON.stringify(DEFAULT_SELECTORS));

function applyRemoteSelectors(remote) {
  if (!remote || typeof remote !== 'object') return;
  if (remote.jobs) Object.assign(activeSelectors.jobs, remote.jobs);
  if (remote.chat) Object.assign(activeSelectors.chat, remote.chat);
}

// Remote selectors pushed via Tauri IPC if available

const SELECTORS = new Proxy(activeSelectors, {
  get(target, prop) {
    return target[prop];
  }
});

const CITY_MAP = {
  '北京': '101010100', '上海': '101020100', '广州': '101280100', '深圳': '101280600',
  '杭州': '101210100', '成都': '101270100', '南京': '101190100', '武汉': '101200100',
  '西安': '101110100', '重庆': '101040100', '长沙': '101250100', '苏州': '101190400',
  '天津': '101030100', '郑州': '101180100', '合肥': '101220100', '济南': '101120100',
  '青岛': '101120200', '厦门': '101230200', '福州': '101230100', '大连': '101070200',
  '沈阳': '101070100', '昆明': '101290100', '贵阳': '101260100', '南宁': '101300100',
  '东莞': '101281600', '佛山': '101280800', '宁波': '101210400', '无锡': '101190200',
  '全国': '100010000'
};

const CONFIG = {
  BASIC_INTERVAL: 1000,
  OPERATION_INTERVAL: 1200,
  MAX_SCAN_PAGES: 5,
  PAGE_SCAN_DELAY: 8000,
  DAILY_APPLY_LIMIT: 100,
  HR_INACTIVE_DAYS: 14,
  COMPANY_CHECK: { REJECT_THRESHOLD: 6 },
  PEAK_HOURS: [
    { start: 9, end: 11, label: '上午 9:00-11:00' },
    { start: 14, end: 17, label: '下午 14:00-17:00' }
  ]
};

// ===== 布局自适应:BOSS 页面多处 -inner 元素固定宽度 1136px,超过 webview 1020px 导致右侧溢出被裁剪 =====
// 诊断数据:body offsetW=1003 scrollW=1136, .inner/.expect-search-inner/.filter-condition-inner/.recommend-result-inner 均为 1136px
// 注入 CSS 强制这些容器自适应宽度
(function injectLayoutFix() {
  const css = `
    #wrap, .page-jobs, .page-jobs-main {
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    html, body {
      min-width: 0 !important;
      overflow-x: hidden !important;
    }
    /* BOSS 直聘所有 -inner 固定宽度容器(诊断显示均为 1136px) */
    .inner, .home-inner,
    .expect-search-inner,
    .filter-condition-inner, .c-filter-condition,
    .recommend-result-inner, .recommend-result-job {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'tauri-layout-fix';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // BOSS 是 SPA,路由切换后可能重新渲染,用 MutationObserver 持续确保 style 存在
  const ensure = () => {
    if (!document.getElementById('tauri-layout-fix')) {
      (document.head || document.documentElement).appendChild(style);
    }
  };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: false });
  }
})();
