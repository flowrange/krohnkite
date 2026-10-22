const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
vm.runInThisContext(readFileSync(__dirname + '/../krohnkite.js', 'utf8'));

const area = new Rect(32, 56, 1200, 800), gap = 32;
const tile = (id, geometry = area.clone()) => ({ id, geometry, state: WindowState.Tiled });
const geometry = windows => JSON.stringify(windows.map(w => w.geometry));

function nested() {
  const a = tile('A', new Rect(32, 56, 584, 800));
  const b = tile('B', new Rect(648, 56, 584, 800));
  const c = tile('C');
  const state = new NextSplitState();
  const ctx = { currentWindow: a };
  state.remember([a, b], area, gap);
  state.request('A', 'y'); state.created('C');
  state.apply(ctx, [a, b, c], area, gap);
  return { state, ctx, a, b, c, tiles: [a, b, c] };
}

test('toggle the nearest split only, from either child, and restore resized proportions', () => {
  const { state, ctx, a, b, c, tiles } = nested();
  state.adjust(area, tiles, a, new RectDelta(0, 0, 40, 0), gap);
  state.apply(ctx, tiles, area, gap);
  const before = geometry(tiles), outside = geometry([b]);
  assert.equal(state.toggle('C'), true);
  state.apply(ctx, tiles, area, gap);
  assert.equal(c.geometry.x, a.geometry.maxX + gap);
  assert.equal(c.geometry.y, a.geometry.y);
  assert.equal(geometry([b]), outside);
  assert.equal(state.toggle('A'), true);
  state.apply(ctx, tiles, area, gap);
  assert.equal(geometry(tiles), before);
});

test('toggle also seeds the ordinary Tile layout before any explicit next-split request', () => {
  const a = tile('A', new Rect(32, 56, 584, 800));
  const b = tile('B', new Rect(648, 56, 584, 800));
  const state = new NextSplitState(), tiles = [a, b], ctx = { currentWindow: b };
  state.remember(tiles, area, gap);
  const before = geometry(tiles);
  assert.equal(state.toggle('B'), true);
  state.apply(ctx, tiles, area, gap);
  assert.equal(b.geometry.y, a.geometry.maxY + gap);
  assert.equal(b.geometry.x, a.geometry.x);
  state.toggle('A'); state.apply(ctx, tiles, area, gap);
  assert.equal(geometry(tiles), before);
});

test('toggle leaves the next-window direction armed and does not insert a window', () => {
  const { state, ctx, a, c, tiles } = nested();
  state.request('C', 'y');
  assert.equal(state.toggle('A'), true);
  state.apply(ctx, tiles, area, gap);
  assert.equal(state.pending.target, 'C');
  assert.equal(state.pending.axis, 'y');
  assert.equal(state.pending.incoming, null);
  const d = tile('D');
  state.created('D'); state.apply(ctx, [...tiles, d], area, gap);
  assert.equal(d.geometry.y, c.geometry.maxY + gap);
  assert.equal(d.geometry.x, c.geometry.x);
});

test('hidden sibling is skipped when selecting the nearest visible split', () => {
  const { state, ctx, a, b, c, tiles } = nested();
  state.apply(ctx, [a, b], area, gap); // C is temporarily hidden.
  assert.equal(state.toggle('A'), true);
  state.apply(ctx, [a, b], area, gap);
  assert.equal(b.geometry.y, a.geometry.maxY + gap);
  state.toggle('A'); state.apply(ctx, [a, b], area, gap);
  state.apply(ctx, tiles, area, gap);
  assert.equal(c.geometry.y, a.geometry.maxY + gap, 'hidden inner split keeps its original axis');
});

test('one visible tile or an unknown focus is a no-op', () => {
  const { state, ctx, a, tiles } = nested();
  const before = JSON.stringify(state.root);
  assert.equal(state.toggle('unknown'), false);
  assert.equal(JSON.stringify(state.root), before);
  state.apply(ctx, [a], area, gap);
  assert.equal(state.toggle('A'), false);
  assert.equal(JSON.stringify(state.root), before);
  state.apply(ctx, tiles, area, gap);
});
