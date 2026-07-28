import { describe, it, expect, vi, afterEach } from "vitest";
import { geminiGenerate, QuotaExhaustedError } from "./text";

/**
 * A 429 means two different things and the difference matters to the user:
 * a rate limit clears in seconds, an exhausted daily quota does not clear
 * today. Retrying the second just stalls before showing an error they need
 * to act on, so the distinction is tested, not assumed.
 */

function mockFetch(responses: { status: number; body: string }[]) {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => JSON.parse(r.body),
      text: async () => r.body,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const okBody = JSON.stringify({
  candidates: [{ content: { parts: [{ text: "hello" }] } }],
});

/** The real shape Gemini returns when a free-tier key is spent. */
const quotaBody = JSON.stringify({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests",
    status: "RESOURCE_EXHAUSTED",
  },
});

const rateLimitBody = JSON.stringify({
  error: { code: 429, message: "Too many requests. Please slow down.", status: "RESOURCE_EXHAUSTED" },
});

const opts = { apiKey: "k", model: "m" };
const msgs = [{ role: "user" as const, content: "hi" }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("geminiGenerate", () => {
  it("returns text on success", async () => {
    mockFetch([{ status: 200, body: okBody }]);
    await expect(geminiGenerate(opts, msgs)).resolves.toBe("hello");
  });

  it("fails immediately on an exhausted quota instead of retrying", async () => {
    const fetchMock = mockFetch([{ status: 429, body: quotaBody }]);
    await expect(geminiGenerate(opts, msgs)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tells the user what to actually do about a spent quota", async () => {
    mockFetch([{ status: 429, body: quotaBody }]);
    await expect(geminiGenerate(opts, msgs)).rejects.toThrow(/billing|tomorrow/i);
  });

  it("does not waste the fallback chain on a per-key quota limit", async () => {
    // Quota is per key, not per model — trying the next model cannot help.
    const fetchMock = mockFetch([{ status: 429, body: quotaBody }]);
    await expect(
      geminiGenerate({ ...opts, fallbackModels: ["m2", "m3"] }, msgs),
    ).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a plain rate limit and succeeds", async () => {
    mockFetch([
      { status: 429, body: rateLimitBody },
      { status: 200, body: okBody },
    ]);
    await expect(geminiGenerate(opts, msgs)).resolves.toBe("hello");
  });

  it("retries transient server errors", async () => {
    mockFetch([
      { status: 503, body: "overloaded" },
      { status: 200, body: okBody },
    ]);
    await expect(geminiGenerate(opts, msgs)).resolves.toBe("hello");
  });

  it("does not retry a bad request", async () => {
    // A 400 fails identically every time; retrying burns the user's quota.
    const fetchMock = mockFetch([{ status: 400, body: "bad schema" }]);
    await expect(geminiGenerate(opts, msgs)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to a fallback model when one is unavailable", async () => {
    mockFetch([
      { status: 503, body: "overloaded" },
      { status: 503, body: "overloaded" },
      { status: 503, body: "overloaded" },
      { status: 503, body: "overloaded" },
      { status: 200, body: okBody },
    ]);
    await expect(
      geminiGenerate({ ...opts, maxAttempts: 4, fallbackModels: ["m2"] }, msgs),
    ).resolves.toBe("hello");
  });
});
