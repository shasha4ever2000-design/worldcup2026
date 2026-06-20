// Thin wrapper around the Anthropic Messages API for Cloudflare Pages Functions.
// The API key is read from the environment (a Pages secret) and never exposed
// to the browser.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Call Claude and return the concatenated text output.
 * @param {object} env  Cloudflare env bindings (needs ANTHROPIC_API_KEY).
 * @param {object} opts { system, prompt, model?, maxTokens? }
 */
export async function claudeMessage(env, { system, prompt, model, maxTokens = 400 }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: model || env.CLAUDE_MODEL || "claude-haiku-4-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("").trim();
}

/** JSON Response helper with permissive CORS + sensible caching. */
export function json(obj, status = 200, maxAge = 3600) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
}
