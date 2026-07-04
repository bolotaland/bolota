import { join } from "node:path";

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
  };
}

/**
 * Load user configuration from `bolota.config.ts` in the current working directory.
 * Falls back to `defaultConfig` if no config file is found. If loading fails,
 * a warning is printed and the default configuration is used.
 */
export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<BolotaConfig> {
  const configPath = join(cwd, "bolota.config.ts");
  const configFile = Bun.file(configPath);

  if (!(await configFile.exists())) {
    return { ...defaultConfig };
  }

  try {
    const module = await import(configPath);
    const userConfig: Partial<BolotaConfig> = module.default ?? module;
    return sanitizeConfig(defaultConfig, userConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[config] Failed to load ${configPath}. Using default config.`);
    console.warn(`[config] ${message}`);
    return { ...defaultConfig };
  }
}
