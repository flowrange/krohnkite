# Krohnkite

This fork adds features to [Krohnkite](https://codeberg.org/anametologin/Krohnkite),
the dynamic tiling script for KWin.

## What changed

- **Toggle the current split.** In Tile mode, `Meta+E` switches the split around
  the focused window between side-by-side and top-to-bottom. Other splits stay
  in place; pressing it again restores the previous orientation and proportions.
- **Choose the next split.** In Tile mode, `Meta+B` places the next tiled window
  below the selected window; `Meta+V` places it to the right. Existing windows
  stay in place until the new window opens.
- **Split beside the focused window.** After an explicit split, new windows
  without a specified direction open to the right of the focused window,
  including after changing focus with a keyboard shortcut.
- **Keep nested layouts.** Local splits preserve gaps and support resizing,
  window swaps and returning from Monocle. Temporarily hidden windows retain
  their slots; closing a window frees its space.
- **Independent package.** Installed as **Krohnkite (flowrange)** with the plugin
  ID `krohnkite-flowrange`, so upstream updates do not overwrite the fork.

Based on the work of **Eon S. Jeon**, **anametologin** and the Krohnkite
contributors. Additions by **flowrange**, with assistance from **Codex (OpenAI)**.
Licensed under the [MIT license](LICENSE).
