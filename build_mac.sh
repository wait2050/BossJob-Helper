#!/bin/bash
# Automated build script for macOS backend (.app bundle)
set -e

# Enforce running from the script directory
cd "$(dirname "$0")"

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
cp -a boss-desktop-app/dist/Boss_helper.app ./Boss_helper.app

echo "Archiving to Boss_helper_mac.zip..."
zip -ry Boss_helper_mac.zip Boss_helper.app

echo "Build complete! Output: Boss_helper_mac.zip"
