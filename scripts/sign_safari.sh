#!/bin/bash

# Usage: ./scripts/sign_safari.sh <developer_id_application_identity>

set -e

IDENTITY=$1

if [ -z "$IDENTITY" ]; then
    echo "Usage: $0 <developer_id_application_identity>"
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME/macOS/$APP_NAME.app"

# Clean up previous build to avoid signing issues
rm -rf "$SAFARI_DIR/$APP_NAME"

echo "Building Safari extension..."
make safari

echo "Codesigning Safari extension..."

# Sign the embedded extension first
EXTENSION_PATH=$(find "$APP_PATH" -name "*.appex")
if [ -n "$EXTENSION_PATH" ]; then
    echo "Signing extension: $EXTENSION_PATH"
    codesign --force --options runtime --sign "$IDENTITY" "$EXTENSION_PATH"
fi

# Sign the main app
echo "Signing app: $APP_PATH"
codesign --force --options runtime --sign "$IDENTITY" "$APP_PATH"

echo "Verifying signature..."
codesign --verify --verbose "$APP_PATH"

echo "Done! Signed app is at $APP_PATH"
