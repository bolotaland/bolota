/**
 * Split Markdown into alternating segments of regular text and code, so
 * text-level transforms (shortcodes, internal links, heading extraction)
 * can skip code. Two levels are handled:
 *
 * - fenced code blocks (``` or ~~~), line-based;
 * - inline code spans (`...`, ``...``), following CommonMark's rule that a
 *   span opens with a backtick run and closes with the next run of the same
 *   length.
 */

export interface MarkdownSegment {
  text: string;
  /** True when the segment is code (fenced block or inline span). */
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

/**
 * Split text into inline code spans and regular text. A span opens with a
 * run of N backticks and closes with the next run of exactly N backticks;
 * unmatched runs stay literal text. Segments joined with "" rebuild the input.
 */
export function splitInlineCode(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let cursor = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "`") {
      i++;
      continue;
    }

    const start = i;
    while (i < text.length && text[i] === "`") i++;
    const runLength = i - start;

    // Find the next backtick run of exactly the same length.
    let j = i;
    let closeStart = -1;
    while (j < text.length) {
      if (text[j] !== "`") {
        j++;
        continue;
      }
      const runStart = j;
      while (j < text.length && text[j] === "`") j++;
      if (j - runStart === runLength) {
        closeStart = runStart;
        break;
      }
    }

    if (closeStart === -1) {
      continue; // Unmatched run: literal backticks, keep scanning after them.
    }

    const end = closeStart + runLength;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), code: false });
    }
    segments.push({ text: text.slice(start, end), code: true });
    cursor = end;
    i = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), code: false });
  }

  return segments;
}

/**
 * Apply a transform to every part of the content that is neither a fenced
 * code block nor an inline code span.
 */
export function transformOutsideCode(
  content: string,
  transform: (text: string) => string,
): string {
  return splitCodeFences(content)
    .map((block) =>
      block.code
        ? block.text
        : splitInlineCode(block.text)
            .map((span) => (span.code ? span.text : transform(span.text)))
            .join(""),
    )
    .join("\n");
}

/** Async variant of {@link transformOutsideCode}. */
export async function transformOutsideCodeAsync(
  content: string,
  transform: (text: string) => Promise<string>,
): Promise<string> {
  const blocks: string[] = [];
  for (const block of splitCodeFences(content)) {
    if (block.code) {
      blocks.push(block.text);
      continue;
    }
    const spans: string[] = [];
    for (const span of splitInlineCode(block.text)) {
      spans.push(span.code ? span.text : await transform(span.text));
    }
    blocks.push(spans.join(""));
  }
  return blocks.join("\n");
}
