/**
 * Dynamic module loading with mtime-based cache busting.
 *
 * Bun caches dynamic `import()` results by URL, so re-importing a file that
 * changed on disk (watch mode) would return the stale module. Appending the
 * file's mtime as a query string forces a fresh load whenever the file
 * actually changed, while reusing the cached module otherwise.
 */
export async function importFresh(path: string): Promise<Record<string, unknown>> {
  const stat = await Bun.file(path).stat();
  // Note: the query string must be appended to the plain absolute path.
  // Bun ignores query strings on file:// URLs and would return the cached module.
  return (await import(`${path}?v=${stat.mtimeMs}`)) as Record<string, unknown>;
}
