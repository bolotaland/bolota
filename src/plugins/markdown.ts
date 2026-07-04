// Markdown rendering plugin using Bun's native markdown API

import type { Page } from "../core/pages.ts";

/**
 * Render raw Markdown content to HTML using Bun.markdown.html().
 */
export function renderMarkdown(content: string): string {
  try {
    return Bun.markdown.html(content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Markdown rendering failed: ${message}`);
  }
}

/**
 * Transform a Page by rendering its Markdown body to HTML.
 * Skips non-Markdown pages.
 */
export function transformMarkdown(page: Page): Page {
  if (!page.sourcePath.endsWith(".md") && !page.sourcePath.endsWith(".markdown")) {
    return page;
  }
  const html = renderMarkdown(page.body);
  return {
    ...page,
    body: html,
  };
}
