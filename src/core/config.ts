import { join } from "node:path";
import { importFresh } from "./modules.ts";
import { SiteData, type DataRegistry } from "./data.ts";

/**
 * Options passed to Bun.markdown.html().
 * See https://bun.com/docs/api/markdown
 */
export interface MarkdownOptions {
  tables?: boolean;
  strikethrough?: boolean;
  tasklists?: boolean;
  autolinks?: boolean | { url?: boolean; www?: boolean; email?: boolean };
  headings?: boolean | { ids?: boolean; autolink?: boolean };
  hardSoftBreaks?: boolean;
  wikiLinks?: boolean;
  underline?: boolean;
  latexMath?: boolean;
  collapseWhitespace?: boolean;
  permissiveAtxHeaders?: boolean;
  noIndentedCodeBlocks?: boolean;
  noHtmlBlocks?: boolean;
  noHtmlSpans?: boolean;
  tagFilter?: boolean;
}

/**
 * Bolota configuration schema.
 */
export interface BolotaConfig {
  /** Root directory for source content */
  srcDir: string;
  /** Directory containing page content (Markdown, etc.) */
  contentDir: string;
  /** Directory containing JS/TS layout functions */
  layoutsDir: string;
  /** Directory containing static assets to copy */
  publicDir: string;
  /** Output directory for built site */
  outDir: string;
  /** Port for the development server */
  port: number;
  /** Global site metadata available in all templates */
  site?: Record<string, unknown>;
  /** Options for Bun.markdown.html() */
  markdownOptions?: MarkdownOptions;
  /** Global data available in all pages, layouts and components */
  data?: Record<string, unknown>;
  /** Scoped data keyed by path (directory or file, relative to contentDir) */
  scopedData?: Record<string, Record<string, unknown>>;
}

/** Function form of a config file. Receives a data registry exposing `data()`. */
export type ConfigFunction = (
  site: DataRegistry,
) => Partial<BolotaConfig> | Promise<Partial<BolotaConfig>>;

/** Result returned by {@link loadConfig}. */
export interface LoadedConfig {
  config: BolotaConfig;
  data: SiteData;
}

/** Default configuration used when no user config is provided */
export const defaultConfig: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

/** Config file names probed in order. */
const CONFIG_FILES = ["bolota.config.ts", "bolota.config.js"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;
}

function sanitizeConfig(
  base: BolotaConfig,
  user: Partial<BolotaConfig>,
): BolotaConfig {
  return {
    srcDir: isNonEmptyString(user.srcDir) ? user.srcDir : base.srcDir,
    contentDir: isNonEmptyString(user.contentDir) ? user.contentDir : base.contentDir,
    layoutsDir: isNonEmptyString(user.layoutsDir) ? user.layoutsDir : base.layoutsDir,
    publicDir: isNonEmptyString(user.publicDir) ? user.publicDir : base.publicDir,
    outDir: isNonEmptyString(user.outDir) ? user.outDir : base.outDir,
    port: isValidPort(user.port) ? user.port : base.port,
    site: {
      ...base.site,
      ...(user.site ?? {}),
    },
    markdownOptions: user.markdownOptions ?? base.markdownOptions,
    data: {
      ...base.data,
      ...(user.data ?? {}),
    },
    scopedData: {
      ...base.scopedData,
      ...(user.scopedData ?? {}),
    },
  };
}

function populateSiteDataFromConfig(
  siteData: SiteData,
  config: BolotaConfig,
): void {
  if (config.data) {
    for (const [key, value] of Object.entries(config.data)) {
      siteData.data(key, value);
    }
  }
  if (config.scopedData) {
    for (const [scope, map] of Object.entries(config.scopedData)) {
      for (const [key, value] of Object.entries(map)) {
        siteData.data(key, value, scope);
      }
    }
  }
}

/**
 * Load user configuration from `bolota.config.ts` (or `.js`) in `cwd`.
 * Falls back to `defaultConfig` if no config file is found.
 *
 * The config file can export either a plain object or a function that receives
 * a data registry (`site.data()`). Global/scoped data registered this way are
 * returned alongside the sanitized config.
 *
 * When a config file exists but fails to load: with `strict` the error is
 * rethrown (a production build must not silently use defaults); otherwise a
 * warning is printed and the default configuration is used.
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  options: { strict?: boolean } = {},
): Promise<LoadedConfig> {
  let configPath: string | null = null;
  for (const fileName of CONFIG_FILES) {
    const candidate = join(cwd, fileName);
    if (await Bun.file(candidate).exists()) {
      configPath = candidate;
      break;
    }
  }

  if (!configPath) {
    return { config: { ...defaultConfig }, data: new SiteData() };
  }

  try {
    const module = await importFresh(configPath);
    const exported = module.default ?? module;

    const siteData = new SiteData();
    const userConfig: Partial<BolotaConfig> =
      typeof exported === "function" ? await exported(siteData) : exported;

    const config = sanitizeConfig(defaultConfig, userConfig ?? {});
    populateSiteDataFromConfig(siteData, config);
    return { config, data: siteData };
  } catch (error) {
    if (options.strict) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load config "${configPath}": ${message}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[config] Failed to load ${configPath}. Using default config.`);
    console.warn(`[config] ${message}`);
    return { config: { ...defaultConfig }, data: new SiteData() };
  }
}
