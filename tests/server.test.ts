import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createDevServer, type DevServer } from "../src/plugins/server.ts";
import type { BolotaConfig } from "../src/core/config.ts";

const tmpBase = join(import.meta.dir, "__tmp_server");

afterAll(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

const baseConfig: BolotaConfig = {
  srcDir: ".",
  contentDir: "content",
  layoutsDir: "layouts",
  publicDir: "public",
  outDir: "_site",
  port: 3000,
};

describe("dev server", () => {
  let tmpRoot: string;
  let dev: DevServer | null = null;

  beforeEach(async () => {
    tmpRoot = join(tmpBase, crypto.randomUUID());
    await Bun.write(join(tmpRoot, "_site", "index.html"), "<html><body>Home</body></html>");
    await Bun.write(join(tmpRoot, "_site", "about", "index.html"), "<html><body>About</body></html>");
    await Bun.write(join(tmpRoot, "_site", "404", "index.html"), "<html><body>Custom 404</body></html>");
    await Bun.write(join(tmpRoot, "_site", "my file.txt"), "spaced");
    await Bun.write(join(tmpRoot, "secret.txt"), "secret");
  });

  afterEach(async () => {
    if (dev) {
      await dev.stop();
      dev = null;
    }
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function url(path: string): string {
    return `http://localhost:${dev!.server.port}${path}`;
  }

  it("serves pretty URLs and redirects missing trailing slashes", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const home = await fetch(url("/"));
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Home");

    const withSlash = await fetch(url("/about/"));
    expect(withSlash.status).toBe(200);

    const noSlash = await fetch(url("/about"), { redirect: "manual" });
    expect(noSlash.status).toBe(301);
    expect(noSlash.headers.get("Location")).toBe("/about/");
  });

  it("redirects .html requests to pretty URLs", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/about.html"), { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/about/");

    const index = await fetch(url("/index.html"), { redirect: "manual" });
    expect(index.status).toBe(301);
    expect(index.headers.get("Location")).toBe("/");
  });

  it("serves the site's own 404 page", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/nope/"));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Custom 404");
  });

  it("decodes percent-encoded paths", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/my%20file.txt"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("spaced");
  });

  it("blocks path traversal outside the output directory", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/%2e%2e/secret.txt"));
    expect([403, 404]).toContain(response.status);
    expect(await response.text()).not.toBe("secret");
  });

  it("injects the live-reload script into HTML", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/"));
    expect(await response.text()).toContain("/__livereload");
  });

  it("does not inject when live reload is disabled", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0, liveReload: false });

    const response = await fetch(url("/"));
    expect(await response.text()).not.toContain("/__livereload");
  });

  it("broadcasts reload and error events over SSE", async () => {
    dev = createDevServer(baseConfig, tmpRoot, { port: 0 });

    const response = await fetch(url("/__livereload"));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const read = async (): Promise<string> => {
      const { value } = await reader.read();
      return decoder.decode(value);
    };

    expect(await read()).toContain(":ok");

    dev.broadcast();
    expect(await read()).toContain("data: reload");

    dev.broadcastError(["bad.md (templates): layout exploded"]);
    const chunk = await read();
    expect(chunk).toContain("data: error:");
    expect(chunk).toContain("layout exploded");

    await reader.cancel();
  });
});
