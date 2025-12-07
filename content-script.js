const FLOATING_CLASS = 'llm-immersive-btn';
const PANEL_CLASS = 'llm-immersive-panel';
const TRANSLATED_FONT_CLASS = 'llm-page-translation';

const DEFAULT_SETTINGS = {
  targetLanguage: '中文',
  selectionEnabled: true,
};

let cachedSettings = { ...DEFAULT_SETTINGS };
let buttonEl;
let panelEl;
let hideTimer;
const translatedNodes = new WeakSet();

function applyStyles() {
  if (document.getElementById('llm-immersive-style')) return;
  const style = document.createElement('style');
  style.id = 'llm-immersive-style';
  style.textContent = `
    .${FLOATING_CLASS} {
      position: absolute;
      padding: 6px 10px;
      font-size: 13px;
      border-radius: 999px;
      border: 1px solid #cbd5e1;
      background: #0b5ea6;
      color: #fff;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(0,0,0,0.12);
      z-index: 2147483646;
      transition: transform 0.1s ease, opacity 0.1s ease;
    }
    .${FLOATING_CLASS}:hover { background: #0a4b85; }
    .${PANEL_CLASS} {
      position: absolute;
      max-width: 420px;
      min-width: 240px;
      background: #0f172a;
      color: #f8fafc;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 12px 32px rgba(0,0,0,0.22);
      z-index: 2147483646;
      border: 1px solid rgba(255,255,255,0.08);
      opacity: 0.98;
      white-space: pre-wrap;
    }
    .${PANEL_CLASS} .llm-immersive-status { color: #cbd5e1; font-size: 13px; }
    .${PANEL_CLASS} .llm-immersive-error { color: #fca5a5; font-size: 13px; }
  `;
  document.head.appendChild(style);
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      cachedSettings = { ...DEFAULT_SETTINGS, ...settings };
      resolve(cachedSettings);
    });
  });
}

function ensureButton() {
  if (buttonEl) return buttonEl;
  buttonEl = document.createElement('button');
  buttonEl.textContent = '翻译选中';
  buttonEl.className = FLOATING_CLASS;
  buttonEl.style.display = 'none';
  document.body.appendChild(buttonEl);
  buttonEl.addEventListener('click', translateSelection);
  return buttonEl;
}

function ensurePanel() {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.className = PANEL_CLASS;
  panelEl.style.display = 'none';
  document.body.appendChild(panelEl);
  return panelEl;
}

function getSelectionRect() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (range.collapsed) return null;
  const rect = range.getBoundingClientRect();
  return rect && rect.width + rect.height > 0 ? rect : null;
}

function positionElement(el, rect, offsetY = 0) {
  const top = window.scrollY + rect.top + offsetY;
  const left = window.scrollX + rect.left + rect.width / 2;
  el.style.top = `${Math.max(top, 6)}px`;
  el.style.left = `${Math.max(left - el.offsetWidth / 2, 6)}px`;
}

function showButton() {
  if (!cachedSettings.selectionEnabled) return;
  const rect = getSelectionRect();
  const text = (window.getSelection()?.toString() || '').trim();
  if (!rect || !text) {
    hideUI();
    return;
  }
  applyStyles();
  const btn = ensureButton();
  btn.style.display = 'block';
  btn.style.opacity = '1';
  btn.style.transform = 'translateY(0)';
  positionElement(btn, rect, -32);
}

function hideUI(delay = 200) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (buttonEl) buttonEl.style.display = 'none';
    if (panelEl) panelEl.style.display = 'none';
  }, delay);
}

function updatePanel(content) {
  applyStyles();
  const panel = ensurePanel();
  panel.innerHTML = content;
  const rect = getSelectionRect();
  if (rect) {
    panel.style.display = 'block';
    positionElement(panel, rect, rect.height + 12);
  }
}

function translateSelection() {
  const selection = window.getSelection();
  const text = (selection?.toString() || '').trim();
  if (!text) return;
  updatePanel('<span class="llm-immersive-status">翻译中…</span>');

  chrome.runtime.sendMessage(
    { type: 'translate', text, targetLanguage: cachedSettings.targetLanguage },
    (response) => {
      if (response?.error) {
        updatePanel(`<span class="llm-immersive-error">${response.error}</span>`);
      } else {
        const translated = response?.translation || '';
        updatePanel(translated ? translated : '<span class="llm-immersive-error">未获得翻译结果</span>');
      }
      hideUI(5000);
    }
  );
}

function sendTranslationRequest(text, targetLanguage) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'translate', text, targetLanguage },
      (response) => {
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response?.translation || '');
      }
    );
  });
}

function shouldTranslateTextNode(node) {
  if (translatedNodes.has(node)) return false;
  if (!node?.parentElement) return false;
  const text = (node.textContent || '').trim();
  if (!text) return false;
  const parent = node.parentElement;
  if (
    parent.closest('script,style,noscript,textarea,code,pre,select,option,input')
  ) {
    return false;
  }
  if (parent.classList.contains(TRANSLATED_FONT_CLASS)) return false;
  return true;
}

function appendTranslationFont(node, translatedText, targetLanguage) {
  const fontEl = document.createElement('font');
  fontEl.className = TRANSLATED_FONT_CLASS;
  fontEl.setAttribute('lang', targetLanguage);
  fontEl.textContent = translatedText;
  node.parentNode.insertBefore(fontEl, node.nextSibling);
}

async function translateFullPage(targetLanguage) {
  const lang = targetLanguage || cachedSettings.targetLanguage;
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (shouldTranslateTextNode(current)) {
      textNodes.push(current);
    }
  }

  let translatedCount = 0;
  for (const node of textNodes) {
    try {
      const translation = await sendTranslationRequest(
        node.textContent.trim(),
        lang
      );
      if (!translation) continue;
      appendTranslationFont(node, translation, lang);
      translatedNodes.add(node);
      translatedCount += 1;
    } catch (error) {
      console.error('Translate node failed', error);
    }
  }

  return { translatedCount, total: textNodes.length };
}

function handleSelection() {
  showButton();
}

function init() {
  applyStyles();
  loadSettings();
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('keyup', handleSelection);
  document.addEventListener('scroll', hideUI, { passive: true });
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === 'translatePage') {
      translateFullPage(request.targetLanguage)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ error: error.message }));
      return true;
    }
    return undefined;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.targetLanguage) {
      cachedSettings.targetLanguage = changes.targetLanguage.newValue ?? cachedSettings.targetLanguage;
    }
    if (changes.selectionEnabled) {
      cachedSettings.selectionEnabled = changes.selectionEnabled.newValue ?? cachedSettings.selectionEnabled;
    }
  });
}

init();
