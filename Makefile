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
	mkdir -p $(SAFARI_DIR)
	# Safari supports background.page with persistent:false in MV3, which is the default in manifest.json
	xcrun safari-web-extension-converter . --project-location $(SAFARI_DIR) --macos-only --no-open --no-prompt --bundle-identifier org.jabref.JabRef-Browser-Extension --force --copy-resources
	find "$(SAFARI_DIR)/JabRef Browser Extension" -name "dist" -type d -exec rm -rf {} +
	cd $(SAFARI_DIR) && zip -r jabref-browser-extension-safari.zip "JabRef Browser Extension"

clean:
	rm -rf $(DIST)

lint:
	web-ext lint --ignore-files dist/** --ignore-files scripts/** --ignore-files .git/** --ignore-files test.js
