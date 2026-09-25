#!/usr/bin/env python3
"""Daylight desktop assistant for Windows, macOS, and Linux."""

import json
import os
import platform
import queue
import re
import shutil
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk

APP_NAME = "Daylight"
CLAUDE_MODEL = "claude-fable-5-1"
OLLAMA_URL = "http://127.0.0.1:11434"
MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024
SYSTEM_PROMPT = (
    "You are Daylight, a concise and practical personal assistant. Help with the user's request "
    "in a few clear sentences. Be honest about actions you cannot perform. Never claim to have "
    "downloaded, installed, opened, or run a file."
)


def data_directory():
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "Daylight"


class HTTPSRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if urllib.parse.urlparse(new_url).scheme.lower() != "https":
            raise urllib.error.HTTPError(new_url, code, "Refusing non-HTTPS redirect", headers, response)
        return super().redirect_request(request, response, code, message, headers, new_url)


def validate_download_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Downloads need a direct HTTPS link without embedded credentials.")
    return parsed


def safe_download_name(url):
    parsed = validate_download_url(url)
    filename = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(urllib.parse.unquote(parsed.path)).name).strip(" .")
    return filename or "download"


def parse_task_command(text):
    match = re.match(r"^(?:add\s+)?task\s*[:, -]?\s+(.+)$", text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def parse_done_command(text):
    match = re.match(r"^(?:done|finish|complete)\s+(\d+)\s*$", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


class DaylightApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Daylight | Your desktop assistant")
        self.root.geometry("800x680")
        self.root.minsize(600, 520)
        self.root.configure(bg="#f4f4ee")
        self.directory = data_directory()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.tasks_path = self.directory / "tasks.json"
        self.tasks = self.load_tasks()
        self.history = []
        self.claude_key = ""
        self.busy = False
        self.events = queue.Queue()
        self.mode = tk.StringVar(value="Offline helper")
        self.ollama_model = tk.StringVar(value="llama3.2")
        self.build_ui()
        self.render_tasks()
        self.root.after(100, self.process_events)

    def build_ui(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background="#f4f4ee")
        style.configure("TLabel", background="#f4f4ee", foreground="#26342a", font=("TkDefaultFont", 10))
        style.configure("Title.TLabel", font=("TkDefaultFont", 20, "bold"), foreground="#315d48")
        style.configure("Subtle.TLabel", foreground="#728074", font=("TkDefaultFont", 9))
        style.configure("TButton", padding=(10, 6))
        style.configure("Accent.TButton", background="#315d48", foreground="#ffffff", padding=(13, 7))
        style.map("Accent.TButton", background=[("active", "#244a36")])

        outer = ttk.Frame(self.root, padding=20)
        outer.pack(fill="both", expand=True)
        header = ttk.Frame(outer)
        header.pack(fill="x")
        ttk.Label(header, text="daylight", style="Title.TLabel").pack(side="left")
        self.status = ttk.Label(header, text="Ready on this device", style="Subtle.TLabel")
        self.status.pack(side="right", pady=7)
        ttk.Label(outer, text="A little more room to think.", style="Subtle.TLabel").pack(anchor="w", pady=(2, 16))

        controls = ttk.Frame(outer)
        controls.pack(fill="x", pady=(0, 12))
        ttk.Label(controls, text="AI mode").pack(side="left", padx=(0, 7))
        mode_box = ttk.Combobox(controls, textvariable=self.mode, state="readonly", width=20,
                                values=("Offline helper", "Ollama (local)", "Claude API"))
        mode_box.pack(side="left")
        ttk.Label(controls, text="Ollama model").pack(side="left", padx=(14, 6))
        ttk.Entry(controls, textvariable=self.ollama_model, width=16).pack(side="left")
        ttk.Button(controls, text="Claude key", command=self.configure_claude).pack(side="right")

        content = ttk.Panedwindow(outer, orient="horizontal")
        content.pack(fill="both", expand=True)
        chat_frame = ttk.Frame(content, padding=(0, 0, 12, 0))
        task_frame = ttk.Frame(content, padding=(12, 0, 0, 0))
        content.add(chat_frame, weight=3)
        content.add(task_frame, weight=1)

        ttk.Label(chat_frame, text="YOUR ASSISTANT", style="Subtle.TLabel").pack(anchor="w", pady=(0, 7))
        log_wrap = ttk.Frame(chat_frame)
        log_wrap.pack(fill="both", expand=True)
        self.log = tk.Text(log_wrap, wrap="word", state="disabled", relief="flat", padx=12, pady=12,
                           bg="#ffffff", fg="#364239", font=("TkDefaultFont", 10), spacing3=5)
        scroll = ttk.Scrollbar(log_wrap, orient="vertical", command=self.log.yview)
        self.log.configure(yscrollcommand=scroll.set)
        self.log.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.log.tag_configure("user", foreground="#315d48", font=("TkDefaultFont", 10, "bold"))
        self.log.tag_configure("assistant", foreground="#26342a", font=("TkDefaultFont", 10))
        self.log.tag_configure("hint", foreground="#809084", font=("TkDefaultFont", 9, "italic"))
        self.write_message("Daylight", "Try plan, task buy milk, tasks, or download followed by a direct HTTPS link. Choose Claude or local Ollama above for open-ended chat.", "hint")

        composer = ttk.Frame(chat_frame)
        composer.pack(fill="x", pady=(10, 0))
        self.entry = ttk.Entry(composer)
        self.entry.pack(side="left", fill="x", expand=True, ipady=7)
        self.entry.bind("<Return>", self.send)
        ttk.Button(composer, text="Send", style="Accent.TButton", command=self.send).pack(side="left", padx=(8, 0))
        ttk.Label(chat_frame, text="Claude prompts leave this device only after confirmation. API use may cost extra.", style="Subtle.TLabel").pack(anchor="w", pady=(7, 0))

        ttk.Label(task_frame, text="MY TASKS", style="Subtle.TLabel").pack(anchor="w", pady=(0, 7))
        self.task_list = tk.Listbox(task_frame, activestyle="none", relief="flat", bg="#ffffff", fg="#364239",
                                    selectbackground="#dce8d9", selectforeground="#26342a", font=("TkDefaultFont", 10))
        self.task_list.pack(fill="both", expand=True)
        task_buttons = ttk.Frame(task_frame)
        task_buttons.pack(fill="x", pady=(8, 0))
        ttk.Button(task_buttons, text="Complete", command=self.complete_task).pack(fill="x")
        ttk.Button(task_buttons, text="Clear done", command=self.clear_completed).pack(fill="x", pady=(6, 0))
        self.entry.focus_set()

    def load_tasks(self):
        try:
            loaded = json.loads(self.tasks_path.read_text(encoding="utf-8"))
            return [item for item in loaded if isinstance(item, dict) and isinstance(item.get("text"), str)]
        except (OSError, json.JSONDecodeError):
            return []

    def save_tasks(self):
        temporary = self.tasks_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.tasks, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.tasks_path)

    def render_tasks(self):
        self.task_list.delete(0, "end")
        for index, task in enumerate(self.tasks, 1):
            mark = "x" if task.get("done") else " "
            self.task_list.insert("end", f"{mark} {index}. {task['text']}")
        self.save_tasks()

    def write_message(self, author, text, tag="assistant"):
        self.log.configure(state="normal")
        self.log.insert("end", f"{author}\n", "user" if author == "You" else tag)
        self.log.insert("end", text + "\n\n", tag)
        self.log.configure(state="disabled")
        self.log.see("end")

    def send(self, _event=None):
        text = self.entry.get().strip()
        if not text or self.busy:
            return "break"
        self.entry.delete(0, "end")
        self.write_message("You", text, "user")
        lowered = text.lower()

        if lowered == "claude setup":
            self.configure_claude()
            return "break"
        if lowered == "claude forget":
            self.claude_key = ""
            self.write_message("Daylight", "The Claude key was cleared from this session.")
            return "break"
        task_text = parse_task_command(text)
        if task_text:
            self.tasks.append({"text": task_text, "done": False})
            self.render_tasks()
            self.write_message("Daylight", f"Added to your list: {task_text}")
            return "break"
        if lowered in ("tasks", "my tasks", "list tasks"):
            open_items = [task["text"] for task in self.tasks if not task.get("done")]
            self.write_message("Daylight", "Your open tasks:\n" + "\n".join(f"{index}. {task}" for index, task in enumerate(open_items, 1)) if open_items else "Your task list is clear.")
            return "break"
        done_number = parse_done_command(text)
        if done_number is not None:
            open_indices = [index for index, task in enumerate(self.tasks) if not task.get("done")]
            selected = done_number - 1
            if 0 <= selected < len(open_indices):
                item = self.tasks[open_indices[selected]]
                item["done"] = True
                self.render_tasks()
                self.write_message("Daylight", f"Completed: {item['text']}")
            else:
                self.write_message("Daylight", "I couldn't find that task number. Type tasks to see your list.")
            return "break"
        if lowered in ("plan", "plan my day"):
            open_items = [task["text"] for task in self.tasks if not task.get("done")]
            answer = "Choose one thing that would make today easier and give its next step 15 minutes."
            if open_items:
                answer += " Your open tasks: " + "; ".join(open_items[:5])
            self.write_message("Daylight", answer)
            return "break"
        if lowered.startswith("download"):
            self.download(text)
            return "break"

        mode = self.mode.get()
        if mode == "Claude API":
            if not self.claude_key:
                self.write_message("Daylight", "Choose Claude key above and enter your Anthropic API key. It is kept in memory only for this session.")
                return "break"
            approved = messagebox.askyesno("Send to Claude?", "This sends your prompt to Anthropic's Claude API. API usage may be billed separately from a Claude chat subscription. Send this request?", parent=self.root)
            if not approved:
                self.write_message("Daylight", "Cancelled. Your prompt was not sent.")
                return "break"
        self.ask_model_async(text, mode)
        return "break"

    def configure_claude(self):
        key = simpledialog.askstring("Claude API key", "Paste your Anthropic API key. It is held in memory only until Daylight closes.", show="*", parent=self.root)
        if key:
            self.claude_key = key.strip()
            self.mode.set("Claude API")
            self.status.configure(text="Claude ready for this session")
            self.write_message("Daylight", "Claude selected. Each request asks before sending prompt text to Anthropic.")

    def ask_model_async(self, prompt, mode):
        self.busy = True
        self.status.configure(text="Thinking...")
        self.events.put(("message", "Daylight", "Thinking...", "hint"))
        model_name = self.ollama_model.get().strip() or "llama3.2"
        api_key = self.claude_key
        worker = threading.Thread(target=self.ask_model, args=(prompt, mode, model_name, api_key), daemon=True)
        worker.start()

    def ask_model(self, prompt, mode, model_name, api_key):
        try:
            if mode == "Claude API":
                answer = self.ask_claude(prompt, api_key)
            elif mode == "Ollama (local)":
                answer = self.ask_ollama(prompt, model_name)
            else:
                answer = "I can help with quick planning and tasks offline. Select local Ollama or Claude API for open-ended chat."
            self.events.put(("reply", answer, ""))
        except Exception as error:
            self.events.put(("error", str(error), ""))

    def ask_claude(self, prompt, api_key):
        messages = self.history[-12:] + [{"role": "user", "content": prompt}]
        body = json.dumps({"model": CLAUDE_MODEL, "max_tokens": 700, "system": SYSTEM_PROMPT, "messages": messages}).encode("utf-8")
        request = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        })
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.load(response)
        answer = "\n".join(block.get("text", "") for block in payload.get("content", []) if block.get("type") == "text")
        self.history.extend([{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}])
        return answer or "Claude returned no text. Try a shorter request."

    def ask_ollama(self, prompt, model_name):
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, *self.history[-12:], {"role": "user", "content": prompt}]
        body = json.dumps({"model": model_name, "messages": messages, "stream": False}).encode("utf-8")
        request = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body, headers={"content-type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.load(response)
        answer = payload.get("message", {}).get("content", "").strip()
        self.history.extend([{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}])
        return answer or "Ollama returned no text. Try again."

    def process_events(self):
        try:
            while True:
                event = self.events.get_nowait()
                if event[0] == "message":
                    self.write_message(event[1], event[2], event[3])
                elif event[0] == "reply":
                    self.write_message("Daylight", event[1])
                    self.busy = False
                    self.status.configure(text="Ready")
                elif event[0] == "error":
                    self.write_message("Daylight", event[1])
                    self.busy = False
                    self.status.configure(text="Request failed")
        except queue.Empty:
            pass
        self.root.after(100, self.process_events)

    def download(self, text):
        match = re.search(r"https://[^\s<>\"']+", text, re.IGNORECASE)
        if not match:
            self.write_message("Daylight", "Paste a direct HTTPS link after download. I can't search websites for a file by name yet.")
            return
        url = match.group(0).rstrip("),.!?")
        try:
            parsed = validate_download_url(url)
        except ValueError as error:
            self.write_message("Daylight", str(error))
            return
        filename = safe_download_name(url)
        target_dir = Path.home() / "Downloads"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / filename
        if not messagebox.askyesno("Confirm download", f"Save a file from {parsed.hostname} to:\n{target}\n\nDaylight will not open or run it.", parent=self.root):
            self.write_message("Daylight", "Download cancelled.")
            return
        if target.exists() and not messagebox.askyesno("Replace existing file?", f"{target} already exists. Replace it?", parent=self.root):
            self.write_message("Daylight", "Kept the existing file. Download cancelled.")
            return
        self.busy = True
        self.status.configure(text="Downloading...")
        threading.Thread(target=self.download_worker, args=(url, target), daemon=True).start()

    def download_worker(self, url, target):
        temporary = None
        try:
            opener = urllib.request.build_opener(HTTPSRedirectHandler())
            request = urllib.request.Request(url, headers={"User-Agent": "Daylight/1.0"})
            with opener.open(request, timeout=30) as response:
                length = response.headers.get("Content-Length")
                if length and int(length) > MAX_DOWNLOAD_BYTES:
                    raise ValueError("This download is larger than the 500 MB limit.")
                with tempfile.NamedTemporaryFile(prefix=".daylight-", dir=target.parent, delete=False) as stream:
                    temporary = Path(stream.name)
                    total = 0
                    while chunk := response.read(1024 * 1024):
                        total += len(chunk)
                        if total > MAX_DOWNLOAD_BYTES:
                            raise ValueError("This download is larger than the 500 MB limit.")
                        stream.write(chunk)
            os.replace(temporary, target)
            self.events.put(("reply", f"Saved to {target}. Review the file before opening it.", ""))
        except Exception as error:
            if temporary:
                temporary.unlink(missing_ok=True)
            self.events.put(("error", f"Download failed: {error}", ""))

    def complete_task(self):
        selection = self.task_list.curselection()
        if not selection:
            return
        index = selection[0]
        if index < len(self.tasks):
            self.tasks[index]["done"] = True
            self.render_tasks()

    def clear_completed(self):
        self.tasks = [task for task in self.tasks if not task.get("done")]
        self.render_tasks()


def main():
    root = tk.Tk()
    DaylightApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
