#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "Install Python 3 from python.org, then open Daylight again." buttons {"OK"} with title "Daylight"'
  exit 1
fi
if ! python3 -c 'import tkinter' >/dev/null 2>&1; then
  osascript -e 'display dialog "This Python is missing Tkinter. Install Python 3 from python.org, which includes Tk support." buttons {"OK"} with title "Daylight"'
  exit 1
fi
exec python3 daylight.py
