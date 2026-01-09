const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
const DEFAULT_API_VERSION = process.env.GEMINI_API_VERSION ?? "v1beta";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_PROMPT_CHARS = 60_000;
const MAX_SYSTEM_CHARS = 20_000;

type Role = "system" | "user" | "assistant";

type LlmMessage = {
  role: Role;
  content: string;
};

type LlmRequest = {
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseJsonSchema?: unknown;
  system?: string;
  prompt?: string;
  messages?: LlmMessage[];
};

type LlmSuccessResponse = {
  ok: true;
  requestId: string;
  model: string;
  outputText: string;
  finishReason?: string;
};

type LlmErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "BAD_REQUEST"
  | "CONFIG_MISSING"
  | "UPSTREAM_UNAUTHORIZED"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

type LlmErrorResponse = {
  ok: false;
  requestId: string;
  error: {
    code: LlmErrorCode;
    message: string;
  };
};

function json(res: any, status: number, body: LlmSuccessResponse | LlmErrorResponse) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function badRequest(res: any, requestId: string, message: string) {
  return json(res, 400, { ok: false, requestId, error: { code: "BAD_REQUEST", message } });
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function validateMessages(messages: unknown): { ok: true; value: LlmMessage[] } | { ok: false; error: string } {
  if (!Array.isArray(messages)) return { ok: false, error: "messages must be an array" };
  const out: LlmMessage[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object") return { ok: false, error: "messages items must be objects" };
    const role = (item as any).role;
    const content = (item as any).content;
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return { ok: false, error: "messages.role must be system|user|assistant" };
    }
    if (typeof content !== "string") return { ok: false, error: "messages.content must be a string" };
    out.push({ role, content });
  }
  return { ok: true, value: out };
}

function toGeminiContents(messages: LlmMessage[]) {
  const contents: Array<{ role?: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: message.content }] });
  }
  return contents;
}

function extractSystemInstruction(request: LlmRequest): string | undefined {
  if (typeof request.system === "string") return request.system;
  const systemMessage = request.messages?.find((m) => m.role === "system")?.content;
  return typeof systemMessage === "string" ? systemMessage : undefined;
}

function buildMessages(request: LlmRequest): LlmMessage[] | null {
  if (Array.isArray(request.messages)) return request.messages;
  if (typeof request.prompt === "string") {
    const system = typeof request.system === "string" ? request.system : undefined;
    return system ? [{ role: "system", content: system }, { role: "user", content: request.prompt }] : [{ role: "user", content: request.prompt }];
  }
  return null;
}

function safeTextLength(text: string, max: number): boolean {
  return text.length <= max;
}

function getUpstreamUrl(model: string) {
  const version = DEFAULT_API_VERSION === "v1" ? "v1" : "v1beta";
  return `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model)}:generateContent`;
}

function mapUpstreamStatusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return "UPSTREAM_UNAUTHORIZED";
  if (status === 429) return "UPSTREAM_RATE_LIMIT";
  if (status >= 400 && status < 500) return "UPSTREAM_ERROR";
  return "UPSTREAM_ERROR";
}

async function readJsonBody(req: any): Promise<unknown> {
  if (req.body != null) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf-8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req: any, res: any) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, {
      ok: false,
      requestId,
      error: { code: "METHOD_NOT_ALLOWED", message: "Use POST /api/llm" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 500, {
      ok: false,
      requestId,
      error: { code: "CONFIG_MISSING", message: "Server is missing GEMINI_API_KEY" },
    });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return badRequest(res, requestId, "Invalid JSON body");
  }

  if (!body || typeof body !== "object") return badRequest(res, requestId, "Body must be a JSON object");
  const request = body as LlmRequest;

  const messages = buildMessages(request);
  if (!messages) return badRequest(res, requestId, "Provide either {prompt} or {messages}");

  const parsed = validateMessages(messages);
  if (!parsed.ok) return badRequest(res, requestId, parsed.error);

  const systemInstruction = extractSystemInstruction({ ...request, messages: parsed.value });
  if (systemInstruction && !safeTextLength(systemInstruction, MAX_SYSTEM_CHARS)) {
    return badRequest(res, requestId, `system is too large (max ${MAX_SYSTEM_CHARS} chars)`);
  }

  const userPrompt = parsed.value.find((m) => m.role === "user")?.content ?? "";
  if (!safeTextLength(userPrompt, MAX_PROMPT_CHARS)) {
    return badRequest(res, requestId, `prompt is too large (max ${MAX_PROMPT_CHARS} chars)`);
  }

  const timeoutMs = clampNumber(request.timeoutMs, 1_000, 60_000) ?? DEFAULT_TIMEOUT_MS;
  const model = typeof request.model === "string" && request.model.trim() ? request.model.trim() : DEFAULT_MODEL;
  const temperature = clampNumber(request.temperature, 0, 2);
  const maxOutputTokens = clampNumber(request.maxOutputTokens, 1, 8192);

  const generationConfig: Record<string, unknown> = {};
  if (temperature != null) generationConfig.temperature = temperature;
  if (maxOutputTokens != null) generationConfig.maxOutputTokens = maxOutputTokens;
  if (typeof request.responseMimeType === "string") generationConfig.responseMimeType = request.responseMimeType;
  if (request.responseJsonSchema != null) generationConfig.responseJsonSchema = request.responseJsonSchema;

  const upstreamPayload: Record<string, unknown> = {
    contents: toGeminiContents(parsed.value),
  };
  if (Object.keys(generationConfig).length) upstreamPayload.generationConfig = generationConfig;
  if (systemInstruction) {
    upstreamPayload.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamRes = await fetch(getUpstreamUrl(model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(upstreamPayload),
      signal: controller.signal,
    });

    const text = await upstreamRes.text();
    const jsonBody = text ? JSON.parse(text) : {};

    if (!upstreamRes.ok) {
      const code = mapUpstreamStatusToCode(upstreamRes.status);
      const message =
        (jsonBody as any)?.error?.message ||
        (jsonBody as any)?.message ||
        `Upstream error (${upstreamRes.status})`;
      return json(res, upstreamRes.status, { ok: false, requestId, error: { code, message } });
    }

    const candidate = (jsonBody as any)?.candidates?.[0];
    const outputText = candidate?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") ?? "";
    const finishReason = candidate?.finishReason;

    return json(res, 200, { ok: true, requestId, model, outputText, finishReason });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return json(res, 504, {
        ok: false,
        requestId,
        error: { code: "TIMEOUT", message: `Timed out after ${timeoutMs}ms` },
      });
    }
    return json(res, 500, {
      ok: false,
      requestId,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  } finally {
    clearTimeout(timeout);
  }
}
