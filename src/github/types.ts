export type GitHubRepoRef = {
  owner: string;
  repo: string;
  url: string;
};

export type RepoFileCategory = "readme" | "docs" | "config" | "entrypoint" | "other";

export type RepoFile = {
  path: string;
  size: number;
  content: string;
  sourceUrl: string;
  category: RepoFileCategory;
};

export type RepoContext = {
  repo: GitHubRepoRef & {
    defaultBranch: string;
    description?: string;
    fetchedAt: string;
  };
  files: RepoFile[];
  selectedPaths: string[];
  stats: {
    totalTreeFiles: number;
    selectedFiles: number;
    totalBytes: number;
    skippedFiles: number;
  };
  warnings: string[];
};

export type RepoIngestOptions = {
  maxFiles?: number;
  maxBytes?: number;
  maxFileBytes?: number;
  maxDepth?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type GitHubErrorCode =
  | "INVALID_REPO_URL"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "REPO_TOO_LARGE"
  | "NOT_PUBLIC"
  | "FETCH_FAILED"
  | "TIMEOUT"
  | "CANCELLED";

export type GitHubError = {
  code: GitHubErrorCode;
  message: string;
};

export type GitHubResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GitHubError };
