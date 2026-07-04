import { join } from "node:path";

/**
 * Ignis configuration schema.
 */
export interface IgnisConfig {
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
}

/** Default configuration used when no user config is provided */
export const defaultConfig: IgnisConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

/**
 * Load user configuration from `ignis.config.ts` in the current working directory.
 * Falls back to `defaultConfig` if no config file is found or if loading fails.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<IgnisConfig> {
  const configPath = join(cwd, "ignis.config.ts");
  const configFile = Bun.file(configPath);

  if (!(await configFile.exists())) {
    return { ...defaultConfig };
  }

  try {
    const module = await import(configPath);
    const userConfig: Partial<IgnisConfig> = module.default ?? module;

    return {
      ...defaultConfig,
      ...userConfig,
      site: {
        ...defaultConfig.site,
        ...(userConfig.site ?? {}),
      },
    };
  } catch {
    return { ...defaultConfig };
  }
}
