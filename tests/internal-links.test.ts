import { describe, it, expect } from "bun:test";
import { resolveInternalLinks } from "../src/core/links.ts";

describe("resolveInternalLinks", () => {
  it("resolves @/about.md to /about/", () => {
    const result = resolveInternalLinks("[About](@/about.md)");
    expect(result).toBe("[About](/about/)");
  });

  it("resolves @/blog/post.md to /blog/post/", () => {
    const result = resolveInternalLinks("[Post](@/blog/post.md)");
    expect(result).toBe("[Post](/blog/post/)");
  });

  it("resolves @/index.md to /", () => {
    const result = resolveInternalLinks("[Home](@/index.md)");
    expect(result).toBe("[Home](/)");
  });

  it("resolves @/blog/_index.md to /blog/", () => {
    const result = resolveInternalLinks("[Blog](@/blog/_index.md)");
    expect(result).toBe("[Blog](/blog/)");
  });

  it("leaves external links unchanged", () => {
    const result = resolveInternalLinks("[External](https://example.com)");
    expect(result).toBe("[External](https://example.com)");
  });

  it("preserves fragments", () => {
    const result = resolveInternalLinks("[Team](@/about.md#team)");
    expect(result).toBe("[Team](/about/#team)");
  });

  it("strips date prefixes like page slugs do", () => {
    const result = resolveInternalLinks("[Post](@/blog/2024-01-15-hello.md)");
    expect(result).toBe("[Post](/blog/hello/)");
  });

  it("leaves links inside fenced code blocks untouched", () => {
    const content = "```md\n[About](@/about.md)\n```\n\n[About](@/about.md)";
    const result = resolveInternalLinks(content);
    expect(result).toBe("```md\n[About](@/about.md)\n```\n\n[About](/about/)");
  });

  it("leaves links inside inline code spans untouched", () => {
    const content = "Use `[About](@/about.md)` to link. [About](@/about.md)";
    const result = resolveInternalLinks(content);
    expect(result).toBe("Use `[About](@/about.md)` to link. [About](/about/)");
  });
});
