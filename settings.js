if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

const DEFAULTS = {
  jabrefPort: 23119,
  autoImport: false,
  launchJabRef: true,
  autoImportWatchlist: false,
};
const TOKEN_KEY = 'connectorToken';

const portInput = document.getElementById('settingPort');
const autoImportToggle = document.getElementById('settingAutoImport');
const launchToggle = document.getElementById('settingLaunchJabRef');
const autoImportWlToggle = document.getElementById('settingAutoImportWatchlist');
const disconnectBtn = document.getElementById('disconnectBtn');
const msgEl = document.getElementById('msg');

function showMessage(text, type = 'success') {
  msgEl.textContent = text;
  msgEl.className = `msg visible ${type}`;
  setTimeout(() => { msgEl.className = 'msg'; }, 2000);
}

async function loadSettings() {
  const res = await browser.storage.local.get(DEFAULTS);
  portInput.value = res.jabrefPort;
  autoImportToggle.checked = res.autoImport;
  launchToggle.checked = res.launchJabRef;
  autoImportWlToggle.checked = res.autoImportWatchlist;
}

async function saveSetting(key, value) {
  await browser.storage.local.set({ [key]: value });
  showMessage('Saved.');
}

portInput.addEventListener('change', () => {
  const val = parseInt(portInput.value, 10);
  if (val > 0 && val <= 65535) {
    saveSetting('jabrefPort', val);
  }
});

autoImportToggle.addEventListener('change', () => saveSetting('autoImport', autoImportToggle.checked));
launchToggle.addEventListener('change', () => saveSetting('launchJabRef', launchToggle.checked));
autoImportWlToggle.addEventListener('change', () => saveSetting('autoImportWatchlist', autoImportWlToggle.checked));

disconnectBtn.addEventListener('click', async () => {
  await browser.storage.local.remove(TOKEN_KEY);
  showMessage('Token cleared. You need to pair again.', 'success');
});

loadSettings();
