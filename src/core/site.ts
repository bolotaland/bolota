import { join, resolve, sep } from "node:path";
import { rm } from "node:fs/promises";
import type { BolotaConfig } from "./config.ts";
import type { Page } from "./pages.ts";
import { discoverPages } from "./pages.ts";
import { SiteData } from "./data.ts";
import { buildCollections, type Collections } from "./collections.ts";
import { buildSections, type Section } from "./sections.ts";

/** Plugin interface for extending the build pipeline */
export interface Plugin {
  name: string;
  /** Called once before any page is processed */
  buildStart?: (site: Site) => Promise<void> | void;
  /** Transform a page; return null to exclude it from the build */
  transform?: (page: Page, site: Site) => Promise<Page | null> | Page | null;
  /** Called once after all pages are written */
  buildEnd?: (site: Site) => Promise<void> | void;
}

/** Core site builder that orchestrates the static generation pipeline */
export class Site {
  readonly config: BolotaConfig;
  readonly pages: Page[] = [];
  private plugins: Plugin[] = [];
  readonly cwd: string;
  readonly data: SiteData;
  collections: Collections = { all: [] };
  sections: Map<string, Section> = new Map();
  /** Per-build memoization (layouts, shortcodes, render hooks). Cleared at the start of every build. */
  readonly buildCache = new Map<string, unknown>();

  constructor(
    config: BolotaConfig,
    cwd: string = process.cwd(),
    data: SiteData = new SiteData(),
  ) {
    this.config = config;
    this.cwd = cwd;
    this.data = data;

    // Populate data from object-style config (global and scoped).
    if (config.data) {
      for (const [key, value] of Object.entries(config.data)) {
        this.data.data(key, value);
      }
    }
    if (config.scopedData) {
      for (const [scope, map] of Object.entries(config.scopedData)) {
        for (const [key, value] of Object.entries(map)) {
          this.data.data(key, value, scope);
        }
      }
    }
  }

  /** Register a plugin */
  use(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Run the full build pipeline.
   * Cleans the output directory, then discovers, transforms, and writes pages.
   *
   * Each plugin's transform runs as a phase over all pages, so later phases
   * (e.g. layouts) see the output of earlier ones (e.g. compiled Markdown)
   * for every page — collections and sections are rebuilt between phases.
   */
  async build(): Promise<void> {
    this.buildCache.clear();
    await this.cleanDestDir();
    await this.data.loadSharedData(resolve(this.cwd, this.config.srcDir, this.config.contentDir));

    for (const plugin of this.plugins) {
      if (plugin.buildStart) await plugin.buildStart(this);
    }

    let pages = await discoverPages(this.config, this.cwd);
    this.setPages(pages);

    for (const plugin of this.plugins) {
      if (!plugin.transform) continue;
      const results = await Promise.all(pages.map((page) => plugin.transform!(page, this)));
      pages = results.filter((page): page is Page => page !== null);
      this.setPages(pages);
    }

    await this.writePages(pages);

    for (const plugin of this.plugins) {
      if (plugin.buildEnd) await plugin.buildEnd(this);
    }
  }

  private setPages(pages: Page[]): void {
    this.pages.length = 0;
    this.pages.push(...pages);
    this.collections = buildCollections(pages);
    this.sections = buildSections(pages);
  }

  private async writePages(pages: Page[]): Promise<void> {
    const outDir = resolve(this.cwd, this.config.outDir);
    const byOutput = new Map<string, string>();

    await Promise.all(pages.map((page) => {
      const existing = byOutput.get(page.outputPath);
      if (existing !== undefined) {
        console.warn(
          `[build] Output collision: "${page.relativePath}" and "${existing}" both write to "${page.outputPath}".`,
        );
      }
      byOutput.set(page.outputPath, page.relativePath);
      return Bun.write(join(outDir, page.outputPath), page.body);
    }));
  }

  private async cleanDestDir(): Promise<void> {
    const dest = resolve(this.cwd, this.config.outDir);
    const projectRoot = resolve(this.cwd);
    const contentDir = resolve(this.cwd, this.config.srcDir, this.config.contentDir);

    // Refuse to delete the project itself or anything containing the content
    // sources — a misconfigured outDir ("." or "..") must never wipe the site.
    const contains = (parent: string, child: string): boolean =>
      child === parent || child.startsWith(parent + sep);
    if (contains(dest, projectRoot) || contains(dest, contentDir)) {
      throw new Error(
        `Refusing to clean outDir "${this.config.outDir}" (${dest}): it contains project sources.`,
      );
    }

    // Bun has no native recursive directory removal API, so node:fs/promises
    // is intentionally retained here.
    await rm(dest, { recursive: true, force: true });
    // Bun.write creates parent directories automatically on the first page write.
  }
}
