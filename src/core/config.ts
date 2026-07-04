import { join } from "node:path";
import { SiteData, type DataRegistry } from "./data.ts";

/**
 * Options passed to Bun.markdown.html().
 * See https://bun.sh/docs/api/markdown
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
export interface VentoConfig {
  /** Enable the Vento autoTrim plugin. Disabled by default. */
  autoTrim?: boolean | { tags?: string[] };
}

export interface BolotaConfig {
  /** Root directory for source content */
  srcDir: string;
  /** Directory containing page content (Markdown, etc.) */
  contentDir: string;
  /** Directory containing Vento layout templates */
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
  /** Vento engine options */
  vento?: VentoConfig;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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
    port: typeof user.port === "number" && Number.isFinite(user.port) ? user.port : base.port,
    site: {
      ...base.site,
      ...(user.site ?? {}),
    },
    markdownOptions: user.markdownOptions ?? base.markdownOptions,
    vento: user.vento ?? base.vento,
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
 * Load user configuration from `bolota.config.ts` in the current working directory.
 * Falls back to `defaultConfig` if no config file is found. If loading fails,
 * a warning is printed and the default configuration is used.
 *
 * The config file can export either a plain object or a function that receives
 * a data registry (`site.data()`). Global/scoped data registered this way are
 * returned alongside the sanitized config.
 */
export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<LoadedConfig> {
  const configPath = join(cwd, "bolota.config.ts");
  const configFile = Bun.file(configPath);
  const fallbackData = new SiteData();

  if (!(await configFile.exists())) {
    return { config: { ...defaultConfig }, data: fallbackData };
  }

  try {
    const module = await import(configPath);
    const exported = module.default ?? module;

    if (typeof exported === "function") {
      const siteData = new SiteData();
      const userConfig: Partial<BolotaConfig> = await exported(siteData);
      const config = sanitizeConfig(defaultConfig, userConfig);
      populateSiteDataFromConfig(siteData, config);
      return { config, data: siteData };
    }

    const userConfig: Partial<BolotaConfig> = exported;
    const config = sanitizeConfig(defaultConfig, userConfig);
    const siteData = new SiteData();
    populateSiteDataFromConfig(siteData, config);
    return { config, data: siteData };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[config] Failed to load ${configPath}. Using default config.`);
    console.warn(`[config] ${message}`);
    return { config: { ...defaultConfig }, data: fallbackData };
  }
}
