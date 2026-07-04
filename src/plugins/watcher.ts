// File watcher plugin using fs.watch

import { watch } from "node:fs";
import { join } from "node:path";
import type { BolotaConfig } from "../core/config.ts";
import type { Site } from "../core/site.ts";
import { broadcastReload } from "./server.ts";

type WatcherCallback = () => Promise<void>;

/**
 * Watch source and layout directories for changes and invoke a callback.
 * Returns a cleanup function to stop watching.
 */
export function watchFiles(
  config: BolotaConfig,
  callback: WatcherCallback,
  cwd: string = process.cwd(),
): () => void {
  const srcDir = join(cwd, config.srcDir, config.contentDir);
  const layoutsDir = join(cwd, config.srcDir, config.layoutsDir);

  const watchedPaths = new Set([srcDir, layoutsDir]);
  const watchers: ReturnType<typeof watch>[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerRebuild = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      callback().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[watcher] Rebuild failed: ${message}`);
      });
    }, 150);
  };

  for (const dir of watchedPaths) {
    const w = watch(
      dir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const filenameStr = filename instanceof Buffer ? filename.toString() : filename;
        // Ignore hidden files and common temp files
        if (filenameStr.startsWith(".") || filenameStr.endsWith("~")) {
          return;
        }
        triggerRebuild();
      },
    );

    w.on("error", (err: Error) => {
      console.error(`[watcher] Error watching ${dir}: ${err.message}`);
    });

    watchers.push(w);
  }

  return () => {
    for (const w of watchers) {
      w.close();
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}

/**
 * Watch the site and rebuild on changes.
 */
export function startWatcher(config: BolotaConfig, site: Site, cwd: string = process.cwd()): () => void {
  const cleanup = watchFiles(config, async () => {
    console.log("[watch] Rebuilding...");
    await site.build();
    broadcastReload();
    console.log("[watch] Rebuild complete.");
  }, cwd);

  console.log(`[watch] Watching ${join(cwd, config.srcDir)} for changes...`);
  return cleanup;
}
