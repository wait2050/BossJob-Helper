# macOS Packaging Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve macOS backend packaging final review issues. This includes globally cleaning `DYLD_*` environment variables in `app.py` entry point block on macOS, reverting browser launcher in `app.py` to `webbrowser.open`, creating `build_mac.sh`, updating `README.md`, and running verification.

**Architecture:** Refactor `boss-desktop-app/app.py` to strip `DYLD_*` variables at entry point and invoke standard `webbrowser.open` after a timer delay. Create a shell script to automate cleaning, PyInstaller packaging, and zipping. Add user instruction guidelines in `README.md` for bypassing macOS unsigned app gatekeeping.

**Tech Stack:** Python 3.13, Flask, PyInstaller, Bash/Shell scripting.

## Global Constraints
- Target architecture: macOS Apple Silicon (`arm64`).
- Clean all `DYLD_*` environment variables globally on macOS.
- Build output format: `Boss_helper.app` zipped into `Boss_helper_mac.zip`.

---

### Task 1: Refactor Browser Launcher & Environment Sanitization in app.py

**Files:**
- Modify: `boss-desktop-app/app.py:96-118`

**Interfaces:**
- Produces: Sanitized macOS environment at startup and automated browser launching using standard `webbrowser.open`.

- [ ] **Step 1: Replace startup and browser launcher blocks in app.py**

Modify the main execution block of [app.py](file:///Users/songzz_1/cc/boss/boss-desktop-app/app.py) from line 96 to the end.

Target Content:
```python
if __name__ == '__main__':
    app = create_app()
    
    def launch_browser():
        import subprocess
        # Clean DYLD variables to prevent library loading issues in subprocesses on macOS
        env = os.environ.copy()
        for key in list(env.keys()):
            if key.startswith('DYLD_'):
                del env[key]
        try:
            subprocess.Popen(['open', f'http://127.0.0.1:{PORT}'], env=env)
        except Exception as e:
            # Fallback to standard webbrowser if subprocess fails
            import webbrowser
            webbrowser.open(f'http://127.0.0.1:{PORT}')

    threading.Timer(1.5, launch_browser).start()
    print(f'\n  Boss海投小助手 已启动')
    print(f'  仪表盘: http://localhost:{PORT}')
    print(f'  按 Ctrl+C 退出\n')
    app.run(host=HOST, port=PORT, debug=False)
```

Replacement Content:
```python
if __name__ == '__main__':
    app = create_app()
    
    # Clean DYLD variables globally for macOS to prevent library inheritance issues in subprocesses
    if sys.platform == 'darwin':
        for key in list(os.environ.keys()):
            if key.startswith('DYLD_'):
                del os.environ[key]
    
    threading.Timer(1.5, lambda: webbrowser.open(f'http://localhost:{PORT}')).start()
    print(f'\n  Boss海投小助手 已启动')
    print(f'  仪表盘: http://localhost:{PORT}')
    print(f'  按 Ctrl+C 退出\n')
    app.run(host=HOST, port=PORT, debug=False)
```

- [ ] **Step 2: Run python linter/syntax check on modified file**

Run:
```bash
python3 -m py_compile boss-desktop-app/app.py
```
Expected: Exit code 0 (no syntax errors).

---

### Task 2: Create Automated Build Script build_mac.sh

**Files:**
- Create: `build_mac.sh`

**Interfaces:**
- Produces: Executable shell script [build_mac.sh](file:///Users/songzz_1/cc/boss/build_mac.sh) in the workspace root.

- [ ] **Step 1: Write build_mac.sh**

Create file `build_mac.sh` with the following content:
```bash
#!/bin/bash
# Automated build script for macOS backend (.app bundle)
set -e

echo "Setting up virtual environment..."
if [ ! -d "boss-desktop-app/.venv" ]; then
    python3 -m venv boss-desktop-app/.venv
fi

echo "Installing dependencies..."
boss-desktop-app/.venv/bin/pip install --upgrade pip
boss-desktop-app/.venv/bin/pip install -r boss-desktop-app/requirements.txt
boss-desktop-app/.venv/bin/pip install pyinstaller

echo "Cleaning old build files..."
rm -rf boss-desktop-app/build/boss-desktop-mac boss-desktop-app/dist Boss_helper.app Boss_helper_mac.zip

echo "Running PyInstaller..."
cd boss-desktop-app
.venv/bin/pyinstaller --clean build/boss-desktop-mac.spec
cd ..

echo "Moving build to root..."
cp -R boss-desktop-app/dist/Boss_helper.app ./Boss_helper.app

echo "Archiving to Boss_helper_mac.zip..."
zip -r Boss_helper_mac.zip Boss_helper.app

echo "Build complete! Output: Boss_helper_mac.zip"
```

- [ ] **Step 2: Make the script executable**

Run:
```bash
chmod +x build_mac.sh
```

---

### Task 3: Update README.md with macOS Startup Instructions

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: Updated user documentation explaining how to launch and authorize `Boss_helper.app` on macOS.

- [ ] **Step 1: Modify README.md**

Locate the `### 启动桌面应用` section in [README.md](file:///Users/songzz_1/cc/boss/README.md) and replace it with the new instructions.

Target Content (to replace):
```markdown
### 启动桌面应用

双击 `Boss_helper.exe` 运行，浏览器自动打开 `http://localhost:5001` 仪表盘。
```

Replacement Content:
```markdown
### 启动桌面应用

#### Windows 端
双击 `Boss_helper.exe` 运行，浏览器自动打开 `http://localhost:5001` 仪表盘。

#### macOS 端
1. 解压 `Boss_helper_mac.zip`，将解压后的 `Boss_helper.app` 放入您希望运行的文件夹中。
2. 双击 `Boss_helper.app` 启动后台 Flask 服务。
3. **首次启动提示**：由于没有开发者证书签名，系统会拦截启动。请**右键点击** `Boss_helper.app` 并选择“打开”，在确认框中再次点击“打开”（或者前往“系统设置 -> 隐私与安全”点击“仍要打开”）。此操作仅需在首次启动时执行。
4. 启动后，浏览器会自动打开 `http://localhost:5001` 仪表盘.
```

---

### Task 4: Run Build, Verify, and Commit

**Files:**
- Modify: `boss-desktop-app/app.py`, `README.md`
- Create: `build_mac.sh`, `Boss_helper.app`, `Boss_helper_mac.zip`
- Test: Build verification using execution and curls.

- [ ] **Step 1: Execute build_mac.sh**

Run:
```bash
./build_mac.sh
```
Expected: The build script runs to completion, creating `Boss_helper_mac.zip` and `Boss_helper.app` at the root.

- [ ] **Step 2: Verify build outputs**

Run:
```bash
ls -ld Boss_helper.app Boss_helper_mac.zip
```
Expected: Both targets exist.

- [ ] **Step 3: Verify the application run**

Run:
```bash
open Boss_helper.app
```
Wait 3 seconds, then test API health status.
Run:
```bash
curl -sI http://localhost:5001/api/health
```
Expected: HTTP status 200 OK.

- [ ] **Step 4: Clean up background process**

Run:
```bash
kill $(pgrep -f Boss_helper_bin)
```
Expected: Process killed successfully.

- [ ] **Step 5: Commit changes to Git**

Run:
```bash
git add boss-desktop-app/app.py build_mac.sh README.md
git commit -m "refactor: clean DYLD vars globally on macOS, update browser launcher, add build script, and document macOS startup"
```
Expected: Success message from git.
