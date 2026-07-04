import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { loadConfig } from "../src/core/config.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_data");

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

describe("shared and global data", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("uses _data.yml at the root to share a layout", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base\nauthor: Root`,
    );
    await Bun.write(join(tmpRoot, "content", "hello.md"), `# Hello`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ author, content }) => \`<html>\${Bun.escapeHTML(String(author))}: \${content}</html>\`;`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot };
    await buildSite(config, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain(`<h1 id="hello">Hello</h1>`);
    expect(html).toContain("Root:");
  });

  it("merges _data.json in subdirectories, child overrides parent", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base\nauthor: Root`,
    );
    await Bun.write(
      join(tmpRoot, "content", "posts", "_data.json"),
      JSON.stringify({ author: "Posts" }),
    );
    await Bun.write(join(tmpRoot, "content", "posts", "hello.md"), `# Post`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ author, content }) => \`<html>\${Bun.escapeHTML(String(author))}: \${content}</html>\`;`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot };
    await buildSite(config, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "posts", "hello", "index.html")).text();
    expect(html).toContain("Posts:");
  });

  it("loads _data.ts with a default export", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.ts"),
      `export default { layout: "base", year: 2026 };`,
    );
    await Bun.write(join(tmpRoot, "content", "hello.md"), `# Hello`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ year, content }) => \`<html>\${year}: \${content}</html>\`;`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot };
    await buildSite(config, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain("2026:");
  });

  it("uses global data from config.data", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base`,
    );
    await Bun.write(join(tmpRoot, "content", "hello.md"), `# Hello`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ globalNumber, content }) => \`<html>\${globalNumber}: \${content}</html>\`;`,
    );

    const config = {
      ...baseConfig,
      srcDir: tmpRoot,
      data: { globalNumber: 42 },
    };
    await buildSite(config, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain("42:");
  });

  it("uses global data from a function config via site.data()", async () => {
    await Bun.write(
      join(tmpRoot, "bolota.config.ts"),
      `export default function (site) {\n        site.data("globalNumber", 99);\n        return { srcDir: ${JSON.stringify(tmpRoot)} };\n      }`,
    );
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base`,
    );
    await Bun.write(join(tmpRoot, "content", "hello.md"), `# Hello`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ globalNumber, content }) => \`<html>\${globalNumber}: \${content}</html>\`;`,
    );

    const { config, data } = await loadConfig(tmpRoot);
    const site = new Site(config, tmpRoot, data);

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

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain("99:");
  });

  it("gives frontmatter priority over shared and global data", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base\nauthor: Shared`,
    );
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nauthor: Frontmatter\n---\n# Hello`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ author, content }) => \`<html>\${Bun.escapeHTML(String(author))}: \${content}</html>\`;`,
    );

    const config = {
      ...baseConfig,
      srcDir: tmpRoot,
      data: { author: "Global" },
      site: { author: "Site" },
    };
    await buildSite(config, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain("Frontmatter:");
  });

  it("applies scoped data only to matching paths", async () => {
    await Bun.write(
      join(tmpRoot, "content", "_data.yml"),
      `layout: base`,
    );
    await Bun.write(join(tmpRoot, "content", "index.md"), `# Home`);
    await Bun.write(join(tmpRoot, "content", "posts", "hello.md"), `# Post`);
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ scopedValue, content }) => \`<html>\${scopedValue ?? "none"}: \${content}</html>\`;`,
    );

    const config = {
      ...baseConfig,
      srcDir: tmpRoot,
      scopedData: { posts: { scopedValue: "posts-only" } },
    };
    await buildSite(config, tmpRoot);

    const homeHtml = await Bun.file(join(tmpRoot, "_site", "index.html")).text();
    expect(homeHtml).toContain("none:");

    const postHtml = await Bun.file(join(tmpRoot, "_site", "posts", "hello", "index.html")).text();
    expect(postHtml).toContain("posts-only:");
  });
});
