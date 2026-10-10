from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

base = Path(__file__).resolve().parent
name = '商职星途九秩校庆 Amarantos V3 13969002793'
source = base / 'revised-delivery' / name
archive = base / (name + '.zip')
unpacked = base / 'unpacked-check'
if archive.exists() or unpacked.exists():
    raise SystemExit('Final output already exists; refusing to overwrite.')
required = ['ppt', 'project', 'video', 'codearts_proof', 'readme']
files = [source / 'README.md']
for folder in required:
    directory = source / folder
    if not directory.is_dir():
        raise SystemExit('Required folder missing: ' + folder)
    files.extend(p for p in directory.rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(source).parts))
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for file in sorted(files):
        package.write(file, file.relative_to(source).as_posix())
with zipfile.ZipFile(archive) as package:
    corrupt = package.testzip()
    if corrupt:
        raise SystemExit('Corrupt entry: ' + corrupt)
    package.extractall(unpacked)
matches = all(hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256((unpacked / p.relative_to(source)).read_bytes()).digest() for p in files)
check = subprocess.run(['node', str(unpacked / 'readme' / 'check-submission.js')], cwd=unpacked, capture_output=True, text=True, encoding='utf-8')
report = {
    'archive': str(archive),
    'bytes': archive.stat().st_size,
    'mib': round(archive.stat().st_size / 1024 / 1024, 2),
    'fileCount': len(files),
    'requiredFolders': required,
    'crcPassed': True,
    'extractedHashesMatch': matches,
    'standaloneCheckExitCode': check.returncode,
    'standaloneCheckOutput': check.stdout + check.stderr,
    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'hiddenCachesIncluded': False
}
(base / 'package-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'standaloneCheckOutput'}, ensure_ascii=False, indent=2))
print(check.stdout)
raise SystemExit(0 if matches and check.returncode == 0 else 1)
