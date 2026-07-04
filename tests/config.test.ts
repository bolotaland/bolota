import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, defaultConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_config");

afterAll(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

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

  it("loads bolota.config.js when no .ts config exists", async () => {
    await Bun.write(
      join(tmpRoot, "bolota.config.js"),
      `export default { port: 4242 };`,
    );
    const { config } = await loadConfig(tmpRoot);
    expect(config.port).toBe(4242);
  });

  it("throws on a broken config in strict mode, warns otherwise", async () => {
    await Bun.write(
      join(tmpRoot, "bolota.config.ts"),
      `throw new Error("boom");`,
    );

    await expect(loadConfig(tmpRoot, { strict: true })).rejects.toThrow(/Failed to load config/);

    const { config } = await loadConfig(tmpRoot);
    expect(config).toEqual({ ...defaultConfig });
  });
});
