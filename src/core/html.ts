/** Marker type for HTML strings that should not be escaped. */
export interface SafeString {
  __html: string;
}

/** Mark a string as safe HTML. */
export function safe(html: string): SafeString {
  return { __html: html };
}

/** Check if a value is a SafeString. */
export function isSafe(value: unknown): value is SafeString {
  return typeof value === "object" && value !== null && "__html" in value;
}

/** Escape HTML special characters using Bun's native helper. */
export function escapeHTML(input: unknown): string {
  return Bun.escapeHTML(String(input ?? ""));
}

/** Convert a value to HTML, escaping unless it is marked safe. */
export function toHTML(value: unknown): string {
  if (isSafe(value)) {
    return value.__html;
  }
  return escapeHTML(value);
}

/**
 * Normalize a URL for internal links.
 * - Leaves absolute URLs and anchors untouched.
 * - Removes `.html` suffix.
 * - Ensures leading slash.
 * - Adds trailing slash for pretty URLs.
 */
export function url(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("#")) {
    return path;
  }

  let normalized = path.replace(/\.html$/i, "");

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1 && !normalized.includes(".") && !normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }

  return normalized || "/";
}

/** Convert text to a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build an HTML attribute string from a record. */
export function joinAttributes(attrs: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue;
    }
    if (value === true) {
      parts.push(escapeHTML(key));
    } else {
      parts.push(`${escapeHTML(key)}="${escapeHTML(String(value))}"`);
    }
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}
