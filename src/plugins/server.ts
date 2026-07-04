// Development server with live-reload via SSE

import { join } from "node:path";
import type { Server } from "bun";
import type { IgnisConfig } from "../core/config.ts";

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

/**
 * Create a development server that serves the built site and injects
 * a live-reload script into HTML responses.
 */
export function createDevServer(
  config: IgnisConfig,
  cwd: string = process.cwd(),
  options: { port?: number; liveReload?: boolean } = {},
): { server: Server; stop: () => void } {
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

      // Serve static files from the output directory
      let filePath = join(outputDir, url.pathname);
      if (url.pathname.endsWith("/")) {
        filePath = join(filePath, "index.html");
      }

      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        return new Response("Not Found", { status: 404 });
      }

      let content = await file.text();
      const contentType = file.type;

      // Inject live-reload script into HTML pages
      if (
        enableLiveReload &&
        contentType.includes("text/html") &&
        !content.includes("__livereload")
      ) {
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
    },
  });

  return {
    server,
    stop: () => {
      server.stop();
      clients.clear();
    },
  };
}
