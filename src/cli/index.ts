#!/usr/bin/env bun
// CLI entry point for the Bolota static site generator

import pkg from "../../package.json";
import { loadConfig } from "../core/config.ts";
import { Site } from "../core/site.ts";
import { transformMarkdown } from "../plugins/markdown.ts";
import { applyLayout } from "../plugins/templates.ts";
import { copyAssets } from "../plugins/assets.ts";
import { copyColocatedAssets } from "../plugins/colocated.ts";
import { createDevServer, type DevServer } from "../plugins/server.ts";
import { startWatcher } from "../plugins/watcher.ts";

const VERSION: string = pkg.version;

interface CliArgs {
  command: string;
  port?: number;
  help: boolean;
  version: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
  let command: string | undefined;
  let port: number | undefined;
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--port" || arg === "-p") {
      port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    } else if (!command && !arg.startsWith("-")) {
      command = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error(`Invalid port: ${port}`);
  }

  return { command: command ?? "build", port, help, version };
}

function printUsage(): void {
  console.log(`Bolota v${VERSION}
`);
  console.log("Usage: bolota <command> [options]\n");
  console.log("Commands:");
  console.log("  build          Generate the static site");
  console.log("  serve          Build, serve, and rebuild on changes (alias: watch)");
  console.log("\nOptions:");
  console.log("  -p, --port <n>  Port for the development server");
  console.log("  -h, --help      Show this help message");
  console.log("  -v, --version   Show the version number");
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseCliArgs(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exit(1);
  }

  if (args.help) {
    printUsage();
    return;
  }

  if (args.version) {
    console.log(VERSION);
    return;
  }

  const command = args.command;
  if (command !== "build" && command !== "serve" && command !== "watch") {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  // A production build must not silently fall back to defaults on a broken
  // config; the dev server can, so you can fix the config while it runs.
  const { config, data: siteData } = await loadConfig(process.cwd(), {
    strict: command === "build",
  });
  if (args.port !== undefined) {
    config.port = args.port;
  }

  const site = new Site(config, process.cwd(), siteData);

  // Register built-in plugins
  site.use({
    name: "markdown",
    async transform(page, site) {
      return transformMarkdown(page, site);
    },
  });

  site.use({
    name: "templates",
    async transform(page, site) {
      return applyLayout(page, site);
    },
  });

  // Runs in buildEnd: the output directory is cleaned after the transform
  // phases, so assets must be copied once pages are written, not during them.
  site.use({
    name: "colocated",
    async buildEnd(site) {
      await Promise.all(
        site.pages.map((page) => copyColocatedAssets(page, config, site.cwd)),
      );
    },
  });

  site.use({
    name: "assets",
    async buildEnd(site) {
      await copyAssets(config, site.cwd);
    },
  });

  let server: DevServer | null = null;
  let watcherCleanup: (() => void) | null = null;

  const shutdown = (): void => {
    if (watcherCleanup) watcherCleanup();
    const stopped = server ? server.stop() : Promise.resolve();
    stopped.finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const reportBuildErrors = (): void => {
    for (const e of site.errors) {
      console.error(`[build] ${e.page} (${e.plugin}): ${e.message}`);
    }
  };

  if (command === "build") {
    await site.build();
    if (site.errors.length > 0) {
      reportBuildErrors();
      console.error(`Build finished with ${site.errors.length} page error(s).`);
      process.exit(1);
    }
    console.log("Build complete.");
    return;
  }

  // serve / watch: build, serve, and rebuild on changes.
  await site.build();
  reportBuildErrors();
  server = createDevServer(config);
  watcherCleanup = startWatcher(config, site, process.cwd(), {
    onRebuild: () => server?.broadcast(),
    onError: (messages) => server?.broadcastError(messages),
  });
  console.log(`Server running at http://localhost:${config.port}`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
