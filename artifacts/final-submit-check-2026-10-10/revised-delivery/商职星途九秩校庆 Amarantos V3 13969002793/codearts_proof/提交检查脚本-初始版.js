#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.join(ROOT, 'project');

const SKIP_DIRS = new Set([
  '.codeartsdoer', '.git', '.vscode', '.idea', 'node_modules',
  '.DS_Store', '__pycache__', '.pytest_cache', '.codex-tools', '.cache'
]);

const REQUIRED_DIRS = ['ppt', 'project', 'video', 'codearts_proof', 'readme'];
const WEBSITE_SCRIPTS = ['data.js', 'learning.js', 'storage.js', 'ai-config.js', 'ai.js', 'app.js'];

const failures = [];
const warnings = [];
const passed = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { passed.push(msg); }

function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (_) { return false; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

function listFiles(dir) {
  const result = [];
  function walk(d) {
    if (!isDir(d)) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

function isExternal(ref) {
  return /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|ftp:|file:|#)/i.test(ref);
}

function localPath(ref) {
  if (isExternal(ref)) return null;
  let p = ref.trim();
  const hashIdx = p.indexOf('#');
  if (hashIdx === 0) return null;
  if (hashIdx > 0) p = p.slice(0, hashIdx);
  const searchIdx = p.indexOf('?');
  if (searchIdx > 0) p = p.slice(0, searchIdx);
  if (!p) return null;
  return p;
}

function checkRequiredDirs() {
  console.log('【1/5】检查必要目录');
  let allOk = true;
  for (const dir of REQUIRED_DIRS) {
    const p = path.join(ROOT, dir);
    if (!exists(p)) { fail('  缺失必要目录：' + dir); allOk = false; }
    else if (!isDir(p)) { fail('  路径不是目录：' + dir); allOk = false; }
    else { ok('  目录存在：' + dir); }
  }
  if (allOk) console.log('  -> 通过');
  console.log('');
}

function checkScriptSyntax() {
  console.log('【2/5】检查网站脚本语法（node --check，不读取文件内容）');
  const jsDir = path.join(PROJECT, 'js');
  if (!isDir(jsDir)) { fail('  缺失 project/js 目录'); console.log(''); return; }
  let allOk = true;
  for (const name of WEBSITE_SCRIPTS) {
    const p = path.join(jsDir, name);
    if (!isFile(p)) { fail('  缺失网站脚本：project/js/' + name); allOk = false; continue; }
    try {
      execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
      ok('  语法正确：project/js/' + name);
    } catch (_) {
      fail('  语法错误：project/js/' + name + '（node --check 未通过）');
      allOk = false;
    }
  }
  if (allOk) console.log('  -> 通过');
  console.log('');
}

function checkLocalAssets() {
  console.log('【3/5】检查本地资源引用');
  let count = 0;
  const indexHtml = path.join(PROJECT, 'index.html');
  const content = readText(indexHtml);
  if (content === null) { fail('  缺失 project/index.html'); console.log(''); return; }

  const refs = new Set();
  const attrRe = /(?:href|src)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = attrRe.exec(content)) !== null) {
    const lp = localPath(m[1]);
    if (lp) refs.add(lp);
  }
  for (const ref of refs) {
    const p = path.resolve(PROJECT, ref);
    if (!exists(p)) { fail('  index.html 引用的本地资源缺失：' + ref); count++; }
  }

  const cssDir = path.join(PROJECT, 'css');
  if (isDir(cssDir)) {
    for (const name of fs.readdirSync(cssDir)) {
      if (!name.endsWith('.css')) continue;
      const cssPath = path.join(cssDir, name);
      const cssContent = readText(cssPath);
      if (cssContent === null) continue;
      const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
      let um;
      while ((um = urlRe.exec(cssContent)) !== null) {
        const lp = localPath(um[1]);
        if (!lp) continue;
        const p = path.resolve(cssDir, lp);
        if (!exists(p)) { fail('  css/' + name + ' 引用的本地资源缺失：' + lp); count++; }
      }
    }
  }

  if (count === 0) { ok('  本地资源引用全部存在'); console.log('  -> 通过'); }
  else console.log('  -> 发现 ' + count + ' 处缺失');
  console.log('');
}

function findMarkdownFiles(dir, results) {
  if (!isDir(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findMarkdownFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
}

function checkMarkdownLinks() {
  console.log('【4/5】检查 Markdown 本地文件链接');
  const mdFiles = [];
  findMarkdownFiles(PROJECT, mdFiles);
  findMarkdownFiles(path.join(ROOT, 'readme'), mdFiles);

  let total = 0;
  let broken = 0;
  for (const mdPath of mdFiles) {
    const content = readText(mdPath);
    if (content === null) continue;
    const dir = path.dirname(mdPath);
    const linkRe = /!?\[([^\]]*)\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      const link = m[2].trim();
      const lp = localPath(link);
      if (!lp) continue;
      total++;
      const target = path.resolve(dir, lp);
      if (!exists(target)) {
        fail('  ' + rel(mdPath) + ' 本地链接缺失：' + lp);
        broken++;
      }
    }
  }
  if (broken === 0) { ok('  检查 ' + mdFiles.length + ' 个 Markdown 文件，' + total + ' 个本地链接全部有效'); console.log('  -> 通过'); }
  else console.log('  -> 检查 ' + mdFiles.length + ' 个文件，' + broken + '/' + total + ' 个链接缺失');
  console.log('');
}

function checkDeliverables() {
  console.log('【5/5】检查参赛交付材料（PDF/MP4 等真实缺失报告）');
  let issue = false;

  const pptDir = path.join(ROOT, 'ppt');
  if (isDir(pptDir)) {
    const files = listFiles(pptDir);
    const names = files.map(f => path.basename(f));
    const hasPdf = names.some(n => /\.pdf$/i.test(n));
    const hasPptx = names.some(n => /\.pptx$/i.test(n));
    if (!hasPdf && !hasPptx) {
      fail('  ppt/ 缺少演示文稿（.pdf 或 .pptx）。当前内容：' + (names.length ? names.join(', ') : '空目录'));
      issue = true;
    } else {
      ok('  ppt/ 已包含演示文稿');
    }
  }

  const videoDir = path.join(ROOT, 'video');
  if (isDir(videoDir)) {
    const files = listFiles(videoDir);
    const names = files.map(f => path.basename(f));
    const hasMp4 = names.some(n => /\.mp4$/i.test(n));
    if (!hasMp4) {
      fail('  video/ 缺少演示视频（.mp4）。当前内容：' + (names.length ? names.join(', ') : '空目录'));
      issue = true;
    } else {
      ok('  video/ 已包含演示视频');
    }
  }

  const proofDir = path.join(ROOT, 'codearts_proof');
  if (isDir(proofDir)) {
    const files = listFiles(proofDir);
    if (!files.length) { fail('  codearts_proof/ 为空，缺少 AI 编程证明材料'); issue = true; }
    else { ok('  codearts_proof/ 已包含 ' + files.length + ' 个证明材料'); }
  }

  if (!issue) console.log('  -> 通过');
  console.log('');
}

function main() {
  console.log('========================================');
  console.log(' 商职星途 V3 参赛交付材料检查');
  console.log('========================================');
  console.log('根目录：' + ROOT);
  console.log('说明：仅使用 Node 内置模块，不发起网络请求，不读取 AI 配置内容，跳过 IDE 缓存目录');
  console.log('');

  checkRequiredDirs();
  checkScriptSyntax();
  checkLocalAssets();
  checkMarkdownLinks();
  checkDeliverables();

  console.log('----------------------------------------');
  console.log('检查汇总');
  console.log('----------------------------------------');
  console.log('通过项：' + passed.length);
  console.log('警告项：' + warnings.length);
  console.log('失败项：' + failures.length);
  if (warnings.length) {
    console.log('');
    console.log('警告详情：');
    warnings.forEach(w => console.log(w));
  }
  if (failures.length) {
    console.log('');
    console.log('失败详情：');
    failures.forEach(f => console.log(f));
  }
  console.log('');
  const success = failures.length === 0;
  console.log(success ? '结果：全部通过 ✓（退出码 0）' : '结果：存在缺失项，请补全交付材料（退出码 1）');
  process.exit(success ? 0 : 1);
}

main();