import os
import re

# content-search.js
fpath = "/Users/songzz_1/cc/boss/boss-tauri/src-tauri/scripts/content-search.js"
with open(fpath, "r") as f: content = f.read()

content = re.sub(r"chrome\.runtime\.sendMessage\(\{ type: 'LOG', text, level \}\);", """if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('content-log', { text: '🔍 [页面] ' + text, level: level || 'info' });
    }""", content)
content = re.sub(r"chrome\.runtime\.onMessage\.addListener[\s\S]*", """// Tauri 桌面版：通过 eval() 调用这些全局函数
window.__bossSearch = {
  scrape: scrape,
  openJD: openJD,
  goChat: goChat
};""", content)

with open(fpath, "w") as f: f.write(content)
print("Updated content-search.js")

# content-chat.js
fpath = "/Users/songzz_1/cc/boss/boss-tauri/src-tauri/scripts/content-chat.js"
with open(fpath, "r") as f: content = f.read()

content = re.sub(r"chrome\.runtime\.onMessage\.addListener[\s\S]*", """// Tauri 桌面版：通过 eval() 调用
window.__bossChat = {
  sendAll: sendAll,
  sendText: sendText,
  sendImage: sendImage,
  findMatchingChatItem: findMatchingChatItem
};""", content)

with open(fpath, "w") as f: f.write(content)
print("Updated content-chat.js")

# background.js
fpath = "/Users/songzz_1/cc/boss/boss-tauri/src-tauri/scripts/background.js"
with open(fpath, "r") as f: content = f.read()

content = re.sub(r"importScripts\('.*?'\);\n?", "", content)

prefix = """// ===== Tauri 桌面版 Background 引擎 =====
// 在 panel-webview 上下文中运行，通过 Tauri IPC 与 boss-webview 交互
const { invoke } = window.__TAURI__.core;
const { emit, listen } = window.__TAURI__.event;

"""

content = prefix + content

content = content.replace("chrome.storage.local", "chromeStorageLocal")

content = re.sub(r"function log\(text, level\) \{[\s\S]*?\}", """function log(text, level) {
  emit('background-to-panel', { type: 'LOG', text, level: level || 'info' });
}""", content, count=1)

content = re.sub(r"chrome\.runtime\.sendMessage", "emit('background-to-panel'", content)
content = content.replace("emit('background-to-panel'(", "emit('background-to-panel', ")

content = re.sub(r"async function ensureTab\(url\) \{[\s\S]*?\}", """async function ensureTab(url) {
  await invoke('navigate_to', { url });
  await sleep(3000); // Wait for page load
  return { id: 'boss-webview' };
}""", content)

content = re.sub(r"async function ensureInjected\(tabId, file\) \{[\s\S]*?\}", """async function ensureInjected(tabId, file) {
  if (file.includes('content-search')) {
    await invoke('inject_content_search');
  } else if (file.includes('content-chat')) {
    await invoke('inject_content_chat');
  }
}""", content)

content = re.sub(r"async function sendToTab\(tabId, msg\) \{[\s\S]*?\}", """async function sendToTab(tabId, msg) {
  // Execute the appropriate function in boss-webview via eval
  let script = '';
  if (msg.type === 'SCRAPE') {
    script = `(async () => { return await window.__bossSearch.scrape(${msg.count || 20}); })()`;
  } else if (msg.type === 'OPEN_JD') {
    script = `(async () => { return await window.__bossSearch.openJD(${JSON.stringify(msg.job)}); })()`;
  } else if (msg.type === 'GO_CHAT') {
    script = `(async () => { return await window.__bossSearch.goChat(${JSON.stringify(msg.job)}, ${JSON.stringify(msg.greeting)}, ${JSON.stringify(msg.cfg)}); })()`;
  } else if (msg.type === 'SEND_ALL') {
    script = `(async () => { return await window.__bossChat.sendAll(${JSON.stringify(msg)}); })()`;
  }
  if (script) {
    await invoke('eval_in_boss', { script });
    // Results come back via events
    return new Promise((resolve) => {
      const unlisten = listen('boss-eval-result', (event) => {
        unlisten.then(fn => fn());
        resolve(event.payload);
      });
      // Timeout fallback
      setTimeout(() => resolve({ success: false, error: 'timeout' }), 15000);
    });
  }
  return { success: false, error: 'unknown message type' };
}""", content)

content = re.sub(r"async function waitTabComplete\(tabId\) \{[\s\S]*?\}", """async function waitTabComplete(tabId) {
  await sleep(2000); // Simple wait since we can't monitor Tauri webview load events easily
}""", content)

content = re.sub(r"async function curUrl\(tabId\) \{[\s\S]*?\}", """async function curUrl(tabId) {
  // We can eval in boss-webview to get current URL
  await invoke('eval_in_boss', { script: `window.__TAURI__.event.emit('boss-eval-result', { url: window.location.href })` });
  return new Promise(resolve => {
    const unlisten = listen('boss-eval-result', (event) => {
      unlisten.then(fn => fn());
      resolve(event.payload.url || '');
    });
    setTimeout(() => resolve(''), 3000);
  });
}""", content)

content = re.sub(r"chrome\.tabs\.create\(\{ url:? (.*?) \}\)", r"invoke('navigate_to', { url: \1 })", content)
content = re.sub(r"chrome\.tabs\.update\(tabId, \{ url:? (.*?) \}\)", r"invoke('navigate_to', { url: \1 })", content)
content = re.sub(r"await chrome\.tabs\.remove\(.*?\);?", "", content)
content = re.sub(r"chrome\.tabs\.remove\(.*?\);?", "", content)

# Bottom events replace
content = re.sub(r"chrome\.runtime\.onMessage\.addListener[\s\S]*", """// Listen for messages from panel
listen('panel-to-background', (event) => {
  const msg = event.payload;
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
""", content)

with open(fpath, "w") as f: f.write(content)
print("Updated background.js")
