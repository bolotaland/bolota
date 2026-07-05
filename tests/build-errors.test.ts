import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_build_errors");

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

describe("build error collection", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("collects a failing page and still builds the others", async () => {
    await Bun.write(join(tmpRoot, "content", "good.md"), `---\ntitle: Good\n---\n# Good`);
    await Bun.write(
      join(tmpRoot, "content", "bad.md"),
      `---\ntitle: Bad\nlayout: broken\n---\n# Bad`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "page.ts"),
      `export default ({ content }) => \`<page>\${content}</page>\`;`,
    );
    await Bun.write(
      join(tmpRoot, "layouts", "broken.ts"),
      `export default () => { throw new Error("layout exploded"); };`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    expect(site.errors.length).toBe(1);
    expect(site.errors[0].page).toBe("bad.md");
    expect(site.errors[0].plugin).toBe("templates");
    expect(site.errors[0].message).toContain("layout exploded");

    expect(await Bun.file(join(tmpRoot, "_site", "good", "index.html")).exists()).toBe(true);
    expect(await Bun.file(join(tmpRoot, "_site", "bad", "index.html")).exists()).toBe(false);
  });

  it("collects missing explicit layouts as errors", async () => {
    await Bun.write(
      join(tmpRoot, "content", "hello.md"),
      `---\nlayout: nope\n---\n# Hello`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    expect(site.errors.length).toBe(1);
    expect(site.errors[0].message).toContain(`Layout "nope" not found`);
  });

  it("clears errors between builds", async () => {
    const layoutPath = join(tmpRoot, "layouts", "page.ts");
    await Bun.write(join(tmpRoot, "content", "hello.md"), "# Hello");
    await Bun.write(layoutPath, `export default () => { throw new Error("boom"); };`);

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();
    expect(site.errors.length).toBe(1);

    await Bun.sleep(15);
    await Bun.write(layoutPath, `export default ({ content }) => content;`);
    await site.build();
    expect(site.errors.length).toBe(0);
    expect(await Bun.file(join(tmpRoot, "_site", "hello", "index.html")).exists()).toBe(true);
  });

  it("keeps failed pages out of collections", async () => {
    await Bun.write(join(tmpRoot, "content", "good.md"), `---\ntags: [post]\n---\n# Good`);
    await Bun.write(
      join(tmpRoot, "content", "bad.md"),
      `---\ntags: [post]\nlayout: nope\n---\n# Bad`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    expect(site.collections.post.map((p) => p.name)).toEqual(["good"]);
  });
});
