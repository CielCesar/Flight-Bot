const OpenAI = require("openai");

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

async function extractQueryParams({ text, model }) {
  const client = getClient();

  const today = new Date().toISOString().slice(0, 10);
  const system = `
    Today is ${today}.
    You extract flight search parameters.

    Return ONLY valid JSON.

    Rules:
    - "date" must be ISO format YYYY-MM-DD.
    - Use current year if not specified.
    - Resolve relative dates like "next Wednesday" to actual date.
    - Cabin must be one of: economy, premium_economy, business, first.
    - If missing required info, return {"need_clarification": true, "question": "..."}.
    - If a city is given, prefer a representative airport code (e.g., Tokyo Haneda -> HND).
    `;

  const user = `User text: ${text}`;

  const resp = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = resp.choices?.[0]?.message?.content || "";
  return content;
}

module.exports = { extractQueryParams };