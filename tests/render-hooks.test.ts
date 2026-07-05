import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_render_hooks");

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
    async transform(page, site) {
      return transformMarkdown(page, site);
    },
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

describe("render hooks", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("customizes image rendering", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Hello\n\n![Alt text](/image.png)`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "_markup", "render-image.ts"),
      `export default ({ src, alt }) => \`<figure><img src="\${src}" alt="\${alt}" loading="lazy"><figcaption>\${alt}</figcaption></figure>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption>Alt text</figcaption>");
  });

  it("matches elements regardless of attribute order", async () => {
    const site = new Site({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await Bun.write(
      join(tmpRoot, "layouts", "_markup", "render-image.ts"),
      `export default ({ src, alt }) => \`<img class="hooked" src="\${src}" alt="\${alt}">\`;`,
    );

    const { applyRenderHooks } = await import("../src/core/render-hooks.ts");
    const html = await applyRenderHooks(`<p><img alt="A" src="/x.png"></p>`, site);
    expect(html).toContain('class="hooked"');
    expect(html).toContain('src="/x.png"');
  });

  it("preserves inline markup in headings without a hook", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Hello *world*`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('<h1 id="hello-world">Hello <em>world</em></h1>');
  });

  it("passes flattened text of rich headings to the hook", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Hello *world*`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "_markup", "render-heading.ts"),
      `export default ({ depth, text, slug }) => \`<h\${depth} id="\${slug}" data-text="\${text}">\${text}</h\${depth}>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('data-text="Hello world"');
    expect(html).toContain('id="hello-world"');
  });

  it("deduplicates heading ids like page.headings", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Setup\n\n## Setup`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('<h1 id="setup">');
    expect(html).toContain('<h2 id="setup-1">');
  });

  it("leaves links with non-text content untouched even with a hook", async () => {
    const site = new Site({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await Bun.write(
      join(tmpRoot, "layouts", "_markup", "render-link.ts"),
      `export default ({ href, text }) => \`<a class="hooked" href="\${href}">\${text}</a>\`;`,
    );

    const { applyRenderHooks } = await import("../src/core/render-hooks.ts");
    const input = `<p><a href="/x/"><img src="/i.png" alt=""></a> <a href="/y/">plain</a></p>`;
    const html = await applyRenderHooks(input, site);
    expect(html).toContain('<a href="/x/"><img src="/i.png" alt=""></a>');
    expect(html).toContain('<a class="hooked" href="/y/">plain</a>');
  });

  it("customizes heading rendering", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Title\n\n## Section`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "_markup", "render-heading.ts"),
      `export default ({ depth, text, slug }) => \`<h\${depth} id="\${slug}"><a href="#\${slug}">#</a> \${text}</h\${depth}>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('<h1 id="title">');
    expect(html).toContain('<a href="#title">#</a>');
  });
});
