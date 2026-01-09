import type {
  GitHubRepoRef,
  GitHubResult,
  RepoContext,
  RepoFile,
  RepoFileCategory,
  RepoIngestOptions,
} from "./types";

type GitHubRepoApiResponse = {
  default_branch?: string;
  description?: string | null;
  private?: boolean;
  visibility?: string;
};

type GitTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type GitTreeResponse = {
  truncated?: boolean;
  tree?: GitTreeEntry[];
};

const DEFAULT_OPTIONS: Required<RepoIngestOptions> = {
  maxFiles: 28,
  maxBytes: 240_000,
  maxFileBytes: 60_000,
  maxDepth: 4,
  timeoutMs: 12_000,
};

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "tar",
  "7z",
  "rar",
  "mp4",
  "mp3",
  "wav",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "exe",
  "dll",
  "bin",
  "dmg",
]);

const SKIP_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "vendor",
  "target",
  "out",
]);

const CONFIG_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "gemfile",
  "composer.json",
]);

const ENTRYPOINT_REGEX = /^(src|app|lib)\/(main|index)\.[jt]sx?$/i;

export function parseGitHubRepoUrl(input: string): GitHubResult<GitHubRepoRef> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: { code: "INVALID_REPO_URL", message: "Repo URL is empty" } };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(\.git)?$/i);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return { ok: true, value: { owner, repo, url: `https://github.com/${owner}/${repo}` } };
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    if (url.hostname !== "github.com") {
      return { ok: false, error: { code: "INVALID_REPO_URL", message: "Only github.com URLs are supported" } };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      return { ok: false, error: { code: "INVALID_REPO_URL", message: "Repo URL must include owner/repo" } };
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) {
      return { ok: false, error: { code: "INVALID_REPO_URL", message: "Invalid owner or repo" } };
    }
    return { ok: true, value: { owner, repo, url: `https://github.com/${owner}/${repo}` } };
  } catch {
    return { ok: false, error: { code: "INVALID_REPO_URL", message: "Invalid repo URL" } };
  }
}

export async function fetchRepoContext(
  input: string | GitHubRepoRef,
  options: RepoIngestOptions = {},
): Promise<GitHubResult<RepoContext>> {
  const resolved = typeof input === "string" ? parseGitHubRepoUrl(input) : { ok: true, value: input };
  if (!resolved.ok) return resolved;

  const repo = resolved.value;
  const config = { ...DEFAULT_OPTIONS, ...options };

  const repoInfo = await fetchRepoInfo(repo, config.timeoutMs);
  if (!repoInfo.ok) return repoInfo;

  const tree = await fetchRepoTree(repo, repoInfo.value.defaultBranch, config.timeoutMs);
  if (!tree.ok) return tree;

  const selection = selectRepoFiles(tree.value, config);
  if (!selection.ok) return selection;

  const files = await fetchSelectedFiles(repo, repoInfo.value.defaultBranch, selection.value.selected, config);
  if (!files.ok) return files;

  const stats = {
    totalTreeFiles: selection.value.totalTreeFiles,
    selectedFiles: files.value.files.length,
    totalBytes: files.value.files.reduce((sum, file) => sum + file.size, 0),
    skippedFiles: selection.value.skippedCount + files.value.skippedByFetch,
  };

  return {
    ok: true,
    value: {
      repo: {
        ...repo,
        defaultBranch: repoInfo.value.defaultBranch,
        description: repoInfo.value.description ?? undefined,
        fetchedAt: new Date().toISOString(),
      },
      files: files.value.files,
      selectedPaths: files.value.files.map((file) => file.path),
      stats,
      warnings: selection.value.warnings,
    },
  };
}

async function fetchRepoInfo(repo: GitHubRepoRef, timeoutMs: number) {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const response = await fetchJson<GitHubRepoApiResponse>(url, timeoutMs);
  if (!response.ok) return response;

  const defaultBranch = response.value.default_branch;
  if (!defaultBranch) {
    return { ok: false, error: { code: "FETCH_FAILED", message: "Missing default branch" } };
  }

  if (response.value.private || response.value.visibility === "private") {
    return { ok: false, error: { code: "NOT_PUBLIC", message: "Private repositories are not supported" } };
  }

  return {
    ok: true,
    value: {
      defaultBranch,
      description: response.value.description ?? undefined,
    },
  };
}

async function fetchRepoTree(repo: GitHubRepoRef, branch: string, timeoutMs: number) {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const response = await fetchJson<GitTreeResponse>(url, timeoutMs);
  if (!response.ok) return response;

  if (response.value.truncated) {
    return { ok: false, error: { code: "REPO_TOO_LARGE", message: "Repo tree is too large to ingest safely" } };
  }

  const tree = response.value.tree ?? [];
  return { ok: true, value: tree };
}

