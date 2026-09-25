# Daylight Desktop

Daylight is a free desktop assistant for Windows, macOS, and Linux. The same ZIP includes the app and a launcher for each system. It needs Python 3.10 or newer with Tk/Tkinter support; no browser or third-party Python packages are required.

## Use Daylight on a phone

Open `mobile.html` on the hosted site, or visit `/mobile.html` after publishing on GitHub Pages. The phone companion supports offline planning and tasks in its chat-style view. Use the Install button when offered, or your browser's **Add to Home Screen** / **Install app** menu. Installability and offline reopening require HTTPS; GitHub Pages provides HTTPS.

Phone tasks work locally while signed out. After signing in, tasks sync to the signed-in user's Firestore document and merge with that phone's locally saved tasks. They do not sync with the desktop app. Claude API keys are never placed in the public webpage. Use the desktop app for Claude, Ollama, and direct-link downloads.

## Enable Google and phone sign-in

Sign-in is optional and requires a Firebase project owned by the site operator. Without this setup, Daylight Pocket continues to work locally and the sign-in controls remain disabled.

1. Create a Firebase project and register a Web app in the [Firebase Console](https://console.firebase.google.com/).
2. Copy the Web app config into `firebase-config.json` using `firebase-config.example.json` as a template. This browser config is public by design; do not put service-account credentials or private keys in it.
3. In **Authentication → Sign-in method**, enable **Google** and **Phone**.
4. In **Authentication → Settings → Authorized domains**, add `senpainex.github.io` and any custom site domain. Configure the SMS region policy to the countries you intend to support. Phone verification uses Firebase reCAPTCHA and may send a billable SMS; standard carrier rates can apply. Firebase processes phone numbers for verification and abuse prevention.
5. Create the Firestore database, then publish the owner-only rules from `firestore.rules`. These rules limit each signed-in user to `/users/{their UID}`.
6. Commit the browser config deliberately with `git add -f firebase-config.json`, then commit and push. The config contains public web-app identifiers, not private credentials; never put a service-account key or private key in it. It is excluded from the downloadable desktop ZIP.

Test phone sign-in first with Firebase's fictional test phone numbers. Real SMS delivery, Google OAuth, and Firebase billing require the site owner's configured Firebase project and cannot be tested from this unconfigured repository.

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

Daylight is published at [senpainex.github.io/Daylight](https://senpainex.github.io/Daylight/). The GitHub repository is `senpainex/Daylight`; GitHub Pages deploys the root of the `main` branch.
