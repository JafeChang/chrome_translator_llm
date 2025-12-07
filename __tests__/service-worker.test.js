const assert = require('node:assert');
const test = require('node:test');

const baseSettings = {
  providerType: 'openai',
  apiKey: 'token',
  baseUrl: 'https://api.example.com',
  model: 'gpt-4',
  temperature: 0.5,
  targetLanguage: '中文',
};

function createChromeMock(settings = {}) {
  let localStore = {};
  return {
    storage: {
      sync: {
        get: (defaults, cb) => cb({ ...defaults, ...settings }),
        set: (_data, cb) => {
          if (typeof cb === 'function') cb();
        },
      },
      local: {
        get: async () => localStore,
        set: async (payload) => {
          localStore = { ...localStore, ...payload };
        },
      },
    },
    runtime: {
      onMessage: {
        addListener: () => {},
      },
    },
  };
}

function loadServiceWorker(settings = {}) {
  global.chrome = createChromeMock(settings);
  delete require.cache[require.resolve('../service-worker')];
  return require('../service-worker');
}

test('makeCacheKey uses provider, model, base URL, target language, and text', async (t) => {
  const service = loadServiceWorker(baseSettings);
  await service.resetCacheForTests();

  const key = service.makeCacheKey('hello', 'French', baseSettings);
  assert.strictEqual(
    key,
    `${baseSettings.providerType}::${baseSettings.model}::${baseSettings.baseUrl}::French::hello`
  );
});

test('translateBatchWithCache returns cached results and persists new translations', async (t) => {
  const settings = { ...baseSettings, targetLanguage: 'French', temperature: 0.1 };
  const service = loadServiceWorker(settings);
  await service.resetCacheForTests();

  const cachedKey = service.makeCacheKey('hello', 'French', settings);
  await service.setCachedTranslation(cachedKey, 'Bonjour');

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const responses = ['monde', 'encore'];
  global.fetch = async (url, options) => {
    const expectedUrl = `${settings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    assert.strictEqual(url, expectedUrl);

    const payload = JSON.parse(options.body);
    assert.strictEqual(payload.messages[1].content.includes('(1) world'), true);
    assert.strictEqual(payload.messages[1].content.includes('(2) again'), true);

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(responses),
            },
          },
        ],
      }),
    };
  };

  const result = await service.translateBatchWithCache(['hello', 'world', 'again'], 'French');
  assert.deepStrictEqual(result, ['Bonjour', ...responses]);

  const cachedWorld = await service.getCachedTranslation(service.makeCacheKey('world', 'French', settings));
  assert.strictEqual(cachedWorld, 'monde');
});

test('callLLMBatch trims parsed JSON array responses', async (t) => {
  const settings = { ...baseSettings, baseUrl: 'https://example.com/' };
  const service = loadServiceWorker(settings);
  await service.resetCacheForTests();

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options) => {
    const expectedUrl = `${settings.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    assert.strictEqual(url, expectedUrl);

    const body = JSON.parse(options.body);
    assert.strictEqual(body.messages[1].content.includes('one'), true);
    assert.strictEqual(body.messages[1].content.includes('two'), true);

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([' foo ', 'bar ']),
            },
          },
        ],
      }),
    };
  };

  const translations = await service.callLLMBatch(['one', 'two'], 'German', settings);
  assert.deepStrictEqual(translations, ['foo', 'bar']);
});
