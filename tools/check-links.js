'use strict';

// Check local website/document links without network requests or reading AI configuration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'project');
const context = vm.createContext({ window: {} });
for (const name of ['data', 'learning']) vm.runInContext(fs.readFileSync(path.join(project, 'js', name + '.js'), 'utf8'), context);
const data = context.window.StarPath.data;
const routes = new Set(['/', '/history', '/alumni', '/paths', '/growth', '/about',
  ...data.alumni.map(item => '/alumni/' + item.id),
  ...data.routes.map(item => '/paths/' + item.id),
  ...data.practiceProjects.map(item => '/practice/' + item.id)]);
const failures = [];
let checked = 0;
let external = 0;

function files(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(folder, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

function check(file, raw, label) {
  checked += 1;
  const url = raw.trim().replaceAll('&amp;', '&');
  const fail = reason => failures.push(path.relative(root, file).replaceAll('\\', '/') + ' (' + label + '): ' + reason + ' ' + raw);
  if (!url || url === '#') return fail('空链接');
  if (/^https?:/i.test(url)) {
    try { const parsed = new URL(url); if (!parsed.hostname) throw new Error(); external += 1; }
    catch (_) { fail('外部网址格式无效'); }
    return;
  }
  if (/^(?:data:|mailto:|tel:)/i.test(url)) return;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return fail('不支持的链接协议');
  let pathname;
  let fragment;
  try {
    const hashIndex = url.indexOf('#');
    const beforeHash = hashIndex < 0 ? url : url.slice(0, hashIndex);
    fragment = hashIndex < 0 ? '' : decodeURIComponent(url.slice(hashIndex + 1));
    pathname = decodeURIComponent(beforeHash.split('?')[0]);
  } catch (_) { return fail('链接编码无效'); }
  let target = pathname ? path.resolve(path.dirname(file), pathname) : file;
  if (file.startsWith(project + path.sep) && target !== project && !target.startsWith(project + path.sep)) return fail('链接超出网站目录，HTTP 预览无法访问');
  if (!fs.existsSync(target)) return fail('目标文件不存在');
  if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return fail('目标入口文件不存在');
  if (!fragment) return;
  if (target === path.join(project, 'index.html') && fragment.startsWith('/')) {
    if (!routes.has(fragment)) fail('页面路由不存在');
    return;
  }
  if (path.extname(target) === '.html') {
    const html = fs.readFileSync(target, 'utf8');
    const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
    if (!ids.includes(fragment)) fail('页面锚点不存在');
  }
}

for (const file of [...files(project), path.join(root, 'README.md'), path.join(root, 'AGENTS.md')]) {
  const ext = path.extname(file);
  if (!['.html', '.md', '.css', '.svg'].includes(ext)) continue;
  let source = fs.readFileSync(file, 'utf8');
  if (ext === '.md') {
    source = source.replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```[^\n]*(?:\n|$)/gm, '');
    for (const match of source.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+["'][^"']*["'])?\s*\)/g)) check(file, match[1].replace(/^<|>$/g, ''), 'Markdown');
  } else if (ext === '.html' || ext === '.svg') {
    for (const match of source.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']*)["']/g)) check(file, match[1], 'HTML');
  }
  if (ext === '.css' || ext === '.html') {
    for (const match of source.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/g)) check(file, match[2], 'CSS');
  }
}

function dataLinks(value, label = 'data') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && (/^(?:url|sourceUrl|download|preview)$/.test(key) || /^(?:assets|materials)\//.test(item))) check(path.join(project, 'index.html'), item, label + '.' + key);
    else if (item && typeof item === 'object') dataLinks(item, label + '.' + key);
  }
}
dataLinks(data);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('链接检查通过：' + checked + ' 项引用，无空链接、本地缺失文件或无效页面入口。' + external + ' 项外部网址仅校验格式。');
