import { join } from "node:path";
import type { Page } from "../core/pages.ts";
import type { Site } from "../core/site.ts";
import type { Collections } from "../core/collections.ts";
import { getSection, type Section } from "../core/sections.ts";

function sortSectionPages(section: Section, sortBy: unknown): void {
  if (sortBy === "date") {
    section.pages.sort((a, b) => {
      const dateA = a.date?.getTime() ?? 0;
      const dateB = b.date?.getTime() ?? 0;
      return dateA - dateB;
    });
  } else if (sortBy === "weight") {
    section.pages.sort((a, b) => {
      const weightA = Number(a.frontmatter.weight) || 0;
      const weightB = Number(b.frontmatter.weight) || 0;
      return weightA - weightB;
    });
  }
  // Default: leave as discovered (directory order).
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

async function resolveLayoutPath(site: Site, name: string): Promise<string | null> {
  const layoutsDir = join(site.config.srcDir, site.config.layoutsDir);

  for (const ext of LAYOUT_EXTENSIONS) {
    const layoutPath = join(layoutsDir, `${name}${ext}`);
    if (await Bun.file(layoutPath).exists()) {
      return layoutPath;
    }
  }

  return null;
}

function inferLayoutName(page: Page): string | null {
  const relativePath = page.relativePath;
  const nameWithoutExt = page.name;

  // Homepage.
  if (relativePath === "index.md" || relativePath === "index.markdown") {
    return "index";
  }

  // 404 page.
  if (nameWithoutExt === "404") {
    return "404";
  }

  // Section landing page.
  if (nameWithoutExt === "_index") {
    return "section";
  }

  // Default page layout.
  return "page";
}

/** Determine which layout should be used for a page. */
function getLayoutName(page: Page, explicitLayout?: string): string | null {
  if (explicitLayout) {
    return explicitLayout;
  }

  return inferLayoutName(page);
}

async function loadLayout(layoutPath: string): Promise<LayoutFunction> {
  const url = Bun.pathToFileURL(layoutPath).href;
  const module = await import(url);
  const fn = module.default ?? module;

  if (typeof fn !== "function") {
    throw new Error(`Layout at "${layoutPath}" must export a function.`);
  }

  return fn as LayoutFunction;
}

/**
 * Wrap a page's rendered body in its layout.
 * Layouts are JS/TS functions in `layouts/{name}.ts` (or `.js`).
 */
export async function applyLayout(page: Page, site: Site): Promise<Page> {
  const pageData = site.data.getPageData(page, site.config);
  const explicitLayout = pageData.layout as string | undefined;
  const layoutName = getLayoutName(page, explicitLayout);

  if (!layoutName) {
    return page;
  }

  const layoutPath = await resolveLayoutPath(site, layoutName);
  if (!layoutPath) {
    // Only error if the user explicitly asked for a missing layout.
    // Convention-based defaults are optional.
    if (explicitLayout) {
      throw new Error(`Layout "${layoutName}" not found for page "${page.relativePath}".`);
    }
    return page;
  }

  const section = getSection(site.sections, page);
  if (section) {
    sortSectionPages(section, pageData.sort_by);
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
    const fn = await loadLayout(layoutPath);
    const html = await fn(layoutData);
    return { ...page, body: html };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to render layout "${layoutName}" for "${page.relativePath}": ${message}`);
  }
}
