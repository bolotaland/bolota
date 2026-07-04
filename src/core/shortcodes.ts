import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Site } from "./site.ts";

const SHORTCODE_REGEX = /\{\{\s*(\w+)\s*\(([^)]*)\)\s*\}\}/g;

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
    } else if (/^-?\d+$/.test(value)) {
      args[key] = Number(value);
    } else {
      args[key] = value;
    }
  }

  return args;
}

async function loadShortcode(site: Site, name: string): Promise<(args: Record<string, unknown>) => string | Promise<string>> {
  const shortcodesDir = join(site.config.srcDir, site.config.layoutsDir, "shortcodes");

  for (const ext of [".ts", ".js"]) {
    const path = join(shortcodesDir, `${name}${ext}`);
    if (await Bun.file(path).exists()) {
      const url = Bun.pathToFileURL(path).href;
      const module = await import(url);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Shortcode "${name}" at "${path}" must export a function.`);
      }
      return fn;
    }
  }

  throw new Error(`Shortcode "${name}" not found in "${shortcodesDir}".`);
}

/**
 * Process shortcodes in Markdown content.
 * Syntax: {{ name(arg1="value", arg2=123) }}
 */
export async function processShortcodes(content: string, site: Site): Promise<string> {
  const matches: Array<{
    index: number;
    length: number;
    replacement: string;
  }> = [];

  for (const match of content.matchAll(SHORTCODE_REGEX)) {
    const name = match[1];
    const argsString = match[2];

    try {
      const fn = await loadShortcode(site, name);
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
