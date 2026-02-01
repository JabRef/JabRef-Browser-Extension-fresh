#!/bin/bash

# Local notarization script for Safari extension
# Usage: ./scripts/notarize_safari_local.sh "notarytool-profile-name"

set -e

PROFILE="$1"
if [ -z "$PROFILE" ]; then
    echo "Usage: $0 \"notarytool-profile-name\""
    echo "To create a profile: xcrun notarytool store-credentials \"profile-name\" --apple-id \"your@apple.id\" --team-id \"TEAMID\" --password \"app-specific-password\""
    exit 1
fi

SAFARI_DIR="dist/safari"
APP_NAME="JabRef Browser Extension"
APP_PATH="$SAFARI_DIR/$APP_NAME.app"
ARCHIVE_PATH="$SAFARI_DIR/$APP_NAME.zip"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH. Run 'make safari' and signing script first."
    exit 1
fi

echo "Verifying signature before zipping..."
if ! codesign -vvv --deep --strict "$APP_PATH"; then
    echo "Deep verification failed, trying strict verification without --deep..."
    if ! codesign -vvv --strict "$APP_PATH"; then
        echo "Verification failed even without --deep."
        exit 1
    fi
fi

echo "Zipping app for notarization..."
rm -f "$ARCHIVE_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ARCHIVE_PATH"

echo "Submitting for notarization..."
xcrun notarytool submit "$ARCHIVE_PATH" --keychain-profile "$PROFILE" --wait

echo "Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "Re-zipping the notarized app for distribution..."
FINAL_ZIP="$SAFARI_DIR/jabref-browser-extension-safari.zip"
rm -f "$FINAL_ZIP"
ditto -c -k --keepParent "$APP_PATH" "$FINAL_ZIP"

echo "Done! Notarized and stapled app is at $APP_PATH"
echo "Distribution zip is at $FINAL_ZIP"
