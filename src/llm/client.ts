import type { LlmClient, LlmErrorResponse, LlmRequest, LlmResponse } from "./types";

const DEFAULT_CLIENT_TIMEOUT_MS = 30_000;

function asError(code: LlmErrorResponse["error"]["code"], message: string, status?: number): LlmErrorResponse {
  return { ok: false, error: { code, message }, status };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createFetchLlmClient(baseUrl = ""): LlmClient {
  return {
    async generate(request: LlmRequest, options?: { signal?: AbortSignal }): Promise<LlmResponse> {
      const externalSignal = options?.signal;
      const timeoutMs = request.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS;
      const controller = new AbortController();

      let didTimeout = false;
      const timeout = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs);

      try {
        if (externalSignal) {
          if (externalSignal.aborted) controller.abort();
          else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        const res = await fetch(`${baseUrl}/api/llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        const status = res.status;
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          return asError("INVALID_RESPONSE", "Failed to parse /api/llm JSON response", status);
        }

        if (!isObject(data) || typeof data.ok !== "boolean") {
          return asError("INVALID_RESPONSE", "Invalid /api/llm response shape", status);
        }

        return { ...(data as any), status } satisfies LlmResponse;
      } catch (error: any) {
        if (error?.name === "AbortError") {
          if (externalSignal?.aborted) return asError("CANCELLED", "Request cancelled");
          if (didTimeout) return asError("TIMEOUT", `Request timed out after ${timeoutMs}ms`);
          return asError("CANCELLED", "Request cancelled");
        }
        return asError("NETWORK_ERROR", "Network request failed");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
