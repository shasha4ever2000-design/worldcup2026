// GET /api/og?home=Egypt&away=Belgium&when=Jun%2017&lang=en
// Generates a 1200x630 branded share card (PNG) for social/WhatsApp previews —
// turns every shared match into a branded billboard. Uses workers-og
// (satori + resvg) which runs on the Cloudflare Workers runtime.
import { ImageResponse } from "workers-og";

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const home = esc(url.searchParams.get("home") || "Team A");
  const away = esc(url.searchParams.get("away") || "Team B");
  const when = esc(url.searchParams.get("when") || "FIFA World Cup 2026");
  const tagline = url.searchParams.get("lang") === "ar" ? "توقّع الفائز ←" : "Predict the winner →";

  const html = `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:linear-gradient(135deg,#064e3b,#0b1220);color:#fff;font-family:sans-serif;padding:72px;justify-content:space-between">
    <div style="display:flex;font-size:34px;font-weight:800;color:#facc15;letter-spacing:2px">🏆 FIFA WORLD CUP 2026</div>
    <div style="display:flex;align-items:center;justify-content:center;font-size:92px;font-weight:800;text-align:center">
      ${home}<span style="color:#facc15;margin:0 36px">vs</span>${away}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:36px">
      <span style="opacity:.85">${when}</span>
      <span style="color:#facc15;font-weight:700">${esc(tagline)}</span>
    </div>
  </div>`;

  return new ImageResponse(html, { width: 1200, height: 630 });
}
