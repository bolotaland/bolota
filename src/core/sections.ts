import { dirname } from "node:path";
import type { Page } from "./pages.ts";

export interface Section {
  /** Pages that belong to this section (excluding the section page itself). */
  pages: Page[];
}

/** Section keys are the "/"-separated directory of the _index.md file ("." for root). */
function sectionKey(page: Page): string {
  return dirname(page.relativePath);
}

/** Build a map of section paths to their child pages. */
export function buildSections(pages: Page[]): Map<string, Section> {
  const sections = new Map<string, Section>();

  // First pass: create sections for every _index.md.
  for (const page of pages) {
    if (page.kind === "section") {
      sections.set(sectionKey(page), { pages: [] });
    }
  }

  // Second pass: assign regular pages to their parent section.
  for (const page of pages) {
    if (page.kind !== "page") {
      continue;
    }

    const section = sections.get(sectionKey(page));
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
  return sections.get(sectionKey(page));
}
