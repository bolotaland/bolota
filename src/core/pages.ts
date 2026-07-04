import { relative, basename, extname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import type { BolotaConfig } from "./config.ts";

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

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
  /** Page kind: homepage, section landing, or regular page */
  kind: "page" | "section" | "index";
  /** Optional publication date (frontmatter or inferred from filename) */
  date?: Date;
  /** Headings extracted from the Markdown body */
  headings?: Heading[];
  /** HTML body after Markdown rendering */
  compiledContent?: string;
}

function computeOutputPath(relativePath: string, ext: string): string {
  const dirPath = relativePath.slice(0, -ext.length);

  // Section landing pages: content/dir/_index.md -> dir/index.html
  if (dirPath.endsWith("_index")) {
    const parentDir = dirPath.slice(0, -"_index".length);
    return parentDir ? join(parentDir, "index.html") : "index.html";
  }

  // Named index pages: content/dir/index.md -> dir/index.html
  if (dirPath.endsWith("index")) {
    return `${dirPath}.html`;
  }

  return join(dirPath, "index.html");
}

function computeUrl(outputPath: string): string {
  // "about/index.html" -> "about/"
  // "index.html" -> ""
  return outputPath.replace(/index\.html$/i, "");
}

function inferPageKind(name: string, relativePath: string): Page["kind"] {
  if (name === "index" && relativePath.replace(/\.md$/i, "") === "index") {
    return "index";
  }
  if (name === "_index") {
    return "section";
  }
  return "page";
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return undefined;
}

function inferDate(name: string, frontmatter: Record<string, unknown>): Date | undefined {
  const fromFrontmatter = parseDate(frontmatter.date);
  if (fromFrontmatter) {
    return fromFrontmatter;
  }

  // Filenames like 2024-01-15-hello.md
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (match) {
    const date = new Date(match[1]);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return undefined;
}

export function extractHeadings(body: string): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const regex = /^(#{1,6})\s+(.+)$/gm;

  for (const match of body.matchAll(regex)) {
    const text = match[2].trim();
    let slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count > 0) {
      slug = `${slug}-${count}`;
    }

    headings.push({
      depth: match[1].length,
      text,
      slug,
    });
  }

  return headings;
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
    const kind = inferPageKind(name, relativePath);
    const date = inferDate(name, frontmatter);

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
      kind,
      date,
      headings: extractHeadings(body),
    });
  }

  return pages;
}
