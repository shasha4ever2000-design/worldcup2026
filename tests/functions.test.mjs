import { describe, it, expect, vi, afterEach } from "vitest";
import { claudeMessage } from "../functions/lib/claude.js";
import { onRequestGet as preview } from "../functions/api/preview.js";
import { onRequestGet as recap } from "../functions/api/recap.js";
import { onRequestGet as health } from "../functions/api/health.js";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function anthropicOk(text) {
  return async () => ({
    ok: true,
    json: async () => ({ content: [{ type: "text", text }] }),
  });
}

function kvMock(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    put: vi.fn(async (k, v) => void store.set(k, v)),
  };
}

const ctx = (url, env) => ({ request: new Request(url), env });

describe("claudeMessage", () => {
  it("posts to the Anthropic API with auth headers and returns joined text", async () => {
    const fetchFn = stubFetch(anthropicOk("Hello world"));
    const out = await claudeMessage(
      { ANTHROPIC_API_KEY: "k", CLAUDE_MODEL: "claude-haiku-4-5" },
      { system: "s", prompt: "p" },
    );
    expect(out).toBe("Hello world");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("api.anthropic.com");
    expect(init.headers["x-api-key"]).toBe("k");
    expect(JSON.parse(init.body).model).toBe("claude-haiku-4-5");
  });

  it("throws without an API key (never calls the network)", async () => {
    const fetchFn = stubFetch(anthropicOk("x"));
    await expect(claudeMessage({}, { system: "s", prompt: "p" })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("/api/preview", () => {
  it("400s when teams are missing", async () => {
    const res = await preview(ctx("https://x/api/preview?home=Egypt", { WC_CACHE: kvMock() }));
    expect(res.status).toBe(400);
  });

  it("serves from KV cache without calling Claude", async () => {
    const fetchFn = stubFetch(anthropicOk("fresh"));
    const kv = kvMock({ "preview:en:egypt:belgium": "cached preview" });
    const res = await preview(ctx("https://x/api/preview?home=Egypt&away=Belgium", { WC_CACHE: kv, ANTHROPIC_API_KEY: "k" }));
    const body = await res.json();
    expect(body).toEqual({ preview: "cached preview", cached: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("generates and stores when not cached", async () => {
    stubFetch(anthropicOk("a generated preview"));
    const kv = kvMock();
    const res = await preview(ctx("https://x/api/preview?home=Egypt&away=Belgium", { WC_CACHE: kv, ANTHROPIC_API_KEY: "k" }));
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.preview).toBe("a generated preview");
    expect(kv.put).toHaveBeenCalledWith("preview:en:egypt:belgium", "a generated preview", expect.any(Object));
  });

  it("returns 502 when generation fails", async () => {
    stubFetch(async () => ({ ok: false, status: 500, text: async () => "boom" }));
    const res = await preview(ctx("https://x/api/preview?home=A&away=B", { WC_CACHE: kvMock(), ANTHROPIC_API_KEY: "k" }));
    expect(res.status).toBe(502);
  });
});

describe("/api/recap", () => {
  it("requires a numeric score", async () => {
    const res = await recap(ctx("https://x/api/recap?home=A&away=B&score=win", { WC_CACHE: kvMock() }));
    expect(res.status).toBe(400);
  });

  it("keys the cache by score so a correction regenerates", async () => {
    stubFetch(anthropicOk("recap text"));
    const kv = kvMock();
    const res = await recap(ctx("https://x/api/recap?home=A&away=B&score=2-1", { WC_CACHE: kv, ANTHROPIC_API_KEY: "k" }));
    expect((await res.json()).recap).toBe("recap text");
    expect(kv.put).toHaveBeenCalledWith("recap:en:a:b:2-1", "recap text", expect.any(Object));
  });
});

describe("/api/health", () => {
  it("reports binding configuration", async () => {
    const res = await health(ctx("https://x/api/health", { ANTHROPIC_API_KEY: "k", WC_CACHE: kvMock() }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, aiConfigured: true, cacheConfigured: true });
  });
});
