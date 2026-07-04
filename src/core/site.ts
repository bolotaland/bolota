import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { BolotaConfig } from "./config.ts";
import type { Page } from "./pages.ts";
import { discoverPages } from "./pages.ts";
import { SiteData } from "./data.ts";

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
   * Uses Bun.write for fast native file I/O.
   */
  async build(): Promise<void> {
    await this.cleanDestDir();
    await this.data.loadSharedData(join(this.config.srcDir, this.config.contentDir));

    for (const plugin of this.plugins) {
      if (plugin.buildStart) await plugin.buildStart(this);
    }

    const pages = await discoverPages(this.config);
    this.pages.length = 0;

    for (const page of pages) {
      let currentPage: Page | null = page;

      for (const plugin of this.plugins) {
        if (plugin.transform && currentPage) {
          currentPage = await plugin.transform(currentPage, this);
        }
      }

      if (currentPage) {
        this.pages.push(currentPage);
        const outputPath = join(this.cwd, this.config.outDir, currentPage.outputPath);
        await Bun.write(outputPath, currentPage.body);
      }
    }

    for (const plugin of this.plugins) {
      if (plugin.buildEnd) await plugin.buildEnd(this);
    }
  }

  private async cleanDestDir(): Promise<void> {
    const dest = join(this.cwd, this.config.outDir);
    // Bun has no native recursive directory removal API, so node:fs/promises
    // is intentionally retained here.
    await rm(dest, { recursive: true, force: true });
    // Bun.write creates parent directories automatically on the first page write.
  }
}
