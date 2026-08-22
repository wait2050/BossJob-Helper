# BossJob-Helper 桌面客户端 (Tauri macOS .dmg) 架构与移植指南

## 1. 现有 Chrome 插件 (MV3) 核心作用拆解

当前的 Chrome 扩展程序（`boss-helper1.1.1/boss-extension`）是一个基于 BOSS 直聘（`zhipin.com`）的自动化 AI 投递与沟通系统，主要分为 **4 大核心功能模块**：

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               BossJob-Helper 核心逻辑流                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
       │
       ├── 1. 搜抓与多维筛选 (Scrape & Screen)
       │    ├── 多城市代码解析 (CITY_MAP 自动映射)
       │    ├── 4 维硬性过滤 (排除猎头 / 排除实习 / HR 活跃度 / 公司黑名单)
       │    ├── 历史已投递去重 (岗位 ID Hash + 公司_岗位名 Hash)
       │    └── HR 职级打分排序 (识别 CEO / 创始人 / 法人直招，HRBP/经理排序)
       │
       ├── 2. AI 针对性招呼语生成 (AI Personalization)
       │    ├── 岗位 JD 关键词与职责提取
       │    ├── 结合用户简历调用 DeepSeek AI 大模型 (通过 Worker 代理)
       │    ├── 3 种沟通策略 (Aggressive 自信 / Balanced 客观 / Conservative 克制)
       │    └── 24 小时本地缓存 (避免同岗位重复消耗卡密/Token)
       │
       ├── 3. 自动投递与跨页沟通 (Automated Delivery)
       │    ├── 自动点击“立即沟通”并捕获重定向 /web/geek/chat
       │    ├── 聊天框自动打字输入并点击发送
       │    └── 自动附带简历图片发送
       │
       └── 4. 商业化卡密扣费与风控避险 (Monetization & Risk Defense)
            ├── 投递成功调用 /api/deduct 扣除 1 次卡密额度
            ├── RiskManager 动态退避 (感知验证码/频繁访问，自适应扩展延时 3s~120s)
            └── 智能调度 (避开午休 12-14点 / 周末自动暂停 / 3 岗位休眠 30s)
```

---

## 2. Chrome 插件 ➔ Tauri macOS (DMG) 桌面端映射方案

在 macOS 环境下使用 Tauri v2 开发 DMG 软件，完全无需依靠 Chrome 扩展的 `manifest.json` 或“开发者模式”，通过内嵌 Webview 与 Rust 后端建立更稳定安全的控制链：

| 浏览器插件模块 (MV3) | Tauri macOS 桌面端替代方案 | 技术实现 |
|---|---|---|
| **`sidepanel.html` (控制台 UI)** | **Tauri 主应用窗口 (Window A)** | 使用 React + Tailwind 作为管理控制台窗口。 |
| **`content-search.js` & `content-chat.js` (DOM 操作)** | **Webview 侧脚本注入 (`scripts/inject.js`)** | 在独立的 Webview 窗口 (Window B) 加载 `zhipin.com`，通过 Tauri `eval()` / `execute_script()` 实时注入 DOM 筛选和模拟打字脚本。 |
| **`background.js` Service Worker (流程调度中心)** | **Rust 核心调度器 (`src-tauri/src/lib.rs`) 或 JS Core Agent** | 由桌面端 Rust 主进程控制并发、调度规则、时间间隔与 `RiskManager` 防退避机制，生命周期不再受 Chrome 强制回收限制。 |
| **`chrome.storage.local` (存储)** | **Tauri Store (SQLite / JSON Store)** | 更加安全的持久化存储，加密保存卡密、客户端 ID (clientId)、已投递历史和简历配置。 |
| **`API_BASE` (Cloudflare Worker 通信)** | **Rust `reqwest` HTTP / Fetch Client** | 拦截所有 API 请求，更加安全地与 Cloudflare Worker (`/api/chat`, `/api/deduct`, `/api/config`) 通信，规避 CORS 问题。 |

---

## 3. macOS DMG 编译与商业化优势

1. **免除用户安装门槛**：用户双击 `.dmg` 文件后，直接将 `BossJob-Helper.app` 拖入 `Applications` 应用程序文件夹即可使用，彻底摆脱 Chrome “开启开发者模式/解压加载”的繁琐流程。
2. **源码高强度保护**：Rust 编译成原生机器码，关键鉴权逻辑和 DOM 脚本更加隐蔽，极大提升防破解能力。
3. **独立运行与防休眠**：不会因为 Chrome 标签页被关闭或浏览器后台限制而中断自动化投递流程。
