import type { Page } from "./pages.ts";

export interface Collections {
  all: Page[];
  [tag: string]: Page[];
}

/** Newest first; pages without a date keep discovery order at the end. */
function byDateDesc(a: Page, b: Page): number {
  if (a.date === undefined && b.date === undefined) return 0;
  if (a.date === undefined) return 1;
  if (b.date === undefined) return -1;
  return b.date.getTime() - a.date.getTime();
}

/**
 * Build tag-based collections from a list of pages.
 * A page with `tags: ["post"]` is added to `collections.post`.
 * Pages can opt out with `excludeFromCollections: true`.
 * Collections are sorted by date, newest first; undated pages come last.
 */
export function buildCollections(pages: Page[]): Collections {
  const all: Page[] = [];
  const byTag = new Map<string, Page[]>();

  for (const page of pages) {
    if (page.frontmatter.excludeFromCollections === true) {
      continue;
    }

    all.push(page);

    const tags = page.frontmatter.tags;
    if (!Array.isArray(tags)) {
      continue;
    }

    for (const tag of tags) {
      if (typeof tag !== "string") {
        continue;
      }
      const list = byTag.get(tag) ?? [];
      list.push(page);
      byTag.set(tag, list);
    }
  }

  all.sort(byDateDesc);

  const collections: Collections = { all };
  for (const [tag, list] of byTag) {
    list.sort(byDateDesc);
    collections[tag] = list;
  }

  return collections;
}
