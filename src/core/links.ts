/**
 * Resolve internal `@/` links in Markdown content.
 * `[About](@/about.md)` becomes `[About](/about/)`.
 */
export function resolveInternalLinks(content: string): string {
  return content.replace(/]\(@\/([^)]+)\)/g, (match, target: string) => {
    const clean = target.trim();
    if (!clean.toLowerCase().endsWith(".md") && !clean.toLowerCase().endsWith(".markdown")) {
      return match;
    }

    const path = clean.replace(/\.(md|markdown)$/i, "");

    let normalized: string;
    if (path.endsWith("/_index") || path === "_index") {
      normalized = path.replace(/\/?_index$/, "");
    } else if (path.endsWith("/index") || path === "index") {
      normalized = path.replace(/\/?index$/, "");
    } else {
      normalized = `${path}/`;
    }

    if (normalized && !normalized.endsWith("/")) {
      normalized = `${normalized}/`;
    }

    return `](/${normalized})`;
  });
}
