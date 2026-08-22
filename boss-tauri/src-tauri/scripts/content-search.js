// ===== 搜索页 content script：收集岗位 + 读 JD + 建立联系 =====
(function () {
  if (window.__bossExtSearch) return;
  window.__bossExtSearch = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const extLog = (text, level) => {
    // 直接输出到 boss-webview 的 console(开发时可通过页面 devtools 查看)
    console.log('🔍 [页面] ' + text, level || 'info');
  };

  function getCards() {
    return Array.from(document.querySelectorAll(SELECTORS.jobs.jobCard));
  }

  function parseCard(card) {
    const nameEl = card.querySelector(SELECTORS.jobs.jobName);
    const salEl = card.querySelector(SELECTORS.jobs.jobSalary);
    const areaEl = card.querySelector(SELECTORS.jobs.jobArea);
    const linkEl = card.querySelector('a[href*="/job_detail/"]') || card.querySelector('a[ka][href]') || card.querySelector('a');
    const link = linkEl ? linkEl.href : '';
    const m = link.match(/job_detail\/([^.?]+)\.html/);
    const id = (m && m[1]) || ((nameEl ? nameEl.textContent.trim() : '') + '|' + (salEl ? salEl.textContent.trim() : ''));
    const tags = Array.from(card.querySelectorAll(SELECTORS.jobs.tagList)).map(t => t.textContent.trim()).filter(Boolean);
    let company = '';
    const compEl = card.querySelector(SELECTORS.jobs.company);
    if (compEl) company = compEl.textContent.trim();

    // 活跃时间
    let activeTime = '';
    const onlineTag = card.querySelector(SELECTORS.jobs.bossOnlineTag);
    if (onlineTag && onlineTag.textContent.trim() === '在线') activeTime = '在线';
    else {
      const atEl = card.querySelector(SELECTORS.jobs.bossActiveTime);
      activeTime = atEl ? atEl.textContent.trim() : '';
    }
    // HR 姓名 + 职级
    let hrName = '', hrTitle = '';
    const nameEl2 = card.querySelector('.boss-name, .name, [class*="boss-name"]');
    if (nameEl2) hrName = nameEl2.textContent.trim();
    const titleEl = card.querySelector('.boss-title, .title, [class*="boss-title"]');
    if (titleEl) hrTitle = titleEl.textContent.trim();
    return { id, name: nameEl ? nameEl.textContent.trim() : '未知', salary: salEl ? salEl.textContent.trim() : '', location: areaEl ? areaEl.textContent.trim() : '', tags, company, link, activeTime, hrName, hrTitle };
  }

  async function scrape(count) {
    extLog("开始抓取网页岗位。目标选择器: " + SELECTORS.jobs.jobCard);
    // 等待页面加载出岗位卡片，最多等待 10 秒
    const cardSelector = SELECTORS.jobs.jobCard;
    let cardsLoaded = false;
    for (let i = 0; i < 20; i++) {
      const docCards = document.querySelectorAll(cardSelector);
      if (docCards.length > 0) {
        extLog("已检测到 " + docCards.length + " 个岗位卡片元素，开始解析数据...");
        cardsLoaded = true;
        break;
      }
      if (i % 4 === 0) {
        extLog("正在等待岗位元素在页面上加载出来...");
      }
      await sleep(500);
    }
    
    if (!cardsLoaded) {
      extLog("⚠ 警告：页面上没有找到任何类名为 " + cardSelector + " 的元素！整个页面的 HTML 长度为: " + document.body.innerHTML.length, "warn");
    }

    const seen = {}, jobs = [];
    let stall = 0;
    for (let loop = 0; loop < 40 && jobs.length < count && stall < 4; loop++) {
      const cards = getCards();
      let added = 0;
      extLog("当前循环抓取到 " + cards.length + " 个卡片，开始解析...");
      for (const c of cards) {
        const j = parseCard(c);
        if (!j.id || seen[j.id]) continue;
        seen[j.id] = 1;
        jobs.push(j);
        added++;
        if (jobs.length >= count) break;
      }
      extLog("本轮循环成功添加了 " + added + " 个岗位。当前累计: " + jobs.length + " 个");
      if (added === 0) stall++; else stall = 0;
      if (jobs.length >= count) break;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(1200);
    }
    return jobs.slice(0, count);
  }

  function findCard(job) {
    const cards = getCards();
    for (const c of cards) { const j = parseCard(c); if (job.id && j.id === job.id) return c; }
    for (const c of cards) { const j = parseCard(c); if (j.name === job.name && (!job.company || j.company === job.company)) return c; }
    return null;
  }

  function waitFor(sel, timeout) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { clearInterval(iv); resolve(el); }
        else if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  function waitForText(texts, timeout) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const els = document.querySelectorAll('a, button, span, div');
        for (const el of els) {
          const tx = (el.textContent || '').trim();
          if (texts.indexOf(tx) >= 0 && el.offsetParent !== null) { clearInterval(iv); resolve(el); return; }
        }
        if (Date.now() - t0 > timeout) { clearInterval(iv); resolve(null); }
      }, 200);
    });
  }

  // 提取岗位全称（详情页 h1 / 卡片 .job-name / 页面 title）
  function extractFullName() {
    const h1 = document.querySelector(
      '.job-banner h1, .job-detail .name h1, .job-detail-box .name h1, .info-primary .name h1, .job-title, .name.job-name'
    );
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    const nameEl = document.querySelector(SELECTORS.jobs.jobName);
    if (nameEl && nameEl.textContent.trim()) return nameEl.textContent.trim();
    // BOSS直聘详情页 title: 「岗位名_薪资_X城_公司名 - BOSS直聘招聘」
    const title = document.title || '';
    if (title.includes(' - BOSS直聘')) {
      return title.split(' - BOSS直聘')[0].split('_')[0].trim();
    }
    return '';
  }

  async function openJD(job) {
    const card = findCard(job);
    if (!card) {
      // 尝试直接从详情页提取 JD
      let jd = '';
      const det = document.querySelector(SELECTORS.jobs.jobDetailBox) ||
                  document.querySelector('.job-detail') ||
                  document.querySelector('.detail-content') ||
                  document.querySelector('.job-sec-text');
      if (det) jd = (det.innerText || '').trim();
      if (!jd) {
        const secs = document.querySelectorAll(SELECTORS.jobs.jobDesc) ||
                     document.querySelectorAll('.job-sec-text');
        jd = Array.from(secs).map(s => (s.innerText || '').trim()).filter(Boolean).join('\n');
      }
      const fullName = extractFullName();
      if (jd) return { success: true, jd: jd.slice(0, 2000), fullName };
      return { success: false, error: '未找到岗位卡片，并且无法直接解析详情页内容' };
    }
    card.scrollIntoView({ block: 'center' });
    await sleep(400);
    card.click();
    await sleep(1600);
    let jd = '';
    const det = document.querySelector(SELECTORS.jobs.jobDetailBox);
    if (det) jd = (det.innerText || '').trim();
    if (!jd) {
      const secs = document.querySelectorAll(SELECTORS.jobs.jobDesc);
      jd = Array.from(secs).map(s => (s.innerText || '').trim()).filter(Boolean).join('\n');
    }
    const fullName = extractFullName();
    return { success: true, jd: jd.slice(0, 2000), fullName };
  }

  function clickElement(el) {
    if (!el) return;
    const opt = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', opt));
    el.dispatchEvent(new MouseEvent('mouseup', opt));
    el.click();
  }

  async function findImmediateChatBtn(job) {
    // 1. 如果在独立的岗位详情页，优先全局查找选择器
    if (window.location.href.includes('/job_detail/')) {
      const btn = document.querySelector(SELECTORS.jobs.immediateChatBtn) || 
                  document.querySelector('a.op-btn-chat, .op-btn-chat, [class*="btn-chat"]');
      if (btn && btn.offsetParent !== null) return btn;
    }

    // 2. 在详情弹窗中寻找
    const det = document.querySelector(SELECTORS.jobs.jobDetailBox);
    if (det) {
      const btn = det.querySelector(SELECTORS.jobs.immediateChatBtn) || 
                  det.querySelector('a.op-btn-chat, .op-btn-chat, [class*="btn-chat"]');
      if (btn && btn.offsetParent !== null) return btn;
    }

    // 3. 在列表卡片中寻找
    const card = findCard(job);
    if (card) {
      const btn = card.querySelector(SELECTORS.jobs.immediateChatBtn) || 
                  card.querySelector('a.op-btn-chat, .op-btn-chat, [class*="btn-chat"]');
      if (btn && btn.offsetParent !== null) return btn;
    }

    // 4. 文字匹配查找（作为强力兜底）
    const all = document.querySelectorAll('a, button, span, div');
    // 优先匹配被包含在详情区域或卡片中的文字按钮
    for (const el of all) {
      const tx = (el.textContent || '').trim();
      if ((tx === '立即沟通' || tx === '继续沟通') && el.offsetParent !== null && el.children.length === 0) {
        if (det && det.contains(el)) return el;
        if (card && card.contains(el)) return el;
      }
    }
    // 全局任意可见的“立即沟通”文字叶子节点
    for (const el of all) {
      const tx = (el.textContent || '').trim();
      if ((tx === '立即沟通' || tx === '继续沟通') && el.offsetParent !== null && el.children.length === 0) {
        return el;
      }
    }

    return null;
  }

  async function goChat(job, greeting, cfg) {
    let btn = await findImmediateChatBtn(job);
    if (!btn) {
      const t0 = Date.now();
      while (Date.now() - t0 < 5000) {
        btn = await findImmediateChatBtn(job);
        if (btn) break;
        await sleep(250);
      }
    }
    if (!btn) {
      const card = findCard(job);
      if (card) {
        clickElement(card);
        await sleep(1500);
        const t0 = Date.now();
        while (Date.now() - t0 < 4000) {
          btn = await findImmediateChatBtn(job);
          if (btn) break;
          await sleep(250);
        }
      }
    }
    if (!btn) return { success: false, error: '未找到立即沟通按钮' };

    // 提取链接作为兜底跳转方案
    let chatUrl = '';
    let href = btn.getAttribute('href');
    if (href && (href.includes('chat') || href.includes('geek'))) {
      if (href.startsWith('/')) {
        chatUrl = window.location.origin + href;
      } else if (href.startsWith('http')) {
        chatUrl = href;
      }
    }

    clickElement(btn);
    await sleep(1500);
    // 点击 "继续沟通"（跳转聊天页）
    const go = await waitForText(['继续沟通'], 4000);
    if (go) { clickElement(go); return { success: true, navigated: true, chatUrl }; }
    return { success: true, navigated: false, chatUrl };
  }

  // Tauri 桌面版：通过 eval() 调用这些全局函数
  window.__bossSearch = {
    scrape: scrape,
    openJD: openJD,
    goChat: goChat
  };
})();