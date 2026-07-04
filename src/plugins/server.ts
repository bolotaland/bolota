// Development server with live-reload via SSE

import { join, resolve, sep } from "node:path";
import type { BolotaConfig } from "../core/config.ts";

type BunServer = ReturnType<typeof Bun.serve>;

interface LiveReloadClient {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
}

let clients: Set<LiveReloadClient> = new Set();
let clientIdCounter = 0;

function addClient(controller: ReadableStreamDefaultController<Uint8Array>): number {
  const id = ++clientIdCounter;
  clients.add({ id, controller });
  return id;
}

function removeClient(id: number): void {
  for (const client of clients) {
    if (client.id === id) {
      clients.delete(client);
      break;
    }
  }
}

/**
 * Broadcast a reload message to all connected SSE clients.
 */
export function broadcastReload(): void {
  const encoder = new TextEncoder();
  const message = encoder.encode("data: reload\n\n");
  for (const client of clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      // Client disconnected; ignore
    }
  }
}

function resolveOutputPath(
  outputDir: string,
  pathname: string,
): { filePath: string; redirect?: string } {
  const normalized = pathname.replace(/\.html$/i, "");

  // If the request ends with .html, redirect to the pretty URL.
  if (normalized !== pathname) {
    const target = normalized === "" ? "/" : `${normalized}/`;
    return { filePath: join(outputDir, normalized, "index.html"), redirect: target };
  }

  const filePath = pathname.endsWith("/")
    ? join(outputDir, pathname, "index.html")
    : join(outputDir, pathname);

  return { filePath };
}

/**
 * Create a development server that serves the built site and injects
 * a live-reload script into HTML responses.
 */
export function createDevServer(
  config: BolotaConfig,
  cwd: string = process.cwd(),
  options: { port?: number; liveReload?: boolean } = {},
): { server: BunServer; stop: () => Promise<void> } {
  const outputDir = join(cwd, config.outDir);
  const port = options.port ?? config.port;
  const enableLiveReload = options.liveReload ?? true;

  const server = Bun.serve({
    port,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);

      // SSE endpoint for live-reload
      if (enableLiveReload && url.pathname === "/__livereload") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const id = addClient(controller);
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(":ok\n\n"));
            request.signal.addEventListener("abort", () => {
              removeClient(id);
            });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      const { filePath, redirect } = resolveOutputPath(outputDir, url.pathname);

      // Prevent path traversal outside the output directory.
      const resolvedFile = resolve(filePath);
      const resolvedOutput = resolve(outputDir);
      const isInside =
        resolvedFile === resolvedOutput ||
        resolvedFile.startsWith(`${resolvedOutput}${sep}`);
      if (!isInside) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }

      // Redirect .html requests to their pretty URL before serving.
      if (redirect) {
        return new Response(null, { status: 301, headers: { Location: redirect } });
      }

      const contentType = file.type;

      // Only read HTML into memory for live-reload injection.
      if (enableLiveReload && contentType.startsWith("text/html")) {
        let content = await file.text();
        if (!content.includes("__livereload")) {
          const script = `
<script>
(function(){
  const es = new EventSource('/__livereload');
  es.onmessage = function(e){ if(e.data === 'reload') location.reload(); };
  es.onerror = function(){ es.close(); };
})();
</script>
`;
          content = content.replace("</body>", `${script}</body>`);
        }
        return new Response(content, {
          headers: { "Content-Type": contentType },
        });
      }

      // Stream non-HTML files directly from disk.
      return new Response(file);
    },
  });

  return {
    server,
    stop: async () => {
      await server.stop();
      clients.clear();
    },
  };
}
