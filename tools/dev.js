'use strict';

// Cross-platform development commands; the website itself needs no runtime.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function python() {
  const candidates = process.env.PYTHON ? [process.env.PYTHON] : process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const command of candidates) {
    const result = spawnSync(command, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], { cwd: root, stdio: 'ignore' });
    if (result.status === 0) return command;
  }
  throw new Error('需要 Python 3.9+；可通过 PYTHON 指定可执行文件路径。');
}

function check() {
  for (const folder of ['project/js', 'tools', 'tests']) {
    for (const file of fs.readdirSync(path.join(root, folder)).filter(file => file.endsWith('.js')).sort()) {
      run(process.execPath, ['--check', path.join(folder, file)]);
    }
  }
  console.log('JavaScript 语法检查通过。');
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check' && args.length === 0) return check();
  if (command === 'test' && args.length === 0) {
    check();
    run(process.execPath, ['--test', '--test-isolation=none', 'tests/content.test.js', 'tests/ai.test.js']);
    run(python(), ['tests/practice.test.py']);
    return;
  }
  if (command === 'browser' && args.length === 0) {
    for (const file of ['browser', 'ai-browser', 'history-title', 'history-motion']) run(process.execPath, ['tests/' + file + '.test.js']);
    return;
  }
  if (command === 'serve') {
    let host = '127.0.0.1';
    let port = '8765';
    for (let i = 0; i < args.length; i += 2) {
      if (!args[i + 1] || !['--host', '--port'].includes(args[i])) throw new Error('预览参数仅支持 --host 地址 --port 端口。');
      if (args[i] === '--host') host = args[i + 1];
      else port = args[i + 1];
    }
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('端口必须为 1–65535。');
    console.log('预览地址：http://' + host + ':' + port + '/（Ctrl+C 停止）');
    run(python(), ['-m', 'http.server', port, '--bind', host, '--directory', 'project']);
    return;
  }
  throw new Error('用法：node tools/dev.js check|test|browser|serve [--host 127.0.0.1] [--port 8765]');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
