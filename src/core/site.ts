import { join, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { BolotaConfig } from "./config.ts";
import type { Page } from "./pages.ts";
import { discoverPages } from "./pages.ts";

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

  constructor(config: BolotaConfig, cwd: string = process.cwd()) {
    this.config = config;
    this.cwd = cwd;
  }

  /** Register a plugin */
  use(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

/**
 * Run the full build pipeline.
 * Writes page bodies using node:fs/promises to avoid Bun.write
 * side-effects when files already exist.
 */
async build(): Promise<void> {
  await this.ensureDestDir();

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
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, currentPage.body, "utf-8");
    }
  }

  for (const plugin of this.plugins) {
    if (plugin.buildEnd) await plugin.buildEnd(this);
  }
}

  private async ensureDestDir(): Promise<void> {
    const dest = join(this.cwd, this.config.outDir);
    await mkdir(dest, { recursive: true });
  }
}
