import { join } from "node:path";

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

/**
 * Load user configuration from `bolota.config.ts` in the current working directory.
 * Falls back to `defaultConfig` if no config file is found or if loading fails.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<BolotaConfig> {
  const configPath = join(cwd, "bolota.config.ts");
  const configFile = Bun.file(configPath);

  if (!(await configFile.exists())) {
    return { ...defaultConfig };
  }

  try {
    const module = await import(configPath);
    const userConfig: Partial<BolotaConfig> = module.default ?? module;

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