function selectRepoFiles(tree: GitTreeEntry[], options: Required<RepoIngestOptions>) {
  const candidates = tree.filter((entry) => entry.type === "blob" && Boolean(entry.path));
  const scored = [];
  let skippedCount = 0;
  const warnings: string[] = [];

  for (const entry of candidates) {
    if (shouldSkipPath(entry.path, options.maxDepth)) {
      skippedCount += 1;
      continue;
    }
    const size = entry.size ?? 0;
    if (size > options.maxFileBytes) {
      skippedCount += 1;
      continue;
    }
    if (!isLikelyText(entry.path)) {
      skippedCount += 1;
      continue;
    }
    const { score, category } = scorePath(entry.path);
    scored.push({ path: entry.path, size, score, category });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const depthDiff = pathDepth(a.path) - pathDepth(b.path);
    if (depthDiff !== 0) return depthDiff;
    return a.path.localeCompare(b.path);
  });

  const selected: Array<{ path: string; size: number; category: RepoFileCategory }> = [];
  let totalBytes = 0;
  for (const item of scored) {
    if (selected.length >= options.maxFiles) break;
    if (totalBytes + item.size > options.maxBytes) {
      warnings.push("File selection capped by total bytes limit.");
      continue;
    }
    selected.push({ path: item.path, size: item.size, category: item.category });
    totalBytes += item.size;
  }

  if (!selected.length) {
    return {
      ok: false,
      error: { code: "REPO_TOO_LARGE", message: "No eligible files found within size limits" },
    };
  }

  return {
    ok: true,
    value: {
      selected,
      totalTreeFiles: candidates.length,
      skippedCount,
      warnings,
    },
  };
}

async function fetchSelectedFiles(
  repo: GitHubRepoRef,
  branch: string,
  selected: Array<{ path: string; size: number; category: RepoFileCategory }>,
  options: Required<RepoIngestOptions>,
): Promise<GitHubResult<{ files: RepoFile[]; skippedByFetch: number }>> {
  const files: RepoFile[] = [];
  let skippedByFetch = 0;

  for (const file of selected) {
    const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${encodeURIComponent(branch)}/${encodePath(file.path)}`;
    const text = await fetchText(rawUrl, options.maxFileBytes, options.timeoutMs);
    if (!text.ok) {
      skippedByFetch += 1;
      continue;
    }
    files.push({
      path: file.path,
      size: file.size,
      content: text.value,
      sourceUrl: rawUrl,
      category: file.category,
    });
  }

  if (!files.length) {
    return { ok: false, error: { code: "REPO_TOO_LARGE", message: "Failed to fetch any files" } };
  }

  return { ok: true, value: { files, skippedByFetch } };
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<GitHubResult<T>> {
  const response = await fetchWithTimeout(url, timeoutMs, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return response;

  const json = (await response.value.json().catch(() => ({}))) as T;
  return { ok: true, value: json };
}

async function fetchText(url: string, maxBytes: number, timeoutMs: number): Promise<GitHubResult<string>> {
  const response = await fetchWithTimeout(url, timeoutMs, {});
  if (!response.ok) return response;

  const lengthHeader = response.value.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > maxBytes) {
    return { ok: false, error: { code: "REPO_TOO_LARGE", message: "File exceeds size limit" } };
  }

  const text = await response.value.text();
  if (text.length > maxBytes) {
    return { ok: false, error: { code: "REPO_TOO_LARGE", message: "File exceeds size limit" } };
  }
  return { ok: true, value: text };
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit,
): Promise<GitHubResult<Response>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const message = await safeReadMessage(response);
      return { ok: false, error: mapGitHubError(response, message) };
    }
    return { ok: true, value: response };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { ok: false, error: { code: "TIMEOUT", message: "GitHub request timed out" } };
    }
    return { ok: false, error: { code: "FETCH_FAILED", message: "Network request failed" } };
  } finally {
    clearTimeout(timeout);
  }
}

function mapGitHubError(response: Response, message: string): GitHubResult<never>["error"] {
  if (response.status === 404) {
    return { code: "NOT_FOUND", message: "Repository not found" };
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(message)))
  ) {
    return { code: "RATE_LIMITED", message: "GitHub rate limit exceeded" };
  }
  return { code: "FETCH_FAILED", message: `GitHub request failed (${response.status})` };
}

async function safeReadMessage(response: Response): Promise<string> {
  try {
    const data = await response.clone().json();
    if (data && typeof data.message === "string") return data.message;
  } catch {
    // ignore
  }
  return response.statusText || "Request failed";
}

function pathDepth(path: string): number {
  return path.split("/").length;
}

function shouldSkipPath(path: string, maxDepth: number): boolean {
  const segments = path.split("/");
  if (segments.length > maxDepth) return true;
  return segments.some((segment) => SKIP_SEGMENTS.has(segment));
}

function isLikelyText(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!ext) return true;
  return !BINARY_EXTENSIONS.has(ext);
}

function scorePath(path: string): { score: number; category: RepoFileCategory } {
  const lower = path.toLowerCase();
  if (!path.includes("/") && lower.startsWith("readme")) {
    return { score: 100, category: "readme" };
  }
  if (lower.startsWith("docs/") || lower.startsWith("doc/") || lower.startsWith("documentation/")) {
    return { score: 85, category: "docs" };
  }
  const filename = lower.split("/").pop() ?? lower;
  if (CONFIG_FILES.has(filename)) {
    return { score: 70, category: "config" };
  }
  if (ENTRYPOINT_REGEX.test(lower)) {
    return { score: 60, category: "entrypoint" };
  }
  if (lower.endsWith(".md")) {
    return { score: 45, category: "docs" };
  }
  return { score: 20, category: "other" };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export const __internal = {
  selectRepoFiles,
};
