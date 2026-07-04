import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_pipeline");

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

function makeSite(config: BolotaConfig, cwd: string): Site {
  const site = new Site(config, cwd);
  site.use({
    name: "markdown",
    async transform(page, site) { return transformMarkdown(page, site); },
  });
  site.use({
    name: "templates",
    async transform(page, site) { return applyLayout(page, site); },
  });
  return site;
}

describe("phase-based pipeline", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("layouts see the compiled HTML of other pages via collections", async () => {
    await Bun.write(join(tmpRoot, "content", "index.md"), "# Home");
    await Bun.write(
      join(tmpRoot, "content", "posts", "a.md"),
      `---\ntitle: A\ntags: [post]\n---\n# Post A`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "index.ts"),
      `export default ({ collections, content }) => \`\${content}<aside>\${collections.post[0].compiledContent}</aside>\`;`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    const html = await Bun.file(join(tmpRoot, "_site", "index.html")).text();
    expect(html).toContain('<aside><h1 id="post-a">Post A</h1>');
  });

  it("refuses to clean an outDir that contains the project", async () => {
    await Bun.write(join(tmpRoot, "content", "hello.md"), "# Hello");

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot, outDir: "." }, tmpRoot);
    await expect(site.build()).rejects.toThrow(/Refusing to clean/);

    // The content must still exist afterwards.
    expect(await Bun.file(join(tmpRoot, "content", "hello.md")).exists()).toBe(true);
  });

  it("sorts collections by date, newest first", async () => {
    await Bun.write(
      join(tmpRoot, "content", "old.md"),
      `---\ntags: [post]\ndate: 2023-01-01\n---\n# Old`,
    );
    await Bun.write(
      join(tmpRoot, "content", "new.md"),
      `---\ntags: [post]\ndate: 2025-01-01\n---\n# New`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    expect(site.collections.post.map((p) => p.name)).toEqual(["new", "old"]);
  });
});
