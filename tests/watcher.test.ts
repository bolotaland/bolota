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
