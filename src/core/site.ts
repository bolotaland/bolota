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

/** A page-level failure collected during a build instead of aborting it. */
export interface BuildError {
  /** Relative path of the failing page. */
  page: string;
  /** Name of the plugin whose transform threw. */
  plugin: string;
  message: string;
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
  /** Page-level errors from the last build. A failing page is dropped from
   *  the output; the rest of the site still builds. */
  readonly errors: BuildError[] = [];

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
   * Discovers, transforms, and writes pages, then cleans up.
   *
   * Each plugin's transform runs as a phase over all pages, so later phases
   * (e.g. layouts) see the output of earlier ones (e.g. compiled Markdown)
   * for every page — collections and sections are rebuilt between phases.
   *
   * A transform that throws does not abort the build: the failing page is
   * dropped and the error is collected in {@link errors}. Callers decide
   * what to do with them (the CLI exits non-zero, the watcher shows an
   * overlay). The output directory is only cleaned once all transforms have
   * run, so a build that dies early leaves the previous output intact.
   */
  async build(): Promise<void> {
    this.buildCache.clear();
    this.errors.length = 0;
    this.assertSafeOutDir();
    await this.data.loadSharedData(resolve(this.cwd, this.config.srcDir, this.config.contentDir));

    for (const plugin of this.plugins) {
      if (plugin.buildStart) await plugin.buildStart(this);
    }

    let pages = await discoverPages(this.config, this.cwd);
    this.setPages(pages);

    for (const plugin of this.plugins) {
      if (!plugin.transform) continue;
      const results = await Promise.all(pages.map(async (page) => {
        try {
          return await plugin.transform!(page, this);
        } catch (error: unknown) {
          this.errors.push({
            page: page.relativePath,
            plugin: plugin.name,
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }));
      pages = results.filter((page): page is Page => page !== null);
      this.setPages(pages);
    }

    await this.cleanDestDir();
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

  /** Refuse to clean an outDir containing the project or the content sources —
   *  a misconfigured outDir ("." or "..") must never wipe the site. */
  private assertSafeOutDir(): void {
    const dest = resolve(this.cwd, this.config.outDir);
    const projectRoot = resolve(this.cwd);
    const contentDir = resolve(this.cwd, this.config.srcDir, this.config.contentDir);

    const contains = (parent: string, child: string): boolean =>
      child === parent || child.startsWith(parent + sep);
    if (contains(dest, projectRoot) || contains(dest, contentDir)) {
      throw new Error(
        `Refusing to clean outDir "${this.config.outDir}" (${dest}): it contains project sources.`,
      );
    }
  }

  private async cleanDestDir(): Promise<void> {
    this.assertSafeOutDir();
    // Bun has no native recursive directory removal API, so node:fs/promises
    // is intentionally retained here.
    await rm(resolve(this.cwd, this.config.outDir), { recursive: true, force: true });
    // Bun.write creates parent directories automatically on the first page write.
  }
}
