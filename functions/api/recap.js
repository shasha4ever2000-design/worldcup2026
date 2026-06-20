// GET /api/recap?home=Egypt&away=Belgium&score=2-1&lang=en
// Returns an AI-generated short recap of a finished match, cached in KV.
// Cache key includes the score so a corrected score regenerates the recap.
import { claudeMessage, json } from "../lib/claude.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const home = (url.searchParams.get("home") || "").trim();
  const away = (url.searchParams.get("away") || "").trim();
  const score = (url.searchParams.get("score") || "").trim();
  const lang = url.searchParams.get("lang") === "ar" ? "ar" : "en";

  if (!home || !away || !/^\d+-\d+$/.test(score)) {
    return json({ error: "home, away and a numeric score (e.g. 2-1) are required" }, 400);
  }

  const key = `recap:${lang}:${home}:${away}:${score}`.toLowerCase();
  if (env.WC_CACHE) {
    const cached = await env.WC_CACHE.get(key);
    if (cached) return json({ recap: cached, cached: true });
  }

  const system =
    lang === "ar"
      ? "أنت محرر رياضي. اكتب ملخصاً موجزاً وواقعياً لمباراة كأس العالم 2026 بناءً على النتيجة النهائية فقط، دون اختلاق أحداث أو أهداف محددة."
      : "You are a sports editor. Write a brief, factual recap of a FIFA World Cup 2026 match based only on the final score. Do not invent goalscorers, minutes, or events you weren't given.";
  const prompt = `Final score: ${home} ${score} ${away}. Write a punchy ~80-word recap conveying the result and momentum, without fabricating specific moments.`;

  let recap;
  try {
    recap = await claudeMessage(env, { system, prompt, maxTokens: 260 });
  } catch (e) {
    return json({ error: "generation_failed", detail: String(e) }, 502, 0);
  }

  // Final results don't change — cache for 30 days.
  if (env.WC_CACHE) await env.WC_CACHE.put(key, recap, { expirationTtl: 60 * 60 * 24 * 30 });
  return json({ recap, cached: false });
}
