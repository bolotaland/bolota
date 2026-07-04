// Static asset copying plugin using Bun's native I/O and globbing

import { join, relative } from "node:path";
import type { BolotaConfig } from "../core/config.ts";

/**
 * Recursively copy the public directory into the output directory.
 * Uses Bun.write for native, zero-copy file creation.
 */
export async function copyAssets(
  config: BolotaConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  const publicDir = join(cwd, config.srcDir, config.publicDir);
  const outputDir = join(cwd, config.outDir);

  // Bun.file(...).exists() only reports true for files, so use stat() to
  // detect directories. If public/ is missing or is not a directory, skip.
  const publicStat = await Bun.file(publicDir).stat().catch(() => null);
  if (!publicStat?.isDirectory()) {
    return;
  }

  const glob = new Bun.Glob("**/*");

  for await (const filePath of glob.scan({ cwd: publicDir, absolute: true })) {
    const stat = await Bun.file(filePath).stat();
    if (stat.isDirectory()) {
      continue;
    }

    const relPath = relative(publicDir, filePath);
    const destPath = join(outputDir, relPath);
    await Bun.write(destPath, Bun.file(filePath));
  }
}
