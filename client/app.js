const form = document.getElementById("prompt-form");
const textarea = document.getElementById("prompt");
const askBtn = document.getElementById("ask");
const statusEl = document.getElementById("status");

const outDeepseek = document.getElementById("out-deepseek");
const outGemini = document.getElementById("out-gemini");
const outChatgpt = document.getElementById("out-chatgpt");

const historyEl = document.getElementById("prompt-history");
const newChatBtn = document.getElementById("new-chat");

// conversation memory (per chat)
let conversation = [
  {
    role: "system",
    content:
      "Stick to less than 150 words. Responses must be clearly structured. Format the output using plain HTML tags (<p>, <ul>, <li>, <strong>, etc.). Do not use Markdown."
  }
];

// helper to update the UI loading state
function setLoading(isLoading) {
  askBtn.disabled = isLoading;
  statusEl.textContent = isLoading ? "Waiting for all models..." : "";
  [outDeepseek, outGemini, outChatgpt].forEach((el) => {
    el.textContent = isLoading ? "" : el.textContent;
    if (isLoading) el.classList.add("skeleton");
    else el.classList.remove("skeleton");
  });
}

// helper to add messages to chat history
function addToHistory(role, text, model = "") {
  const li = document.createElement("li");
  li.classList.add(role);
  if (role === "assistant") {
    li.textContent = `${model}: ${text}`;
  } else {
    li.textContent = `You: ${text}`;
  }
  historyEl.appendChild(li);

  // auto-scroll to newest message
  historyEl.scrollTop = historyEl.scrollHeight;
}

// form submission handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = textarea.value.trim();
  if (!prompt) {
    statusEl.textContent = "Please enter a prompt.";
    return;
  }

  // add user message
  conversation.push({ role: "user", content: prompt });
  addToHistory("user", prompt);

  // clear input
  textarea.value = "";

  setLoading(true);

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation })
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);

    const data = await res.json();

    // ChatGPT
    if (data.chatgpt.ok) {
      conversation.push({ role: "assistant", content: data.chatgpt.text });
      addToHistory("assistant", data.chatgpt.text, "ChatGPT");
      outChatgpt.innerHTML = data.chatgpt.text;
    } else {
      outChatgpt.textContent = `⚠️ ${data.chatgpt.error}`;
    }

    // DeepSeek
    if (data.deepseek.ok) {
      conversation.push({ role: "assistant", content: data.deepseek.text });
      addToHistory("assistant", data.deepseek.text, "DeepSeek");
      outDeepseek.innerHTML = data.deepseek.text;
    } else {
      outDeepseek.textContent = `⚠️ ${data.deepseek.error}`;
    }

    // Gemini
    if (data.gemini.ok) {
      conversation.push({ role: "assistant", content: data.gemini.text });
      addToHistory("assistant", data.gemini.text, "Gemini");
      outGemini.innerHTML = data.gemini.text;
    } else {
      outGemini.textContent = `⚠️ ${data.gemini.error}`;
    }
  } catch (err) {
    statusEl.textContent = `Request failed: ${err.message}`;
  } finally {
    setLoading(false);
  }
});

// new chat resets everything
newChatBtn.addEventListener("click", () => {
  conversation = [
    {
      role: "system",
      content:
        "Stick to less than 150 words. Responses must be clearly structured. Format the output using plain HTML tags (<p>, <ul>, <li>, <strong>, etc.). Do not use Markdown."
    }
  ];
  historyEl.innerHTML = "";
  [outDeepseek, outGemini, outChatgpt].forEach((el) => (el.textContent = ""));
  statusEl.textContent = "Started a new chat.";
});
