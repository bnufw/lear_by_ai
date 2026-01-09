export type JsonParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

function extractBalanced(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1).trim();
}

export function parseJsonLoosely<T = unknown>(text: string): JsonParseResult<T> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Empty output" };

  try {
    return { ok: true, value: JSON.parse(trimmed) as T };
  } catch {
    // fall through
  }

  const block = extractCodeBlock(trimmed);
  if (block) {
    try {
      return { ok: true, value: JSON.parse(block) as T };
    } catch {
      // fall through
    }
  }

  const obj = extractBalanced(trimmed, "{", "}");
  if (obj) {
    try {
      return { ok: true, value: JSON.parse(obj) as T };
    } catch {
      // fall through
    }
  }

  const arr = extractBalanced(trimmed, "[", "]");
  if (arr) {
    try {
      return { ok: true, value: JSON.parse(arr) as T };
    } catch {
      // fall through
    }
  }

  return { ok: false, error: "Failed to parse JSON" };
}

