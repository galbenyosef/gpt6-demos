#!/usr/bin/env python3
"""Exercise the packaged executable from an unrelated working directory."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]

class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='notavirus-process-')
        self.root = Path(self.temp.name)
        self.binary = self.root / 'notavirus-gnome'
        shutil.copy2(ROOT / 'target/release/notavirus-gnome', self.binary)
        shutil.copytree(ROOT / 'resources/packs', self.root / 'packs')
        self.env = dict(os.environ, XDG_RUNTIME_DIR=str(self.root), XDG_DATA_HOME=str(self.root / 'data'))

    def tearDown(self):
        self.temp.cleanup()

    def command(self, args=(), data=None):
        return subprocess.run([str(self.binary), *args], input=data, text=True, capture_output=True, cwd='/tmp', env=self.env, timeout=15)

    def test_eof_and_protocol_errors_clean_session(self):
        hello = {'type': 'hello', 'seq': 1, 'version': 1, 'pack': 'removed', 'size': 1, 'paused': False}
        result = self.command(data=json.dumps(hello) + '\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['id'], 'default')
        self.assertEqual(list((self.root / 'notavirus').iterdir()), [])
        for data in ['x' * 65537, '{}', '{invalid}\n']:
            result = self.command(data=data)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list((self.root / 'notavirus').iterdir()), [])

    def archive(self, name='imported'):
        archive = self.root / f'{name}.petpack'
        with zipfile.ZipFile(archive, 'w') as z:
            pack = ROOT / 'resources/packs/paco'
            z.writestr('pack.toml', (pack / 'pack.toml').read_text().replace('id = "paco"', f'id = "{name}"'))
            z.write(pack / 'atlas.png', 'atlas.png')
        return archive

    def test_import_install_duplicate_rollback_and_lock(self):
        archive = self.archive()
        result = self.command(['import', str(archive)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['id'], 'imported')
        root = self.root / 'data/notavirus/packs'
        before = (root / 'imported/atlas.png').read_bytes()
        self.assertNotEqual(self.command(['import', str(archive)]).returncode, 0)
        self.assertEqual(before, (root / 'imported/atlas.png').read_bytes())
        with open(root / '.import.lock', 'r+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.command(['import', str(self.archive('concurrent'))])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Another import', result.stderr)
        self.assertFalse((root / 'concurrent').exists())
        bad = self.root / 'bad.petpack'
        bad.write_bytes(b'broken zip')
        self.assertNotEqual(self.command(['import', str(bad)]).returncode, 0)
        self.assertFalse(list(root.glob('.import-*')))

    def test_missing_runtime_is_actionable(self):
        self.env.pop('XDG_RUNTIME_DIR')
        result = self.command(data='')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('XDG_RUNTIME_DIR', result.stderr)

if __name__ == '__main__':
    unittest.main()
