import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { discoverPages } from "../src/core/pages.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_pages");

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
    expect(about?.outputPath).toBe(join("about", "index.html"));
    expect(about?.url).toBe("about/");

    const index = pages.find((p) => p.name === "index");
    expect(index?.outputPath).toBe("index.html");
    expect(index?.url).toBe("");
  });
});
