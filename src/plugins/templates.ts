import { join, resolve } from "node:path";
import type { Page } from "../core/pages.ts";
import type { Site } from "../core/site.ts";
import type { Collections } from "../core/collections.ts";
import { importFresh } from "../core/modules.ts";
import { getSection, type Section } from "../core/sections.ts";

function sortSectionPages(section: Section, sortBy: unknown, reverse: unknown): void {
  const pages = section.pages;

  if (sortBy === "date") {
    // Newest first, like Zola.
    pages.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  } else if (sortBy === "weight") {
    pages.sort((a, b) => (Number(a.frontmatter.weight) || 0) - (Number(b.frontmatter.weight) || 0));
  } else if (sortBy === "name") {
    pages.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Default: leave as discovered (directory order).

  if (reverse === true) {
    pages.reverse();
  }
}

/** Data passed to a layout function. */
export interface LayoutData extends Record<string, unknown> {
  /** The rendered page body (HTML). */
  content: string;
  /** Full page metadata. */
  page: Page;
  /** Global site metadata from config.site. */
  site?: Record<string, unknown>;
  /** Tag-based collections. */
  collections?: Collections;
  /** Section data (only for section landing pages). */
  section?: Section;
}

/** A layout is a JS/TS function that receives data and returns HTML. */
export type LayoutFunction = (data: LayoutData) => string | Promise<string>;

const LAYOUT_EXTENSIONS = [".ts", ".js"] as const;

async function findLayout(site: Site, name: string): Promise<LayoutFunction | null> {
  const layoutsDir = resolve(site.cwd, site.config.srcDir, site.config.layoutsDir);

  for (const ext of LAYOUT_EXTENSIONS) {
    const layoutPath = join(layoutsDir, `${name}${ext}`);
    if (await Bun.file(layoutPath).exists()) {
      const module = await importFresh(layoutPath);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Layout at "${layoutPath}" must export a function.`);
      }
      return fn as LayoutFunction;
    }
  }

  return null;
}

/** Resolve a layout function, memoized per build to avoid repeated FS lookups. */
function resolveLayout(site: Site, name: string): Promise<LayoutFunction | null> {
  const cacheKey = `layout:${name}`;
  let cached = site.buildCache.get(cacheKey) as Promise<LayoutFunction | null> | undefined;
  if (!cached) {
    cached = findLayout(site, name);
    site.buildCache.set(cacheKey, cached);
  }
  return cached;
}

function inferLayoutName(page: Page): string {
  if (page.kind === "index") {
    return "index";
  }
  if (page.name === "404") {
    return "404";
  }
  if (page.kind === "section") {
    return "section";
  }
  return "page";
}

/**
 * Wrap a page's rendered body in its layout.
 * Layouts are JS/TS functions in `layouts/{name}.ts` (or `.js`).
 */
export async function applyLayout(page: Page, site: Site): Promise<Page> {
  const pageData = site.data.getPageData(page, site.config);
  const explicitLayout = typeof pageData.layout === "string" ? pageData.layout : undefined;
  const layoutName = explicitLayout ?? inferLayoutName(page);

  const layout = await resolveLayout(site, layoutName);
  if (!layout) {
    // Only error if the user explicitly asked for a missing layout.
    // Convention-based defaults are optional.
    if (explicitLayout) {
      throw new Error(`Layout "${layoutName}" not found for page "${page.relativePath}".`);
    }
    return page;
  }

  const section = getSection(site.sections, page);
  if (section) {
    sortSectionPages(section, pageData.sort_by, pageData.reverse);
  }

  const layoutData: LayoutData = {
    ...pageData,
    content: page.body,
    page,
    site: site.config.site,
    collections: site.collections,
    section,
  };

  try {
    const html = await layout(layoutData);
    return { ...page, body: html };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to render layout "${layoutName}" for "${page.relativePath}": ${message}`);
  }
}
