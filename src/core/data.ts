import { dirname, extname, relative, sep } from "node:path";
import type { Page } from "./pages.ts";
import type { BolotaConfig } from "./config.ts";

/** Public API used to register global or scoped data. */
export interface DataRegistry {
  /**
   * Register a data value.
   * @param name  Variable name.
   * @param value Variable value.
   * @param scope Optional path scope (directory or file, relative to contentDir).
   */
  data(name: string, value: unknown, scope?: string): void;
}

/** Shared data indexed by directory path (relative to contentDir, "" for root). */
export type SharedDataByDir = Map<string, Record<string, unknown>>;

const SUPPORTED_EXTENSIONS = [".json", ".yaml", ".yml", ".ts", ".js"] as const;

/** Priority order when several `_data.*` files coexist in the same directory.
 *  Higher index wins. */
const EXTENSION_PRIORITY: Record<string, number> = {
  ".yml": 1,
  ".yaml": 2,
  ".json": 3,
  ".js": 4,
  ".ts": 5,
};

function isSupportedDataFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

async function loadDataFile(filePath: string): Promise<Record<string, unknown>> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".json": {
      const value = await Bun.file(filePath).json();
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`JSON data file must export an object: ${filePath}`);
      }
      return value as Record<string, unknown>;
    }

    case ".yaml":
    case ".yml": {
      const text = await Bun.file(filePath).text();
      const value = Bun.YAML.parse(text);
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`YAML data file must contain an object: ${filePath}`);
      }
      return value as Record<string, unknown>;
    }

    case ".js":
    case ".ts": {
      const url = Bun.pathToFileURL(filePath).href;
      const module = await import(url);
      const value = module.default ?? module;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`JS/TS data file must export an object: ${filePath}`);
      }
      return value as Record<string, unknown>;
    }

    default:
      throw new Error(`Unsupported data file extension "${ext}": ${filePath}`);
  }
}

/** Discover and load all `_data.*` files inside a content directory. */
export async function loadSharedData(contentDir: string): Promise<SharedDataByDir> {
  const byDir = new Map<string, Record<string, unknown>>();
  const filesByDir = new Map<string, string[]>();
  const glob = new Bun.Glob("**/_data.*");

  for await (const filePath of glob.scan({ cwd: contentDir, absolute: true })) {
    if (!isSupportedDataFile(filePath)) {
      continue;
    }

    const dirPath = dirname(filePath);
    const relDir = relative(contentDir, dirPath);
    const key = relDir === "" ? "" : relDir;

    const list = filesByDir.get(key) ?? [];
    list.push(filePath);
    filesByDir.set(key, list);
  }

  for (const [key, filePaths] of filesByDir) {
    // Sort by priority so higher-priority formats override lower-priority ones.
    filePaths.sort((a, b) => {
      const priorityA = EXTENSION_PRIORITY[extname(a).toLowerCase()] ?? 0;
      const priorityB = EXTENSION_PRIORITY[extname(b).toLowerCase()] ?? 0;
      return priorityA - priorityB;
    });

    let merged: Record<string, unknown> = {};
    for (const filePath of filePaths) {
      try {
        const data = await loadDataFile(filePath);
        merged = mergeObjects(merged, data);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[data] ${message}`);
      }
    }

    byDir.set(key, merged);
  }

  return byDir;
}

function mergeObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...override };
}

function normalizeScope(scope: string): string {
  let normalized = scope.replace(/\//g, sep).replace(/\\/g, sep);
  normalized = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized;
}

function pageMatchesScope(pageRelativePath: string, scope: string): boolean {
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope === "") {
    return true;
  }

  // Exact file match.
  if (pageRelativePath === normalizedScope) {
    return true;
  }

  // Directory prefix match.
  const prefix = normalizedScope + sep;
  return pageRelativePath.startsWith(prefix);
}

/** Holds global, scoped and shared data for a site build. */
export class SiteData implements DataRegistry {
  private global = new Map<string, unknown>();
  private scoped = new Map<string, Map<string, unknown>>();
  private shared: SharedDataByDir = new Map();

  data(name: string, value: unknown, scope?: string): void {
    if (scope === undefined) {
      this.global.set(name, value);
      return;
    }

    const normalizedScope = normalizeScope(scope);
    let map = this.scoped.get(normalizedScope);
    if (!map) {
      map = new Map();
      this.scoped.set(normalizedScope, map);
    }
    map.set(name, value);
  }

  /** Load shared `_data.*` files from the content directory. */
  async loadSharedData(contentDir: string): Promise<void> {
    this.shared = await loadSharedData(contentDir);
  }

  /** Resolve the final data object for a page, merging all scopes.
   *  Precedence (low to high): config.site → global data → scoped data →
   *  shared parent dirs → shared child dirs → page frontmatter. */
  getPageData(page: Page, config: BolotaConfig): Record<string, unknown> {
    const result: Record<string, unknown> = { ...(config.site ?? {}) };

    // Global data.
    for (const [key, value] of this.global) {
      result[key] = value;
    }

    // Scoped data.
    for (const [scope, map] of this.scoped) {
      if (pageMatchesScope(page.relativePath, scope)) {
        for (const [key, value] of map) {
          result[key] = value;
        }
      }
    }

    // Shared data: walk from root to the page's directory so closer dirs win.
    const pageDir = dirname(page.relativePath);
    const parts = pageDir === "." ? [] : pageDir.split(sep);
    const dirs: string[] = [];
    for (let i = 0; i <= parts.length; i++) {
      dirs.push(parts.slice(0, i).join(sep));
    }

    for (const dir of dirs) {
      const key = dir === "" ? "" : dir;
      const data = this.shared.get(key);
      if (data) {
        Object.assign(result, data);
      }
    }

    // Page frontmatter has the highest priority.
    Object.assign(result, page.frontmatter);

    return result;
  }

  /** Direct access to global data (useful for tests and introspection). */
  getGlobalData(): Record<string, unknown> {
    return Object.fromEntries(this.global);
  }

  /** Direct access to scoped data (useful for tests and introspection). */
  getScopedData(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [scope, map] of this.scoped) {
      result[scope] = Object.fromEntries(map);
    }
    return result;
  }

  /** Direct access to shared data by directory (useful for tests). */
  getSharedData(): SharedDataByDir {
    return this.shared;
  }
}
