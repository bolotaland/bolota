import { relative, basename, extname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import type { BolotaConfig } from "./config.ts";

export interface Page {
  /** Absolute filesystem path to the source file */
  sourcePath: string;
  /** Path relative to the configured content directory */
  relativePath: string;
  /** Output path relative to the configured output directory */
  outputPath: string;
  /** Public URL path (e.g. "about/" or "") */
  url: string;
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

function computeOutputPath(relativePath: string, ext: string): string {
  const dirPath = relativePath.slice(0, -ext.length);
  return dirPath.endsWith("index")
    ? `${dirPath}.html`
    : join(dirPath, "index.html");
}

function computeUrl(outputPath: string): string {
  // "about/index.html" -> "about/"
  // "index.html" -> ""
  return outputPath.replace(/index\.html$/i, "");
}

/**
 * Discover all content pages in the content directory.
 * Uses `Bun.Glob` for fast recursive file scanning.
 */
export async function discoverPages(config: BolotaConfig): Promise<Page[]> {
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

    const outputPath = computeOutputPath(relativePath, ext);
    const url = computeUrl(outputPath);

    pages.push({
      sourcePath: filePath,
      relativePath,
      outputPath,
      url,
      rawContent,
      frontmatter,
      body,
      ext,
      name,
    });
  }

  return pages;
}
