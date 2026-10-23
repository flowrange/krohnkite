// A single parked window, with separate return and original desktops.
// All shell changes are temporary KWin window assignments, never Plasma config.
interface ZenSpace {
  desktop: VirtualDesktop;
  activity: string;
  returnDesktop: VirtualDesktop;
  returnActivity: string;
  returnWindow: Window | null;
}

interface ZenSession {
  window: WindowClass;
  client: Window;
  origin: VirtualDesktop;
  desktops: VirtualDesktop[];
  activity: string;
  activities: string[];
  geometry: QRect;
  noBorder: boolean;
  fullScreen: boolean;
  maximizeMode: number;
}

class KWinZen {
  private session: ZenSession | null = null;
  private space: ZenSpace | null = null;
  private hidden: { client: Window; desktops: VirtualDesktop[] }[] = [];

  constructor(private workspace: Workspace, private arrange: () => void,
              private focus: (window: Window) => void) {}

  // Navigation never parks or restores a window, including on the first visit.
  public toggle() {
    const space = this.ensureSpace();
    if (!space) return;
    if (this.isVisible()) {
      this.restoreShell();
      this.workspace.currentActivity = space.returnActivity;
      this.workspace.currentDesktop = this.validDesktop(space.returnDesktop);
      this.arrange();
      this.restoreFocus(space.returnWindow);
    } else {
      space.returnDesktop = this.workspace.currentDesktop;
      space.returnActivity = this.workspace.currentActivity;
      space.returnWindow = this.workspace.activeWindow;
      this.visit();
    }
  }

  // Meta+Shift+U transfers the selected window in either direction.
  public transfer(window: WindowClass | null) {
    if (!window || window.dock || window.state === WindowState.Dragging) return;
    const client = (window.window as KWinWindow).window;
    if (client.deleted || !client.normalWindow) return;
    if (this.session && this.session.client === client) {
      if (this.isVisible()) this.release();
      else this.visit();
      return;
    }
    // There is one Zen slot. Restore its previous occupant before replacing it.
    if (this.session) this.release(false);
    const space = this.ensureSpace();
    if (!space) return;
    const origin = this.isVisible() ? this.validDesktop(space.returnDesktop) : this.workspace.currentDesktop;
    this.restoreShell();
    const previous = this.workspace.stackingOrder.slice().reverse().find(w =>
      w !== client && w.normalWindow && !w.deleted && !w.minimized &&
      (w.desktops.length === 0 || w.desktops.indexOf(origin) >= 0) &&
      (w.activities.length === 0 || w.activities.indexOf(this.workspace.currentActivity) >= 0));
    this.session = {
      window, client, origin, desktops: client.desktops.slice(),
      activity: this.workspace.currentActivity, activities: client.activities.slice(),
      geometry: toQRect(toRect(client.frameGeometry)),
      noBorder: client.noBorder, fullScreen: client.fullScreen,
      maximizeMode: client.maximizeMode,
    };
    space.returnDesktop = origin;
    space.returnActivity = this.workspace.currentActivity;
    space.returnWindow = previous || null;
    space.activity = this.workspace.currentActivity;
    window.zen = true;
    client.fullScreen = false;
    client.setMaximize(false, false);
    client.noBorder = true;
    client.desktops = [space.desktop];
    client.activities = [this.session.activity];
    this.arrange();
    this.visit();
  }

  public release(requireFocus = true) {
    const s = this.session;
    if (!s || (requireFocus && (!this.isVisible() || this.workspace.activeWindow !== s.client))) return;
    const visible = this.isVisible();
    const space = this.space!;
    this.restoreShell();
    this.session = null;
    const origin = this.validDesktop(s.origin);
    if (!s.client.deleted) {
      s.window.zen = false;
      s.client.desktops = s.desktops.length === 0 ? [] :
        s.desktops.filter(d => this.workspace.desktops.indexOf(d) >= 0);
      if (s.desktops.length && !s.client.desktops.length) s.client.desktops = [origin];
      s.client.activities = s.activities;
      s.client.noBorder = s.noBorder;
      s.client.frameGeometry = s.geometry;
      s.client.setMaximize(Boolean(s.maximizeMode & 1), Boolean(s.maximizeMode & 2));
      (s.window.window as KWinWindow).maximized = s.maximizeMode > 0;
      s.client.fullScreen = s.fullScreen;
    }
    if (visible) {
      this.workspace.currentActivity = s.activity;
      this.workspace.currentDesktop = origin;
    }
    // Move any remaining dialogs/windows off the temporary desktop first.
    this.workspace.stackingOrder.forEach(w => {
      if (!w.deleted && w.desktops.indexOf(space.desktop) >= 0)
        w.desktops = w.desktops.filter(d => d !== space.desktop).concat([origin]);
    });
    this.arrange();
    if (visible) this.restoreFocus(s.client.deleted ? space.returnWindow : s.client);
  }

  public removed(client: Window) {
    if (this.session && client === this.session.client) this.release(false);
    this.hidden = this.hidden.filter(h => h.client !== client);
  }

