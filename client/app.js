const form = document.getElementById("prompt-form");
const textarea = document.getElementById("prompt");
const askBtn = document.getElementById("ask");
const statusEl = document.getElementById("status");

const outDeepseek = document.getElementById("out-deepseek");
const outGemini = document.getElementById("out-gemini");
const outChatgpt = document.getElementById("out-chatgpt");

function setLoading(isLoading) {
  askBtn.disabled = isLoading;
  statusEl.textContent = isLoading ? "Waiting for all models..." : "";
  [outDeepseek, outGemini, outChatgpt].forEach(el => {
    el.textContent = isLoading ? "" : el.textContent;
    if (isLoading) {
      el.classList.add("skeleton");
    } else {
      el.classList.remove("skeleton");
    }
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = textarea.value.trim();
  if (!prompt) {
    statusEl.textContent = "Please enter a prompt.";
    return;
  }

  // adding the prompt to history.
  const li = document.createElement("li");
  li.textContent = prompt;
  historyEl.prepend(li);

  textarea.value = "";
  setLoading(true);

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error ${res.status}: ${text}`);
    }
    const data = await res.json();

    // Fill outputs (success or error per model)
    const apply = (el, result) => {
      if (result?.ok) el.innerHTML = result.text || "(empty)";
      else el.textContent = `⚠️ ${result?.error || "Unknown error"}`;
    };

    apply(outDeepseek, data.deepseek);
    apply(outGemini, data.gemini);
    apply(outChatgpt, data.chatgpt);
  } catch (err) {
    outDeepseek.textContent = "";
    outGemini.textContent = "";
    outChatgpt.textContent = "";
    statusEl.textContent = `Request failed: ${err.message}`;
  } finally {
    setLoading(false);
  }
});
