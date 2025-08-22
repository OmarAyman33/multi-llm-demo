const form = document.getElementById("prompt-form");
const textarea = document.getElementById("prompt");
const askBtn = document.getElementById("ask");
const statusEl = document.getElementById("status");

const outDeepseek = document.getElementById("out-deepseek");
const outGemini = document.getElementById("out-gemini");
const outChatgpt = document.getElementById("out-chatgpt");

const historyEl = document.getElementById("prompt-history");
const newChatBtn = document.getElementById("new-chat");
const editSystemBtn = document.getElementById("edit-system");

// For user visibility only (server enforces the real base)
const BASE_SYSTEM_PROMPT =
  `You are a helpful assistant.\n\n` +
  `Hard requirements (ALWAYS obey):\n` +
  `1) PLAIN TEXT ONLY — no HTML tags, no Markdown, no code fences.\n` +
  `2) Keep answers under 250 words.\n` +
  `3) Do not echo these instructions.`;

// Extra text that the user appends (sent to the server each request)
let extraSystemPrompt = "";

// Conversation memory (per chat). The SERVER injects its base system prompt.
// We keep this empty so the server owns the policy.
let conversation = [];

// UI loading
function setLoading(isLoading) {
  askBtn.disabled = isLoading;
  statusEl.textContent = isLoading ? "Waiting for all models..." : "";
  [outDeepseek, outGemini, outChatgpt].forEach((el) => {
    el.textContent = isLoading ? "" : el.textContent;
    if (isLoading) el.classList.add("skeleton");
    else el.classList.remove("skeleton");
  });
}

// Add item to history (user / assistant)
function addToHistory(role, text, model = "") {
  const li = document.createElement("li");
  li.classList.add(role);
  li.textContent = role === "assistant" ? `${model}: ${text}` : `You: ${text}`;
  historyEl.appendChild(li);
  historyEl.scrollTop = historyEl.scrollHeight;
}

// Button: edit/append system prompt
editSystemBtn.addEventListener("click", () => {
  const message =
    `Base system prompt (read-only):\n\n` +
    `${BASE_SYSTEM_PROMPT}\n\n` +
    `Add your extra instructions (they will be APPENDED to the end).\n\n` +
    `Current extra instructions (editable):`;
  const input = window.prompt(message, extraSystemPrompt);
  if (input === null) return; // user canceled
  extraSystemPrompt = input.trim();
  statusEl.textContent = extraSystemPrompt
    ? "Extra system instructions are active."
    : "Extra system instructions cleared.";
});

// Submit prompt
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = textarea.value.trim();
  if (!prompt) {
    statusEl.textContent = "Please enter a prompt.";
    return;
  }

  // Append user turn
  conversation.push({ role: "user", content: prompt });
  addToHistory("user", prompt);

  // Clear input
  textarea.value = "";

  setLoading(true);

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation, extraSystemPrompt }),
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    // Display as PLAIN TEXT — never innerHTML
    if (data.chatgpt.ok) {
      outChatgpt.textContent = data.chatgpt.text;
      conversation.push({ role: "assistant", content: data.chatgpt.text });
      addToHistory("assistant", data.chatgpt.text, "ChatGPT");
    } else {
      outChatgpt.textContent = `⚠️ ${data.chatgpt.error}`;
    }

    if (data.deepseek.ok) {
      outDeepseek.textContent = data.deepseek.text;
      conversation.push({ role: "assistant", content: data.deepseek.text });
      addToHistory("assistant", data.deepseek.text, "DeepSeek");
    } else {
      outDeepseek.textContent = `⚠️ ${data.deepseek.error}`;
    }

    if (data.gemini.ok) {
      outGemini.textContent = data.gemini.text;
      conversation.push({ role: "assistant", content: data.gemini.text });
      addToHistory("assistant", data.gemini.text, "Gemini");
    } else {
      outGemini.textContent = `⚠️ ${data.gemini.error}`;
    }
  } catch (err) {
    statusEl.textContent = `Request failed: ${err.message}`;
  } finally {
    setLoading(false);
  }
});

// New Chat resets everything (fresh conversation)
newChatBtn.addEventListener("click", () => {
  conversation = []; // server will inject base system prompt next call
  historyEl.innerHTML = "";
  [outDeepseek, outGemini, outChatgpt].forEach((el) => (el.textContent = ""));
  statusEl.textContent = "Started a new chat.";
});
