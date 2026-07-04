import { describe, it, expect } from "bun:test";
import { parseFrontmatter } from "../src/core/frontmatter.ts";

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const result = parseFrontmatter(`---\ntitle: Hello\n---\n\nBody here.`);
    expect(result.frontmatter).toEqual({ title: "Hello" });
    expect(result.body).toBe("Body here.");
  });

  it("parses TOML frontmatter with ---toml marker", () => {
    const result = parseFrontmatter(`---toml\ntitle = "Hello"\n---\n\nBody here.`);
    expect(result.frontmatter).toEqual({ title: "Hello" });
    expect(result.body).toBe("Body here.");
  });

  it("parses legacy TOML frontmatter with +++", () => {
    const result = parseFrontmatter(`+++\ntitle = "Hello"\n+++\n\nBody here.`);
    expect(result.frontmatter).toEqual({ title: "Hello" });
    expect(result.body).toBe("Body here.");
  });

  it("returns empty frontmatter when no delimiter is present", () => {
    const result = parseFrontmatter("Just body content.");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Just body content.");
  });

  it("returns empty object for empty YAML block", () => {
    const result = parseFrontmatter(`---\n---\nBody.`);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Body.");
  });

  it("ignores --- appearing inside a frontmatter value", () => {
    const result = parseFrontmatter(`---\ntitle: foo---bar\n---\nBody`);
    expect(result.frontmatter).toEqual({ title: "foo---bar" });
    expect(result.body).toBe("Body");
  });

  it("does not treat a leading horizontal rule as frontmatter", () => {
    const content = `---\njust some text\n---\nmore text`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("requires the opening delimiter to be alone on its line", () => {
    const content = `--- not frontmatter\ntext\n---\nbody`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("requires the closing delimiter to be alone on its line", () => {
    const content = `---\ntitle: x\n--- trailing\nbody`;
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles CRLF line endings", () => {
    const result = parseFrontmatter(`---\r\ntitle: Hello\r\n---\r\nBody`);
    expect(result.frontmatter).toEqual({ title: "Hello" });
    expect(result.body).toBe("Body");
  });
});
