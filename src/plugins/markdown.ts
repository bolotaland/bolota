import type { Page } from "../core/pages.ts";
import type { MarkdownOptions } from "../core/config.ts";
import { resolveInternalLinks } from "../core/links.ts";
import { processShortcodes } from "../core/shortcodes.ts";
import { applyRenderHooks } from "../core/render-hooks.ts";
import type { Site } from "../core/site.ts";

/**
 * Render raw Markdown content to HTML using Bun.markdown.html().
 */
export function renderMarkdown(content: string, options?: MarkdownOptions): string {
  try {
    return Bun.markdown.html(content, options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Markdown rendering failed: ${message}`);
  }
}

/**
 * Transform a Page by rendering its Markdown body to HTML.
 * Skips non-Markdown pages.
 */
export async function transformMarkdown(page: Page, site?: Site): Promise<Page> {
  if (!page.sourcePath.endsWith(".md") && !page.sourcePath.endsWith(".markdown")) {
    return page;
  }

  let body = page.body;
  if (site) {
    body = await processShortcodes(body, site);
    body = resolveInternalLinks(body, {
      knownPaths: new Set(site.pages.map((p) => p.relativePath)),
      sourceLabel: page.relativePath,
    });
  } else {
    body = resolveInternalLinks(body);
  }

  let html = renderMarkdown(body, site?.config.markdownOptions);
  if (site) {
    html = await applyRenderHooks(html, site);
  }

  return {
    ...page,
    body: html,
    compiledContent: html,
  };
}
