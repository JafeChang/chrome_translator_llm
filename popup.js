const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('apiKey');
const baseUrlEl = document.getElementById('baseUrl');
const modelEl = document.getElementById('model');
const temperatureEl = document.getElementById('temperature');
const defaultTargetLangEl = document.getElementById('defaultTargetLanguage');
const selectionEnabledEl = document.getElementById('selectionEnabled');
const saveBtn = document.getElementById('saveSettings');
const translateBtn = document.getElementById('translate');
const translatePageBtn = document.getElementById('translatePage');
const sourceTextEl = document.getElementById('sourceText');
const targetLangEl = document.getElementById('targetLanguage');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');

const PROVIDER_PRESETS = {
  openai: {
    baseUrl: 'https://api.openai.com',
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn',
  },
  local: {
    baseUrl: 'http://localhost:1234',
  },
};

const DEFAULT_SETTINGS = {
  providerType: 'openai',
  apiKey: '',
  baseUrl: PROVIDER_PRESETS.openai.baseUrl,
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  targetLanguage: '中文',
  selectionEnabled: true,
};

let currentSettings = { ...DEFAULT_SETTINGS };

function getProviderBaseUrl(providerType) {
  return PROVIDER_PRESETS[providerType]?.baseUrl || DEFAULT_SETTINGS.baseUrl;
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    currentSettings = { ...DEFAULT_SETTINGS, ...settings };
    providerEl.value = currentSettings.providerType;
    apiKeyEl.value = currentSettings.apiKey;
    baseUrlEl.value = currentSettings.baseUrl || getProviderBaseUrl(currentSettings.providerType);
    modelEl.value = currentSettings.model;
    temperatureEl.value = currentSettings.temperature;
    defaultTargetLangEl.value = currentSettings.targetLanguage;
    selectionEnabledEl.checked = Boolean(currentSettings.selectionEnabled);

    updateHints(!currentSettings.baseUrl);

    if (!targetLangEl.value) {
      targetLangEl.value = currentSettings.targetLanguage;
    } else {
      targetLangEl.placeholder = currentSettings.targetLanguage;
    }
  });
}

function updateHints(forceFill = false) {
  const presetBase = getProviderBaseUrl(providerEl.value);
  baseUrlEl.placeholder = presetBase;

  if (!baseUrlEl.value || forceFill) {
    baseUrlEl.value = presetBase;
  }
}

function saveSettings() {
  const providerType = providerEl.value;
  const settings = {
    providerType,
    apiKey: apiKeyEl.value.trim(),
    baseUrl: baseUrlEl.value.trim() || getProviderBaseUrl(providerType),
    model: modelEl.value.trim() || DEFAULT_SETTINGS.model,
    temperature: Number(temperatureEl.value) || DEFAULT_SETTINGS.temperature,
    targetLanguage: defaultTargetLangEl.value.trim() || DEFAULT_SETTINGS.targetLanguage,
    selectionEnabled: Boolean(selectionEnabledEl.checked),
  };

  currentSettings = settings;

  chrome.runtime.sendMessage({ type: 'saveSettings', settings }, (res) => {
    statusEl.textContent = res?.ok ? '配置已保存' : '保存失败';
    setTimeout(() => (statusEl.textContent = ''), 1500);
  });
}

function translate() {
  const text = sourceTextEl.value.trim();
  if (!text) {
    statusEl.textContent = '请输入待翻译文本';
    return;
  }

  const targetLanguage = targetLangEl.value.trim() || currentSettings.targetLanguage || '中文';
  statusEl.textContent = '翻译中...';
  translateBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: 'translate', text, targetLanguage },
    (response) => {
      translateBtn.disabled = false;
      if (response?.error) {
        statusEl.textContent = `错误：${response.error}`;
        resultEl.value = '';
      } else {
        statusEl.textContent = '翻译完成';
        resultEl.value = response.translation || '';
      }
    }
  );
}

function translateActivePage() {
  const targetLanguage = targetLangEl.value.trim() || currentSettings.targetLanguage || '中文';
  statusEl.textContent = '正在翻译当前页面...';
  translatePageBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      statusEl.textContent = '无法找到当前标签页';
      translatePageBtn.disabled = false;
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      { type: 'translatePage', targetLanguage },
      (response) => {
        translatePageBtn.disabled = false;

        if (chrome.runtime.lastError) {
          statusEl.textContent = `错误：${chrome.runtime.lastError.message}`;
          return;
        }

        if (response?.error) {
          statusEl.textContent = `错误：${response.error}`;
          return;
        }

        if (response) {
          const { translatedCount, total } = response;
          statusEl.textContent = `页面翻译完成：${translatedCount}/${total} 段文本`; 
        } else {
          statusEl.textContent = '已发送页面翻译指令';
        }
      }
    );
  });
}

providerEl.addEventListener('change', () => updateHints(true));
saveBtn.addEventListener('click', saveSettings);
translateBtn.addEventListener('click', translate);
translatePageBtn.addEventListener('click', translateActivePage);

document.addEventListener('DOMContentLoaded', loadSettings);
