// Static asset copying plugin using Bun's native I/O and globbing

import { join, relative, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { BolotaConfig } from "../core/config.ts";

/**
 * Recursively copy the public directory into the output directory.
 * Uses node:fs/promises to avoid Bun.write side-effects.
 */
export async function copyAssets(config: BolotaConfig, cwd: string = process.cwd()): Promise<void> {
  const publicDir = join(cwd, config.srcDir, config.publicDir);
  const outputDir = join(cwd, config.outDir);

  const glob = new Bun.Glob("**/*");

  for await (const filePath of glob.scan({ cwd: publicDir, absolute: true })) {
    const stat = await Bun.file(filePath).stat();
    if (stat.isDirectory()) {
      continue;
    }

    const relPath = relative(publicDir, filePath);
    const destPath = join(outputDir, relPath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, await Bun.file(filePath).arrayBuffer());
  }
}
