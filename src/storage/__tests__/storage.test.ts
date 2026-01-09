import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { type Session } from "../../domain/models";
import { SCHEMA_VERSION } from "../../lib/schema/learning";
import {
  clearAll,
  getLastSessionId,
  getSession,
  resetStorageForTests,
  saveSession,
  setLastSessionId,
} from "../index";

const baseSession = {
  schemaVersion: SCHEMA_VERSION,
  id: "session-1",
  repo: {
    schemaVersion: SCHEMA_VERSION,
    kind: "github",
    url: "https://github.com/vercel/next.js",
    owner: "vercel",
    repo: "next.js",
    fetchedAt: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} satisfies Session;

beforeEach(async () => {
  await resetStorageForTests();
});

describe("storage", () => {
  it("saves and loads sessions", async () => {
    const saved = await saveSession(baseSession);
    expect(saved.ok).toBe(true);

    const loaded = await getSession("session-1");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value?.id).toBe("session-1");
    }
  });

  it("rejects invalid sessions", async () => {
    const result = await saveSession({ ...baseSession, id: "" });
    expect(result.ok).toBe(false);
  });

  it("tracks last session id", async () => {
    await saveSession(baseSession);
    await setLastSessionId("session-1");
    const last = await getLastSessionId();
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.value).toBe("session-1");
    }
  });

  it("clears storage", async () => {
    await saveSession(baseSession);
    const cleared = await clearAll();
    expect(cleared.ok).toBe(true);
    const loaded = await getSession("session-1");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value).toBeNull();
    }
  });
});
