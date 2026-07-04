import type { Page } from "./pages.ts";

export interface Collections {
  all: Page[];
  [tag: string]: Page[];
}

/**
 * Build tag-based collections from a list of pages.
 * A page with `tags: ["post"]` is added to `collections.post`.
 * Pages can opt out with `excludeFromCollections: true`.
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

  const collections: Collections = { all };
  for (const [tag, list] of byTag) {
    collections[tag] = list;
  }

  return collections;
}
