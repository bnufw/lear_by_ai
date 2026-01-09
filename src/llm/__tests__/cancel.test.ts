import { describe, expect, it, vi } from "vitest";
import type { RepoContext } from "../../github/types";
import type { LlmClient, LlmResponse } from "../types";
import { generatePlan } from "../orchestrators";

function makeRepoContext(): RepoContext {
  return {
    repo: {
      owner: "vercel",
      repo: "next.js",
      url: "https://github.com/vercel/next.js",
      defaultBranch: "main",
      fetchedAt: new Date().toISOString(),
      description: "Test repo",
    },
    files: [
      {
        path: "README.md",
        size: 10,
        content: "Hello",
        sourceUrl: "https://example.com/readme",
        category: "readme",
      },
    ],
    selectedPaths: ["README.md"],
    stats: { totalTreeFiles: 1, selectedFiles: 1, totalBytes: 10, skippedFiles: 0 },
    warnings: [],
  };
}

function makeMockClient(response: LlmResponse): LlmClient {
  return { generate: vi.fn(async () => response) };
}

describe("cancellation", () => {
  it("throws CANCELLED for generatePlan", async () => {
    const repo = makeRepoContext();
    const client = makeMockClient({ ok: false, error: { code: "CANCELLED", message: "cancelled" } });
    await expect(generatePlan(repo, { client, maxAttempts: 1 })).rejects.toThrow("CANCELLED");
  });
});

