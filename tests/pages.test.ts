import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { discoverPages } from "../src/core/pages.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_pages");

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

describe("discoverPages", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("discovers markdown pages with pretty URLs", async () => {
    await Bun.write(join(tmpRoot, "content", "about.md"), "# About");
    await Bun.write(join(tmpRoot, "content", "index.md"), "# Home");

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });
    expect(pages.length).toBe(2);

    const about = pages.find((p) => p.name === "about");
    expect(about?.outputPath).toBe("about/index.html");
    expect(about?.url).toBe("/about/");

    const index = pages.find((p) => p.name === "index");
    expect(index?.outputPath).toBe("index.html");
    expect(index?.url).toBe("/");
    expect(index?.kind).toBe("index");
  });

  it("treats names merely ending in index as regular pages", async () => {
    await Bun.write(join(tmpRoot, "content", "reindex.md"), "# Reindex");
    await Bun.write(join(tmpRoot, "content", "foo_index.md"), "# Foo");

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });

    const reindex = pages.find((p) => p.name === "reindex");
    expect(reindex?.outputPath).toBe("reindex/index.html");
    expect(reindex?.url).toBe("/reindex/");
    expect(reindex?.kind).toBe("page");

    const fooIndex = pages.find((p) => p.name === "foo_index");
    expect(fooIndex?.outputPath).toBe("foo_index/index.html");
    expect(fooIndex?.kind).toBe("page");
  });

  it("strips date prefixes from slugs and infers the date", async () => {
    await Bun.write(join(tmpRoot, "content", "blog", "2024-01-15-hello.md"), "# Hello");

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });
    const post = pages[0];
    expect(post.outputPath).toBe("blog/hello/index.html");
    expect(post.url).toBe("/blog/hello/");
    expect(post.date?.toISOString().slice(0, 10)).toBe("2024-01-15");
  });

  it("recognizes index.markdown as the homepage", async () => {
    await Bun.write(join(tmpRoot, "content", "index.markdown"), "# Home");

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });
    expect(pages[0].kind).toBe("index");
    expect(pages[0].url).toBe("/");
  });

  it("skips headings inside fenced code blocks", async () => {
    await Bun.write(
      join(tmpRoot, "content", "doc.md"),
      "# Real\n\n```sh\n# just a comment\n```\n\n## Also real",
    );

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });
    const slugs = pages[0].headings?.map((h) => h.slug);
    expect(slugs).toEqual(["real", "also-real"]);
  });

  it("deduplicates heading slugs", async () => {
    await Bun.write(join(tmpRoot, "content", "doc.md"), "# Setup\n\n## Setup\n\n## Setup");

    const pages = await discoverPages({ ...baseConfig, srcDir: tmpRoot });
    const slugs = pages[0].headings?.map((h) => h.slug);
    expect(slugs).toEqual(["setup", "setup-1", "setup-2"]);
  });
});
