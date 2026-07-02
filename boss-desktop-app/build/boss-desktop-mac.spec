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
    exclude_binaries=True,
    name='Boss_helper_bin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Boss_helper',
)

app = BUNDLE(
    coll,
    name='Boss_helper.app',
    icon=None,
    bundle_identifier='com.h1077.bosshelper',
    info_plist={
        'LSBackgroundOnly': 'False',
        'CFBundleDisplayName': 'Boss Helper Dashboard',
    }
)
