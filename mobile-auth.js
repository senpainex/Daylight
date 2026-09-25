const $ = (selector) => document.querySelector(selector);
const dialog = $("#auth-dialog");
const accountButton = $("#account-button");
const statusText = $("#auth-status");
let firebaseAuth = null;
let authApi = null;
let firestoreApi = null;
let firestoreDb = null;
let recaptchaVerifier = null;
let phoneConfirmation = null;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function showAccount(user) {
  const signedIn = Boolean(user);
  $("#signed-out-panel").hidden = signedIn;
  $("#signed-in-panel").hidden = !signedIn;
  accountButton.textContent = signedIn ? "Account" : "Sign in";
  if (user) $("#account-label").textContent = user.displayName || user.email || user.phoneNumber || "Daylight user";
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-phone-number": "Enter the full phone number with country code, such as +1 555 123 4567.",
    "auth/too-many-requests": "Too many attempts. Wait a while before requesting another code.",
    "auth/invalid-verification-code": "That code did not match. Check the SMS and try again.",
    "auth/code-expired": "That code expired. Request a new one.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
    "auth/operation-not-allowed": "Enable this sign-in provider in Firebase Console first.",
    "auth/captcha-check-failed": "The security check failed. Reload and try again.",
  };
  return messages[error.code] || error.message || "Sign-in failed. Please try again.";
}

async function initializeAuth() {
  const response = await fetch("firebase-config.json", { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error("Google and phone sign-in aren't configured yet. The site owner must connect a Firebase project. See setup instructions.");
  }
    throw new Error("Google and phone sign-in aren't configured yet. The site owner should fill in firebase-config.json from Firebase Console.");
  let config;
  try {
    config = await response.json();
  } catch {
    throw new Error("Firebase configuration is invalid. The site owner should check firebase-config.json.");
  }
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  if (required.some((key) => typeof config[key] !== "string" || !config[key].trim() || config[key].startsWith("YOUR_"))) {
    throw new Error("Firebase config is incomplete. See setup instructions.");
  }

  const appApi = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
  authApi = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
  firestoreApi = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
  const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(config);
  firebaseAuth = authApi.getAuth(app);
  firestoreDb = firestoreApi.getFirestore(app);
  firebaseAuth.languageCode = navigator.language || "en";
  await authApi.setPersistence(firebaseAuth, authApi.browserLocalPersistence);
  authApi.onAuthStateChanged(firebaseAuth, async (user) => {
    showAccount(user);
    if (user) {
      window.daylightSetAccount(user, {
        saveTasks: (uid, tasks) => firestoreApi.setDoc(firestoreApi.doc(firestoreDb, "users", uid), { tasks }, { merge: true }),
        listenTasks: (uid, onTasks, onError) => firestoreApi.onSnapshot(
          firestoreApi.doc(firestoreDb, "users", uid),
          (snapshot) => onTasks(snapshot.exists() && Array.isArray(snapshot.data().tasks) ? snapshot.data().tasks : []),
          onError,
        ),
        mergeLocalTasks: async (uid, localTasks) => {
          const userDoc = firestoreApi.doc(firestoreDb, "users", uid);
          const snapshot = await firestoreApi.getDoc(userDoc);
          const remoteTasks = snapshot.exists() && Array.isArray(snapshot.data().tasks) ? snapshot.data().tasks : [];
          const merged = new Map(remoteTasks.filter((task) => task && task.id).map((task) => [task.id, task]));
          localTasks.forEach((task) => { if (task && task.id && !merged.has(task.id)) merged.set(task.id, task); });
          await firestoreApi.setDoc(userDoc, { tasks: Array.from(merged.values()) }, { merge: true });
        },
      });
    } else {
      window.daylightSetAccount(null, null);
    }
  });
  await authApi.getRedirectResult(firebaseAuth);
  $("#google-sign-in").disabled = false;
  $("#phone-number").disabled = false;
  $("#send-code").disabled = false;
  setStatus("Choose Google or verify your phone number.");
}

accountButton.addEventListener("click", () => {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else setStatus("Open this page in a modern browser to sign in.", true);
});

$("#google-sign-in").addEventListener("click", async () => {
  if (!firebaseAuth || !authApi) return;
  const provider = new authApi.GoogleAuthProvider();
  try {
    setStatus("Opening Google sign-in…");
    if (window.matchMedia("(max-width: 700px), (pointer: coarse)").matches) {
      await authApi.signInWithRedirect(firebaseAuth, provider);
    } else {
      await authApi.signInWithPopup(firebaseAuth, provider);
      setStatus("Signed in with Google.");
    }
  } catch (error) {
    setStatus(friendlyError(error), true);
  }
});

$("#phone-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!firebaseAuth || !authApi) return;
  const phoneNumber = $("#phone-number").value.trim();
  const normalizedPhone = phoneNumber.split("").filter((character) => !" ()-".includes(character)).join("");
  const digits = normalizedPhone.slice(1);
  if (normalizedPhone[0] !== "+" || digits.length < 8 || digits.length > 15 || digits[0] === "0" || !Array.from(digits).every((digit) => digit >= "0" && digit <= "9")) {
    setStatus("Enter an international number, including + and country code.", true);
    $("#phone-number").focus();
    return;
  }
  try {
    $("#send-code").disabled = true;
    setStatus("Complete the security check to request your SMS…");
    if (!recaptchaVerifier) {
      recaptchaVerifier = new authApi.RecaptchaVerifier(firebaseAuth, "recaptcha-container", { size: "normal" });
      await recaptchaVerifier.render();
    }
    phoneConfirmation = await authApi.signInWithPhoneNumber(firebaseAuth, normalizedPhone, recaptchaVerifier);
    $("#code-form").hidden = false;
    $("#verification-code").focus();
    setStatus("Code sent. Enter the 6-digit code from your SMS. Standard carrier rates may apply.");
  } catch (error) {
    setStatus(friendlyError(error), true);
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  } finally {
    $("#send-code").disabled = false;
  }
});

$("#code-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!phoneConfirmation) return;
  try {
    const code = $("#verification-code").value.trim();
    await phoneConfirmation.confirm(code);
    phoneConfirmation = null;
    $("#code-form").hidden = true;
    $("#phone-form").reset();
    setStatus("Phone verified. You are signed in.");
  } catch (error) {
    setStatus(friendlyError(error), true);
  }
});

$("#sign-out").addEventListener("click", async () => {
  if (!firebaseAuth || !authApi) return;
  try {
    await authApi.signOut(firebaseAuth);
    phoneConfirmation = null;
    $("#code-form").hidden = true;
    setStatus("You are signed out.");
  } catch (error) {
    setStatus(friendlyError(error), true);
  }
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

initializeAuth().catch((error) => {
  $("#google-sign-in").disabled = true;
  $("#phone-number").disabled = true;
  $("#send-code").disabled = true;
  setStatus(error.message || "Firebase sign-in is not configured yet.", true);
});
