import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetchLlmClient } from "../client";

function makeAbortError(): Error {
  const error = new Error("Aborted");
  (error as any).name = "AbortError";
  return error;
}

function mockFetchNeverResponds() {
  return vi.fn((_url: unknown, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      signal?.addEventListener("abort", () => reject(makeAbortError()), { once: true });
    });
  });
}

describe("createFetchLlmClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as any).fetch = originalFetch;
  });

  it("returns TIMEOUT when /api/llm never responds", async () => {
    (globalThis as any).fetch = mockFetchNeverResponds();
    const client = createFetchLlmClient();

    const promise = client.generate({ system: "s", prompt: "p", timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);

    const res = await promise;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("TIMEOUT");
    }
  });

  it("returns CANCELLED when external signal aborts", async () => {
    (globalThis as any).fetch = mockFetchNeverResponds();
    const client = createFetchLlmClient();
    const controller = new AbortController();

    const promise = client.generate({ system: "s", prompt: "p", timeoutMs: 1000 }, { signal: controller.signal });
    controller.abort();

    const res = await promise;
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("CANCELLED");
    }
  });
});

