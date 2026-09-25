# Daylight Desktop

Daylight is a free desktop assistant for Windows, macOS, and Linux. The same ZIP includes the app and a launcher for each system. It needs Python 3.10 or newer with Tk/Tkinter support; no browser or third-party Python packages are required.

## Use Daylight on a phone

Open `mobile.html` on the hosted site, or visit `/mobile.html` after publishing on GitHub Pages. The phone companion supports offline planning and tasks in its chat-style view. Use the Install button when offered, or your browser's **Add to Home Screen** / **Install app** menu. Installability and offline reopening require HTTPS; GitHub Pages provides HTTPS.

Phone tasks are saved in that browser's local storage on that phone. They do not sync with the desktop app or another phone. The phone companion is intentionally offline-only; Claude API keys are not placed in a public webpage. Use the desktop app for Claude, Ollama, and direct-link downloads.

## Download and run

1. Download and extract `downloads/daylight-desktop.zip`.
2. Use the launcher for your system:

| System | Launcher | Requirements |
| --- | --- | --- |
| Windows 10/11 | Double-click `run-windows.bat` | Python 3.10+ from python.org with Tcl/Tk selected |
| macOS | Double-click `run-macos.command` | Python 3.10+ from python.org, which includes Tk support |
| Linux | Run `./run-linux.sh` | Python 3.10+ and Tkinter; on Ubuntu install `python3-tk` if needed |

You can also run `python daylight.py` from a terminal on Windows, `python3 daylight.py` on macOS/Linux. Daylight is currently distributed as a portable Python ZIP, not signed `.exe` or `.app` installers.

## Short commands

- `plan` gives a quick planning nudge.
- `task buy milk` adds a task; `tasks` lists them; `done 1` completes the first open task.
- `download https://example.com/file.pdf` asks before saving a direct HTTPS link to your Downloads folder. Downloads are limited to 500 MB, HTTPS redirects only, and files are never run automatically.
- Choose **Ollama (local)** in the AI mode menu for a local model. Install Ollama and a model first, for example `ollama pull llama3.2`.
- Choose **Claude API**, then **Claude key**, to use Claude Fable 5.1 (`claude-fable-5-1`). Each request asks for confirmation before sending prompt text to Anthropic. API usage may be billed separately from a Claude chat subscription. Your API key is held in memory only while Daylight is open.

Tasks are stored in the operating system's standard per-user application data folder. Chat history and API keys are not saved by Daylight.

## Publish this site

1. Create a public repository on GitHub.
2. From this folder, run `git init -b main`, `git add .`, `git commit -m "Add Daylight download site"`, add your repository as `origin`, and push `main`.
3. In GitHub repository settings, open **Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save.

This folder is not yet connected to a GitHub account or repository, so publishing still needs to be completed from your GitHub account.
