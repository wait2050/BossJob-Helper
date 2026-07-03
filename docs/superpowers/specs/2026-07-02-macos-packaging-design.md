# macOS Backend Packaging Design

This document details the design for packaging the `BossJob-Helper` Python/Flask backend into a native, standalone macOS Application Bundle (`Boss_helper.app`) for Apple Silicon (`arm64`) architecture.

## Goal

Provide a double-clickable macOS application that runs the backend Flask server in the background and opens the dashboard at `http://localhost:5001` in the default web browser, matching the experience of the Windows `.exe` version.

---

## User Review Required

> [!WARNING]
> Since the packaged application is compiled locally and not signed with an Apple Developer Certificate, macOS Gatekeeper will block it by default on first launch.
> **Fix**: The user will need to right-click the `.app`, select "Open", and click "Open Anyway" (or go to `System Settings` -> `Privacy & Security` and click `Open Anyway`). This only needs to be done once.

---

## Technical Design

### 1. Build Environment Setup
*   Use python `3.13` (Miniconda) to create a clean virtual environment (`.venv`) under `/Users/songzz_1/cc/boss/boss-desktop-app/.venv`.
*   Install dependencies from `requirements.txt`:
    *   `flask>=3.0`
    *   `flask-sqlalchemy>=3.1`
    *   `flask-cors`
    *   `requests`
    *   `pyjwt`
    *   `cryptography`
    *   `openpyxl`
*   Install `pyinstaller` in the virtual environment.

### 2. PyInstaller Specification Adaptation
The existing `boss-desktop.spec` is designed for Windows executable output and only defines `EXE(...)`. On macOS, to package the application as a standard GUI-like `.app` bundle, a `BUNDLE(...)` section needs to be appended.

We will create a macOS-specific spec file `boss-desktop-mac.spec` inside the `build` directory:
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
        'LSBackgroundOnly': 'False',  # Set to True if we want no dock icon, but False is fine so it has a dock icon when running.
        'CFBundleDisplayName': 'Boss Helper Dashboard',
    }
)
```

### 3. Packaging & Output
*   Run PyInstaller targeting the new macOS spec file:
    ```bash
    pyinstaller --clean build/boss-desktop-mac.spec
    ```
*   Verify output under `boss-desktop-app/dist/Boss_helper.app`.
*   Move/Copy `Boss_helper.app` to the project root directory.
*   Compress the app bundle to `Boss_helper_mac.zip` for easy sharing/archiving.

---

## Verification Plan

### Automated Steps
1.  Verify the virtual environment installation completed without errors.
2.  Verify PyInstaller runs and completes with status `0`.
3.  Check that `dist/Boss_helper.app` exists and has the correct internal layout (including `Contents/MacOS/Boss_helper_bin` and `Contents/Resources/static`).

### Manual Steps
1.  Run `open Boss_helper.app` from the terminal or double-click it in Finder.
2.  Verify the Flask server starts, opens the web browser automatically at `http://localhost:5001`, and the static page displays correctly.
3.  Verify SQLite database gets successfully initialized under `Boss_helper.app/Contents/MacOS/data/boss_desktop.db` (or relative path check).
4.  Test endpoint connectivity from the browser.
