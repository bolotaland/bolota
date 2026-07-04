// Vento template engine integration

import { join } from "node:path";
import vento from "ventojs";
import autoTrim, { defaultTags } from "ventojs/plugins/auto_trim.js";
import type { Page } from "../core/pages.ts";
import type { BolotaConfig } from "../core/config.ts";

export type VentoEnvironment = ReturnType<typeof vento>;

function normalizeUrl(path: string): string {
  // Leave absolute URLs and anchors untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("#")) {
    return path;
  }

  let normalized = path.replace(/\.html$/i, "");

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  // Pretty-print page URLs: /about -> /about/
  if (normalized.length > 1 && !normalized.includes(".") && !normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }

  return normalized || "/";
}

/**
 * Create a fresh Vento environment configured for Bolota.
 */
export function createVentoEnv(config: BolotaConfig): VentoEnvironment {
  const layoutsDir = join(config.srcDir, config.layoutsDir);

  const env = vento({
    includes: layoutsDir,
    autoescape: true,
  });

  env.filters.url = normalizeUrl;

  if (config.vento?.autoTrim) {
    const tags =
      typeof config.vento.autoTrim === "object" &&
      Array.isArray(config.vento.autoTrim.tags)
        ? config.vento.autoTrim.tags
        : defaultTags;
    env.use(autoTrim({ tags }));
  }

  return env;
}

/**
 * Render a Vento template file.
 */
export async function renderVentoFile(
  env: VentoEnvironment,
  templatePath: string,
  data: Record<string, unknown>,
): Promise<string> {
  const result = await env.run(templatePath, data);
  return result.content;
}

/**
 * Wrap a page's body in its layout if one is specified in frontmatter.
 */
export async function applyLayout(
  page: Page,
  config: BolotaConfig,
  env: VentoEnvironment,
): Promise<Page> {
  const layout = page.frontmatter.layout as string | undefined;
  if (!layout) {
    return page;
  }

  const layoutsDir = join(config.srcDir, config.layoutsDir);
  const layoutPath = join(layoutsDir, `${layout}.vto`);

  const layoutData = {
    ...page.frontmatter,
    content: page.body,
    page,
    site: config.site,
  };

  try {
    const html = await renderVentoFile(env, layoutPath, layoutData);
    return {
      ...page,
      body: html,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to render layout "${layout}": ${message}`);
  }
}
