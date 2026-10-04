'use strict';

const path = require('node:path');
let playwrightPath;
try {
  playwrightPath = require.resolve('playwright', { paths: [path.resolve(__dirname, '../.codex-tools')] });
} catch (_) {
  try { playwrightPath = require.resolve('playwright'); }
  catch (_) { throw new Error('请先安装 Playwright：云端运行 bash tools/codex-setup.sh --browser，或按 docs/codex-cloud.md 配置。'); }
}

const { chromium } = require(playwrightPath);
function browserOptions(extra = {}) {
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium');
  return { headless: true, ...(channel === 'chromium' ? {} : { channel }), ...extra };
}

module.exports = { chromium, browserOptions };
