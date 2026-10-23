#!/usr/bin/env python3
"""Run real KWin scenarios in a private D-Bus session and XDG directories."""
import json
import os
from pathlib import Path
import shutil
import shlex
import signal
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
for executable in ('dbus-run-session', 'kwin_wayland', 'plasmashell'):
    if not shutil.which(executable):
        sys.exit('Missing integration-test dependency: ' + executable)
# Fail explicitly if the desktop Python bindings are unavailable.
subprocess.run([sys.executable, '-c', 'import dbus; from gi.repository import GLib; from PyQt6.QtWidgets import QApplication'], check=True)
for scenario in (sys.argv[1:] or ('splits', 'focus', 'toggle', 'zen', 'zen-flameshot')):
    with tempfile.TemporaryDirectory(prefix='krohnkite-test-') as directory:
        work = Path(directory)
        env = os.environ.copy()
        for key in ('DBUS_SESSION_BUS_ADDRESS', 'DBUS_SESSION_BUS_PID', 'WAYLAND_DISPLAY', 'DISPLAY', 'SESSION_MANAGER'):
            env.pop(key, None)
        # Never share configuration, caches, sockets or user services with the
        # running desktop. Only system-installed runtime libraries are reused.
        for variable, name in (('HOME', 'home'), ('XDG_CONFIG_HOME', 'config'),
                               ('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'),
                               ('XDG_RUNTIME_DIR', 'runtime'), ('XDG_STATE_HOME', 'state')):
            (work / name).mkdir(mode=0o700)
            env[variable] = str(work / name)
        env.update(XDG_DATA_DIRS='/usr/local/share:/usr/share', XDG_CONFIG_DIRS='/etc/xdg',
                   QT_FORCE_STDERR_LOGGING='1', QT_QPA_PLATFORM='wayland')
        shutil.copytree(root / 'pkg', work / 'data/kwin/scripts/krohnkite-flowrange')
        (work / 'config/kwinrc').write_text('''[Plugins]
krohnkite-flowrangeEnabled=true

[Script-krohnkite-flowrange]
floatingClass=floating_terminal
monocleMaximize=false
notificationDuration=0
screenDefaultLayout=:tile
screenGapBetween=32
screenGapBottom=32
screenGapLeft=32
screenGapRight=32
screenGapTop=32
soleWindowNoGaps=false
''')
        session = shlex.join([sys.executable, str(root / 'test/kwin_session.py'), scenario, str(work)])
        command = ['dbus-run-session', '--', 'kwin_wayland', '--virtual', '--width', '1280',
                   '--height', '900', '--no-lockscreen', '--exit-with-session', session]
        with (work / 'kwin.log').open('w') as log:
            process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                process.wait(timeout=60)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
                raise RuntimeError('KWin integration scenario timed out: ' + scenario)
        result = work / 'result.json'
        checks = json.loads(result.read_text()) if result.exists() else []
        expected = {'splits': 10, 'focus': 3, 'toggle': 10, 'zen': 21, 'zen-flameshot': 7}[scenario]
        if process.returncode or len(checks) != expected or not all(c['pass'] for c in checks):
            print((work / 'kwin.log').read_text()[-16000:])
            sys.exit('FAIL: ' + scenario)
        for check in checks:
            print('PASS:', check['test'])
