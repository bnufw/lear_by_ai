export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmRequest = {
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

export type LlmErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "BAD_REQUEST"
  | "CONFIG_MISSING"
  | "UPSTREAM_UNAUTHORIZED"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export type LlmSuccessResponse = {
  ok: true;
  requestId: string;
  model: string;
  outputText: string;
  finishReason?: string;
};

export type LlmErrorResponse = {
  ok: false;
  requestId?: string;
  error: {
    code: LlmErrorCode;
    message: string;
  };
  status?: number;
};

export type LlmResponse = LlmSuccessResponse | LlmErrorResponse;

export type LlmClient = {
  generate: (request: LlmRequest, options?: { signal?: AbortSignal }) => Promise<LlmResponse>;
};
