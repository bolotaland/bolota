import { dirname, join, resolve } from "node:path";
import type { Page } from "../core/pages.ts";
import type { BolotaConfig } from "../core/config.ts";
import { isIgnoredAsset } from "./assets.ts";

function isCopyableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return false;
  }
  if (fileName.startsWith("_data.")) {
    return false;
  }
  if (isIgnoredAsset(fileName)) {
    return false;
  }
  return true;
}

/**
 * Copy assets co-located with a page bundle (a directory owned by an
 * `index.md` or `_index.md` file), Hugo-style. Regular sibling pages do not
 * carry their directory's assets — that would copy every asset once per page.
 */
export async function copyColocatedAssets(
  page: Page,
  config: BolotaConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  if (page.name !== "index" && page.name !== "_index") {
    return;
  }

  const sourceDir = dirname(page.sourcePath);
  const outputDir = resolve(cwd, config.outDir, dirname(page.outputPath));

  const glob = new Bun.Glob("*");
  const copies: Promise<unknown>[] = [];

  for await (const filePath of glob.scan({ cwd: sourceDir, absolute: true })) {
    const fileName = filePath.slice(sourceDir.length + 1);
    if (!isCopyableFile(fileName)) {
      continue;
    }
    copies.push(Bun.write(join(outputDir, fileName), Bun.file(filePath)));
  }

  await Promise.all(copies);
}
