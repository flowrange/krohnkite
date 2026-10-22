const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

vm.runInThisContext(readFileSync(__dirname + '/../krohnkite.js', 'utf8'));

test('shortcut focus becomes the anchor for the next unarmed window', () => {
  const area = new Rect(0, 0, 1200, 800), gap = 32;
  const tile = id => ({ id, geometry: area.clone(), window: { window: { id } } });
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(tile);
  const state = new NextSplitState();
  state.remember([a], area, gap);
  state.request('A', 'y'); state.created('B');
  state.apply({ currentWindow: a }, [a, b], area, gap);
  state.request('B', 'y'); state.created('C');
  state.apply({ currentWindow: b }, [a, b, c], area, gap);
  state.lastFocused = 'C';
  const previous = JSON.stringify([a.geometry, c.geometry]);

  // Use the actual driver setter, signal wrapper and controller. The workspace
  // emits activation synchronously, as KWin does while handling a shortcut.
  const driver = Object.create(KWinDriver.prototype);
  const layout = Object.assign(Object.create(TileLayout.prototype), { nextSplit: state });
  driver.control = new TilingController({ layouts: { getCurrentLayout: () => layout } });
  driver.entered = false;
  Object.defineProperty(driver, 'currentSurface', { value: {} });
  const callbacks = [];
  const signal = { connect: f => callbacks.push(f), disconnect() {} };
  let active = c.window.window;
  driver.workspace = {
    get activeWindow() { return active; },
    set activeWindow(client) { active = client; callbacks.forEach(f => f(client)); }
  };
  driver.windowMap = { get: client => [a, b, c, d].find(w => w.window.window === client) };
  driver.connect(signal, client => driver.control.onWindowFocused(driver, driver.windowMap.get(client)));

  driver.enter(() => { driver.currentWindow = b; });
  assert.equal(driver.currentWindow, b);
  assert.equal(state.lastFocused, 'B', 'the reentrancy guard must not lose shortcut focus');
  // A newly mapped window can already be active before it has been arranged.
  active = d.window.window;
  state.apply(driver, [a, b, c, d], area, gap);
  assert.equal(d.geometry.x, b.geometry.x + b.geometry.width + gap);
  assert.equal(d.geometry.y, b.geometry.y);
  assert.equal(JSON.stringify([a.geometry, c.geometry]), previous);
});
