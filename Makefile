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
	zip -r $(CHROME_ZIP) . -x "dist/*" ".git/*" "scripts/*" "background_safari.js" "sources/vendor/linkedom.js"

firefox: $(FIREFOX_XPI)

$(FIREFOX_XPI):
	web-ext build --artifacts-dir $(FIREFOX_DIR)  --ignore-files dist/** --ignore-files scripts/** --ignore-files .git/** --ignore-files background_safari.js --ignore-files sources/vendor/linkedom.js
	mv $(FIREFOX_DIR)/jabref-browser-extension-*.zip $(FIREFOX_XPI)

safari:
	mkdir -p $(SAFARI_DIR)
	cp manifest.json manifest_backup.json
	cp manifest_safari.json manifest.json
	xcrun safari-web-extension-converter . --project-location $(SAFARI_DIR) --macos-only --no-open --no-prompt --bundle-identifier org.jabref.browser-extension --force --copy-resources
	mv manifest_backup.json manifest.json
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "dist" -type d -exec rm -rf {} +
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "background.js" -delete
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "manifest_safari.json" -delete
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "manifest_backup.json" -delete
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "offscreen.js" -delete
	find $(SAFARI_DIR)/JabRef\ Browser\ Extension -name "offscreen.html" -delete
	cd $(SAFARI_DIR) && zip -r jabref-browser-extension-safari.zip JabRef\ Browser\ Extension

clean:
	rm -rf $(DIST)

lint:
	web-ext lint --ignore-files dist/** --ignore-files scripts/** --ignore-files .git/** --ignore-files test.js
