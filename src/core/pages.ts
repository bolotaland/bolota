import { relative, basename, extname, resolve, sep } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import { slugify } from "./html.ts";
import { splitCodeFences } from "./segments.ts";
import type { BolotaConfig } from "./config.ts";

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

export interface Page {
  /** Absolute filesystem path to the source file */
  sourcePath: string;
  /** Path relative to the configured content directory, always "/"-separated */
  relativePath: string;
  /** Output path relative to the configured output directory, always "/"-separated */
  outputPath: string;
  /** Public URL path (e.g. "/about/" or "/") */
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

/** Filenames like 2024-01-15-hello.md: date prefix, then the slug. */
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

function computeOutputPath(relativePath: string, ext: string): string {
  const segments = relativePath.slice(0, -ext.length).split("/");
  const name = segments.pop() ?? "";

  // index.md and _index.md both map to their directory's index.html.
  // Compare the basename, not a suffix: "reindex.md" is a regular page.
  if (name === "index" || name === "_index") {
    return [...segments, "index.html"].join("/");
  }

  // Strip a leading date from the slug: 2024-01-15-hello.md -> hello/
  const slug = name.replace(DATE_PREFIX, "$2");
  return [...segments, slug, "index.html"].join("/");
}

function computeUrl(outputPath: string): string {
  // "about/index.html" -> "/about/"
  // "index.html" -> "/"
  return `/${outputPath.replace(/index\.html$/i, "")}`;
}

/**
 * Map a content-relative source path (e.g. "blog/post.md") to its public URL
 * (e.g. "/blog/post/"). Used by internal `@/` link resolution.
 */
export function urlForContentPath(relativePath: string): string {
  const normalized = relativePath.split(sep).join("/");
  return computeUrl(computeOutputPath(normalized, extname(normalized)));
}

function inferPageKind(name: string, relativePath: string, ext: string): Page["kind"] {
  if (name === "index" && relativePath === `index${ext}`) {
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

  const match = name.match(DATE_PREFIX);
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

  for (const segment of splitCodeFences(body)) {
    if (segment.code) {
      continue;
    }
    for (const match of segment.text.matchAll(regex)) {
      const text = match[2].trim();
      let slug = slugify(text);

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
  }

  return headings;
}

/**
 * Discover all content pages in the content directory.
 * Uses `Bun.Glob` for fast recursive file scanning.
 */
export async function discoverPages(
  config: BolotaConfig,
  cwd: string = process.cwd(),
): Promise<Page[]> {
  const pages: Page[] = [];
  const contentPath = resolve(cwd, config.srcDir, config.contentDir);
  const glob = new Bun.Glob("**/*.{md,markdown}");

  for await (const filePath of glob.scan({ cwd: contentPath, absolute: true })) {
    const ext = extname(filePath);
    const rawContent = await Bun.file(filePath).text();

    const relativePath = relative(contentPath, filePath).split(sep).join("/");
    let frontmatter: Record<string, unknown>;
    let body: string;
    try {
      ({ frontmatter, body } = parseFrontmatter(rawContent));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid frontmatter in "${relativePath}": ${message}`);
    }

    const name = basename(filePath, ext);

    const outputPath = computeOutputPath(relativePath, ext);
    const url = computeUrl(outputPath);
    const kind = inferPageKind(name, relativePath, ext);
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
