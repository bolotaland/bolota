/**
 * Frontmatter parser using Bun's native YAML and TOML APIs.
 * Supports YAML (`---`), TOML (`---toml`), and legacy TOML (`+++`) delimiters.
 */

export interface Frontmatter {
  [key: string]: unknown;
}

export interface ParsedFile {
  /** Parsed frontmatter metadata */
  frontmatter: Frontmatter;
  /** Content body after the frontmatter block */
  body: string;
}

interface FrontmatterFormat {
  open: string;
  close: string;
  parse: (block: string) => unknown;
}

/** `---toml` must be tried before `---`, whose opening line is a prefix of it. */
const FORMATS: FrontmatterFormat[] = [
  { open: "---toml", close: "---", parse: (block) => Bun.TOML.parse(block) },
  { open: "---", close: "---", parse: (block) => Bun.YAML.parse(block) },
  { open: "+++", close: "+++", parse: (block) => Bun.TOML.parse(block) },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Try to parse `content` against one delimiter format.
 * Both delimiters must sit alone on their own line, so a `---` occurring
 * inside a frontmatter value or in the body is never mistaken for a delimiter.
 * Returns null when the format does not apply or the block is not a key/value
 * object (e.g. a document that merely starts with a horizontal rule).
 */
function tryFormat(content: string, format: FrontmatterFormat): ParsedFile | null {
  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd === -1) {
    return null;
  }
  if (content.slice(0, firstLineEnd).trimEnd() !== format.open) {
    return null;
  }

  const rest = content.slice(firstLineEnd + 1);
  const closeRegex = new RegExp(`^${escapeRegExp(format.close)}[ \\t]*\\r?$`, "m");
  const match = closeRegex.exec(rest);
  if (!match) {
    return null;
  }

  const block = rest.slice(0, match.index).trim();
  const body = rest.slice(match.index + match[0].length).trimStart();
  const value = block ? format.parse(block) : {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return { frontmatter: value as Frontmatter, body };
}

/**
 * Parse frontmatter delimited by `---` (YAML), `---toml` (TOML), or `+++`
 * (legacy TOML). Returns the parsed metadata and the remaining body content.
 * Falls back to empty frontmatter and the raw body if no valid block is found.
 */
export function parseFrontmatter(content: string): ParsedFile {
  const trimmed = content.trimStart();

  for (const format of FORMATS) {
    const parsed = tryFormat(trimmed, format);
    if (parsed) {
      return parsed;
    }
  }

  return { frontmatter: {}, body: content };
}
