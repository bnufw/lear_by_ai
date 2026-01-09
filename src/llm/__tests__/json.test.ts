import { describe, expect, it } from "vitest";
import { parseJsonLoosely } from "../json";

describe("parseJsonLoosely", () => {
  it("parses raw JSON", () => {
    const result = parseJsonLoosely<{ a: number }>('{"a":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.a).toBe(1);
  });

  it("parses JSON inside a fenced block", () => {
    const result = parseJsonLoosely<{ ok: boolean }>("```json\n{\"ok\":true}\n```");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ok).toBe(true);
  });
});

