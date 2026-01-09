import type { GitHubError } from "../github/types";
import type { LlmErrorResponse } from "../llm/types";

export function formatGitHubError(error: GitHubError): string {
  switch (error.code) {
    case "INVALID_REPO_URL":
      return `仓库地址无效：${error.message}`;
    case "NOT_FOUND":
      return "仓库不存在（404）。请确认 URL 是否正确且为 public 仓库。";
    case "NOT_PUBLIC":
      return "该仓库不是 public，当前不支持 private 仓库。";
    case "RATE_LIMITED":
      return "GitHub 触发 rate limit（403/429）。请稍后再试，或换一个网络环境。";
    case "REPO_TOO_LARGE":
      return `仓库过大或超出安全上限：${error.message}`;
    case "TIMEOUT":
      return "GitHub 请求超时。请稍后再试。";
    case "CANCELLED":
      return "已取消 GitHub 请求。";
    case "FETCH_FAILED":
    default:
      return `GitHub 请求失败：${error.message}`;
  }
}

export function formatLlmError(error: LlmErrorResponse["error"]): string {
  switch (error.code) {
    case "CONFIG_MISSING":
      return "服务端缺少 GEMINI_API_KEY 配置。";
    case "UPSTREAM_UNAUTHORIZED":
      return "Gemini 鉴权失败（API key 无效或权限不足）。";
    case "UPSTREAM_RATE_LIMIT":
      return "Gemini 触发 rate limit。请稍后再试。";
    case "TIMEOUT":
      return "LLM 请求超时。";
    case "CANCELLED":
      return "已取消 LLM 请求。";
    case "BAD_REQUEST":
      return `LLM 请求参数错误：${error.message}`;
    case "INVALID_RESPONSE":
      return "LLM 返回了无法解析的响应。";
    case "NETWORK_ERROR":
      return "网络请求失败。";
    case "UPSTREAM_ERROR":
    case "INTERNAL_ERROR":
    default:
      return `LLM 调用失败：${error.message}`;
  }
}

