import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SW_SRC = readFileSync(join(ROOT, "sw.js"), "utf8");
const VERSION = SW_SRC.match(/const VERSION\s*=\s*"([^"]+)"/)[1];

// ---- Minimal Cache Storage mock ------------------------------------------
function makeCaches() {
  const store = new Map(); // name -> Map(url -> response)
  return {
    store,
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name);
      return {
        async put(req, res) {
          c.set(typeof req === "string" ? req : req.url, res);
        },
        async match(req) {
          return c.get(typeof req === "string" ? req : req.url);
        },
      };
    },
    async match(req) {
      const url = typeof req === "string" ? req : req.url;
      for (const c of store.values()) if (c.has(url)) return c.get(url);
      return undefined;
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
  };
}

function makeResponse(body, { ok = true, url = "" } = {}) {
  return { body, ok, url, clone() { return makeResponse(body, { ok, url }); } };
}

function loadSW({ fetchImpl }) {
  const listeners = {};
  const self = {
    addEventListener: (type, cb) => {
      (listeners[type] ||= []).push(cb);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: { showNotification: () => {} },
    location: { origin: "https://example.com" },
  };
  const caches = makeCaches();
  const sandbox = {
    self,
    caches,
    fetch: fetchImpl,
    URL,
    location: self.location,
    console: { log() {}, warn() {}, error() {} },
    Promise,
    Event: class {},
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SRC, sandbox);
  return { listeners, caches, self };
}

// Build a fetch event whose respondWith captures the resolved response.
function fetchEvent(listeners, request) {
  let captured = "__none__";
  const e = {
    request,
    respondWith(p) {
      captured = Promise.resolve(p);
    },
  };
  listeners.fetch.forEach((cb) => cb(e));
  return captured;
}

describe("service worker caching strategies", () => {
  let env;
  beforeEach(() => {
    env = null;
  });

  it("scores.json is network-first and caches the response", async () => {
    const net = makeResponse("live", { url: "https://example.com/scores.json" });
    env = loadSW({ fetchImpl: async () => net });
    const captured = fetchEvent(env.listeners, {
      url: "https://example.com/scores.json",
      method: "GET",
    });
    const res = await captured;
    expect(res.body).toBe("live");
    // written into the active cache
    const cached = await env.caches.match("https://example.com/scores.json");
    expect(cached.body).toBe("live");
  });

  it("scores.json falls back to cache when offline", async () => {
    env = loadSW({ fetchImpl: async () => { throw new Error("offline"); } });
    const c = await env.caches.open("seed");
    await c.put("https://example.com/scores.json", makeResponse("cached", {
      url: "https://example.com/scores.json",
    }));
    const res = await fetchEvent(env.listeners, {
      url: "https://example.com/scores.json",
      method: "GET",
    });
    expect(res.body).toBe("cached");
  });

  it("does not intercept cross-origin requests (e.g. weather API)", async () => {
    env = loadSW({ fetchImpl: async () => makeResponse("x") });
    const captured = fetchEvent(env.listeners, {
      url: "https://api.open-meteo.com/v1/forecast?x=1",
      method: "GET",
    });
    expect(captured).toBe("__none__"); // respondWith never called → browser default
  });

  it("ignores non-GET requests", async () => {
    env = loadSW({ fetchImpl: async () => makeResponse("x") });
    const captured = fetchEvent(env.listeners, {
      url: "https://example.com/scores.json",
      method: "POST",
    });
    expect(captured).toBe("__none__");
  });

  it("activate purges caches from older versions", async () => {
    env = loadSW({ fetchImpl: async () => makeResponse("x") });
    await env.caches.open("wc2026-old");
    await env.caches.open(VERSION); // current VERSION parsed from sw.js
    let done;
    const e = { waitUntil: (p) => (done = p) };
    env.listeners.activate.forEach((cb) => cb(e));
    await done;
    const remaining = await env.caches.keys();
    expect(remaining).toContain(VERSION);
    expect(remaining).not.toContain("wc2026-old");
    expect(remaining).not.toContain("wc2026-v1");
  });
});
