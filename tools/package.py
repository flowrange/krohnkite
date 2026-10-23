#!/usr/bin/env python3
"""Build a local KWin package without installing or changing the session."""
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
package = json.loads((root / 'package.json').read_text())
revision = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=root, text=True).strip()
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root):
    revision += '-dirty'
metadata = (root / 'res/metadata.json').read_text().replace('$VER', package['version']).replace('$REV', revision)
stage = root / 'pkg'
if stage.exists():
    shutil.rmtree(stage)
files = {
    'res/main.qml': 'contents/ui/main.qml',
    'res/config.ui': 'contents/ui/config.ui',
    'res/popup.qml': 'contents/ui/popup.qml',
    'res/shortcuts.qml': 'contents/ui/shortcuts.qml',
    'res/main.js': 'contents/code/main.js',
    'krohnkite.js': 'contents/code/script.js',
    'res/config.xml': 'contents/config/main.xml',
    'LICENSE': 'LICENSE',
    'README.md': 'README.md',
    'img/zen-mode.png': 'img/zen-mode.png',
}
for source, target in files.items():
    destination = stage / target
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / source, destination)
(stage / 'metadata.json').write_text(metadata)
locales = root / 'translations/locale'
if locales.exists():
    shutil.copytree(locales, stage / 'contents/locale')
output = root / 'builds' / (package['name'] + '.kwinscript')
output.parent.mkdir(exist_ok=True)
# Stable ordering, permissions and timestamps make identical inputs reproducible.
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(stage.rglob('*')):
        if path.is_file():
            entry = zipfile.ZipInfo(path.relative_to(stage).as_posix(), (1980, 1, 1, 0, 0, 0))
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())
print(output.relative_to(root))
