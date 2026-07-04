// CLI entry point for the Bolota static site generator

import { loadConfig } from "../core/config.ts";
import { Site } from "../core/site.ts";
import { transformMarkdown } from "../plugins/markdown.ts";
import { applyLayout } from "../plugins/vento.ts";
import { copyAssets } from "../plugins/assets.ts";
import { createDevServer } from "../plugins/server.ts";
import { startWatcher } from "../plugins/watcher.ts";

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const command = args[0] ?? "build";

  const config = await loadConfig();
  const site = new Site(config);

  // Register built-in plugins
  site.use({
    name: "markdown",
    transform(page) {
      return transformMarkdown(page);
    },
  });

  site.use({
    name: "vento",
    async transform(page) {
      return applyLayout(page, config);
    },
  });

  site.use({
    name: "assets",
    async buildEnd() {
      await copyAssets(config);
    },
  });

  switch (command) {
    case "build": {
      await site.build();
      console.log("Build complete.");
      break;
    }
    case "serve": {
      await site.build();
      createDevServer(config);
      console.log(`Server running at http://localhost:${config.port}`);
      break;
    }
    case "watch": {
      await site.build();
      createDevServer(config);
      startWatcher(config, site);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      console.error("Usage: bun run src/index.ts <build|serve|watch>");
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
