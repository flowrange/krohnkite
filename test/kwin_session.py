#!/usr/bin/env python3
"""Scenario client; invoked only by kwin.py inside its disposable session."""
import json
from pathlib import Path
import subprocess
import sys
import time

import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib

scenario, directory = sys.argv[1:]
work = Path(directory)
dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
reports, apps, checks = [], [], []


class Probe(dbus.service.Object):
    @dbus.service.method('org.flowrange.SplitProbe', in_signature='s', out_signature='')
    def Report(self, value):
        reports.append(json.loads(value))


name = dbus.service.BusName('org.flowrange.SplitProbe', bus)
probe = Probe(bus, '/Probe')
context = GLib.MainContext.default()


def pump(seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        while context.pending():
            context.iteration(False)
        time.sleep(.01)


def js(code=''):
    reports.clear()
    path = work / 'probe.js'
    path.write_text(code + ''';
callDBus("org.flowrange.SplitProbe", "/Probe", "org.flowrange.SplitProbe", "Report",
  JSON.stringify(workspace.windowList().filter(w => w.caption.startsWith("Split test "))
    .map(w => ({ name: w.caption.slice(11), active: workspace.activeWindow === w,
      g: { x: w.frameGeometry.x, y: w.frameGeometry.y,
           width: w.frameGeometry.width, height: w.frameGeometry.height } }))));
''')
    bus.call_blocking('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting', 'loadScript', 'ss', (str(path), 'split-test-probe'))
    bus.call_blocking('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting', 'start', '', ())
    pump(.3)
    bus.call_blocking('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting', 'unloadScript', 's', ('split-test-probe',))
    assert reports, 'No response from the KWin probe'
    # Unloading uses deferred QObject deletion; let it finish before reloading.
    pump(.05)
    return {w['name']: w for w in reports[-1]}


def focus(label):
    return js('workspace.activeWindow = workspace.windowList().find(w => w.caption === ' + json.dumps('Split test ' + label) + ');')


def action(label):
    bus.call_blocking('org.kde.kglobalaccel', '/component/kwin', 'org.kde.kglobalaccel.Component', 'invokeShortcut', 's', (label,))
    pump(.3)


def launch(label, floating=False):
    code = '''from PyQt6.QtWidgets import QApplication, QWidget
from PyQt6.QtGui import QGuiApplication
import sys
app = QApplication(sys.argv)
'''
    if floating:
        code += 'QGuiApplication.setDesktopFileName("floating_terminal")\n'
    code += 'w = QWidget()\nw.setWindowTitle(' + repr('Split test ' + label) + ')\nw.resize(400, 300)\nw.show()\napp.exec()\n'
    app = subprocess.Popen([sys.executable, '-c', code])
    apps.append(app)
    pump(.8)
    return app


def same(a, b):
    return all(abs(a[k] - b[k]) < 1.1 for k in a)


def adjacent(a, b, axis):
    size = 'width' if axis == 'x' else 'height'
    other = 'y' if axis == 'x' else 'x'
    return abs(b[axis] - a[axis] - a[size] - 32) < 1.1 and abs(b[other] - a[other]) < 1.1


def check(label, condition):
    checks.append({'test': label, 'pass': bool(condition)})
    print(label, condition, flush=True)
    assert condition, label


try:
    pump(1)
    if scenario == 'splits':
        launch('A'); launch('B')
        before = focus('A')
        action('FlorentNextSplitBelow')
        armed = js()
        check('arming below does not move windows', all(same(before[k]['g'], armed[k]['g']) for k in before))
        launch('C'); after = js()
        check('new C below A', adjacent(after['A']['g'], after['C']['g'], 'y'))
        check('unrelated B stays in place', same(before['B']['g'], after['B']['g']))
        before = focus('C'); action('FlorentNextSplitRight'); armed = js()
        check('arming right does not move windows', all(same(before[k]['g'], armed[k]['g']) for k in before))
        launch('D'); after = js()
        check('new D right of C', adjacent(after['C']['g'], after['D']['g'], 'x'))
        check('A and B stay in place', all(same(before[k]['g'], after[k]['g']) for k in ('A', 'B')))
        before = focus('C'); action('KrohnkiteShrinkWidth'); after = js()
        check('resize nested tile', after['C']['g']['width'] < before['C']['g']['width'])
        before = focus('C'); action('KrohnkiteShiftRight'); after = js()
        check('directional move swaps slots', same(before['C']['g'], after['D']['g']) and same(before['D']['g'], after['C']['g']))
        before = focus('C'); action('KrohnkiteMonocleLayout'); action('KrohnkiteMonocleLayout'); after = js()
        check('monocle restores split tree', all(same(before[k]['g'], after[k]['g']) for k in before))
        focus('A'); action('FlorentNextSplitBelow'); launch('Float', True); launch('E'); after = js()
        check('floating window does not consume intent', adjacent(after['A']['g'], after['E']['g'], 'y'))
    elif scenario == 'toggle':
        launch('A'); before = focus('A'); action('KrohnkiteToggleSplit'); after = js()
        check('toggle with one window is a no-op', same(before['A']['g'], after['A']['g']))
        launch('B'); before = focus('B'); action('KrohnkiteToggleSplit'); after = js()
        check('toggle ordinary Tile to top-to-bottom', adjacent(after['A']['g'], after['B']['g'], 'y'))
        action('KrohnkiteToggleSplit'); after = js()
        check('second toggle restores ordinary Tile', all(same(before[k]['g'], after[k]['g']) for k in before))
        focus('A'); action('FlorentNextSplitBelow'); launch('C'); before = focus('C')
        action('KrohnkiteToggleSplit'); after = js()
        check('toggle only the nested split around C', adjacent(after['A']['g'], after['C']['g'], 'x'))
        check('unrelated B stays fixed during toggle', same(before['B']['g'], after['B']['g']))
        focus('A'); action('KrohnkiteToggleSplit'); after = js()
        check('toggle from either child restores nested geometry', all(same(before[k]['g'], after[k]['g']) for k in before))
        focus('C'); action('FlorentNextSplitBelow'); action('KrohnkiteToggleSplit'); launch('D'); after = js()
        check('toggle preserves pending next-window direction', adjacent(after['C']['g'], after['D']['g'], 'y'))
        launch('Float', True); before = focus('Float'); action('KrohnkiteToggleSplit'); after = js()
        check('toggle ignores floating focus', all(same(before[k]['g'], after[k]['g']) for k in before))
        before = focus('A'); action('KrohnkiteMonocleLayout'); monocle = js()
        action('KrohnkiteToggleSplit'); after = js()
        check('toggle ignores Monocle layout', all(same(monocle[k]['g'], after[k]['g']) for k in monocle))
        action('KrohnkiteMonocleLayout'); after = js()
        check('returning from Monocle keeps the toggled tree', all(same(before[k]['g'], after[k]['g']) for k in before))
    elif scenario == 'focus':
        launch('A'); focus('A'); action('FlorentNextSplitBelow'); launch('B')
        focus('B'); action('FlorentNextSplitBelow'); launch('C'); focus('C')
        action('KrohnkiteFocusUp'); before = js()
        check('focus moves to middle B', before['B']['active'])
        launch('D'); after = js()
        check('new D splits focused B to its right', adjacent(after['B']['g'], after['D']['g'], 'x'))
        check('A and C stay in place', all(same(before[k]['g'], after[k]['g']) for k in ('A', 'C')))
    else:
        raise ValueError(scenario)
finally:
    (work / 'result.json').write_text(json.dumps(checks, indent=2))
    for app in apps:
        if app.poll() is None:
            app.terminate()
            app.wait(timeout=5)
