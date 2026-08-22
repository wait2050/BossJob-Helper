// ===== BOSS直聘 关键 DOM 选择器与页面映射 =====

const DEFAULT_SELECTORS = {
  jobs: {
    jobCard: '.job-card-wrapper, .job-card-body, .job-primary',
    jobName: '.job-name, .job-title',
    jobSalary: '.salary, .job-salary',
    jobArea: '.job-area, .job-area-wrapper',
    company: '.company-name, .company-text a, .company-info a',
    hrName: '.boss-name, .name',
    hrTitle: '.boss-title, .title',
    bossOnlineTag: '.boss-online-tag, .boss-active-time, .user-online-tag',
    detailJd: '.job-detail-section, .job-sec-text, .detail-bottom-text',
    detailBtn: '.btn-container .btn-startchat, .job-detail-btn .btn-startchat, a.btn-startchat',
    tagList: '.tag-list li, .job-card-body .tag-list span'
  },
  chat: {
    inputArea: 'div#chat-input, #chat-input, div.chat-input, .chat-input[contenteditable], [contenteditable="true"], textarea.input-area',
    sendBtn: 'button.btn-send, .btn-send, button[class*="send"]',
    messageSent: '.item-myself, .chat-item-self, .message-card-self',
    userList: '.user-list li, .friend-list li',
    userName: '.name, .user-name',
    userCompany: '.company, .company-name'
  }
};

const CITY_MAP = {
  '全国': '100010000', '北京': '101010100', '上海': '101020100', '广州': '101280100',
  '深圳': '101280600', '杭州': '101210100', '成都': '101270100', '南京': '101190100',
  '武汉': '101200100', '西安': '101110100', '厦门': '101230200', '苏州': '101190400',
  '天津': '101030100', '重庆': '101040100', '长沙': '101250100', '郑州': '101180100',
  '青岛': '101120200', '合肥': '101220100', '宁波': '101210400', '东莞': '101281600',
  '佛山': '101280800', '无锡': '101190200', '济南': '101120100', '大连': '101070200',
  '福州': '101230100', '哈尔滨': '101050100', '沈阳': '101070100', '长春': '101060100',
  '昆明': '101290100', '南宁': '101300100', '贵阳': '101260100', '兰州': '101160100',
  '南昌': '101240100', '太原': '101100100', '海口': '101310100', '石家庄': '101090100',
  '呼和浩特': '101080100', '银川': '101170100', '西宁': '101150100', '乌鲁木齐': '101130100'
};

const CONFIG = {
  MAX_COLLECT_PER_CITY: 20,
  PEAK_HOURS: [
    { start: 9, end: 11 },
    { start: 14, end: 17 }
  ],
  COMPANY_CHECK: {
    REJECT_THRESHOLD: 4
  }
};

let activeSelectors = JSON.parse(JSON.stringify(DEFAULT_SELECTORS));

function applyRemoteSelectors(remote) {
  if (!remote) return;
  if (remote.jobs) Object.assign(activeSelectors.jobs, remote.jobs);
  if (remote.chat) Object.assign(activeSelectors.chat, remote.chat);
}

const SELECTORS = new Proxy(activeSelectors, {
  get(target, prop) {
    return target[prop];
  }
});
