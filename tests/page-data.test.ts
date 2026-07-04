import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { discoverPages, extractHeadings } from "../src/core/pages.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_page_data");

afterAll(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

const baseConfig: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

describe("page data", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("infers page kind from filename", async () => {
    await Bun.write(join(tmpRoot, "content", "index.md"), `# Home`);
    await Bun.write(join(tmpRoot, "content", "about.md"), `# About`);
    await Bun.write(join(tmpRoot, "content", "blog", "_index.md"), `# Blog`);

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });

    const index = pages.find((p) => p.name === "index");
    const about = pages.find((p) => p.name === "about");
    const section = pages.find((p) => p.name === "_index");

    expect(index?.kind).toBe("index");
    expect(about?.kind).toBe("page");
    expect(section?.kind).toBe("section");
  });

  it("infers date from frontmatter", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\ndate: 2024-03-15\n---\n# Hello`,
    );

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });

    expect(pages[0].date).toEqual(new Date("2024-03-15"));
  });

  it("infers date from filename prefix", async () => {
    await Bun.write(join(tmpRoot, "content", "2024-03-15-hello.md"), `# Hello`);

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });

    expect(pages[0].date).toEqual(new Date("2024-03-15"));
  });

  it("extracts headings from markdown body", async () => {
    const body = `# Title\n\n## Section A\n\n## Section A`;
    const headings = extractHeadings(body);

    expect(headings).toEqual([
      { depth: 1, text: "Title", slug: "title" },
      { depth: 2, text: "Section A", slug: "section-a" },
      { depth: 2, text: "Section A", slug: "section-a-1" },
    ]);
  });

  it("exposes headings on page object", async () => {
    await Bun.write(join(tmpRoot, "content", "hello.md"), `# Title\n\n## Section`);

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });

    expect(pages[0].headings).toEqual([
      { depth: 1, text: "Title", slug: "title" },
      { depth: 2, text: "Section", slug: "section" },
    ]);
  });
});
