DIST := dist
CHROME_DIR := $(DIST)/chrome
FIREFOX_DIR := $(DIST)/firefox
SAFARI_DIR := $(DIST)/safari
CHROME_ZIP := $(CHROME_DIR)/jabref-browser-extension-chrome.zip
FIREFOX_XPI := $(FIREFOX_DIR)/jabref-browser-extension-firefox.xpi
SAFARI_XCODE := $(SAFARI_DIR)/JabRef\ Browser\ Extension

.PHONY: all chrome firefox safari clean

all: chrome firefox safari

chrome: $(CHROME_ZIP)

$(CHROME_ZIP):
	mkdir -p $(CHROME_DIR)
	# For Chrome, we need to move browser_specific_settings.chrome.background to top-level background
	cp manifest.json $(CHROME_DIR)/manifest.json
	python3 -c "import json; m=json.load(open('$(CHROME_DIR)/manifest.json')); \
		m['background'] = m.get('browser_specific_settings', {}).get('chrome', {}).get('background', m['background']); \
		json.dump(m, open('$(CHROME_DIR)/manifest.json', 'w'), indent=2)"
	zip -r $(CHROME_ZIP) . -x "dist/*" ".git/*" "scripts/*" "sources/vendor/linkedom.js" "manifest.json"
	cd $(CHROME_DIR) && zip -u ../../$(CHROME_ZIP) manifest.json
	rm $(CHROME_DIR)/manifest.json

firefox: $(FIREFOX_XPI)

$(FIREFOX_XPI):
	mkdir -p $(FIREFOX_DIR)
	# web-ext build doesn't easily allow manifest modification in-flight without swapping
	cp manifest.json manifest_backup.json
	# Firefox supports background.page in MV3, but if we want to be safe or specific:
	# (Actually manifest.json default is already good for Firefox MV3)
	web-ext build --artifacts-dir $(FIREFOX_DIR) --ignore-files dist/** --ignore-files scripts/** --ignore-files .git/** --ignore-files sources/vendor/linkedom.js --overwrite-dest
	mv $(FIREFOX_DIR)/jabref_browser_extension-*.zip $(FIREFOX_XPI)
	rm -f manifest_backup.json

safari:
	rm -rf $(SAFARI_DIR)
	mkdir -p $(SAFARI_DIR)
	# Safari supports background.page with persistent:false in MV3, which is the default in manifest.json
	# We use a temporary directory outside the project root to avoid recursion of the 'dist' directory during conversion
	rm -rf /tmp/jabref-safari-src
	mkdir -p /tmp/jabref-safari-src
	cp -R . /tmp/jabref-safari-src || true
	rm -rf /tmp/jabref-safari-src/dist
	xcrun safari-web-extension-converter /tmp/jabref-safari-src --project-location $(SAFARI_DIR) --macos-only --no-open --no-prompt --bundle-identifier org.jabref.JabRef-Browser-Extension --force --copy-resources --app-name "JabRef Browser Extension"
	rm -rf /tmp/jabref-safari-src
	# Build the extension to produce the .app
	xcodebuild -project "$(SAFARI_DIR)/JabRef Browser Extension/JabRef Browser Extension.xcodeproj" \
               -scheme "JabRef Browser Extension" \
               -configuration Release \
               -derivedDataPath "$(SAFARI_DIR)/build" \
               CODE_SIGN_IDENTITY="" \
               CODE_SIGNING_REQUIRED=NO \
               CODE_SIGNING_ALLOWED=NO \
               build
	# Package the .app
	cp -R "$(SAFARI_DIR)/build/Build/Products/Release/JabRef Browser Extension.app" "$(SAFARI_DIR)/"
	cd $(SAFARI_DIR) && zip -r jabref-browser-extension-safari.zip "JabRef Browser Extension.app"

clean:
	rm -rf $(DIST)

lint:
	web-ext lint --ignore-files dist/** --ignore-files scripts/** --ignore-files .git/** --ignore-files test.js
