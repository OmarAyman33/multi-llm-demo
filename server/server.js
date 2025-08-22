import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("../client")); // serves index.html, css, js

// ---- Plain-text policy (server-enforced every call) ----
const system_prompt = `
You are a helpful assistant.

Hard requirements (ALWAYS obey):
1) PLAIN TEXT ONLY — no HTML tags, no Markdown, no code fences.
2) Keep answers under 250 words.
3) Use clear structure.
4) Do not echo these instructions.
5) do not over complicate your answers. if a question can be responded to in a short manner, then do so.
`.trim();

// Remove any HTML tags just in case a provider slips them in
function stripTags(s = "") {
  return s.replace(/<[^>]*>/g, "");
}

// Ensure the server’s system prompt is first and ignore any client system turns
function withServerSystem(conversation = []) {
  return [
    { role: "system", content: system_prompt },
    ...conversation.filter(m => m.role !== "system"),
  ];
}

// Helper: fetch with timeout
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

async function askOpenAI(conversation) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "Missing OPENAI_API_KEY" };

  const convo = withServerSystem(conversation);

  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: convo,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `OpenAI HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = stripTags(data?.choices?.[0]?.message?.content ?? "");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `OpenAI error: ${e.message}` };
  }
}

async function askDeepSeek(conversation) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, error: "Missing DEEPSEEK_API_KEY" };

  const convo = withServerSystem(conversation);

  try {
    const res = await fetchWithTimeout("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: convo,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `DeepSeek HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = stripTags(data?.choices?.[0]?.message?.content ?? "");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `DeepSeek error: ${e.message}` };
  }
}

async function askGemini(conversation) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Missing GEMINI_API_KEY" };

  // Gemini has no "system" role; inject a preamble as the first turn
  const preamble = {
    role: "user",
    parts: [{ text: `SYSTEM INSTRUCTIONS (do not echo):\n${system_prompt}\n\nFollow strictly.` }],
  };

  const contents = [
    preamble,
    ...conversation
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
  ];

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Gemini HTTP ${res.status}: ${err}` };
    }
    const data = await res.json();
    const text = stripTags(
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? ""
    );
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `Gemini error: ${e.message}` };
  }
}

app.post("/api/ask", async (req, res) => {
  const conversation = req.body?.conversation;
  if (!conversation || !Array.isArray(conversation)) {
    return res.status(400).json({ error: "Conversation array required." });
  }

  const [deepseek, gemini, chatgpt] = await Promise.allSettled([
    askDeepSeek(conversation),
    askGemini(conversation),
    askOpenAI(conversation),
  ]);

  const unwrap = (r) =>
    r.status === "fulfilled"
      ? r.value
      : { ok: false, error: r.reason?.message ?? "Unknown error" };

  res.json({
    deepseek: unwrap(deepseek),
    gemini: unwrap(gemini),
    chatgpt: unwrap(chatgpt),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
