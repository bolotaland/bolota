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
});
