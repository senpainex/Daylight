#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  printf 'Install Python 3.10 or newer, then run this launcher again.\n' >&2
  exit 1
fi
if ! python3 -c 'import tkinter' >/dev/null 2>&1; then
  printf 'Tkinter is missing. Install the Python Tk package for your Linux distribution (for Ubuntu: sudo apt install python3-tk).\n' >&2
  exit 1
fi
exec python3 daylight.py
