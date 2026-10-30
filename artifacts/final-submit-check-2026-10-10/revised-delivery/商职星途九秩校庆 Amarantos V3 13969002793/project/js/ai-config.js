(function () {
  'use strict';
  window.StarPath.aiConfig = Object.freeze({
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    model: 'deepseek-flash',
    reasoningEffort: 'high',
    apiKey: '',
    timeoutMs: 300000
  });
})();
