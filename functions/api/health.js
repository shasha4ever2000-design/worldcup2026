// GET /api/health — quick check that functions are deployed and bindings exist.
import { json } from "../lib/claude.js";

export async function onRequestGet(context) {
  const { env } = context;
  return json({
    ok: true,
    aiConfigured: Boolean(env.ANTHROPIC_API_KEY),
    cacheConfigured: Boolean(env.WC_CACHE),
    model: env.CLAUDE_MODEL || "claude-haiku-4-5",
  });
}
