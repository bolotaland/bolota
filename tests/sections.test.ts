import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_sections");

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

describe("sections", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("exposes section.pages in section layouts", async () => {
    await Bun.write(
      join(tmpRoot, "content", "blog", "_index.md"),
      `---\nlayout: section\ntitle: Blog\n---\n# Blog`,
    );
    await Bun.write(join(tmpRoot, "content", "blog", "first.md"), `---\ntitle: First\n---\n# First`);
    await Bun.write(join(tmpRoot, "content", "blog", "second.md"), `---\ntitle: Second\n---\n# Second`);
    await Bun.write(
      join(tmpRoot, "layouts", "section.ts"),
      `export default ({ section, content }) => \`<section><ul>\${section.pages.map(p => \`<li>\${p.frontmatter.title}</li>\`).join("")}</ul>\${content}</section>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "blog", "index.html")).text();
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<li>Second</li>");
  });

  it("sorts section.pages by date, newest first", async () => {
    await Bun.write(
      join(tmpRoot, "content", "blog", "_index.md"),
      `---\nlayout: section\nsort_by: date\n---\n# Blog`,
    );
    await Bun.write(
      join(tmpRoot, "content", "blog", "a.md"),
      `---\ntitle: A\ndate: 2024-01-01\n---\n# A`,
    );
    await Bun.write(
      join(tmpRoot, "content", "blog", "b.md"),
      `---\ntitle: B\ndate: 2024-01-02\n---\n# B`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "section.ts"),
      `export default ({ section }) => \`<section>\${section.pages.map(p => p.frontmatter.title ?? p.name).join(",")}</section>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "blog", "index.html")).text();
    expect(html).toContain("<section>B,A</section>");
  });

  it("sorts section.pages by name, with reverse support", async () => {
    await Bun.write(
      join(tmpRoot, "content", "blog", "_index.md"),
      `---\nlayout: section\nsort_by: name\nreverse: true\n---\n# Blog`,
    );
    await Bun.write(join(tmpRoot, "content", "blog", "b.md"), `---\ntitle: B\n---\n# B`);
    await Bun.write(join(tmpRoot, "content", "blog", "a.md"), `---\ntitle: A\n---\n# A`);
    await Bun.write(join(tmpRoot, "content", "blog", "c.md"), `---\ntitle: C\n---\n# C`);
    await Bun.write(
      join(tmpRoot, "layouts", "section.ts"),
      `export default ({ section }) => \`<section>\${section.pages.map(p => p.frontmatter.title ?? p.name).join(",")}</section>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "blog", "index.html")).text();
    expect(html).toContain("<section>C,B,A</section>");
  });
});
