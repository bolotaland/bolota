import { join, resolve } from "node:path";
import { importFresh } from "./modules.ts";
import { slugify } from "./html.ts";
import type { Site } from "./site.ts";

export interface RenderImageData {
  src: string;
  alt: string;
  title?: string;
}

export interface RenderLinkData {
  href: string;
  text: string;
  title?: string;
}

export interface RenderHeadingData {
  depth: number;
  text: string;
  slug: string;
}

type RenderHook = (data: Record<string, unknown>) => string | Promise<string>;

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

async function findRenderHook(site: Site, name: string): Promise<RenderHook | null> {
  const hooksDir = resolve(site.cwd, site.config.srcDir, site.config.layoutsDir, "_markup");

  for (const ext of [".ts", ".js"]) {
    const path = join(hooksDir, `${name}${ext}`);
    if (await Bun.file(path).exists()) {
      const module = await importFresh(path);
      const fn = module.default ?? module;
      if (typeof fn !== "function") {
        throw new Error(`Render hook "${name}" at "${path}" must export a function.`);
      }
      return fn as RenderHook;
    }
  }

  return null;
}

/** Resolve a render hook, memoized per build to avoid per-element FS lookups. */
function loadRenderHook(site: Site, name: string): Promise<RenderHook | null> {
  const cacheKey = `render-hook:${name}`;
  let cached = site.buildCache.get(cacheKey) as Promise<RenderHook | null> | undefined;
  if (!cached) {
    cached = findRenderHook(site, name);
    site.buildCache.set(cacheKey, cached);
  }
  return cached;
}

/** Decode the few entities Bun's Markdown renderer emits in text content. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

interface ImageRecord {
  src: string;
  alt: string;
  title?: string;
}

interface LinkRecord {
  href: string;
  title?: string;
  text: string;
  /** True when the link contains child elements (images, emphasis, ...). */
  rich: boolean;
}

interface HeadingRecord {
  depth: number;
  text: string;
  hasId: boolean;
}

/**
 * Apply render hooks to HTML generated from Markdown, using Bun's native
 * HTMLRewriter — element matching is structural, not regex-based, so
 * attribute order and inline markup inside elements are handled.
 *
 * Two passes over the document: the first collects element data (hooks can
 * be async and element text is only known after parsing), the second applies
 * the computed replacements in the same document order.
 *
 * Defaults without hooks: images and links are left untouched; headings get
 * an `id` attribute (slugs deduplicated per document, matching
 * `extractHeadings`) while preserving their inline markup.
 *
 * Hooks receive plain-text content: a heading hook on `# Hello *world*` gets
 * `text: "Hello world"`. Links whose content is not plain text (e.g. image
 * links) are left untouched rather than flattened.
 */
export async function applyRenderHooks(html: string, site: Site): Promise<string> {
  const [imageHook, linkHook, headingHook] = await Promise.all([
    loadRenderHook(site, "render-image"),
    loadRenderHook(site, "render-link"),
    loadRenderHook(site, "render-heading"),
  ]);

  // Pass 1: collect element data in document order.
  const images: ImageRecord[] = [];
  const links: LinkRecord[] = [];
  const headings: HeadingRecord[] = [];

  const collector = new HTMLRewriter();
  if (imageHook) {
    collector.on("img", {
      element(el) {
        images.push({
          src: el.getAttribute("src") ?? "",
          alt: el.getAttribute("alt") ?? "",
          title: el.getAttribute("title") ?? undefined,
        });
      },
    });
  }
  if (linkHook) {
    collector.on("a", {
      element(el) {
        links.push({
          href: el.getAttribute("href") ?? "",
          title: el.getAttribute("title") ?? undefined,
          text: "",
          rich: false,
        });
      },
      text(chunk) {
        const current = links[links.length - 1];
        if (current) current.text += chunk.text;
      },
    });
    collector.on("a *", {
      element() {
        const current = links[links.length - 1];
        if (current) current.rich = true;
      },
    });
  }
  for (const tag of HEADING_TAGS) {
    collector.on(tag, {
      element(el) {
        headings.push({
          depth: Number(tag[1]),
          text: "",
          hasId: el.hasAttribute("id"),
        });
      },
      text(chunk) {
        const current = headings[headings.length - 1];
        if (current) current.text += chunk.text;
      },
    });
  }

  if (!imageHook && !linkHook && !headingHook && !html.includes("<h")) {
    return html;
  }
  collector.transform(html);

  // Compute replacements between the two passes (hooks may be async).
  const imageOut = await Promise.all(
    images.map((img) => imageHook!({ src: img.src, alt: img.alt, title: img.title })),
  );
  const linkOut = await Promise.all(
    links.map((link) =>
      link.rich
        ? Promise.resolve<string | null>(null)
        : linkHook!({ href: link.href, text: link.text, title: link.title }),
    ),
  );

  const seenSlugs = new Map<string, number>();
  const headingSlugs = headings.map((heading) => {
    let slug = slugify(decodeEntities(heading.text));
    const count = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
    return slug;
  });
  const headingOut = await Promise.all(
    headings.map((heading, i) =>
      headingHook
        ? headingHook({ depth: heading.depth, text: heading.text, slug: headingSlugs[i] })
        : Promise.resolve<string | null>(null),
    ),
  );

  // Pass 2: apply mutations in the same document order.
  let imageIndex = 0;
  let linkIndex = 0;
  let headingIndex = 0;

  const applier = new HTMLRewriter();
  if (imageHook) {
    applier.on("img", {
      element(el) {
        el.replace(imageOut[imageIndex++], { html: true });
      },
    });
  }
  if (linkHook) {
    applier.on("a", {
      element(el) {
        const replacement = linkOut[linkIndex++];
        if (replacement !== null) {
          el.replace(replacement, { html: true });
        }
      },
    });
  }
  for (const tag of HEADING_TAGS) {
    applier.on(tag, {
      element(el) {
        const i = headingIndex++;
        const replacement = headingOut[i];
        if (replacement !== null) {
          el.replace(replacement, { html: true });
          return;
        }
        if (!headings[i].hasId) {
          el.setAttribute("id", headingSlugs[i]);
        }
      },
    });
  }

  return applier.transform(html);
}
