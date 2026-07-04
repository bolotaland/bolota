// Development server with live-reload via SSE

import { join, resolve, sep } from "node:path";
import type { BolotaConfig } from "../core/config.ts";

type BunServer = ReturnType<typeof Bun.serve>;

export interface DevServer {
  server: BunServer;
  /** Notify connected browsers that the site changed. */
  broadcast: () => void;
  stop: () => Promise<void>;
}

const LIVE_RELOAD_SCRIPT = `
<script>
(function(){
  const es = new EventSource('/__livereload');
  es.onmessage = function(e){ if(e.data === 'reload') location.reload(); };
  es.onerror = function(){ es.close(); };
})();
</script>
`;

function injectLiveReload(html: string): string {
  if (html.includes("/__livereload")) {
    return html;
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${LIVE_RELOAD_SCRIPT}</body>`);
  }
  return html + LIVE_RELOAD_SCRIPT;
}

/**
 * Create a development server that serves the built site and injects
 * a live-reload script into HTML responses.
 */
export function createDevServer(
  config: BolotaConfig,
  cwd: string = process.cwd(),
  options: { port?: number; liveReload?: boolean } = {},
): DevServer {
  const outputDir = resolve(cwd, config.outDir);
  const port = options.port ?? config.port;
  const enableLiveReload = options.liveReload ?? true;

  const clients = new Map<number, ReadableStreamDefaultController<Uint8Array>>();
  let nextClientId = 0;
  const encoder = new TextEncoder();

  const broadcast = (): void => {
    const message = encoder.encode("data: reload\n\n");
    for (const [id, controller] of clients) {
      try {
        controller.enqueue(message);
      } catch {
        clients.delete(id);
      }
    }
  };

  /** Join against outputDir, refusing paths that escape it (traversal). */
  const safeJoin = (...parts: string[]): string | null => {
    const candidate = resolve(join(outputDir, ...parts));
    if (candidate === outputDir || candidate.startsWith(`${outputDir}${sep}`)) {
      return candidate;
    }
    return null;
  };

  const serveHtml = (html: string, status = 200): Response => {
    return new Response(enableLiveReload ? injectLiveReload(html) : html, {
      status,
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  };

  const notFound = async (): Promise<Response> => {
    // Serve the site's own 404 page when it exists.
    for (const candidate of ["404/index.html", "404.html"]) {
      const filePath = safeJoin(candidate);
      if (!filePath) continue;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return serveHtml(await file.text(), 404);
      }
    }
    return new Response("Not Found", { status: 404 });
  };

  const server = Bun.serve({
    port,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      // SSE endpoint for live-reload
      if (enableLiveReload && pathname === "/__livereload") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const id = ++nextClientId;
            clients.set(id, controller);
            controller.enqueue(encoder.encode(":ok\n\n"));
            request.signal.addEventListener("abort", () => {
              clients.delete(id);
            });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Requests ending in .html redirect to their pretty URL:
      // /about.html -> /about/, /blog/index.html -> /blog/, /index.html -> /.
      const withoutHtml = pathname.replace(/\.html$/i, "");
      if (withoutHtml !== pathname) {
        const target = withoutHtml.endsWith("/index")
          ? withoutHtml.slice(0, -"index".length)
          : `${withoutHtml}/`;
        const filePath = safeJoin(target, "index.html");
        if (filePath && (await Bun.file(filePath).exists())) {
          return new Response(null, { status: 301, headers: { Location: target } });
        }
        return notFound();
      }

      const filePath = pathname.endsWith("/")
        ? safeJoin(pathname, "index.html")
        : safeJoin(pathname);
      if (!filePath) {
        return new Response("Forbidden", { status: 403 });
      }

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        // Redirect /about to /about/ when _site/about/index.html exists.
        if (!pathname.endsWith("/")) {
          const indexPath = safeJoin(pathname, "index.html");
          if (indexPath && (await Bun.file(indexPath).exists())) {
            return new Response(null, { status: 301, headers: { Location: `${pathname}/` } });
          }
        }
        return notFound();
      }

      // Only read HTML into memory for live-reload injection.
      if (enableLiveReload && file.type.startsWith("text/html")) {
        return serveHtml(await file.text());
      }

      // Stream non-HTML files directly from disk.
      return new Response(file);
    },
  });

  return {
    server,
    broadcast,
    stop: async () => {
      for (const [, controller] of clients) {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
      clients.clear();
      await server.stop();
    },
  };
}
