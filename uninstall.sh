#!/usr/bin/env bash
set -euo pipefail

schema="org.gnome.settings-daemon.plugins.media-keys"
path="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/daylight-assistant/"
key_schema="$schema.custom-keybinding:$path"
current="$(gsettings get "$schema" custom-keybindings)"
if [[ "$current" == *"$path"* ]]; then
  updated="$(printf '%s' "$current" | sed "s|'$path', ||; s|, '$path'||; s|\['$path'\]|[]|")"
  gsettings set "$schema" custom-keybindings "$updated"
fi
gsettings reset-recursively "$key_schema" 2>/dev/null || true
rm -f "$HOME/.local/bin/daylight-assistant" "$HOME/.local/bin/daylight-uninstall" "$HOME/.local/share/applications/daylight-assistant.desktop"
printf 'Removed the Daylight shortcut and launcher. Local tasks were kept in ~/.local/share/daylight.\n'