import os
import re

# sidepanel.html
fpath = "/Users/songzz_1/cc/boss/boss-tauri/sidepanel/sidepanel.html"
with open(fpath, "r") as f: content = f.read()
content = content.replace('href="sidepanel.css"', 'href="./sidepanel.css"')
content = content.replace('src="sidepanel.js"', 'src="./sidepanel.js"')
content = re.sub(r'© \d{4} Boss海投助手', '© 2026 Boss海投助手 · 桌面版', content)
with open(fpath, "w") as f: f.write(content)
print("Updated sidepanel.html")

# sidepanel.js
fpath = "/Users/songzz_1/cc/boss/boss-tauri/sidepanel/sidepanel.js"
with open(fpath, "r") as f: content = f.read()

prefix = """// ===== Tauri 桌面版适配层 =====
const __TAURI__ = window.__TAURI__;
const { invoke } = __TAURI__.core;
const { emit, listen } = __TAURI__.event;

// chrome.storage.local 兼容层
const chromeStorageLocal = {
  async get(keys, callback) {
    const data = await invoke('storage_get', { keys: Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {})) });
    const res = typeof data === 'string' ? JSON.parse(data) : data;
    if (callback) callback(res);
    return res;
  },
  async set(obj, callback) {
    await invoke('storage_set', { data: JSON.stringify(obj) });
    if (callback) callback();
  },
  async remove(keys, callback) {
    await invoke('storage_remove', { keys: Array.isArray(keys) ? keys : [keys] });
    if (callback) callback();
  }
};

// chrome.runtime 兼容层  
const chromeRuntime = {
  sendMessage(msg, callback) {
    emit('panel-to-background', msg);
    // For messages that expect a response, use invoke
    if (callback) {
      invoke('handle_panel_message', { msg: JSON.stringify(msg) })
        .then(resp => callback(typeof resp === 'string' ? JSON.parse(resp) : resp))
        .catch(() => {});
    }
  },
  onMessage: {
    addListener(callback) {
      listen('background-to-panel', (event) => callback(event.payload));
    }
  },
  getManifest() {
    return { version: '1.1.0' };
  }
};

// chrome.storage.onChanged 兼容层
const chromeStorageOnChanged = {
  addListener(callback) {
    listen('storage-changed', (event) => callback(event.payload));
  }
};

// chrome.tabs 兼容层 (limited)
const chromeTabs = {
  async query(queryInfo, callback) {
    if (callback) callback([]);
    return [];
  },
  async update(tabId, props) { /* no-op */ }
};

"""
content = prefix + content
content = content.replace('chrome.storage.local', 'chromeStorageLocal')
content = content.replace('chrome.runtime.sendMessage', 'chromeRuntime.sendMessage')
content = content.replace('chrome.runtime.onMessage.addListener', 'chromeRuntime.onMessage.addListener')
content = content.replace('chrome.runtime.getManifest', 'chromeRuntime.getManifest')
content = content.replace('chrome.storage.onChanged.addListener', 'chromeStorageOnChanged.addListener')
content = content.replace('chrome.tabs.query', 'chromeTabs.query')
content = content.replace('chrome.tabs.update', 'chromeTabs.update')
content = re.sub(r'chrome\.sidePanel\.setPanelBehavior.*?;\n?', '', content, flags=re.DOTALL)
content = re.sub(r'async function checkInviteFromUrl\(\)\s*\{[\s\S]*?\}', 'async function checkInviteFromUrl() {\n  // empty function for Tauri\n}', content)
content = re.sub(r'function checkInviteFromUrl\(\)\s*\{[\s\S]*?\}', 'function checkInviteFromUrl() {\n  // empty function for Tauri\n}', content)
with open(fpath, "w") as f: f.write(content)
print("Updated sidepanel.js")

# selectors.js
fpath = "/Users/songzz_1/cc/boss/boss-tauri/src-tauri/scripts/selectors.js"
with open(fpath, "r") as f: content = f.read()
content = re.sub(r"chromeStorageLocal\.get\(\['remote_selectors'\].*?\}\);", "// Remote selectors will be pushed via Tauri IPC", content, flags=re.DOTALL)
content = re.sub(r"chrome\.storage\.local\.get\(\['remote_selectors'\].*?\}\);", "// Remote selectors will be pushed via Tauri IPC", content, flags=re.DOTALL)
with open(fpath, "w") as f: f.write(content)
print("Updated selectors.js")
