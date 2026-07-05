import { join, resolve } from "node:path";
import { importFresh } from "./modules.ts";
import { transformOutsideCodeAsync } from "./segments.ts";
import type { Site } from "./site.ts";

const SHORTCODE_REGEX = /\{\{\s*(\w+)\s*\(([^)]*)\)\s*\}\}/g;

type ShortcodeFunction = (args: Record<string, unknown>) => string | Promise<string>;

function parseArgs(argsString: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (!argsString.trim()) {
    return args;
  }

  const regex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  for (const match of argsString.matchAll(regex)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];

    if (value === "true") {
      args[key] = true;
    } else if (value === "false") {
      args[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      args[key] = Number(value);
    } else {
      args[key] = value;
    }
  }

  return args;
}

async function findShortcode(site: Site, name: string): Promise<ShortcodeFunction | null> {
  const shortcodesDir = resolve(site.cwd, site.config.srcDir, site.config.layoutsDir, "shortcodes");

  for (const ext of [".ts", ".js"]) {
    const path = join(shortcodesDir, `${name}${ext}`);
    if (await Bun.file(path).exists()) {
      const module = await importFresh(path);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Shortcode "${name}" at "${path}" must export a function.`);
      }
      return fn as ShortcodeFunction;
    }
  }

  return null;
}

/** Resolve a shortcode function, memoized per build to avoid repeated FS lookups. */
function resolveShortcode(site: Site, name: string): Promise<ShortcodeFunction | null> {
  const cacheKey = `shortcode:${name}`;
  let cached = site.buildCache.get(cacheKey) as Promise<ShortcodeFunction | null> | undefined;
  if (!cached) {
    cached = findShortcode(site, name);
    site.buildCache.set(cacheKey, cached);
  }
  return cached;
}

async function processSegment(content: string, site: Site): Promise<string> {
  const matches: Array<{
    index: number;
    length: number;
    replacement: string;
  }> = [];

  for (const match of content.matchAll(SHORTCODE_REGEX)) {
    const name = match[1];
    const argsString = match[2];

    try {
      const fn = await resolveShortcode(site, name);
      if (!fn) {
        console.warn(`[shortcode] Shortcode "${name}" not found in "${site.config.layoutsDir}/shortcodes".`);
        continue;
      }
      const args = parseArgs(argsString);
      const replacement = await fn(args);
      matches.push({ index: match.index, length: match[0].length, replacement });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[shortcode] ${message}`);
    }
  }

  // Replace from end to start to keep indices valid.
  let result = content;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, length, replacement } = matches[i];
    result = result.slice(0, index) + replacement + result.slice(index + length);
  }

  return result;
}

/**
 * Process shortcodes in Markdown content.
 * Syntax: {{ name(arg1="value", arg2=123) }}
 * Occurrences inside fenced code blocks and inline code spans are left untouched.
 */
export async function processShortcodes(content: string, site: Site): Promise<string> {
  return transformOutsideCodeAsync(content, (text) => processSegment(text, site));
}
