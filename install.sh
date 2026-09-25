#!/usr/bin/env bash
set -euo pipefail

if [[ "${XDG_CURRENT_DESKTOP:-}" != *GNOME* ]] || ! command -v gsettings >/dev/null 2>&1; then
  printf 'This installer configures a GNOME keyboard shortcut. You can still run ./daylight-assistant manually.\n' >&2
  exit 1
fi
if ! command -v zenity >/dev/null 2>&1; then
  printf 'Please install zenity first.\n' >&2
  exit 1
fi
for program in curl jq; do
  if ! command -v "$program" >/dev/null 2>&1; then
    printf 'Please install %s first.\n' "$program" >&2
    exit 1
  fi
done

if [[ "${DAYLIGHT_INSTALL_CONFIRMED:-}" != "1" ]]; then
  if ! zenity --question --title="Install Daylight shortcut" --width=440 --text="Add a per-user GNOME shortcut?\n\nCtrl+Alt+Space will open Daylight's local assistant prompt. No administrator access is needed."; then
    exit 0
  fi
fi

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
bin_dir="$HOME/.local/bin"
applications_dir="$HOME/.local/share/applications"
install -Dm755 "$script_dir/daylight-assistant" "$bin_dir/daylight-assistant"
mkdir -p "$applications_dir"
printf '[Desktop Entry]\nType=Application\nName=Daylight Assistant\nComment=Private local laptop assistant\nExec=%s\nIcon=utilities-terminal\nTerminal=false\nCategories=Utility;\nKeywords=assistant;local;AI;\n' "$bin_dir/daylight-assistant" > "$applications_dir/daylight-assistant.desktop"
chmod 644 "$applications_dir/daylight-assistant.desktop"

schema="org.gnome.settings-daemon.plugins.media-keys"
path="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/daylight-assistant/"
key_schema="$schema.custom-keybinding:$path"
current="$(gsettings get "$schema" custom-keybindings)"
current="${current#@as }"
if [[ "$current" != *"$path"* ]]; then
  if [[ "$current" == "[]" ]]; then
    updated="['$path']"
  else
    updated="${current%]}"
    updated+=", '$path']"
  fi
  gsettings set "$schema" custom-keybindings "$updated"
fi
gsettings set "$key_schema" name 'Daylight Assistant'
gsettings set "$key_schema" command "$bin_dir/daylight-assistant"
gsettings set "$key_schema" binding '<Control><Alt>space'

printf 'Installed. Press Ctrl+Alt+Space to open Daylight.\n'