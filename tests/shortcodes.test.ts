import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_shortcodes");

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

describe("shortcodes", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("replaces shortcodes with rendered output", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n# Hello\n\n{{ youtube(id="abc123") }}`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => \`<html>\${content}</html>\`;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "shortcodes", "youtube.ts"),
      `export default ({ id }) => \`<iframe src="https://www.youtube.com/embed/\${id}"></iframe>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('src="https://www.youtube.com/embed/abc123"');
  });

  it("parses string, number, and boolean args", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: base\n---\n{{ button(text="Click", count=3, primary=true) }}`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "base.ts"),
      `export default ({ content }) => content;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "shortcodes", "button.ts"),
      `export default ({ text, count, primary }) => \`<button data-count="\${count}" data-primary="\${primary}">\${text}</button>\`;`,
    );

    await buildSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);

    const html = await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).text();
    expect(html).toContain('data-count="3"');
    expect(html).toContain('data-primary="true"');
    expect(html).toContain(">Click</button>");
  });
});
