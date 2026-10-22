# Switching to the fork later

Preparing or building this repository does not switch the running desktop.
Keep the currently working installation until a deliberate migration.

1. Back up `~/.config/kwinrc`, `~/.config/kglobalshortcutsrc` and the existing
   `~/.local/share/kwin/scripts/krohnkite` directory. If a locally patched script
   is loaded from another directory, preserve that directory as well.
2. Build and test this fork. `make install` installs or updates only
   `krohnkite-flowrange`; it does not enable it or remove upstream Krohnkite.
3. The fork reads its settings from `[Script-krohnkite-flowrange]` in `kwinrc`.
   To preserve existing gaps, floating exclusions and other options, copy the
   settings from `[Script-krohnkite]` to that new group while the fork is disabled.
   Do not rename or delete the original group. KDE's script configuration dialog
   can also configure the fork directly.
4. In **System Settings → Window Management → KWin Scripts**, disable the old
   Krohnkite and enable **Krohnkite (flowrange)**. If a patched instance was
   manually loaded under another script name, unload that instance too. Logging
   out and back in avoids leaving an old instance or cached QML running.
5. Check focus movement, deferred splits, gap sizes, Monocle, window resizing,
   floating exclusions and virtual-desktop moves before removing any backup.

The fork preserves the existing shortcut action IDs. Existing KWin assignments
and helpers that invoke those actions can continue to use them. Avoid running
both variants simultaneously. No automatic configuration migration is performed.

For `Meta+E` to toggle the current split, assign it to **Krohnkite: Toggle Current
Split** in KDE's shortcuts settings. If it was previously assigned to
**Krohnkite: Tile Layout**, remove that assignment first.

To roll back, disable the fork and re-enable the original script. If required,
restore the backed-up original package and settings, then log out and back in.
The split tree itself is transient and cannot be restored from `kwinrc`.
