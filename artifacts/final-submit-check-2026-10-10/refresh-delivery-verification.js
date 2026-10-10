'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const targetRoot = path.resolve(process.argv[2] || path.join(__dirname, 'revised-delivery', '商职星途九秩校庆 Amarantos V3 13969002793'));
const manifestPath = path.join(targetRoot, 'readme', '验收结果.json');
const checkPath = path.join(targetRoot, 'readme', 'check-submission.js');
const logPath = path.join(targetRoot, 'readme', '最终检查日志.txt');

if (!targetRoot.includes(path.join('final-submit-check-2026-10-10', 'revised-delivery')) || targetRoot.includes(path.sep + '压缩包' + path.sep)) {
  throw new Error('只允许刷新独立修订交付副本。');
}

const checkedAtUtc = new Date().toISOString();
const check = spawnSync(process.execPath, [checkPath], { cwd: targetRoot, encoding: 'utf8', windowsHide: true });
if (check.error) throw check.error;
const output = check.stdout + check.stderr;
fs.writeFileSync(logPath, '提交前修订副本独立检查时间（UTC）：' + checkedAtUtc + '\n' + output + '\n实际退出码：' + check.status + '\n', 'utf8');

const matchCount = (label) => {
  const match = output.match(new RegExp(label + '：([0-9]+)'));
  return match ? Number(match[1]) : null;
};
const relativePath = (fullPath) => path.relative(targetRoot, fullPath).replace(/\\/g, '/');
const currentFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.isFile() && fullPath !== manifestPath) currentFiles.push(fullPath);
  }
};
for (const directory of ['ppt', 'video', 'codearts_proof', 'readme']) visit(path.join(targetRoot, directory));
for (const relative of ['README.md', 'project/js/app.js']) currentFiles.push(path.join(targetRoot, relative));
currentFiles.sort((a, b) => relativePath(a).localeCompare(relativePath(b), 'zh-CN'));

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.proof = '网站核心开发由本人亲手使用华为云码道完成；现存IDE、Prompt、回答、代码差异、检查输出及账户用量截图覆盖本次交付补充阶段，详细范围见证据索引';
manifest.sourcePreservation.businessFilesUnchanged = false;
manifest.sourcePreservation.changedOriginalProjectFiles = ['project/README.md', 'project/docs/codex-cloud.md', 'project/js/app.js'];
manifest.sourcePreservation.latestBusinessChange = '手机收藏卡片调整宽度后的外边距来源修正；其他业务HTML/CSS/JS、照片及实践材料保持原样';
manifest.files = currentFiles.map((file) => {
  const bytes = fs.readFileSync(file);
  return { path: relativePath(file), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
manifest.manifestScope = '根README、ppt/video/codearts_proof/readme交付文件及本次修改的project/js/app.js；排除隐藏缓存及验收结果.json自身，避免自引用校验值';
manifest.standaloneSubmissionCheck = {
  checkedAtUtc,
  exitCode: check.status,
  passedItems: matchCount('通过项'),
  warnings: matchCount('警告项'),
  failures: matchCount('失败项'),
  log: 'readme/最终检查日志.txt'
};
manifest.submissionRecheckedAtUtc = checkedAtUtc;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const badPaths = manifest.files.filter((entry) => !fs.existsSync(path.join(targetRoot, entry.path)));
const badHashes = manifest.files.filter((entry) => {
  const fullPath = path.join(targetRoot, entry.path);
  if (!fs.existsSync(fullPath)) return true;
  const bytes = fs.readFileSync(fullPath);
  return bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256;
});
console.log(output.trim());
console.log('清单文件数：' + manifest.files.length + '；不存在路径：' + badPaths.length + '；过期大小/SHA-256：' + badHashes.length + '；不包含清单自身。');
process.exit(check.status || (badPaths.length || badHashes.length ? 1 : 0));
