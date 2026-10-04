"""Rebuild the three local teaching archives with Python's standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1] / 'project' / 'materials'
for name in ['campus-guide', 'study-stats', 'local-server']:
    folder = root / name
    with ZipFile(root / (name + '.zip'), 'w', ZIP_DEFLATED) as archive:
        for source in sorted(folder.rglob('*')):
            if source.is_file() and '__pycache__' not in source.parts and source.suffix != '.pyc':
                archive.write(source, source.relative_to(root))
    print(f'{name}.zip')
