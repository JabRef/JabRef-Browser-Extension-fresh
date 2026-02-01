#!/bin/bash

# Local signing script for Safari extension
# Usage: ./scripts/sign_safari_local.sh "Developer ID Application: Your Name (ID)"

set -e

IDENTITY="$1"
if [ -z "$IDENTITY" ]; then
    echo "Usage: $0 \"Developer ID Application: Your Name (ID)\""
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME.app"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH. Run 'make safari' first."
    exit 1
fi

echo "Cleaning up unnecessary files..."
find "$APP_PATH" -name ".DS_Store" -delete || true
find "$APP_PATH" -name "__pycache__" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "build" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "sign_safari.sh" -delete || true
find "$APP_PATH" -name "notarize_safari.sh" -delete || true
find "$APP_PATH" -name "import_and_patch_translators.py" -delete || true
find "$APP_PATH" -name "*.entitlements" -delete || true
find "$APP_PATH" -name "test_cache" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "test-results" -type d -exec rm -rf {} + || true
find "$APP_PATH" -name "test.js" -delete || true
find "$APP_PATH" -name "test.log" -delete || true
find "$APP_PATH" -name "eslint.config.mjs" -delete || true
find "$APP_PATH" -name "rollup.config.js" -delete || true
find "$APP_PATH" -name "package.json" -delete || true
find "$APP_PATH" -name "package-lock.json" -delete || true
find "$APP_PATH" -name "example_bib_page.html" -delete || true
find "$APP_PATH" -name "sample.bib" -delete || true
find "$APP_PATH" -name "*.md" -delete || true

echo "Signing all native binaries..."
find "$APP_PATH" -type f \( -name "*.dylib" -o -name "*.node" -o -name "*.so" \) -exec codesign --force --options runtime --sign "$IDENTITY" --timestamp --verbose=4 {} \;

EXTENSION_PATH=$(find "$APP_PATH" -name "*.appex")
if [ -n "$EXTENSION_PATH" ]; then
    echo "Signing extension bundle: $EXTENSION_PATH"
    EXTENSION_EXE=$(find "$EXTENSION_PATH" -path "*/Contents/MacOS/*" -type f)
    if [ -n "$EXTENSION_EXE" ]; then
        echo "Signing extension executable: $EXTENSION_EXE"
        codesign --force --options runtime --entitlements "scripts/JabRef Browser Extension Extension.entitlements" --sign "$IDENTITY" --timestamp --verbose=4 "$EXTENSION_EXE"
    fi
    codesign --force --options runtime --entitlements "scripts/JabRef Browser Extension Extension.entitlements" --sign "$IDENTITY" --timestamp --verbose=4 "$EXTENSION_PATH"
fi

echo "Signing main app executable..."
MAIN_EXE="$APP_PATH/Contents/MacOS/$APP_NAME"
if [ -f "$MAIN_EXE" ]; then
    codesign --force --options runtime --entitlements "scripts/JabRef Browser Extension.entitlements" --sign "$IDENTITY" --timestamp --verbose=4 "$MAIN_EXE"
fi

echo "Signing app: $APP_PATH"
codesign --force --options runtime --entitlements "scripts/JabRef Browser Extension.entitlements" --sign "$IDENTITY" --timestamp --verbose=4 "$APP_PATH"

echo "Verifying signature..."
if ! codesign -vvv --deep --strict "$APP_PATH"; then
    echo "Deep verification failed. Trying strict verification without --deep..."
    codesign -vvv --strict "$APP_PATH"
fi

echo "Done! Signed app is at $APP_PATH"
