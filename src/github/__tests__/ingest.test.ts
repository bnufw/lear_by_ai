import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchRepoContext, parseGitHubRepoUrl, __internal } from "../ingest";

const { selectRepoFiles } = __internal;

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

function textResponse(body: string, status = 200, headers?: Record<string, string>) {
  return new Response(body, { status, headers });
}

describe("parseGitHubRepoUrl", () => {
  it("parses https URLs", () => {
    const result = parseGitHubRepoUrl("https://github.com/foo/bar");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.owner).toBe("foo");
      expect(result.value.repo).toBe("bar");
      expect(result.value.url).toBe("https://github.com/foo/bar");
    }
  });

  it("parses URLs without protocol and trims .git", () => {
    const result = parseGitHubRepoUrl("github.com/foo/bar.git");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repo).toBe("bar");
    }
  });
});

describe("selectRepoFiles", () => {
  it("prioritizes readme/docs/config/entrypoint and enforces caps", () => {
    const tree: Array<{ path: string; type: "blob"; size: number }> = [
      { path: "README.md", type: "blob", size: 100 },
      { path: "docs/guide.md", type: "blob", size: 200 },
      { path: "package.json", type: "blob", size: 150 },
      { path: "src/main.ts", type: "blob", size: 120 },
      { path: "assets/logo.png", type: "blob", size: 80 },
      { path: "dist/bundle.js", type: "blob", size: 100 },
    ];

    const result = selectRepoFiles(tree, {
      maxFiles: 3,
      maxBytes: 1000,
      maxFileBytes: 1000,
      maxDepth: 3,
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      const paths = result.value.selected.map((item) => item.path);
      expect(paths).toEqual(["README.md", "docs/guide.md", "package.json"]);
    }
  });
});

describe("fetchRepoContext", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("handles repo not found", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, 404));
    const result = await fetchRepoContext("https://github.com/ghost/missing");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("handles rate limit", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      jsonResponse({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" }),
    );
    const result = await fetchRepoContext("https://github.com/ghost/rate-limit");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
    }
  });

  it("returns selected files and content", async () => {
    const mockFetch = globalThis.fetch as any;
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ default_branch: "main", description: "Demo" }, 200))
      .mockResolvedValueOnce(
        jsonResponse({
          truncated: false,
          tree: [
            { path: "README.md", type: "blob", size: 20 },
            { path: "docs/guide.md", type: "blob", size: 20 },
            { path: "assets/logo.png", type: "blob", size: 20 },
          ],
        }),
      )
      .mockResolvedValueOnce(textResponse("Hello readme", 200, { "content-length": "12" }))
      .mockResolvedValueOnce(textResponse("Guide content", 200, { "content-length": "13" }));

    const result = await fetchRepoContext("https://github.com/vercel/next.js", {
      maxFiles: 2,
      maxBytes: 200,
      maxFileBytes: 100,
      maxDepth: 4,
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files).toHaveLength(2);
      expect(result.value.files[0].path).toBe("README.md");
      expect(result.value.repo.defaultBranch).toBe("main");
    }
  });
});
