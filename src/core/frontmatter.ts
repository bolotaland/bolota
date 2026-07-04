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

const YAML_DELIMITER = "---";
const TOML_DELIMITER = "+++";
const TOML_MARKED_DELIMITER = "---toml";

/**
 * Parse frontmatter delimited by `---` (YAML), `---toml` (TOML), or `+++` (legacy TOML).
 * Returns the parsed metadata and the remaining body content.
 * Falls back to empty frontmatter and raw body if no delimiter is found.
 */
export function parseFrontmatter(content: string): ParsedFile {
  const trimmed = content.trimStart();

  // YAML frontmatter: ---
  if (trimmed.startsWith(YAML_DELIMITER) && !trimmed.startsWith(TOML_MARKED_DELIMITER)) {
    const endIndex = trimmed.indexOf(YAML_DELIMITER, YAML_DELIMITER.length);
    if (endIndex !== -1) {
      const yamlBlock = trimmed.slice(YAML_DELIMITER.length, endIndex).trim();
      const body = trimmed.slice(endIndex + YAML_DELIMITER.length).trimStart();
      const frontmatter = yamlBlock ? (Bun.YAML.parse(yamlBlock) as Frontmatter) : {};
      return { frontmatter, body };
    }
  }

  // TOML frontmatter with explicit marker: ---toml
  if (trimmed.startsWith(TOML_MARKED_DELIMITER)) {
    const endIndex = trimmed.indexOf(YAML_DELIMITER, TOML_MARKED_DELIMITER.length);
    if (endIndex !== -1) {
      const tomlBlock = trimmed.slice(TOML_MARKED_DELIMITER.length, endIndex).trim();
      const body = trimmed.slice(endIndex + YAML_DELIMITER.length).trimStart();
      const frontmatter = tomlBlock ? (Bun.TOML.parse(tomlBlock) as Frontmatter) : {};
      return { frontmatter, body };
    }
  }

  // Legacy TOML frontmatter: +++
  if (trimmed.startsWith(TOML_DELIMITER)) {
    const endIndex = trimmed.indexOf(TOML_DELIMITER, TOML_DELIMITER.length);
    if (endIndex !== -1) {
      const tomlBlock = trimmed.slice(TOML_DELIMITER.length, endIndex).trim();
      const body = trimmed.slice(endIndex + TOML_DELIMITER.length).trimStart();
      const frontmatter = tomlBlock ? (Bun.TOML.parse(tomlBlock) as Frontmatter) : {};
      return { frontmatter, body };
    }
  }

  return { frontmatter: {}, body: content };
}
