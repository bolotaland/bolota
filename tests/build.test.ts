import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
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
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("builds a page and applies its layout", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\ntitle: Hello\nlayout: base\n---\n\n# Hello`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => \`<html><body>\${content}</body></html>\`;`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot };
    const site = new Site(config, tmpRoot);

    site.use({
      name: "markdown",
      async transform(page, site) { return transformMarkdown(page, site); },
    });

    site.use({
      name: "templates",
      async transform(page, site) {
        return applyLayout(page, site);
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
    expect(html).toContain(`<h1 id="hello">Hello</h1>`);
    expect(html).toContain("<body>");
  });

  it("cleans the output directory before rebuilding", async () => {
    await Bun.write(join(tmpRoot, "content", "hello.md"), "# Hello");
    const stalePath = join(tmpRoot, "_site", "stale.html");
    await Bun.write(stalePath, "old");

    const config = { ...baseConfig, srcDir: tmpRoot };
    const site = new Site(config, tmpRoot);
    site.use({
      name: "markdown",
      async transform(page, site) { return transformMarkdown(page, site); },
    });

    await site.build();

    expect(await Bun.file(stalePath).exists()).toBe(false);
  });
});
