// CLI entry point for the Bolota static site generator

import { loadConfig } from "../core/config.ts";
import { Site } from "../core/site.ts";
import { transformMarkdown } from "../plugins/markdown.ts";
import { applyLayout } from "../plugins/templates.ts";
import { copyAssets } from "../plugins/assets.ts";
import { copyColocatedAssets } from "../plugins/colocated.ts";
import { createDevServer } from "../plugins/server.ts";
import { startWatcher } from "../plugins/watcher.ts";

const VERSION = "0.1.0";

function printUsage(): void {
  console.log(`Bolota v${VERSION}
`);
  console.log("Usage: bun run src/cli/index.ts <command>\n");
  console.log("Commands:");
  console.log("  build   Generate the static site");
  console.log("  serve   Build and start the development server");
  console.log("  watch   Build, start the server, and rebuild on changes");
  console.log("  --help  Show this help message");
  console.log("  --version Show the version number");
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const command = args[0] ?? "build";

  if (command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  const { config, data: siteData } = await loadConfig();
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

  site.use({
    name: "colocated",
    async transform(page, site) {
      await copyColocatedAssets(page, config, site.cwd);
      return page;
    },
  });

  site.use({
    name: "assets",
    async buildEnd() {
      await copyAssets(config);
    },
  });

  let server: ReturnType<typeof createDevServer> | null = null;
  let watcherCleanup: (() => void) | null = null;

  const shutdown = (): void => {
    const tasks: Promise<unknown>[] = [];
    if (server) tasks.push(server.stop());
    if (watcherCleanup) watcherCleanup();
    Promise.all(tasks).finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  switch (command) {
    case "build": {
      await site.build();
      console.log("Build complete.");
      break;
    }
    case "serve": {
      await site.build();
      server = createDevServer(config);
      console.log(`Server running at http://localhost:${config.port}`);
      break;
    }
    case "watch": {
      await site.build();
      server = createDevServer(config);
      watcherCleanup = startWatcher(config, site);
      console.log(`Server running at http://localhost:${config.port}`);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
