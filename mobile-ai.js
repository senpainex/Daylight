const $ai = (selector) => document.querySelector(selector);
const AI_SYSTEM_PROMPT = "You are Daylight, a kind and practical everyday assistant. Help the user find realistic next steps for ordinary life problems. Start with a brief acknowledgment, then give a clear numbered plan. Ask one concise clarifying question only when it would materially improve the advice. Be honest about uncertainty. For health, legal, financial, or safety-critical topics, give general information and encourage a qualified professional; do not present yourself as a professional. Never claim to take actions for the user.";
let selectedProvider = "offline";
let apiKeyForThisPage = "";
let aiConversation = [];
let googleSearchGrounding = false;
let requestInProgress = false;

function aiStatus(message, isError) {
  const status = $ai("#ai-status");
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function configureProviderControls() {
  const wantsAI = selectedProvider !== "offline";
  $ai("#ai-key-form").hidden = !wantsAI;
  $ai("#grounding-option").hidden = selectedProvider !== "gemini";
  const settingsButton = $ai("#ai-settings-button");
  settingsButton.textContent = selectedProvider === "offline"
    ? "AI · Offline"
    : `AI · ${selectedProvider === "gemini" ? "Gemini" : "Claude"}`;
  const keyLink = $ai("#provider-key-link");
  if (selectedProvider === "claude") {
    keyLink.href = "https://platform.claude.com/settings/keys";
    keyLink.textContent = "Get a Claude API key ↗";
    aiStatus(apiKeyForThisPage ? "Claude is ready for this page session." : "Your Claude API key is required. It may incur separate API charges.");
  } else if (selectedProvider === "gemini") {
    keyLink.href = "https://aistudio.google.com/apikey";
    keyLink.textContent = "Get a Gemini API key ↗";
    aiStatus(apiKeyForThisPage ? "Gemini is ready for this page session." : "Your Gemini API key is required. Restrict it to Gemini API and set usage limits.");
  } else {
    aiStatus("Offline answers need no account or key.");
  }
  const caption = $ai("#privacy-caption");
  if (caption) {
    const detail = selectedProvider === "offline"
      ? "This phone only · Works offline"
      : `Prompts sent to ${selectedProvider === "gemini" ? "Google Gemini" : "Claude"} after confirmation`;
    caption.replaceChildren();
    const symbol = document.createElement("span");
    symbol.textContent = "⌑";
    caption.append(symbol, document.createTextNode(` ${detail}`));
  }
}

function formatProviderError(error, provider) {
  if (error.name === "AbortError") return "That request took too long. Check your connection and try again.";
  if (error instanceof TypeError) return "Couldn't reach the AI provider. Check your connection, API key restrictions, and browser CORS settings.";
  const detail = error.message || "The provider rejected the request.";
  return `${provider === "gemini" ? "Gemini" : "Claude"} couldn't answer: ${detail}`;
}

async function fetchJSON(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error && payload.error.message
        ? payload.error.message
        : `Request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGemini(prompt, key) {
  const contents = aiConversation.slice(-10).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  contents.push({ role: "user", parts: [{ text: prompt }] });
  const body = {
    systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 800 },
  };
  const tools = googleSearchGrounding ? [{ googleSearch: {} }] : undefined;
  if (tools) body.tools = tools;
  const result = await fetchJSON("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const answer = (result.candidates || []).flatMap((candidate) => candidate.content && candidate.content.parts || [])
    .map((part) => part.text || "").filter(Boolean).join("\n");
  if (!answer) throw new Error((result.promptFeedback && result.promptFeedback.blockReason) || "No text response was returned.");
  aiConversation.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
  const sources = (result.candidates || []).flatMap((candidate) => candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks || [])
    .map((chunk) => chunk.web).filter((source) => source && source.uri);
  return { answer, sources };
}

async function requestClaude(prompt, key) {
  const body = {
    model: "claude-fable-5-1",
    max_tokens: 800,
    system: AI_SYSTEM_PROMPT,
    messages: [...aiConversation.slice(-10), { role: "user", content: prompt }],
  };
  const result = await fetchJSON("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": key,
    },
    body: JSON.stringify(body),
  });
  const answer = (result.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n");
  if (!answer) throw new Error("No text response was returned.");
  aiConversation.push({ role: "user", content: prompt }, { role: "assistant", content: answer });
  return { answer, sources: [] };
}

$ai("#ai-settings-button").addEventListener("click", () => $ai("#ai-dialog").showModal());
$ai("#ai-provider").addEventListener("change", (event) => {
  selectedProvider = event.target.value;
  apiKeyForThisPage = "";
  aiConversation = [];
  $ai("#ai-key").value = "";
  configureProviderControls();
});
$ai("#ai-grounding").addEventListener("change", (event) => {
  googleSearchGrounding = event.target.checked;
});
$ai("#ai-key-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const key = $ai("#ai-key").value.trim();
  if (!key) {
    aiStatus("Enter your own API key. Daylight does not provide a shared key.", true);
    return;
  }
  if (!$ai("#ai-consent").checked) {
    aiStatus("Confirm that your prompts will be sent to the provider and API charges may apply.", true);
    return;
  }
  apiKeyForThisPage = key;
  $ai("#ai-key").value = "";
  configureProviderControls();
  $ai("#ai-dialog").close();
});
$ai("#ai-dialog").addEventListener("click", (event) => {
  if (event.target === $ai("#ai-dialog")) $ai("#ai-dialog").close();
});
function clearProviderSession() {
  apiKeyForThisPage = "";
  aiConversation = [];
}

window.addEventListener("pagehide", clearProviderSession);
window.addEventListener("beforeunload", clearProviderSession);

window.daylightHasAI = () => selectedProvider !== "offline" && Boolean(apiKeyForThisPage);
window.daylightOpenAISettings = () => $ai("#ai-dialog").showModal();
window.daylightAskAI = async (prompt) => {
  if (requestInProgress) throw new Error("Please wait for the current answer to finish.");
  if (!window.daylightHasAI()) throw new Error("Choose an AI provider and enter your own API key in AI settings.");
  if (!window.confirm(`Send this question to ${selectedProvider === "gemini" ? "Google Gemini" : "Claude"}? The provider will receive your prompt, and usage may be billed to you.`)) {
    throw new Error("Canceled. Your prompt was not sent.");
  }
  requestInProgress = true;
  try {
    return selectedProvider === "gemini"
      ? await requestGemini(prompt, apiKeyForThisPage)
      : await requestClaude(prompt, apiKeyForThisPage);
  } catch (error) {
    throw new Error(formatProviderError(error, selectedProvider));
  } finally {
    requestInProgress = false;
  }
};

configureProviderControls();
