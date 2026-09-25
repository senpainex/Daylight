@echo off
cd /d "%~dp0"
py -3 daylight.py
if errorlevel 1 (
  echo Daylight needs Python 3.10 or newer with Tcl/Tk support.
  echo Install Python from https://www.python.org/downloads/windows/ and try again.
  pause
)
