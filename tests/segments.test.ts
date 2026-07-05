import { describe, it, expect } from "bun:test";
import { splitInlineCode, transformOutsideCode } from "../src/core/segments.ts";

describe("splitInlineCode", () => {
  it("isolates simple code spans", () => {
    expect(splitInlineCode("a `b` c")).toEqual([
      { text: "a ", code: false },
      { text: "`b`", code: true },
      { text: " c", code: false },
    ]);
  });

  it("matches runs of equal length only", () => {
    // ``…`` may contain a single backtick.
    expect(splitInlineCode("x ``a ` b`` y")).toEqual([
      { text: "x ", code: false },
      { text: "``a ` b``", code: true },
      { text: " y", code: false },
    ]);
  });

  it("leaves unmatched backticks as text", () => {
    expect(splitInlineCode("a ` b")).toEqual([{ text: "a ` b", code: false }]);
  });

  it("rebuilds the input when joined", () => {
    const input = "before `one` mid ``two`` after ` dangling";
    const joined = splitInlineCode(input).map((s) => s.text).join("");
    expect(joined).toBe(input);
  });
});

describe("transformOutsideCode", () => {
  it("skips fenced blocks and inline spans", () => {
    const input = "A\n```\nB\n```\nC `D` E";
    const out = transformOutsideCode(input, (text) => text.toLowerCase());
    expect(out).toBe("a\n```\nB\n```\nc `D` e");
  });
});
