const DEFAULT_SETTINGS = {
  providerType: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  targetLanguage: '中文',
  selectionEnabled: true,
};

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...result });
    });
  });
}

async function callLLM(prompt, targetLanguage) {
  const settings = await getSettings();
  const url = `${settings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }

  const body = {
    model: settings.model,
    temperature: Number(settings.temperature) || 0,
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

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'translate') {
    callLLM(request.text, request.targetLanguage)
      .then((translation) => sendResponse({ translation }))
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
