import { relative, basename, extname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import type { IgnisConfig } from "./config.ts";

export interface Page {
  /** Absolute filesystem path to the source file */
  sourcePath: string;
  /** Path relative to the configured content directory */
  relativePath: string;
  /** Output path relative to the configured output directory */
  outputPath: string;
  /** Raw file content (including frontmatter) */
  rawContent: string;
  /** Parsed frontmatter metadata */
  frontmatter: Record<string, unknown>;
  /** Content after frontmatter removal */
  body: string;
  /** File extension (e.g., `.md`, `.markdown`) */
  ext: string;
  /** Base name without extension */
  name: string;
}

/**
 * Discover all content pages in the content directory.
 * Uses `Bun.Glob` for fast recursive file scanning.
 */
export async function discoverPages(config: IgnisConfig): Promise<Page[]> {
  const pages: Page[] = [];
  const contentPath = join(config.srcDir, config.contentDir);
  const glob = new Bun.Glob("**/*.{md,markdown}");

  for await (const filePath of glob.scan({ cwd: contentPath, absolute: true })) {
    const ext = extname(filePath);
    const f = Bun.file(filePath);
    const rawContent = await f.text();
    const { frontmatter, body } = parseFrontmatter(rawContent);

    const relativePath = relative(contentPath, filePath);
    const name = basename(filePath, ext);

    const dirPath = relativePath.slice(0, -ext.length);
    const outputPath = dirPath.endsWith("index") ? `${dirPath}.html` : join(dirPath, "index.html");

    pages.push({
      sourcePath: filePath,
      relativePath,
      outputPath,
      rawContent,
      frontmatter,
      body,
      ext,
      name,
    });
  }

  return pages;
}
