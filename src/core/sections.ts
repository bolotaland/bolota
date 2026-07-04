import { dirname } from "node:path";
import type { Page } from "./pages.ts";

export interface Section {
  /** Pages that belong to this section (excluding the section page itself). */
  pages: Page[];
}

/** Build a map of section paths to their child pages. */
export function buildSections(pages: Page[]): Map<string, Section> {
  const sections = new Map<string, Section>();

  // First pass: create sections for every _index.md.
  for (const page of pages) {
    if (page.kind === "section") {
      const sectionPath = dirname(page.relativePath).replace(/\\/g, "/");
      sections.set(sectionPath, { pages: [] });
    }
  }

  // Second pass: assign regular pages to their parent section.
  for (const page of pages) {
    if (page.kind !== "page") {
      continue;
    }

    const pageDir = dirname(page.relativePath).replace(/\\/g, "/");
    const section = sections.get(pageDir);
    if (section) {
      section.pages.push(page);
    }
  }

  return sections;
}

/** Get the section for a given page, if any. */
export function getSection(sections: Map<string, Section>, page: Page): Section | undefined {
  if (page.kind !== "section") {
    return undefined;
  }
  const sectionPath = dirname(page.relativePath).replace(/\\/g, "/");
  return sections.get(sectionPath);
}
