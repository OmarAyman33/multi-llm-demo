import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Serve the static client
app.use(express.static("../client"));

// Add system prompt here so you can play with it easily
const system_prompt = `
Stick to less than 150 words.
Responses must be clearly structured.
stick to plain text only.
Do not use Markdown.
`;


// Helper function: fetch with timeout
async function fetchWithTimeout(url, options = {}, ms = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function askOpenAI(userPrompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "Missing OPENAI_API_KEY" };

  const fullPrompt = `system instructions:\n${system_prompt}\n\nuser prompt:\n${userPrompt}`;

  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `OpenAI HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `OpenAI error: ${e.message}` };
  }
}

async function askDeepSeek(userPrompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, error: "Missing DEEPSEEK_API_KEY" };

  const fullPrompt = `system instructions:\n${system_prompt}\n\nuser prompt:\n${userPrompt}`;

  try {
    const res = await fetchWithTimeout("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: fullPrompt }],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `DeepSeek HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `DeepSeek error: ${e.message}` };
  }
}

async function askGemini(userPrompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Missing GEMINI_API_KEY" };

  const fullPrompt = `system instructions:\n${system_prompt}\n\nuser prompt:\n${userPrompt}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Gemini HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `Gemini error: ${e.message}` };
  }
}

app.post("/api/ask", async (req, res) => {
  const prompt = (req.body?.prompt ?? "").toString().trim();
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  // Kick off all three in parallel
  const [deepseek, gemini, chatgpt] = await Promise.allSettled([
    askDeepSeek(prompt),
    askGemini(prompt),
    askOpenAI(prompt)
  ]);

  const unwrap = (r) => (r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message ?? "Unknown error" });

  res.json({
    deepseek: unwrap(deepseek),
    gemini: unwrap(gemini),
    chatgpt: unwrap(chatgpt)
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
