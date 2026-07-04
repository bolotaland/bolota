import { describe, it, expect } from "bun:test";
import { renderMarkdown } from "../src/plugins/markdown.ts";

describe("renderMarkdown", () => {
  it("renders basic markdown", () => {
    expect(renderMarkdown("# Hello")).toContain("<h1>Hello</h1>");
  });

  it("passes markdownOptions to Bun.markdown.html", () => {
    const withoutIds = renderMarkdown("# Hello World");
    expect(withoutIds).toContain("<h1>Hello World</h1>");

    const withIds = renderMarkdown("# Hello World", { headings: { ids: true } });
    expect(withIds).toContain('<h1 id="hello-world">');
  });
});
