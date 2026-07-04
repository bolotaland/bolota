/**
 * Split Markdown into alternating segments of regular text and fenced code
 * blocks (``` or ~~~), so text-level transforms (shortcodes, internal links,
 * heading extraction) can skip code. Inline code spans are not detected.
 */

export interface MarkdownSegment {
  text: string;
  /** True when the segment is a fenced code block. */
  code: boolean;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function splitCodeFences(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = content.split("\n");
  let buffer: string[] = [];
  let inCode = false;
  let fence = "";

  const flush = (code: boolean): void => {
    if (buffer.length === 0) return;
    segments.push({ text: buffer.join("\n"), code });
    buffer = [];
  };

  for (const line of lines) {
    if (!inCode) {
      const match = line.match(FENCE);
      if (match) {
        flush(false);
        inCode = true;
        fence = match[1];
      }
      buffer.push(line);
    } else {
      buffer.push(line);
      const closing = line.match(FENCE);
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
        flush(true);
        inCode = false;
      }
    }
  }
  flush(inCode);

  return segments;
}

/** Apply a transform to every non-code segment, leaving code blocks intact. */
export function transformOutsideCodeFences(
  content: string,
  transform: (text: string) => string,
): string {
  return splitCodeFences(content)
    .map((segment) => (segment.code ? segment.text : transform(segment.text)))
    .join("\n");
}

/** Async variant of {@link transformOutsideCodeFences}. */
export async function transformOutsideCodeFencesAsync(
  content: string,
  transform: (text: string) => Promise<string>,
): Promise<string> {
  const out: string[] = [];
  for (const segment of splitCodeFences(content)) {
    out.push(segment.code ? segment.text : await transform(segment.text));
  }
  return out.join("\n");
}
