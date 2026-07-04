// Vento template engine integration

import { join } from "node:path";
import vento from "ventojs";
import type { Page } from "../core/pages.ts";
import type { BolotaConfig } from "../core/config.ts";

type VentoEnvironment = ReturnType<typeof vento>;

let env: VentoEnvironment | null = null;

/**
 * Initialize the Vento environment with the layouts directory.
 */
export function initVento(layoutsDir: string): VentoEnvironment {
  env = vento({
    includes: layoutsDir,
    autoescape: true,
  });
  return env;
}

/**
 * Render a Vento template file.
 */
export async function renderVentoFile(
  templatePath: string,
  data: Record<string, unknown>,
): Promise<string> {
  const instance = env ?? vento({ autoescape: true });
  const result = await instance.run(templatePath, data);
  return result.content;
}

/**
 * Wrap a page's body in its layout if one is specified in frontmatter.
 */
export async function applyLayout(page: Page, config: BolotaConfig): Promise<Page> {
  const layout = page.frontmatter.layout as string | undefined;
  if (!layout) {
    return page;
  }

  const layoutsDir = join(config.srcDir, config.layoutsDir);
  if (!env) {
    initVento(layoutsDir);
  }

  const layoutPath = join(layoutsDir, `${layout}.vto`);
  const layoutData = {
    ...page.frontmatter,
    content: page.body,
    page,
    site: config.site,
  };

  try {
    const html = await renderVentoFile(layoutPath, layoutData);
    return {
      ...page,
      body: html,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to render layout "${layout}": ${message}`);
  }
}
