import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_collections");

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

  await site.build();
  return site;
}

describe("collections", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("groups pages by tag", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\ntags: [post]\n---\n# Hello`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ collections, content }) => \`<html>\${collections.post.length} posts: \${content}</html>\`;`,
    );

    const site = await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    expect(site.collections.post.length).toBe(1);
    expect(site.collections.all.length).toBe(1);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain("1 posts:");
  });

  it("exposes collections.all", async () => {
    await Bun.write(join(tmpRoot, "content", "a.md"), `---\ntags: [post]\n---\n# A`);
    await Bun.write(join(tmpRoot, "content", "b.md"), `# B`);

    const site = await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    expect(site.collections.all.length).toBe(2);
    expect(site.collections.post.length).toBe(1);
  });

  it("respects excludeFromCollections", async () => {
    await Bun.write(join(tmpRoot, "content", "a.md"), `---\ntags: [post]\n---\n# A`);
    await Bun.write(
      join(tmpRoot, "content", "b.md"),
      `---\ntags: [post]\nexcludeFromCollections: true\n---\n# B`,
    );

    const site = await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    expect(site.collections.post.length).toBe(1);
    expect(site.collections.all.length).toBe(1);
  });
});
