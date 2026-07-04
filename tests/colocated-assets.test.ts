import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import { copyColocatedAssets } from "../src/plugins/colocated.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_colocated");

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

async function buildSite(config: BolotaConfig, cwd: string): Promise<Site> {
  const site = new Site(config, cwd);

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
    name: "colocated",
    async transform(page, site) {
      await copyColocatedAssets(page, config, site.cwd);
      return page;
    },
  });

  await site.build();
  return site;
}

describe("co-located assets", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("copies sibling files inside a leaf bundle", async () => {
    await Bun.write(join(tmpRoot, "content", "post", "index.md"), `# Post`);
    await Bun.write(join(tmpRoot, "content", "post", "diagram.png"), "diagram");
    await Bun.write(join(tmpRoot, "content", "post", "_data.yml"), "layout: page");
    await Bun.write(
      join(tmpRoot, "layouts", "page.ts"),
      `export default ({ content }) => content;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const asset = Bun.file(join(tmpRoot, "_site", "post", "diagram.png"));
    expect(await asset.exists()).toBe(true);
    expect(await asset.text()).toBe("diagram");

    const dataFile = Bun.file(join(tmpRoot, "_site", "post", "_data.yml"));
    expect(await dataFile.exists()).toBe(false);
  });

  it("copies section bundle assets once, not per sibling page", async () => {
    await Bun.write(join(tmpRoot, "content", "blog", "_index.md"), `# Blog`);
    await Bun.write(join(tmpRoot, "content", "blog", "a.md"), `# A`);
    await Bun.write(join(tmpRoot, "content", "blog", "b.md"), `# B`);
    await Bun.write(join(tmpRoot, "content", "blog", "photo.png"), "photo");

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    expect(await Bun.file(join(tmpRoot, "_site", "blog", "photo.png")).exists()).toBe(true);
    expect(await Bun.file(join(tmpRoot, "_site", "blog", "a", "photo.png")).exists()).toBe(false);
    expect(await Bun.file(join(tmpRoot, "_site", "blog", "b", "photo.png")).exists()).toBe(false);
  });

  it("does not copy siblings of a regular named page", async () => {
    await Bun.write(join(tmpRoot, "content", "post.md"), `# Post`);
    await Bun.write(join(tmpRoot, "content", "hero.png"), "fake-image");

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    expect(await Bun.file(join(tmpRoot, "_site", "post", "hero.png")).exists()).toBe(false);
  });
});
