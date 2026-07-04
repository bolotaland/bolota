import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Site } from "../src/core/site.ts";
import { transformMarkdown } from "../src/plugins/markdown.ts";
import { applyLayout, createVentoEnv } from "../src/plugins/vento.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_vento");

const baseConfig: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

async function buildWithConfig(config: BolotaConfig, cwd: string): Promise<string> {
  const site = new Site(config, cwd);
  const env = createVentoEnv(config);

  site.use({
    name: "markdown",
    transform(page) {
      return transformMarkdown(page);
    },
  });

  site.use({
    name: "vento",
    async transform(page) {
      return applyLayout(page, config, env);
    },
  });

  await site.build();
  return await Bun.file(join(cwd, "_site", "hello", "index.html")).text();
}

describe("vento plugin", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
    await mkdir(join(tmpRoot, "content"), { recursive: true });
    await mkdir(join(tmpRoot, "layouts"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("does not auto-trim whitespace by default", async () => {
    await writeFile(
      join(tmpRoot, "content", "hello.md"),
      `---\ntitle: Hello\nlayout: base\n---\n\n# Hello`,
    );
    await writeFile(
      join(tmpRoot, "layouts", "base.vto"),
      `{{ if true }}\n  <p>Keep me</p>\n{{ /if }}`,
    );

    const html = await buildWithConfig({ ...baseConfig, srcDir: tmpRoot }, tmpRoot);
    expect(html).toContain("\n  <p>Keep me</p>\n");
  });

  it("trims whitespace when autoTrim is enabled", async () => {
    await writeFile(
      join(tmpRoot, "content", "hello.md"),
      `---\ntitle: Hello\nlayout: base\n---\n\n# Hello`,
    );
    await writeFile(
      join(tmpRoot, "layouts", "base.vto"),
      `{{ if true }}\n  <p>Trim me</p>\n{{ /if }}`,
    );

    const config = { ...baseConfig, srcDir: tmpRoot, vento: { autoTrim: true } };
    const html = await buildWithConfig(config, tmpRoot);
    expect(html).not.toContain("\n  <p>Trim me</p>\n");
    expect(html).toContain("<p>Trim me</p>");
  });

  it("trims only configured tags when autoTrim.tags is provided", async () => {
    await writeFile(
      join(tmpRoot, "content", "hello.md"),
      `---\ntitle: Hello\nlayout: base\n---\n\n# Hello`,
    );
    await writeFile(
      join(tmpRoot, "layouts", "base.vto"),
      `{{ set message = "Hi" }}\n  <p>{{ message }}</p>\n{{ if true }}\n  <span>Keep</span>\n{{ /if }}`,
    );

    const config = {
      ...baseConfig,
      srcDir: tmpRoot,
      vento: { autoTrim: { tags: ["set", "/set"] } },
    };
    const html = await buildWithConfig(config, tmpRoot);
    // set tag whitespace is trimmed
    expect(html).not.toContain("\n  <p>{{ message }}</p>\n");
    expect(html).toContain("<p>Hi</p>");
    // if tag whitespace is preserved
    expect(html).toContain("\n  <span>Keep</span>\n");
  });
});
