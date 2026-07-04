import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_layouts");

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

  await site.build();
  return site;
}

describe("default layouts", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("uses layouts/index.ts for the homepage", async () => {
    await Bun.write(join(tmpRoot, "content", "index.md"), `# Home`);
    await Bun.write(
      join(tmpRoot, "layouts", "index.ts"),
      `export default ({ content }) => \`<home>\${content}</home>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "index.html")).text();
    expect(html).toContain("<home>");
  });

  it("uses layouts/page.ts for regular pages", async () => {
    await Bun.write(join(tmpRoot, "content", "about.md"), `# About`);
    await Bun.write(
      join(tmpRoot, "layouts", "page.ts"),
      `export default ({ content }) => \`<page>\${content}</page>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "about", "index.html")).text();
    expect(html).toContain("<page>");
  });

  it("uses layouts/section.ts for _index.md", async () => {
    await Bun.write(join(tmpRoot, "content", "blog", "_index.md"), `# Blog`);
    await Bun.write(
      join(tmpRoot, "layouts", "section.ts"),
      `export default ({ content }) => \`<section>\${content}</section>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "blog", "index.html")).text();
    expect(html).toContain("<section>");
  });

  it("uses layouts/404.ts for 404.md", async () => {
    await Bun.write(join(tmpRoot, "content", "404.md"), `# Not found`);
    await Bun.write(
      join(tmpRoot, "layouts", "404.ts"),
      `export default ({ content }) => \`<not-found>\${content}</not-found>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "404", "index.html")).text();
    expect(html).toContain("<not-found>");
  });

  it("frontmatter layout overrides default", async () => {
    await Bun.write(
      join(tmpRoot, "content", "about.md"),
      `---\nlayout: custom\n---\n# About`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "page.ts"),
      `export default ({ content }) => \`<page>\${content}</page>\`;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "custom.ts"),
      `export default ({ content }) => \`<custom>\${content}</custom>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "about", "index.html")).text();
    expect(html).toContain("<custom>");
    expect(html).not.toContain("<page>");
  });
});
