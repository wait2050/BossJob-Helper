// 站点配置与内容数据 —— 部署前替换 LANZO_URL / BUY_URL / 备案 / 邮箱

export const SITE = {
  name: "Boss海投助手",
  // 蓝奏云插件下载链接
  LANZO_URL: "https://h2so4.lanzout.com/i4tkH3u7jibe",
  // 爱发卡购买额度链接
  BUY_URL: "https://pay.ldxp.cn/item/8caf0e",
  // 联系邮箱
  EMAIL: "morpheus.s@qq.com",
  // 备案号
  ICP: "",
} as const;

export const NAV_LINKS = [
  { label: "痛点", href: "#pain" },
  { label: "功能", href: "#features" },
  { label: "流程", href: "#process" },
  { label: "定价", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export const PAINS = [
  {
    icon: "Snail",
    color: "pink",
    title: "投递效率低",
    desc: "一个个点开岗位、复制打招呼话术、手动发送，一天投不到几十个，时间全耗在重复操作上。",
  },
  {
    icon: "MessageCircleOff",
    color: "blue",
    title: "回复率惨淡",
    desc: "海投没策略，简历和岗位匹配度低，HR 已读不回，投了上百个却没几个面试机会。",
  },
  {
    icon: "BatteryLow",
    color: "sun",
    title: "海投太累人",
    desc: "长时间盯着屏幕机械式投递，精力被消磨殆尽，真正该花在准备面试上的时间反而没了。",
  },
] as const;

export const FEATURES = [
  {
    no: "01",
    icon: "Zap",
    color: "pink",
    title: "批量自动投递",
    desc: "一键启动，自动遍历推荐岗位并完成打招呼与简历投递，把一天的海投压缩到几分钟，效率直接拉满。",
    points: ["自动翻页滚动投递", "自定义打招呼话术", "投递进度实时可视"],
  },
  {
    no: "02",
    icon: "BrainCircuit",
    color: "blue",
    title: "AI 分析简历匹配",
    desc: "接入 DeepSeek 大模型，AI 实时分析你的简历与岗位 JD 的匹配度，优先投递高匹配岗位，提升回复率。",
    points: ["简历一键解析", "岗位匹配度评分", "智能推荐优先投递"],
  },
  {
    no: "03",
    icon: "Gift",
    color: "sun",
    title: "邀请好友得额度",
    desc: "邀请好友双方各得 10 次免费投递额度，好友越多投得越多，零成本持续白嫖。",
    points: ["双方各得 10 次额度", "邀请次数无上限", "链接点击自动建立关系"],
  },
] as const;

export const STEPS = [
  {
    no: "1",
    icon: "Download",
    title: "下载安装插件",
    desc: "通过蓝奏云下载安装包，按引导装入 Chrome 浏览器，几秒搞定。",
  },
  {
    no: "2",
    icon: "LogIn",
    title: "登录 BOSS 直聘",
    desc: "打开 BOSS 直聘网页版并登录，插件自动识别你的求职身份与简历。",
  },
  {
    no: "3",
    icon: "Rocket",
    title: "一键启动海投",
    desc: "在推荐页点击启动，AI 匹配 + 自动投递同时进行，坐等结果。",
  },
  {
    no: "4",
    icon: "Wallet",
    title: "充值或邀请扩容",
    desc: "免费额度用完？10 元买 100 岗位，或邀请好友继续白嫖。",
  },
] as const;

export const PLANS = [
  {
    name: "免费体验",
    tag: "邀请得额度",
    color: "cream",
    price: "0",
    unit: "元",
    desc: "通过邀请链接注册即可领取，零成本上手体验。",
    features: ["邀请好友双方各 10 次额度", "邀请次数无上限", "AI 简历分析", "基础投递功能"],
    cta: { label: "邀请好友白嫖", href: SITE.LANZO_URL, primary: false },
    highlight: false,
  },
  {
    name: "海投套餐",
    tag: "最受欢迎",
    color: "sun",
    price: "10",
    unit: "元 / 100 岗位",
    desc: "一杯奶茶钱，换 100 次精准投递，性价比拉满。",
    features: [
      "100 次岗位投递额度",
      "AI 匹配优先投递",
      "自定义打招呼话术",
      "投递进度统计",
      "优先客服支持",
    ],
    cta: { label: "立即购买额度", href: SITE.BUY_URL, primary: true },
    highlight: true,
  },
] as const;

export const FAQS = [
  {
    q: "使用这个插件会被 BOSS 直聘封号吗？",
    a: "插件模拟人工操作节奏投递，并内置了间隔与频次控制，正常使用不会触发封号。建议不要长时间不间断狂投，配合合理间隔更安全。",
  },
  {
    q: "插件安全吗？会泄露我的简历和账号吗？",
    a: "插件仅在本地浏览器运行，不收集、不上传你的简历与账号信息。AI 分析通过加密接口调用，不留存个人数据。",
  },
  {
    q: "购买额度后多久到账？怎么使用？",
    a: "在面包多购买后会收到卡密，在插件「额度与充值」面板输入卡密即可秒到账。1 个卡密 = 100 次投递额度，可叠加充值。",
  },
  {
    q: "支持哪些浏览器和系统？",
    a: "基于 Chromium 的浏览器均可使用（Chrome / Edge / 360 极速等），Windows 与 macOS 都支持。需要安装桌面端辅助程序完成自动操作。",
  },
  {
    q: "免费额度用完了怎么办？",
    a: "两种方式：一是邀请好友，双方各得 10 次额度，邀请无上限；二是花 10 元购买 100 岗位套餐，卡密即充即用。",
  },
  {
    q: "可以退款吗？",
    a: "卡密属于虚拟商品，一经充值使用不支持退款。未充值的卡密如有问题可联系客服处理，建议先免费体验满意后再购买。",
  },
  {
    q: "AI 简历分析是怎么工作的？",
    a: "插件接入 DeepSeek 大模型，自动解析你的简历内容与岗位 JD，计算匹配度并优先投递高匹配岗位，帮你把精力花在更可能回复的机会上。",
  },
] as const;
