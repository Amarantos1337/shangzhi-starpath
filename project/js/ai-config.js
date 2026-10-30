(function () {
  'use strict';
  window.StarPath.aiConfig = Object.freeze({
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    searchEndpoint: 'https://api.deepseek.com/v1/tools/search',
    fetchEndpoint: 'https://api.deepseek.com/v1/tools/fetch',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
    timeoutMs: 300000
  });
  // Credentials are separate from plans and their JSON backups.
  const storageKey = 'starpath.deepseek-api-key';
  let memoryKey = '';
  let memoryOnly = false;
  function validate(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 512 || /\s/.test(value.trim())) {
      throw new Error('请输入有效的 API Key（不含空格，最多512个字符）。');
    }
    return value.trim();
  }
  function get() {
    if (!memoryOnly) {
      try { memoryKey = localStorage.getItem(storageKey) || ''; }
      catch (_) { memoryOnly = true; }
    }
    return memoryKey;
  }
  function save(value) {
    const key = validate(value);
    try { localStorage.setItem(storageKey, key); memoryOnly = false; }
    catch (_) { memoryOnly = true; }
    memoryKey = key;
  }
  function clear() {
    try { localStorage.removeItem(storageKey); memoryOnly = false; }
    catch (_) {
      memoryKey = '';
      memoryOnly = true;
      throw new Error('浏览器暂时无法清除已保存的 API Key，请允许存储访问后重试，或在浏览器设置中清除此网站的数据。');
    }
    memoryKey = '';
  }
  function status() {
    const configured = Boolean(get());
    return { configured, memoryOnly };
  }
  window.StarPath.aiCredentials = Object.freeze({ get, save, clear, status });
})();
