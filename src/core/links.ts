import { urlForContentPath } from "./pages.ts";
import { transformOutsideCodeFences } from "./segments.ts";

export interface ResolveLinksOptions {
  /** Relative paths ("/"-separated) of all known content files, for validation. */
  knownPaths?: Set<string>;
  /** Label used in warnings, e.g. the page being processed. */
  sourceLabel?: string;
}

/**
 * Resolve internal `@/` links in Markdown content.
 * `[About](@/about.md)` becomes `[About](/about/)`.
 * Fragments are preserved: `[Team](@/about.md#team)` becomes `[Team](/about/#team)`.
 * Links inside fenced code blocks are left untouched.
 */
export function resolveInternalLinks(
  content: string,
  options: ResolveLinksOptions = {},
): string {
  return transformOutsideCodeFences(content, (text) =>
    text.replace(/]\(@\/([^)\s]+)\)/g, (match, target: string) => {
      const [filePart = "", ...fragmentParts] = target.split("#");
      const fragment = fragmentParts.length > 0 ? `#${fragmentParts.join("#")}` : "";
      const clean = filePart.trim();

      if (!/\.(md|markdown)$/i.test(clean)) {
        return match;
      }

      if (options.knownPaths && !options.knownPaths.has(clean)) {
        const where = options.sourceLabel ? ` in "${options.sourceLabel}"` : "";
        console.warn(
          `[links] Internal link "@/${target}"${where} does not match any content file.`,
        );
      }

      return `](${urlForContentPath(clean)}${fragment})`;
    }),
  );
}
