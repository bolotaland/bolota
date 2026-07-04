import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout } from "../src/plugins/templates.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_watch_reload");

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

describe("rebuilds pick up module changes (watch mode)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("reloads an edited layout on the next build", async () => {
    const layoutPath = join(tmpRoot, "layouts", "page.ts");
    await Bun.write(join(tmpRoot, "content", "hello.md"), "# Hello");
    await Bun.write(layoutPath, `export default ({ content }) => \`<v1>\${content}</v1>\`;`);

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    const outPath = join(tmpRoot, "_site", "hello", "index.html");
    expect(await Bun.file(outPath).text()).toContain("<v1>");

    // Ensure a different mtime, then rebuild with the same Site instance,
    // as the watcher does.
    await Bun.sleep(15);
    await Bun.write(layoutPath, `export default ({ content }) => \`<v2>\${content}</v2>\`;`);
    await site.build();

    expect(await Bun.file(outPath).text()).toContain("<v2>");
  });

  it("reloads an edited _data.ts file on the next build", async () => {
    const dataPath = join(tmpRoot, "content", "_data.ts");
    await Bun.write(join(tmpRoot, "content", "hello.md"), "# Hello");
    await Bun.write(dataPath, `export default { label: "v1" };`);
    await Bun.write(
      join(tmpRoot, "layouts", "page.ts"),
      `export default ({ label, content }) => \`<p>\${label}</p>\${content}\`;`,
    );

    const site = makeSite({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    await site.build();

    const outPath = join(tmpRoot, "_site", "hello", "index.html");
    expect(await Bun.file(outPath).text()).toContain("<p>v1</p>");

    await Bun.sleep(15);
    await Bun.write(dataPath, `export default { label: "v2" };`);
    await site.build();

    expect(await Bun.file(outPath).text()).toContain("<p>v2</p>");
  });
});
