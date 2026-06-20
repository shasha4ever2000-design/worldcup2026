// GET /api/preview?home=Egypt&away=Belgium&lang=en
// Returns an AI-generated 2-paragraph match preview, cached in KV for 24h.
import { claudeMessage, json } from "../lib/claude.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const home = (url.searchParams.get("home") || "").trim();
  const away = (url.searchParams.get("away") || "").trim();
  const lang = url.searchParams.get("lang") === "ar" ? "ar" : "en";

  if (!home || !away) return json({ error: "home and away are required" }, 400);

  const key = `preview:${lang}:${home}:${away}`.toLowerCase();
  if (env.WC_CACHE) {
    const cached = await env.WC_CACHE.get(key);
    if (cached) return json({ preview: cached, cached: true });
  }

  const system =
    lang === "ar"
      ? "أنت محلل كرة قدم محترف ومحايد. اكتب توقعاً موجزاً لمباراة في كأس العالم 2026 في فقرتين قصيرتين، دون اختلاق إحصاءات أو تشكيلات."
      : "You are a professional, neutral football analyst. Write a concise 2-paragraph preview of a FIFA World Cup 2026 match. Do not invent specific stats, scores, or lineups.";
  const prompt = `Preview the match: ${home} vs ${away}. Keep it under 120 words, engaging and fair to both teams.`;

  let preview;
  try {
    preview = await claudeMessage(env, { system, prompt, maxTokens: 320 });
  } catch (e) {
    return json({ error: "generation_failed", detail: String(e) }, 502, 0);
  }

  if (env.WC_CACHE) await env.WC_CACHE.put(key, preview, { expirationTtl: 60 * 60 * 24 });
  return json({ preview, cached: false });
}
