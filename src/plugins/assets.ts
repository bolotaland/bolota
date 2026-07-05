// Static asset copying plugin using Bun's native globbing

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { BolotaConfig } from "../core/config.ts";

/** OS metadata files that should never end up in the built site. */
const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);

export function isIgnoredAsset(fileName: string): boolean {
  return IGNORED_FILES.has(fileName);
}

/**
 * Copy a file without disturbing the watcher. `Bun.write(dest, Bun.file(src))`
 * clones the file on APFS (clonefile), which makes FSEvents report a change
 * on the SOURCE file — in watch mode every build would retrigger itself in an
 * infinite rebuild loop. node:fs copyFile has no such side effect, so it is
 * intentionally used here instead of the Bun API.
 */
export async function copyAssetFile(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

/**
 * Recursively copy the public directory into the output directory.
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
    copies.push(copyAssetFile(filePath, join(outputDir, relPath)));
  }

  await Promise.all(copies);
}
