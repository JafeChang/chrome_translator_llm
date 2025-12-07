const DEFAULT_SETTINGS = {
  providerType: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  targetLanguage: '中文',
  selectionEnabled: true,
};

const CACHE_STORAGE_KEY = 'translationCacheV1';
const CACHE_MAX_ENTRIES = 300;
let translationCache = new Map();
let cacheReady = null;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...result });
    });
  });
}

function serializeCache() {
  return {
    entries: Array.from(translationCache.entries()).map(([key, entry]) => ({
      key,
      value: entry.value,
      updatedAt: entry.updatedAt,
    })),
  };
}

function trimCache() {
  while (translationCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }
}

async function persistCache() {
  const payload = serializeCache();
  await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: payload });
}

async function loadCache() {
  const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
  const payload = stored?.[CACHE_STORAGE_KEY];
  if (payload && Array.isArray(payload.entries)) {
    const sorted = payload.entries
      .filter((entry) => typeof entry?.key === 'string' && typeof entry?.value === 'string')
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    translationCache = new Map(
      sorted.map((entry) => [entry.key, { value: entry.value, updatedAt: entry.updatedAt || Date.now() }])
    );
    const previousSize = translationCache.size;
    trimCache();
    if (translationCache.size !== previousSize) {
      await persistCache();
    }
  }
}

function makeCacheKey(text, targetLanguage, settings) {
  return [
    settings.providerType || 'provider',
    settings.model || 'model',
    settings.baseUrl || 'base',
    targetLanguage,
    text,
  ].join('::');
}

cacheReady = loadCache();

async function getCachedTranslation(key) {
  if (!cacheReady) {
    cacheReady = loadCache();
  }
  await cacheReady;
  if (!translationCache.has(key)) return undefined;
  const entry = translationCache.get(key);
  translationCache.delete(key);
  translationCache.set(key, { ...entry, updatedAt: Date.now() });
  return entry.value;
}

async function setCachedTranslation(key, value) {
  if (!cacheReady) {
    cacheReady = loadCache();
  }
  await cacheReady;
  translationCache.delete(key);
  translationCache.set(key, { value, updatedAt: Date.now() });
  trimCache();
  await persistCache();
}

function resetCacheForTests() {
  translationCache = new Map();
  cacheReady = Promise.resolve();
}

async function callLLM(prompt, targetLanguage, settings) {
  const activeSettings = settings || (await getSettings());
  const url = `${activeSettings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (activeSettings.apiKey) {
    headers['Authorization'] = `Bearer ${activeSettings.apiKey}`;
  }

  const body = {
    model: activeSettings.model,
    temperature: Number(activeSettings.temperature) || 0,
    messages: [
      {
        role: 'system',
        content: `You are a translation assistant. Translate all user content into ${targetLanguage}. Keep code blocks and special formatting intact.`
      },
      { role: 'user', content: prompt }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error('LLM returned an empty response.');
  }
  return message.trim();
}

async function callLLMBatch(texts, targetLanguage, settings) {
  const activeSettings = settings || (await getSettings());
  const url = `${activeSettings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (activeSettings.apiKey) {
    headers['Authorization'] = `Bearer ${activeSettings.apiKey}`;
  }

  const numberedTexts = texts
    .map((text, index) => `(${index + 1}) ${text}`)
    .join('\n');

  const body = {
    model: activeSettings.model,
    temperature: Number(activeSettings.temperature) || 0,
    messages: [
      {
        role: 'system',
        content: `You are a translation assistant. Translate all user content into ${targetLanguage}. Keep code blocks and special formatting intact. Return only valid JSON.`
      },
      {
        role: 'user',
        content: `Translate each of the following texts into ${targetLanguage}. Respond with a JSON array of translated strings in the same order without any additional text.\\n${numberedTexts}`
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error('LLM returned an empty response.');
  }

  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item.trim() : ''));
    }
  } catch (_error) {
    // fallthrough to attempt simple line splitting below
  }

  return message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, texts.length);
}

async function translateWithCache(text, targetLanguage) {
  const settings = await getSettings();
  const lang = targetLanguage || settings.targetLanguage;
  const key = makeCacheKey(text, lang, settings);
  const cached = await getCachedTranslation(key);
  if (typeof cached === 'string') {
    return cached;
  }

  const translation = await callLLM(text, lang, settings);
  await setCachedTranslation(key, translation);
  return translation;
}

async function translateBatchWithCache(texts, targetLanguage) {
  const settings = await getSettings();
  const lang = targetLanguage || settings.targetLanguage;
  const results = new Array(texts.length).fill('');
  const missingTexts = [];
  const missingIndices = [];

  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i];
    const key = makeCacheKey(text, lang, settings);
    // eslint-disable-next-line no-await-in-loop
    const cached = await getCachedTranslation(key);
    if (typeof cached === 'string') {
      results[i] = cached;
    } else {
      missingTexts.push(text);
      missingIndices.push(i);
    }
  }

  if (missingTexts.length > 0) {
    const translations = await callLLMBatch(missingTexts, lang, settings);
    await Promise.all(
      missingIndices.map((originalIndex, position) => {
        const text = texts[originalIndex];
        const translated = translations?.[position] || '';
        results[originalIndex] = translated;
        const key = makeCacheKey(text, lang, settings);
        return setCachedTranslation(key, translated);
      })
    );
  }

  return results;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'translate') {
    translateWithCache(request.text, request.targetLanguage)
      .then((translation) => sendResponse({ translation }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.type === 'translateBatch') {
    translateBatchWithCache(request.texts || [], request.targetLanguage)
      .then((translations) => sendResponse({ translations }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (request.type === 'saveSettings') {
    chrome.storage.sync.set(request.settings, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (request.type === 'getSettings') {
    getSettings().then((settings) => sendResponse({ settings }));
    return true;
  }

  return false;
});

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_SETTINGS,
    makeCacheKey,
    translateWithCache,
    translateBatchWithCache,
    callLLM,
    callLLMBatch,
    getCachedTranslation,
    setCachedTranslation,
    serializeCache,
    loadCache,
    persistCache,
    trimCache,
    getSettings,
    resetCacheForTests,
  };
}
