'use strict';
// Real integration tools only; never embed the supplied credential in artifacts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function loadConfig() {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) throw new Error('请先设置有效的 DEEPSEEK_API_KEY 环境变量；不会读取网页保存的密钥。');
  const context = vm.createContext({ window: { StarPath: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../project/js/ai-config.js'), 'utf8'), context);
  return { ...context.window.StarPath.aiConfig, apiKey };
};
