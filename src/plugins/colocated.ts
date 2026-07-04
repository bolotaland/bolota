import { dirname, join, relative } from "node:path";
import type { Page } from "../core/pages.ts";
import type { BolotaConfig } from "../core/config.ts";

function isCopyableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return false;
  }
  if (fileName.startsWith("_data.")) {
    return false;
  }
  return true;
}

/**
 * Copy assets co-located with content pages.
 * For a page at content/dir/page.md, copies non-Markdown sibling files
 * to _site/dir/page/.
 */
export async function copyColocatedAssets(
  page: Page,
  config: BolotaConfig,
  cwd: string = process.cwd(),
): Promise<void> {
  const sourceDir = dirname(page.sourcePath);
  const outputDir = join(cwd, config.outDir, dirname(page.outputPath));

  const glob = new Bun.Glob("*");
  for await (const filePath of glob.scan({ cwd: sourceDir, absolute: true })) {
    const fileName = filePath.slice(sourceDir.length + 1);
    if (!isCopyableFile(fileName)) {
      continue;
    }

    const stat = await Bun.file(filePath).stat().catch(() => null);
    if (!stat || stat.isDirectory()) {
      continue;
    }

    await Bun.write(join(outputDir, fileName), Bun.file(filePath));
  }
}
