import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

async function loadRenderHook(site: Site, name: string): Promise<RenderHook | null> {
  const hooksDir = join(site.config.srcDir, site.config.layoutsDir, "_markup");

  for (const ext of [".ts", ".js"]) {
    const path = join(hooksDir, `${name}${ext}`);
    if (await Bun.file(path).exists()) {
      const url = Bun.pathToFileURL(path).href;
      const module = await import(url);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Render hook "${name}" at "${path}" must export a function.`);
      }
      return fn as RenderHook;
    }
  }

  return null;
}

async function renderImageHook(site: Site, src: string, alt: string, title?: string): Promise<string> {
  const fn = await loadRenderHook(site, "render-image");
  if (!fn) {
    return title
      ? `<img src="${src}" alt="${alt}" title="${title}">`
      : `<img src="${src}" alt="${alt}">`;
  }
  return await fn({ src, alt, title });
}

async function renderLinkHook(site: Site, href: string, text: string, title?: string): Promise<string> {
  const fn = await loadRenderHook(site, "render-link");
  if (!fn) {
    return title
      ? `<a href="${href}" title="${title}">${text}</a>`
      : `<a href="${href}">${text}</a>`;
  }
  return await fn({ href, text, title });
}

async function renderHeadingHook(site: Site, depth: number, text: string, slug: string): Promise<string> {
  const fn = await loadRenderHook(site, "render-heading");
  if (!fn) {
    return `<h${depth} id="${slug}">${text}</h${depth}>`;
  }
  return await fn({ depth, text, slug });
}

/**
 * Apply render hooks to HTML generated from Markdown.
 */
export async function applyRenderHooks(html: string, site: Site): Promise<string> {
  // Images: <img src="..." alt="..." title="...">
  html = await replaceAsync(html, /<img src="([^"]*)" alt="([^"]*)"(?: title="([^"]*)")?\s*\/?>/g, async (match, src, alt, title) => {
    return renderImageHook(site, src, alt, title);
  });

  // Links: <a href="..." title="...">text</a>
  html = await replaceAsync(html, /<a href="([^"]*)"(?: title="([^"]*)")?>([^<]*)<\/a>/g, async (match, href, title, text) => {
    return renderLinkHook(site, href, text, title);
  });

  // Headings: <h1>text</h1> ... <h6>text</h6>
  html = await replaceAsync(html, /<h([1-6])>([^<]*)<\/h[1-6]>/g, async (match, depth, text) => {
    const slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return renderHeadingHook(site, Number(depth), text, slug);
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
