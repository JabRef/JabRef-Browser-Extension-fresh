#!/bin/bash

# Usage: ./scripts/notarize_safari.sh <apple_id> <app_specific_password> <team_id>

set -e

APPLE_ID=$1
APP_PASSWORD=$2
TEAM_ID=$3

if [ -z "$APPLE_ID" ] || [ -z "$APP_PASSWORD" ] || [ -z "$TEAM_ID" ]; then
    echo "Usage: $0 <apple_id> <app_specific_password> <team_id>"
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME/macOS/$APP_NAME.app"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    exit 1
fi

echo "Creating archive for notarization..."
ARCHIVE_PATH="$SAFARI_DIR/$APP_NAME.zip"
# Remove old archive if exists
rm -f "$ARCHIVE_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ARCHIVE_PATH"

echo "Submitting for notarization..."
xcrun notarytool submit "$ARCHIVE_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "Re-zipping the notarized app for distribution..."
# The zip we created for notarization might not be exactly what we want to distribute, 
# although it contains the .app. Usually we zip the "JabRef Browser Extension" folder.
cd "$SAFARI_DIR" && zip -r jabref-browser-extension-safari.zip "$APP_NAME"

echo "Done! Notarized app is at $APP_PATH and zip is at $SAFARI_DIR/jabref-browser-extension-safari.zip"
