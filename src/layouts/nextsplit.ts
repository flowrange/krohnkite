// Copyright (c) 2026 flowrange. Distributed under the MIT license; see LICENSE.

type SplitAxis = "x" | "y";
type SplitNode = { id: string } | SplitBranch;
interface SplitBranch {
  axis: SplitAxis;
  ratio: number;
  a: SplitNode | null;
  b: SplitNode | null;
  // Visible views point to the persistent branch when resizing.
  source?: SplitBranch;
}
interface SplitSnapshot { id: string; geometry: Rect; }

// Local addition to Krohnkite (MIT): deferred, focus-local window insertion.
// Existing Tile layout is retained until a local split or orientation toggle.
class NextSplitState {
  root: SplitNode | null = null;
  pending: { target: string; axis: SplitAxis; incoming: string | null } | null = null;
  last: SplitSnapshot[] = [];
  lastArea: Rect | null = null;
  lastGap = 0;
  lastOrder: string[] = [];
  lastFocused: string | null = null;
  contains(node: SplitNode | null, id: string): boolean {
    return !!node && (("id" in node ? node.id === id :
      (this.contains(node.a, id) || this.contains(node.b, id))));
  }
  request(id: string, axis: SplitAxis) {
    this.pending = {target: id, axis: axis, incoming: null};
  }
  created(id: string) {
    if (this.pending && !this.pending.incoming && id !== this.pending.target)
      this.pending.incoming = id;
  }
  remember(tiles: WindowClass[], area: Rect, gap: number) {
    this.last = tiles.map(w => ({id: w.id, geometry: w.geometry.clone()}));
    this.lastArea = area.clone();
    this.lastGap = gap;
    this.lastOrder = tiles.map(w => w.id);
  }
  // Toggle the closest split visible around the focused leaf. The visible view
  // collapses hidden siblings, while source points back to the persistent tree.
  toggle(id: string): boolean {
    if (!this.lastArea || this.last.length < 2 ||
        !this.last.some(w => w.id === id)) return false;
    if (!this.root) this.root = this.seed(this.last, this.lastArea, this.lastGap);
    const tree = this.view(this.root, new Set(this.lastOrder));
    const parent = (node: SplitNode | null): SplitBranch | null => {
      if (!node || "id" in node) return null;
      if (this.contains(node.a, id)) return parent(node.a) || node;
      if (this.contains(node.b, id)) return parent(node.b) || node;
      return null;
    };
    const split = parent(tree);
    if (!split || !split.source) return false;
    split.source.axis = split.axis === "x" ? "y" : "x";
    return true;
  }
  // Recover the current guillotine layout, including its resized proportions.
  seed(entries: SplitSnapshot[], area: Rect, gap: number): SplitNode | null {
    if (!entries.length) return null;
    if (entries.length === 1) return {id: entries[0].id};
    for (const axis of ["x", "y"] as SplitAxis[]) {
      const size = axis === "x" ? "width" : "height";
      for (const entry of entries) {
        const end = entry.geometry[axis] + entry.geometry[size];
        const first = entries.filter(e => e.geometry[axis] + e.geometry[size] <= end + 0.01);
        const second = entries.filter(e => e.geometry[axis] >= end + gap - 0.01);
        if (!first.length || !second.length || first.length + second.length !== entries.length)
          continue;
        const ratio = (end - area[axis]) / (area[size] - gap);
        const areas = this.divide(area, axis, ratio, gap);
        return {axis: axis, ratio: ratio,
          a: this.seed(first, areas[0], gap), b: this.seed(second, areas[1], gap)};
      }
    }
    // Refuse an ambiguous seed rather than rearranging unrelated windows.
    throw new Error("Cannot preserve current layout for local split");
  }
  divide(area: Rect, axis: SplitAxis, ratio: number, gap: number): [Rect, Rect] {
    const size = axis === "x" ? "width" : "height";
    const span = Math.max(0, area[size] - gap);
    const first = area.clone(), second = area.clone();
    first[size] = span * ratio;
    second[axis] += first[size] + gap;
    second[size] = span - first[size];
    return [first, second];
  }
  insert(node: SplitNode | null, target: string, incoming: string, axis: SplitAxis): SplitNode {
    if (!node) return {id: incoming};
    if ("id" in node && node.id === target)
      return {axis: axis, ratio: 0.5, a: node, b: {id: incoming}};
    if (!("id" in node)) {
      node.a = this.insert(node.a, target, incoming, axis);
      node.b = this.insert(node.b, target, incoming, axis);
    }
    return node;
  }
  remove(id: string) {
    const prune = (node: SplitNode | null): SplitNode | null => {
      if (!node || ("id" in node && node.id === id)) return null;
      if ("id" in node) return node;
      node.a = prune(node.a); node.b = prune(node.b);
      return !node.a ? node.b : !node.b ? node.a : node;
    };
    this.root = prune(this.root);
    if (this.pending && this.pending.target === id) this.pending = null;
    this.last = this.last.filter(w => w.id !== id);
    this.lastOrder = this.lastOrder.filter(value => value !== id);
  }
  // Hidden/floating/minimized leaves keep their place for later restoration.
  view(node: SplitNode | null, ids: Set<string>): SplitNode | null {
    if (!node) return null;
    if ("id" in node) return ids.has(node.id) ? node : null;
    const a = this.view(node.a, ids), b = this.view(node.b, ids);
    if (!a || !b) return a || b;
    return {axis: node.axis, ratio: node.ratio, a: a, b: b, source: node};
  }
  render(node: SplitNode | null, area: Rect, windows: Map<string, WindowClass>, gap: number): void {
    if (!node) return;
    if ("id" in node) { windows.get(node.id)!.geometry = area; return; }
    const areas = this.divide(area, node.axis, node.ratio, gap);
    this.render(node.a, areas[0], windows, gap);
    this.render(node.b, areas[1], windows, gap);
  }
  remapOrder(ids: string[]) {
    if (ids.length !== this.lastOrder.length || !ids.every(id => this.lastOrder.indexOf(id) !== -1)) return;
    const rename = new Map<string, string>(this.lastOrder.map((id, i) => [id, ids[i]] as [string, string]));
    const walk = (node: SplitNode | null): void => {
      if (!node) return;
      if ("id" in node) { node.id = rename.get(node.id) || node.id; return; }
      walk(node.a); walk(node.b);
    };
    walk(this.root);
  }
  apply(ctx: EngineContext, tiles: WindowClass[], area: Rect, gap: number): boolean {
    const ids = tiles.map(w => w.id), visible = new Set(ids);
    if (this.root) this.remapOrder(ids);
    const pending = this.pending;
    if (pending && pending.incoming && visible.has(pending.incoming)) {
      this.pending = null;
      if (visible.has(pending.target)) {
        if (!this.root) {
          const previous = this.last.filter(w => visible.has(w.id));
          this.root = this.seed(previous, this.lastArea || area, gap);
        }
        if (this.contains(this.root, pending.target))
          this.root = this.insert(this.root, pending.target, pending.incoming, pending.axis);
      }
    }
    if (!this.root) return false;
    for (const window of tiles) {
      if (this.contains(this.root, window.id)) continue;
      const active = ctx.currentWindow;
      const target = [active && active.id, this.lastFocused, ...this.lastOrder]
        .find(id => id !== null && id !== window.id && visible.has(id) && this.contains(this.root, id));
      if (target) this.root = this.insert(this.root, target, window.id, "x");
      else this.root = {id: window.id};
    }
    tiles.forEach(w => { w.state = WindowState.Tiled; });
    this.render(this.view(this.root, visible), area, new Map<string, WindowClass>(tiles.map(w => [w.id, w] as [string, WindowClass])), gap);
    this.remember(tiles, area, gap);
    return true;
  }
  adjust(area: Rect, tiles: WindowClass[], basis: WindowClass, delta: RectDelta, gap: number) {
    const tree = this.view(this.root, new Set(tiles.map(w => w.id)));
    const walk = (node: SplitNode | null, rect: Rect): boolean => {
      if (!node || "id" in node) return false;
      const inFirst = this.contains(node.a, basis.id);
      const areas = this.divide(rect, node.axis, node.ratio, gap);
      if (walk(inFirst ? node.a : node.b, areas[inFirst ? 0 : 1])) return true;
      const change = node.axis === "x"
        ? (inFirst ? delta.east : -delta.west)
        : (inFirst ? delta.south : -delta.north);
      if (!change) return false;
      const span = rect[node.axis === "x" ? "width" : "height"] - gap;
      if (span > 0) node.source!.ratio = clip(node.ratio + change / span, 0.05, 0.95);
      return true;
    };
    walk(tree, area);
  }
}
