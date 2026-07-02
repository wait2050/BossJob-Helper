# macOS Backend Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Python Flask backend of `BossJob-Helper` into a native standalone macOS application bundle (`Boss_helper.app`) and create a distributable `.zip` archive.

**Architecture:** Create a clean virtual environment, install requirements, write a macOS-specific PyInstaller `.spec` configuration file incorporating a `BUNDLE` builder, run PyInstaller, and zip the resulting `.app` bundle.

**Tech Stack:** Python 3.13, PyInstaller, Flask, SQLite.

## Global Constraints
- Target architecture: macOS Apple Silicon (`arm64`).
- Output files must be saved under the appropriate paths.
- No placeholders or generic execution commands.

---

### Task 1: Environment and Dependency Setup

**Files:**
- Create: `boss-desktop-app/.venv` (directory via virtualenv setup)
- Test: Virtualenv python binary checks.

**Interfaces:**
- Produces: A functional python virtual environment with flask and pyinstaller installed.

- [ ] **Step 1: Create the python virtual environment**

Run:
```bash
python3 -m venv boss-desktop-app/.venv
```

- [ ] **Step 2: Verify the virtual environment python version**

Run:
```bash
boss-desktop-app/.venv/bin/python --version
```
Expected: Output showing Python 3.13.x version.

- [ ] **Step 3: Install Flask dependencies and PyInstaller**

Run:
```bash
boss-desktop-app/.venv/bin/pip install --upgrade pip
boss-desktop-app/.venv/bin/pip install -r boss-desktop-app/requirements.txt
boss-desktop-app/.venv/bin/pip install pyinstaller
```

- [ ] **Step 4: Verify installed dependencies**

Run:
```bash
boss-desktop-app/.venv/bin/pip show flask pyinstaller pyjwt cryptography
```
Expected: Details of the installed packages (no installation errors).

- [ ] **Step 5: Commit task state**

Run:
```bash
git status
```
(No source files committed yet, but environment is verified).

---

### Task 2: Create macOS PyInstaller Spec File

**Files:**
- Create: `boss-desktop-app/build/boss-desktop-mac.spec`

**Interfaces:**
- Consumes: `boss-desktop-app/app.py`, `boss-desktop-app/static/` directory content.
- Produces: `boss-desktop-mac.spec` configuration file for PyInstaller.

- [ ] **Step 1: Write the mac spec file**

Create and write the file `boss-desktop-app/build/boss-desktop-mac.spec` with this content:
```python
# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['../app.py'],
    pathex=['..'],
    binaries=[],
    datas=[
        ('../static', 'static'),
    ],
    hiddenimports=['flask_sqlalchemy', 'sqlalchemy.sql.default_comparator', 'jinja2.ext'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Boss_helper_bin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

app = BUNDLE(
    exe,
    name='Boss_helper.app',
    icon=None,
    bundle_identifier='com.h1077.bosshelper',
    info_plist={
        'LSBackgroundOnly': 'False',
        'CFBundleDisplayName': 'Boss Helper Dashboard',
    }
)
```

- [ ] **Step 2: Verify spec file path and existence**

Run:
```bash
ls -l boss-desktop-app/build/boss-desktop-mac.spec
```
Expected: File details listed successfully.

- [ ] **Step 3: Commit the new spec file**

Run:
```bash
git add boss-desktop-app/build/boss-desktop-mac.spec
git commit -m "feat: add macOS-specific PyInstaller spec file"
```

---

### Task 3: Build macOS Application Bundle

**Files:**
- Modify: None.
- Create: `boss-desktop-app/dist/Boss_helper.app` (via PyInstaller build).

**Interfaces:**
- Consumes: `boss-desktop-app/build/boss-desktop-mac.spec`.
- Produces: Independent macOS application package directory `dist/Boss_helper.app`.

- [ ] **Step 1: Clean build cache and execute PyInstaller**

Run:
```bash
cd boss-desktop-app && .venv/bin/pyinstaller --clean build/boss-desktop-mac.spec
```

- [ ] **Step 2: Verify built application directory structure**

Run:
```bash
ls -ld dist/Boss_helper.app
ls -l dist/Boss_helper.app/Contents/MacOS/Boss_helper_bin
ls -ld dist/Boss_helper.app/Contents/Resources/static
```
Expected: All three check paths exist and display in list command output.

- [ ] **Step 3: Commit changes**

Run:
```bash
git status
```
(No modifications to tracked code; build files are git-ignored or in temporary folders).

---

### Task 4: Move, Archive and Verify Execution

**Files:**
- Create: `/Users/songzz_1/cc/boss/Boss_helper.app` (copied)
- Create: `/Users/songzz_1/cc/boss/Boss_helper_mac.zip` (compressed archive)

**Interfaces:**
- Consumes: `boss-desktop-app/dist/Boss_helper.app`.
- Produces: Running Flask application and `Boss_helper_mac.zip`.

- [ ] **Step 1: Copy application to root workspace**

Run:
```bash
cp -R boss-desktop-app/dist/Boss_helper.app ./Boss_helper.app
```

- [ ] **Step 2: Create a ZIP file for distribution**

Run:
```bash
zip -r Boss_helper_mac.zip Boss_helper.app
```

- [ ] **Step 3: Verify the ZIP file exists**

Run:
```bash
ls -lh Boss_helper_mac.zip
```
Expected: File details shown, size should be roughly 15MB - 35MB.

- [ ] **Step 4: Verify program execution manually**

Run:
```bash
open Boss_helper.app
```
Wait 3 seconds, then test API health status.
Run:
```bash
curl -I http://localhost:5001/api/health
```
Expected: HTTP/1.1 200 OK.
Also check that default browser has opened to dashboard.

- [ ] **Step 5: Clean up temporary background process**

Run:
```bash
kill $(pgrep -f Boss_helper_bin)
```
Expected: Process killed.
