const TASK_KEY = "daylight.pocket.tasks.v1";
const $ = (selector) => document.querySelector(selector);
let tasks = loadTasks();
let taskStorageKey = TASK_KEY;
let installPrompt = null;
let accountUser = null;
let remoteTasksEnabled = false;
let saveRemoteTasks = null;
let remoteTaskUnsubscribe = null;

function loadTasks(key = TASK_KEY) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value)
      ? value.filter((task) => task && typeof task.text === "string").map((task) => ({ ...task, id: task.id || crypto.randomUUID() }))
      : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
  } catch {
    appendMessage("Daylight", "This browser couldn't save the task list. Check its storage settings.", false);
  }
  if (accountUser && remoteTasksEnabled && saveRemoteTasks) {
    saveRemoteTasks(accountUser.uid, tasks).catch(() => {
      appendMessage("Daylight", "Couldn't sync tasks just now. Your copy is still saved on this phone.", false);
    });
  }
}

window.daylightSetAccount = (user, syncApi) => {
  if (remoteTaskUnsubscribe) {
    remoteTaskUnsubscribe();
    remoteTaskUnsubscribe = null;
  }
  if (accountUser && (!user || accountUser.uid !== user.uid)) {
    accountUser = null;
    remoteTasksEnabled = false;
    saveRemoteTasks = null;
    taskStorageKey = TASK_KEY;
    tasks = loadTasks();
    renderTasks(false);
  }
  accountUser = user || null;
  remoteTasksEnabled = Boolean(user && syncApi);
  saveRemoteTasks = syncApi ? syncApi.saveTasks : null;
  const footerNote = document.querySelector(".pocket-footer p");
  if (!user || !syncApi) {
    footerNote.textContent = "Signed out · Tasks stay in this browser on this phone.";
    $("#privacy-caption").innerHTML = "<span>⌑</span> This phone only · Works offline";
    return;
  }
  taskStorageKey = `${TASK_KEY}.user.${user.uid}`;
  tasks = loadTasks(taskStorageKey);
  renderTasks(false);
  footerNote.textContent = "Signed in · Syncing your tasks to your account.";
  $("#privacy-caption").innerHTML = "<span>⌑</span> Account tasks sync · Chat stays on this phone";
  remoteTaskUnsubscribe = syncApi.listenTasks(user.uid, (remoteTasks) => {
    tasks = Array.isArray(remoteTasks) ? remoteTasks : [];
    renderTasks(false);
    try {
      localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
    } catch {
      appendMessage("Daylight", "Account sync is active, but this browser couldn't update its local copy.", false);
    }
  }, (error) => {
    footerNote.textContent = "Account sync unavailable · This phone's saved copy is still available.";
    console.error("Daylight task sync failed", error);
  });
  syncApi.mergeLocalTasks(user.uid, loadTasks())
    .then(() => localStorage.removeItem(TASK_KEY))
    .catch(() => appendMessage("Daylight", "Couldn't merge this phone's saved tasks yet. They remain on this phone.", false));
};

function appendMessage(author, text, user = false) {
  const row = document.createElement("article");
  row.className = user ? "user-message" : "assistant-message";
  if (!user) {
    const mark = document.createElement("span");
    mark.className = "message-mark";
    mark.textContent = "d.";
    mark.setAttribute("aria-hidden", "true");
    row.append(mark);
  }
  const bubble = document.createElement("p");
  bubble.textContent = text;
  bubble.setAttribute("aria-label", `${author}: ${text}`);
  row.append(bubble);
  $("#messages").append(row);
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

function renderTasks(persist = true) {
  const list = $("#task-list");
  list.replaceChildren();
  tasks.forEach((task, index) => {
    const row = document.createElement("li");
    row.className = `task-row ${task.done ? "done" : ""}`;
    const toggle = document.createElement("button");
    toggle.className = "task-toggle";
    toggle.type = "button";
    toggle.textContent = task.done ? "✓" : "";
    toggle.setAttribute("aria-label", task.done ? "Mark task incomplete" : "Complete task");
    toggle.addEventListener("click", () => {
      tasks[index].done = !tasks[index].done;
      renderTasks();
    });
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${task.text}`);
    remove.addEventListener("click", () => {
      tasks.splice(index, 1);
      renderTasks();
    });
    row.append(toggle, text, remove);
    list.append(row);
  });
  const openCount = tasks.filter((task) => !task.done).length;
  $("#task-count").textContent = openCount;
  $("#empty-tasks").classList.toggle("show", tasks.length === 0);
  $("#clear-done").hidden = !tasks.some((task) => task.done);
  if (persist) saveTasks();
}

function addTask(text) {
  const clean = text.trim();
  if (!clean) return false;
  tasks.unshift({ id: crypto.randomUUID(), text: clean, done: false });
  renderTasks();
  return true;
}

function switchView(viewId) {
  document.querySelectorAll(".pocket-view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll(".tab-button").forEach((button) => {
    const selected = button.dataset.view === viewId;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  if (viewId === "tasks-view") $("#new-task").focus();
}

function reply(text) {
  const clean = text.trim();
  const taskMatch = clean.match(/^(?:add\s+)?task\s*[:, -]?\s+(.+)$/i);
  if (taskMatch) {
    const name = taskMatch[1].trim();
    if (addTask(name)) return `Added to your list: ${name}`;
  }
  if (/^(?:tasks|my tasks|list tasks)$/i.test(clean)) {
    const open = tasks.filter((task) => !task.done).map((task) => task.text);
    return open.length ? `Your open tasks:\n${open.map((task, index) => `${index + 1}. ${task}`).join("\n")}` : "Your task list is clear.";
  }
  const doneMatch = clean.match(/^(?:done|finish|complete)\s+(\d+)\s*$/i);
  if (doneMatch) {
    const openIndexes = tasks.map((task, index) => !task.done ? index : -1).filter((index) => index >= 0);
    const chosen = openIndexes[Number(doneMatch[1]) - 1];
    if (chosen === undefined) return "I couldn't find that task number. Say tasks to see your list.";
    tasks[chosen].done = true;
    renderTasks();
    return `Completed: ${tasks[chosen].text}`;
  }
  if (/^(?:plan|plan my day|help me plan)$/i.test(clean) || /\b(plan|overwhelmed|too much|prioriti[sz]e)\b/i.test(clean)) {
    const open = tasks.filter((task) => !task.done).map((task) => task.text);
    return open.length
      ? `Pick one thing that would make today easier and give its next step 15 minutes. Your open tasks: ${open.slice(0, 5).join("; ")}`
      : "Choose one thing that would make today easier. Write down the next tiny step and give it 15 minutes.";
  }
  if (/^download\b/i.test(clean)) return "The phone companion doesn't download files yet. Use the desktop version for confirmed direct HTTPS downloads.";
  return "I'm the offline phone companion. I can help you make a small plan and keep a private task list on this phone.";
}

$("#today").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
renderTasks();
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => appendMessage("Daylight", reply(button.dataset.prompt))));
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const field = $("#message-input");
  const text = field.value.trim();
  if (!text) return;
  field.value = "";
  field.style.height = "auto";
  appendMessage("You", text, true);
  appendMessage("Daylight", reply(text));
});
$("#message-input").addEventListener("input", (event) => {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 110)}px`;
});
$("#message-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
$("#task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const field = $("#new-task");
  if (addTask(field.value)) field.value = "";
});
$("#clear-done").addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.done);
  renderTasks();
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("#install-button").hidden = false;
});
$("#install-button").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-button").hidden = true;
});
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
