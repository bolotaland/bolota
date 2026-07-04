import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, defaultConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_config");

describe("loadConfig", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns default config when no config file exists", async () => {
    const { config, data } = await loadConfig(tmpRoot);
    expect(config).toEqual(defaultConfig);
    expect(data.getGlobalData()).toEqual({});
  });

  it("loads and merges user config", async () => {
    await Bun.write(
      join(tmpRoot, "bolota.config.ts"),
      `export default { port: 8080, site: { name: "Test" } };`,
    );
    const { config } = await loadConfig(tmpRoot);
    expect(config.port).toBe(8080);
    expect(config.site).toEqual({ name: "Test" });
    expect(config.contentDir).toBe(defaultConfig.contentDir);
  });

  it("ignores invalid config values (e.g. empty strings)", async () => {
    await Bun.write(
      join(tmpRoot, "bolota.config.ts"),
      `export default { srcDir: "", port: "not-a-number" };`,
    );
    const { config } = await loadConfig(tmpRoot);
    expect(config.srcDir).toBe(defaultConfig.srcDir);
    expect(config.port).toBe(defaultConfig.port);
  });
});
