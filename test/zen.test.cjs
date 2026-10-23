const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
global.Qt = { rect: (x, y, width, height) => ({ x, y, width, height }) };
vm.runInThisContext(readFileSync(__dirname + '/../krohnkite.js', 'utf8'));

function setup() {
  const origin = { id: 'origin' }, other = { id: 'other' };
  const client = { normalWindow: true, deleted: false, desktops: [origin], activities: [],
    frameGeometry: { x: 20, y: 30, width: 420, height: 350 }, noBorder: false,
    fullScreen: false, maximizeMode: 0, resizeable: true,
    minSize: { width: 10, height: 10 }, maxSize: { width: 5000, height: 5000 },
    setMaximize(v, h) { this.maximizeMode = Number(v) + 2 * Number(h); } };
  const panel = { dock: true, desktops: [] };
  const previous = { normalWindow: true, desktops: [origin], activities: [] };
  const ws = { desktops: [origin, other], currentDesktop: origin, currentActivity: 'activity',
    activeWindow: client, stackingOrder: [panel, previous, client],
    createDesktop() { this.desktops.push({ id: 'zen' }); },
    removeDesktop(d) { this.desktops = this.desktops.filter(x => x !== d); },
    clientArea() { return { x: 1920, y: -200, width: 1920, height: 1080 }; } };
  const window = { window: { window: client }, zen: false };
  const zen = new KWinZen(ws, () => {}, w => { ws.activeWindow = w; });
  return { origin, other, client, panel, previous, ws, window, zen };
}

test('Zen honors monitor coordinates and restores sticky/multidesktop assignments', () => {
  const { origin, other, client, panel, ws, window, zen } = setup();
  client.desktops = []; panel.desktops = [origin, other];
  zen.transfer(window);
  assert.deepEqual(client.frameGeometry, { x: 2480, y: 40, width: 800, height: 600 });
  zen.release();
  assert.deepEqual(client.desktops, []);
  assert.deepEqual(panel.desktops, [origin, other]);
  assert.equal(window.zen, false);
});

test('removed original and return desktops fall back to a surviving desktop', () => {
  const { origin, other, client, ws, window, zen } = setup();
  zen.transfer(window); ws.removeDesktop(origin); zen.surfaceChanged();
  zen.toggle(); assert.equal(ws.currentDesktop, other);
  zen.toggle(); zen.release();
  assert.deepEqual(client.desktops, [other]);
  zen.dispose();
  assert.deepEqual(ws.desktops, [other]);
});

test('external removal of Zen restores shell and window', () => {
  const { origin, client, panel, ws, window, zen } = setup();
  zen.transfer(window); ws.removeDesktop(ws.currentDesktop); ws.currentDesktop = origin;
  zen.surfaceChanged();
  assert.deepEqual(client.desktops, [origin]);
  assert.deepEqual(panel.desktops, []);
  assert.equal(window.zen, false);
});

test('activity changes restore panels and later visits return to the previous activity', () => {
  const { panel, ws, window, zen } = setup();
  zen.transfer(window); ws.currentActivity = 'other'; zen.surfaceChanged();
  assert.deepEqual(panel.desktops, []);
  zen.toggle(); assert.equal(ws.currentActivity, 'activity');
  zen.toggle(); assert.equal(ws.currentActivity, 'other');
  zen.release(false);
  assert.equal(ws.currentActivity, 'other');
});

test('cleanup restores native fullscreen and partial maximization', () => {
  const { client, ws, window, zen } = setup();
  client.fullScreen = true; client.maximizeMode = 1;
  const geometry = { ...client.frameGeometry };
  zen.transfer(window);
  assert.equal(client.fullScreen, false);
  assert.equal(client.maximizeMode, 0);
  zen.release(false);
  assert.equal(client.fullScreen, true);
  assert.equal(client.maximizeMode, 1);
  assert.deepEqual(client.frameGeometry, geometry);
});

test('new panels are restored while Zen dialogs stay usable', () => {
  const { client, ws, window, zen } = setup();
  zen.transfer(window);
  const panel = { dock: true, desktops: [] }; ws.stackingOrder.push(panel); zen.added(panel);
  assert.ok(!panel.desktops.includes(ws.currentDesktop));
  const dialog = { normalWindow: true, desktops: [ws.currentDesktop], transientFor: client };
  ws.stackingOrder.push(dialog); zen.added(dialog);
  assert.deepEqual(dialog.desktops, [ws.currentDesktop]);
  zen.release(false); assert.deepEqual(panel.desktops, []);
});

