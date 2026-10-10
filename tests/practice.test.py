"""Run with python tests/practice.test.py. Uses only the standard library."""
import contextlib
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1] / 'project' / 'materials'
ENV = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
TEST_TMP = (ROOT.parents[1] / 'artifacts' / 'content-depth' / 'test-temp').resolve()


@contextlib.contextmanager
def fixture():
    TEST_TMP.mkdir(parents=True, exist_ok=True)
    folder = Path(tempfile.mkdtemp(dir=TEST_TMP)).resolve()
    assert folder.is_relative_to(TEST_TMP) and folder != TEST_TMP
    try:
        yield folder
    finally:
        assert folder.resolve().is_relative_to(TEST_TMP) and folder != TEST_TMP
        shutil.rmtree(folder)


def run(script):
    return subprocess.run([sys.executable, str(script)], capture_output=True, text=True, encoding='utf-8', env=ENV, check=False)


@contextlib.contextmanager
def serve(folder):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(folder)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f'http://127.0.0.1:{port}'
    try:
        for _ in range(40):
            try:
                with OPENER.open(url, timeout=0.3) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.05)
        else:
            raise AssertionError('Local server did not start')
        yield url
    finally:
        process.terminate()
        process.wait(timeout=5)


class PracticeTests(unittest.TestCase):
    def test_reference_statistics_and_changed_input(self):
        source = ROOT / 'study-stats' / 'reference'
        result = run(source / 'stats.py')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), (source / 'expected.txt').read_text(encoding='utf-8').strip())
        with fixture() as temp:
            folder = Path(temp)
            shutil.copy(source / 'stats.py', folder)
            original = (source / 'study.csv').read_text(encoding='utf-8')
            (folder / 'study.csv').write_text(original.replace('Python,30', 'Python,40', 1), encoding='utf-8')
            self.assertIn('总时长：295', run(folder / 'stats.py').stdout)
            self.assertIn('Python：115', run(folder / 'stats.py').stdout)
            (folder / 'study.csv').write_text(original.replace('Python,30', 'Python,no', 1), encoding='utf-8')
            invalid = run(folder / 'stats.py')
            self.assertEqual(invalid.returncode, 1)
            self.assertIn('第 2 行', invalid.stdout)

    def test_starter_completed_using_the_taught_loop(self):
        folder = ROOT / 'study-stats' / 'starter'
        code = (folder / 'stats.py').read_text(encoding='utf-8').replace('totals = {}', '''totals = {}
for row in rows:
    minutes = int(row["minutes"])
    subject = row["subject"]
    total += minutes
    totals[subject] = totals.get(subject, 0) + minutes''')
        with fixture() as temp:
            dest = Path(temp)
            (dest / 'stats.py').write_text(code, encoding='utf-8')
            shutil.copy(folder / 'study.csv', dest)
            self.assertEqual(run(dest / 'stats.py').stdout.strip(), (ROOT / 'study-stats/reference/expected.txt').read_text(encoding='utf-8').strip())

    def test_http_exercise_success_missing_fix_and_stop(self):
        for version in ['starter', 'reference']:
            with serve(ROOT / 'local-server' / version / 'site') as url:
                with OPENER.open(url) as response:
                    self.assertEqual(response.status, 200)
                    html = response.read().decode('utf-8')
                self.assertIn('href="about.html"', html)
                for path in ['/missing.html', '/info.html']:
                    with self.assertRaises(urllib.error.HTTPError) as caught:
                        OPENER.open(url + path)
                    self.assertEqual(caught.exception.code, 404)
                    caught.exception.close()
                with OPENER.open(url + '/about.html') as response:
                    self.assertEqual(response.status, 200)
            with self.assertRaises(urllib.error.URLError):
                OPENER.open(url + '/after-stop.html?check=1', timeout=1)

    def test_archives_match_local_sources_and_have_no_cache_files(self):
        for name in ['campus-guide', 'study-stats', 'local-server']:
            with ZipFile(ROOT / (name + '.zip')) as archive:
                self.assertIsNone(archive.testzip())
                for member in archive.namelist():
                    self.assertNotIn('__pycache__', member)
                    self.assertEqual(archive.read(member), (ROOT / member).read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