  public dispose() {
    this.release(false);
    const space = this.space;
    if (!space) return;
    this.restoreShell();
    if (this.isVisible()) {
      this.workspace.currentActivity = space.returnActivity;
      this.workspace.currentDesktop = this.validDesktop(space.returnDesktop);
      this.restoreFocus(space.returnWindow);
    }
    const target = this.validDesktop(space.returnDesktop);
    this.workspace.stackingOrder.forEach(w => {
      if (!w.deleted && w.desktops.indexOf(space.desktop) >= 0)
        w.desktops = w.desktops.filter(d => d !== space.desktop).concat([target]);
    });
    this.space = null;
    if (this.workspace.desktops.indexOf(space.desktop) >= 0) this.workspace.removeDesktop(space.desktop);
    this.arrange();
  }

  public surfaceChanged() {
    const space = this.space;
    if (!space) return;
    if (this.workspace.desktops.indexOf(space.desktop) < 0) {
      this.dispose();
      return;
    }
    if (this.isVisible()) this.hideShell();
    else this.restoreShell();
  }

  public added(client: Window) {
    if (!this.isVisible() || this.isFlameshot(client)) return;
    const space = this.space!;
    const s = this.session;
    // Dialogs belonging to the Zen application remain usable.
    let parent = client.transientFor;
    while (parent) {
      if (s && parent === s.client) return;
      parent = parent.transientFor;
    }
    if (client.normalWindow && (!s || client !== s.client) && client.desktops.indexOf(space.desktop) >= 0)
      client.desktops = [this.validDesktop(space.returnDesktop)];
    this.hideShell();
  }

  public center() {
    const s = this.session;
    if (!s || s.client.deleted) return;
    const c = s.client;
    const area = this.workspace.clientArea(ClientAreaOption.FullScreenArea, c.output, this.space!.desktop);
    // Match the original i3 quiet-cmd.py "small" preset in logical pixels.
    const width = c.resizeable ? clip(Math.round(Math.min(area.width * .5, 800)), c.minSize.width, c.maxSize.width) : c.width;
    const height = c.resizeable ? clip(Math.round(Math.min(area.height * .7, 600)), c.minSize.height, c.maxSize.height) : c.height;
    c.frameGeometry = { x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2), width, height };
  }

  private ensureSpace(): ZenSpace | null {
    if (this.space) return this.space;
    const before = this.workspace.desktops.slice();
    this.workspace.createDesktop(before.length, "Zen (Krohnkite)");
    const desktop = this.workspace.desktops.find(d => before.indexOf(d) < 0);
    if (!desktop) return null;
    this.space = { desktop, activity: this.workspace.currentActivity,
      returnDesktop: this.workspace.currentDesktop, returnActivity: this.workspace.currentActivity,
      returnWindow: this.workspace.activeWindow };
    return this.space;
  }

  private visit() {
    const space = this.space!;
    this.workspace.currentActivity = space.activity;
    this.workspace.currentDesktop = space.desktop;
    this.hideShell();
    const s = this.session;
    if (s) {
      s.client.minimized = false;
      this.center();
    }
    this.arrange();
    if (s) this.focus(s.client);
  }

  private isVisible(): boolean {
    return this.space !== null && this.workspace.currentDesktop === this.space.desktop &&
      this.workspace.currentActivity === this.space.activity;
  }

  private hideShell() {
    const space = this.space!;
    const otherDesktops = this.workspace.desktops.filter(d => d !== space.desktop);
    if (!otherDesktops.length) return;
    this.workspace.stackingOrder.forEach(client => {
      if (client.deleted || this.isFlameshot(client) || (this.session && client === this.session.client) || this.hidden.some(h => h.client === client)) return;
      // Keep the real Plasma wallpaper; only exclude panels and sticky windows.
      // Unlike opacity=0, desktop assignments also remove panel input regions.
      if (client.dock || (client.normalWindow && client.desktops.length === 0)) {
        this.hidden.push({ client, desktops: client.desktops.slice() });
        client.desktops = otherDesktops;
      }
    });
  }

  private isFlameshot(client: Window): boolean {
    // Capture overlays must stay where Print Screen was invoked, including
    // overlays shown on all desktops. Match app identity, never window titles.
    return [client.resourceClass, client.resourceName, client.desktopFileName].some(value => {
      const id = String(value || "").toLowerCase().replace(/\.desktop$/, "");
      return id === "flameshot" || id === "org.flameshot.flameshot";
    });
  }

  private restoreShell() {
    const hidden = this.hidden;
    this.hidden = [];
    hidden.forEach(h => {
      if (!h.client.deleted) h.client.desktops = h.desktops.filter(d => this.workspace.desktops.indexOf(d) >= 0);
    });
  }

  private validDesktop(preferred: VirtualDesktop, fallback?: VirtualDesktop): VirtualDesktop {
    let desktops = this.workspace.desktops.filter(d => !this.space || d !== this.space.desktop);
    if (!desktops.length) {
      this.workspace.createDesktop(this.workspace.desktops.length, "Desktop");
      desktops = this.workspace.desktops.filter(d => !this.space || d !== this.space.desktop);
    }
    return desktops.indexOf(preferred) >= 0 ? preferred :
      (fallback && desktops.indexOf(fallback) >= 0 ? fallback : desktops[0]);
  }

  private restoreFocus(client: Window | null) {
    if (client && !client.deleted && !client.minimized &&
        (client.desktops.length === 0 || client.desktops.indexOf(this.workspace.currentDesktop) >= 0) &&
        (client.activities.length === 0 || client.activities.indexOf(this.workspace.currentActivity) >= 0))
      this.focus(client);
  }
}
