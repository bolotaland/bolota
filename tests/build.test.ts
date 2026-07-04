import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout, createVentoEnv } from "../src/plugins/vento.ts";
import { copyAssets } from "../src/plugins/assets.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_build");

const baseConfig: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

describe("Site.build", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
    await mkdir(join(tmpRoot, "content"), { recursive: true });
    await mkdir(join(tmpRoot, "layouts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("builds a page and applies its layout", async () => {
    await writeFile(
      join(tmpRoot, "content", "hello.md"),
      `---\ntitle: Hello\nlayout: base\n---\n\n# Hello`,
    );
    await writeFile(
      join(tmpRoot, "layouts", "base.vto"),
      `<html><body>{{ content |> safe }}</body></html>`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot };
    const site = new Site(config, tmpRoot);
    const env = createVentoEnv(config);

    site.use({
      name: "markdown",
      transform(page) {
        return transformMarkdown(page);
      },
    });

    site.use({
      name: "vento",
      async transform(page) {
        return applyLayout(page, config, env);
      },
    });

    site.use({
      name: "assets",
      async buildEnd() {
        await copyAssets(config, tmpRoot);
      },
    });

    await site.build();

    expect(site.pages.length).toBe(1);

    const outputFile = Bun.file(join(tmpRoot, "_site", "hello", "index.html"));
    expect(await outputFile.exists()).toBe(true);

    const html = await outputFile.text();
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<body>");
  });

  it("cleans the output directory before rebuilding", async () => {
    await writeFile(join(tmpRoot, "content", "hello.md"), "# Hello");
    const stalePath = join(tmpRoot, "_site", "stale.html");
    await mkdir(join(tmpRoot, "_site"), { recursive: true });
    await writeFile(stalePath, "old");

    const config = { ...baseConfig, srcDir: tmpRoot };
    const site = new Site(config, tmpRoot);
    site.use({
      name: "markdown",
      transform(page) {
        return transformMarkdown(page);
      },
    });

    await site.build();

    expect(await Bun.file(stalePath).exists()).toBe(false);
  });
});
