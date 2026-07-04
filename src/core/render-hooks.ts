import { join, resolve } from "node:path";
import { importFresh } from "./modules.ts";
import { slugify } from "./html.ts";
import type { Site } from "./site.ts";

export interface RenderImageData {
  src: string;
  alt: string;
  title?: string;
}

export interface RenderLinkData {
  href: string;
  text: string;
  title?: string;
}

export interface RenderHeadingData {
  depth: number;
  text: string;
  slug: string;
}

type RenderHook = (data: Record<string, unknown>) => string | Promise<string>;

async function findRenderHook(site: Site, name: string): Promise<RenderHook | null> {
  const hooksDir = resolve(site.cwd, site.config.srcDir, site.config.layoutsDir, "_markup");

  for (const ext of [".ts", ".js"]) {
    const path = join(hooksDir, `${name}${ext}`);
    if (await Bun.file(path).exists()) {
      const module = await importFresh(path);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Render hook "${name}" at "${path}" must export a function.`);
      }
      return fn as RenderHook;
    }
  }

  return null;
}

/** Resolve a render hook, memoized per build to avoid per-element FS lookups. */
function loadRenderHook(site: Site, name: string): Promise<RenderHook | null> {
  const cacheKey = `render-hook:${name}`;
  let cached = site.buildCache.get(cacheKey) as Promise<RenderHook | null> | undefined;
  if (!cached) {
    cached = findRenderHook(site, name);
    site.buildCache.set(cacheKey, cached);
  }
  return cached;
}

/**
 * Apply render hooks to HTML generated from Markdown.
 */
export async function applyRenderHooks(html: string, site: Site): Promise<string> {
  const imageHook = await loadRenderHook(site, "render-image");
  const linkHook = await loadRenderHook(site, "render-link");
  const headingHook = await loadRenderHook(site, "render-heading");

  // Images: <img src="..." alt="..." title="...">
  html = await replaceAsync(html, /<img src="([^"]*)" alt="([^"]*)"(?: title="([^"]*)")?\s*\/?>/g, async (_match, src, alt, title) => {
    if (!imageHook) {
      return title
        ? `<img src="${src}" alt="${alt}" title="${title}">`
        : `<img src="${src}" alt="${alt}">`;
    }
    return imageHook({ src, alt, title });
  });

  // Links: <a href="..." title="...">text</a>
  html = await replaceAsync(html, /<a href="([^"]*)"(?: title="([^"]*)")?>([^<]*)<\/a>/g, async (_match, href, title, text) => {
    if (!linkHook) {
      return title
        ? `<a href="${href}" title="${title}">${text}</a>`
        : `<a href="${href}">${text}</a>`;
    }
    return linkHook({ href, text, title });
  });

  // Headings: <h1>text</h1> ... <h6>text</h6>
  // Slugs are deduplicated per document, matching extractHeadings in pages.ts.
  const seenSlugs = new Map<string, number>();
  html = await replaceAsync(html, /<h([1-6])>([^<]*)<\/h[1-6]>/g, async (_match, depth, text) => {
    let slug = slugify(text);
    const count = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, count + 1);
    if (count > 0) {
      slug = `${slug}-${count}`;
    }
    if (!headingHook) {
      return `<h${depth} id="${slug}">${text}</h${depth}>`;
    }
    return headingHook({ depth: Number(depth), text, slug });
  });

  return html;
}

async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (match: string, ...args: string[]) => Promise<string>,
): Promise<string> {
  const promises: Promise<string>[] = [];
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args));
    return match;
  });
  const replacements = await Promise.all(promises);
  let i = 0;
  return str.replace(regex, () => replacements[i++]);
}
