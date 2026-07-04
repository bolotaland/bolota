// Static asset copying plugin using Bun's native I/O and globbing

import { join, relative, resolve } from "node:path";
import type { BolotaConfig } from "../core/config.ts";

/** OS metadata files that should never end up in the built site. */
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);

export function isIgnoredAsset(fileName: string): boolean {
  return IGNORED_FILES.has(fileName);
}

/**
 * Recursively copy the public directory into the output directory.
 * Uses Bun.write for native, zero-copy file creation.
 */
export async function copyAssets(
  config: BolotaConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  const publicDir = resolve(cwd, config.srcDir, config.publicDir);
  const outputDir = resolve(cwd, config.outDir);

  // Bun.file(...).exists() only reports true for files, so use stat() to
  // detect directories. If public/ is missing or is not a directory, skip.
  const publicStat = await Bun.file(publicDir).stat().catch(() => null);
  if (!publicStat?.isDirectory()) {
    return;
  }

  // dot: true so files like .well-known/* or .htaccess are copied too.
  const glob = new Bun.Glob("**/*");
  const copies: Promise<unknown>[] = [];

  for await (const filePath of glob.scan({ cwd: publicDir, absolute: true, dot: true })) {
    const relPath = relative(publicDir, filePath);
    if (isIgnoredAsset(relPath.split(/[\\/]/).pop() ?? "")) {
      continue;
    }
    copies.push(Bun.write(join(outputDir, relPath), Bun.file(filePath)));
  }

  await Promise.all(copies);
}