test('centering respects application size limits and fixed-size windows', () => {
  const { client, window, zen } = setup();
  client.minSize.width = 900; client.maxSize.height = 400;
  zen.transfer(window);
  assert.deepEqual(client.frameGeometry, { x: 2430, y: 140, width: 900, height: 400 });
  zen.release();
  client.resizeable = false; client.width = 300; client.height = 200;
  zen.transfer(window);
  assert.deepEqual(client.frameGeometry, { x: 2730, y: 240, width: 300, height: 200 });
});

test('Meta+U visits an empty Zen desktop without moving the focused window or wallpaper', () => {
  const { origin, client, panel, ws, window, zen } = setup();
  const wallpaper = { desktopWindow: true, desktops: [] };
  ws.stackingOrder.push(wallpaper);
  const geometry = { ...client.frameGeometry };
  zen.toggle();
  const desktop = ws.currentDesktop;
  assert.notEqual(desktop, origin);
  assert.deepEqual(client.desktops, [origin]);
  assert.deepEqual(client.frameGeometry, geometry);
  assert.equal(window.zen, false);
  assert.deepEqual(wallpaper.desktops, []);
  assert.ok(!panel.desktops.includes(desktop));
  zen.toggle();
  assert.equal(ws.currentDesktop, origin);
  assert.equal(ws.activeWindow, client);
  assert.deepEqual(panel.desktops, []);
  zen.toggle(); assert.equal(ws.currentDesktop, desktop);
  zen.dispose(); assert.equal(ws.currentDesktop, origin);
  assert.ok(!ws.desktops.includes(desktop));
  assert.deepEqual(panel.desktops, []);
});

test('Meta+U works without a focused application', () => {
  const { origin, ws, zen } = setup();
  ws.activeWindow = null;
  zen.toggle(); assert.notEqual(ws.currentDesktop, origin);
  zen.transfer(null); // No window to send; keep the empty space.
  zen.toggle(); assert.equal(ws.currentDesktop, origin);
  zen.dispose();
});

test('Meta+Shift+U uses the existing Zen desktop and returns the window on its second press', () => {
  const { origin, client, ws, window, zen } = setup();
  zen.toggle(); const desktop = ws.currentDesktop; zen.toggle();
  zen.transfer(window);
  assert.equal(ws.currentDesktop, desktop);
  assert.deepEqual(client.desktops, [desktop]);
  assert.equal(ws.activeWindow, client);
  zen.toggle(); assert.deepEqual(client.desktops, [desktop]);
  zen.toggle(); zen.transfer(window);
  assert.equal(ws.currentDesktop, origin);
  assert.deepEqual(client.desktops, [origin]);
  assert.equal(window.zen, false);
  zen.toggle(); assert.equal(ws.currentDesktop, desktop);
  assert.deepEqual(client.desktops, [origin]);
  zen.dispose();
});

for (const identity of ['flameshot', 'org.flameshot.Flameshot']) {
  test(`Flameshot capture ${identity} stays on Zen instead of the return desktop`, () => {
    const { origin, ws, zen } = setup();
    zen.toggle();
    const desktop = ws.currentDesktop;
    const capture = { normalWindow: true, resourceClass: identity, resourceName: '',
      desktopFileName: '', desktops: [desktop], activities: [] };
    ws.stackingOrder.push(capture); zen.added(capture);
    assert.deepEqual(capture.desktops, [desktop]);
    assert.equal(ws.currentDesktop, desktop);
    zen.dispose();
  });
}

test('Flameshot on all desktops remains available when Zen hides sticky windows', () => {
  const { ws, zen } = setup();
  const capture = { normalWindow: true, resourceClass: 'flameshot', desktops: [], activities: [] };
  ws.stackingOrder.push(capture); zen.toggle(); zen.added(capture); zen.surfaceChanged();
  assert.deepEqual(capture.desktops, []);
  zen.dispose();
});

test('ordinary and similarly named windows are still excluded from Zen', () => {
  const { origin, ws, zen } = setup();
  zen.toggle();
  for (const id of ['terminal', 'flameshot-helper']) {
    const other = { normalWindow: true, resourceClass: id, caption: 'flameshot',
      desktops: [ws.currentDesktop], activities: [] };
    ws.stackingOrder.push(other); zen.added(other);
    assert.deepEqual(other.desktops, [origin]);
  }
  const sticky = { normalWindow: true, resourceClass: 'terminal', desktops: [], activities: [] };
  ws.stackingOrder.push(sticky); zen.surfaceChanged();
  assert.ok(!sticky.desktops.includes(ws.currentDesktop));
  zen.dispose(); assert.deepEqual(sticky.desktops, []);
});
