import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { watchFiles } from "../src/plugins/watcher.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_watcher");

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

describe("watchFiles", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("does not throw when watched directories are missing", async () => {
    // Only content/ exists; layouts/ and public/ are absent.
    await mkdir(join(tmpRoot, "content"), { recursive: true });

    const cleanup = watchFiles({ ...baseConfig, srcDir: tmpRoot }, async () => {}, tmpRoot);
    cleanup();
  });

  it("does not retrigger itself when the build copies public assets", async () => {
    // Regression: Bun.write(dest, Bun.file(src)) clones on APFS and FSEvents
    // reports a change on the SOURCE file, causing an infinite rebuild loop.
    await Bun.write(join(tmpRoot, "public", "style.css"), "body{}");
    await mkdir(join(tmpRoot, "content"), { recursive: true });

    const config = { ...baseConfig, srcDir: tmpRoot, outDir: join(tmpRoot, "_site") };

    let calls = 0;
    const cleanup = watchFiles(config, async () => { calls++; }, tmpRoot);

    // Drain FSEvents from the setup writes above, then measure only the copy.
    await Bun.sleep(500);
    calls = 0;

    const { copyAssets } = await import("../src/plugins/assets.ts");
    await copyAssets(config, tmpRoot);

    // Wait past the debounce window: the copy must not fire the watcher.
    await Bun.sleep(800);
    cleanup();

    expect(calls).toBe(0);
  });

  it("triggers the callback on file changes", async () => {
    await mkdir(join(tmpRoot, "content"), { recursive: true });

    let calls = 0;
    const cleanup = watchFiles(
      { ...baseConfig, srcDir: tmpRoot },
      async () => {
        calls++;
      },
      tmpRoot,
    );

    await Bun.sleep(50);
    await Bun.write(join(tmpRoot, "content", "new.md"), "# New");

    // Debounce is 300ms; wait for it to flush.
    const deadline = Date.now() + 2000;
    while (calls === 0 && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    cleanup();

    expect(calls).toBe(1);
  });
});
