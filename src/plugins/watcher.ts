// File watcher plugin using fs.watch

import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";
import type { BolotaConfig } from "../core/config.ts";
import type { Site } from "../core/site.ts";

type WatcherCallback = () => Promise<void>;

/**
 * Watch content, layout, and public directories for changes and invoke a
 * callback. Missing directories are skipped. Overlapping rebuilds are
 * serialized: changes arriving during a build trigger exactly one more run.
 * Returns a cleanup function to stop watching.
 */
export function watchFiles(
  config: BolotaConfig,
  callback: WatcherCallback,
  cwd: string = process.cwd(),
): () => void {
  const dirs = [
    resolve(cwd, config.srcDir, config.contentDir),
    resolve(cwd, config.srcDir, config.layoutsDir),
    resolve(cwd, config.srcDir, config.publicDir),
  ];
  const watchedPaths = [...new Set(dirs)].filter((dir) => existsSync(dir));

  const watchers: ReturnType<typeof watch>[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let pending = false;

  const runCallback = (): void => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    callback()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[watcher] Rebuild failed: ${message}`);
      })
      .finally(() => {
        building = false;
        if (pending) {
          pending = false;
          triggerRebuild();
        }
      });
  };

  const triggerRebuild = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runCallback, 300);
  };

  for (const dir of watchedPaths) {
    const w = watch(
      dir,
      { recursive: true },
      (_eventType, filename) => {
        if (!filename) {
          return;
        }
        // Ignore hidden files and common temp files
        if (filename.startsWith(".") || filename.endsWith("~")) {
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

export interface WatchHooks {
  /** Called after a rebuild that produced no errors (e.g. live-reload broadcast). */
  onRebuild?: () => void;
  /** Called when a rebuild fails or finishes with page errors (e.g. error overlay). */
  onError?: (messages: string[]) => void;
}

/**
 * Watch the site and rebuild on changes.
 */
export function startWatcher(
  config: BolotaConfig,
  site: Site,
  cwd: string = process.cwd(),
  hooks: WatchHooks = {},
): () => void {
  const cleanup = watchFiles(
    config,
    async () => {
      console.log("[watch] Rebuilding...");
      try {
        await site.build();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[watch] Build failed: ${message}`);
        hooks.onError?.([message]);
        return;
      }

      if (site.errors.length > 0) {
        const messages = site.errors.map(
          (e) => `${e.page} (${e.plugin}): ${e.message}`,
        );
        for (const message of messages) {
          console.error(`[watch] ${message}`);
        }
        hooks.onError?.(messages);
        return;
      }

      hooks.onRebuild?.();
      console.log("[watch] Rebuild complete.");
    },
    cwd,
  );

  console.log(`[watch] Watching ${resolve(cwd, config.srcDir)} for changes...`);
  return cleanup;
}
