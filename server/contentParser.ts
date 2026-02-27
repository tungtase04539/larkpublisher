import { marked } from "marked";
import * as cheerio from "cheerio";

/**
 * Lark DocX block types (confirmed from official docs):
 * 1 = Page Block
 * 2 = Text Block
 * 3 = Heading1, 4 = Heading2, 5 = Heading3,
 * 6 = Heading4, 7 = Heading5, 8 = Heading6,
 * 9 = Heading7, 10 = Heading8, 11 = Heading9
 * 12 = Bullet (Unordered List) Block
 * 13 = Ordered List Block
 * 14 = Code Block
 * 15 = Quote Block
 * 17 = ToDo Block
 * 22 = Divider Block
 * 27 = Image Block
 */

/**
 * Lark CodeLanguage enum (from official docs)
 */
const LANGUAGE_MAP: Record<string, number> = {
  plain_text: 1, plaintext: 1, text: 1,
  abap: 2, ada: 3, apache: 4, apex: 5,
  assembly: 6, asm: 6,
  bash: 7, sh: 7, shell: 60, zsh: 7,
  csharp: 8, "c#": 8, cs: 8,
  "c++": 9, cpp: 9, "c": 10,
  cobol: 11, css: 12, coffeescript: 13, coffee: 13,
  d: 14, dart: 15, delphi: 16, django: 17,
  dockerfile: 18, docker: 18,
  erlang: 19, fortran: 20, foxpro: 21,
  go: 22, golang: 22,
  groovy: 23, html: 24, htmlbars: 25, http: 26,
  haskell: 27, hs: 27,
  json: 28, java: 29, javascript: 30, js: 30,
  julia: 31, kotlin: 32, kt: 32,
  latex: 33, tex: 33,
  lisp: 34, logo: 35, lua: 36,
  matlab: 37, makefile: 38, make: 38,
  markdown: 39, md: 39,
  nginx: 40, "objective-c": 41, objc: 41, "objectivec": 41,
  openedgeabl: 42,
  php: 43, perl: 44, pl: 44,
  postscript: 45, powershell: 46, ps1: 46,
  prolog: 47, protobuf: 48, proto: 48,
  python: 49, py: 49,
  r: 50, rpg: 51,
  ruby: 52, rb: 52,
  rust: 53, rs: 53,
  sas: 54, scss: 55, sql: 56,
  scala: 57, scheme: 58, scratch: 59,
  swift: 61, thrift: 62,
  typescript: 63, ts: 63,
  vbscript: 64, vb: 65, "visual basic": 65, visualbasic: 65,
  xml: 66, yaml: 67, yml: 67,
};

function getLanguageCode(lang: string): number {
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] || 1;
}

export interface LarkBlock {
  block_type: number;
  [key: string]: any;
}

export interface ImageReference {
  localPath: string;
  placeholder: string;
}

/** Style context passed down during recursive inline extraction */
interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inline_code?: boolean;
  link?: { url: string };
}

// ─── Block-level tags that should NOT be treated as inline wrappers ───
const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "section", "article", "main", "aside", "nav", "header", "footer", "figure", "figcaption",
  "ul", "ol", "li",
  "blockquote",
  "pre",
  "hr",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "img",
  "details", "summary",
  "dl", "dt", "dd",
]);

// Container tags that should be traversed recursively (they don't produce blocks themselves)
const CONTAINER_TAGS = new Set([
  "div", "section", "article", "main", "aside", "nav", "header", "footer",
  "figure", "figcaption", "details", "summary", "span",
]);

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Convert Markdown content to Lark DocX blocks
 */
export function markdownToLarkBlocks(
  markdown: string,
  imageMap?: Map<string, string>
): LarkBlock[] {
  const html = marked.parse(markdown, { async: false }) as string;
  return htmlToLarkBlocks(html, imageMap);
}

/**
 * Convert HTML content to Lark DocX blocks.
 * Handles deeply nested HTML structures (div > section > p, etc.)
 */
export function htmlToLarkBlocks(
  html: string,
  imageMap?: Map<string, string>
): LarkBlock[] {
  const $ = cheerio.load(html);
  const blocks: LarkBlock[] = [];
  processChildren($, $("body"), blocks, imageMap);
  return blocks;
}

// ─── Recursive block-level processor ─────────────────────────────────

function processChildren(
  $: cheerio.CheerioAPI,
  parent: cheerio.Cheerio<any>,
  blocks: LarkBlock[],
  imageMap?: Map<string, string>
): void {
  parent.contents().each((_, node) => {
    if (node.type === "text") {
      const text = $(node).text().trim();
      if (text) {
        blocks.push(createTextBlock([{ text_run: { content: text } }]));
      }
      return;
    }
    if (node.type !== "tag") return;

    const el = $(node);
    const tag = (node as any).tagName?.toLowerCase() as string;

    processElement($, el, tag, blocks, imageMap);
  });
}

function processElement(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  tag: string,
  blocks: LarkBlock[],
  imageMap?: Map<string, string>
): void {
  switch (tag) {
    // ── Headings ──
    case "h1": blocks.push(createHeadingBlock(3, extractInlineElements($, element, {}))); break;
    case "h2": blocks.push(createHeadingBlock(4, extractInlineElements($, element, {}))); break;
    case "h3": blocks.push(createHeadingBlock(5, extractInlineElements($, element, {}))); break;
    case "h4": blocks.push(createHeadingBlock(6, extractInlineElements($, element, {}))); break;
    case "h5": blocks.push(createHeadingBlock(7, extractInlineElements($, element, {}))); break;
    case "h6": blocks.push(createHeadingBlock(8, extractInlineElements($, element, {}))); break;

    // ── Paragraph ──
    case "p": {
      const imgs = element.find("img");
      if (imgs.length > 0 && imageMap) {
        // Handle images inside paragraphs
        imgs.each((_, imgNode) => {
          const src = $(imgNode).attr("src") || "";
          const imageKey = imageMap.get(src);
          if (imageKey) blocks.push(createImageBlock(imageKey));
        });
        // Also add any remaining text
        const inlineEls = extractInlineElements($, element, {}, true);
        if (inlineEls.length > 0) {
          blocks.push(createTextBlock(inlineEls));
        }
      } else {
        const inlineEls = extractInlineElements($, element, {});
        if (inlineEls.length > 0) {
          blocks.push(createTextBlock(inlineEls));
        }
      }
      break;
    }

    // ── Lists ──
    case "ul": {
      processListItems($, element, 12, blocks, imageMap);
      break;
    }
    case "ol": {
      processListItems($, element, 13, blocks, imageMap);
      break;
    }

    // ── Definition lists ──
    case "dl": {
      element.children().each((_, child) => {
        const childTag = (child as any).tagName?.toLowerCase();
        const childEl = $(child);
        if (childTag === "dt") {
          const els = extractInlineElements($, childEl, { bold: true });
          if (els.length > 0) blocks.push(createTextBlock(els));
        } else if (childTag === "dd") {
          const els = extractInlineElements($, childEl, {});
          if (els.length > 0) blocks.push(createBulletBlock(els));
        }
      });
      break;
    }

    // ── Blockquote ──
    case "blockquote": {
      processBlockquote($, element, blocks, imageMap);
      break;
    }

    // ── Code block ──
    case "pre": {
      const codeEl = element.find("code");
      const codeText = codeEl.length > 0 ? codeEl.text() : element.text();
      const langClass = codeEl.attr("class") || "";
      // Support: language-xxx, lang-xxx, or data-language="xxx"
      const langMatch = langClass.match(/(?:language|lang)-(\w[\w+#-]*)/);
      const dataLang = codeEl.attr("data-language") || element.attr("data-language") || "";
      const language = langMatch ? langMatch[1] : (dataLang || "plain_text");
      blocks.push(createCodeBlock(codeText, language));
      break;
    }

    // ── Horizontal rule ──
    case "hr": {
      blocks.push(createDividerBlock());
      break;
    }

    // ── Table ──
    case "table": {
      processTable($, element, blocks);
      break;
    }

    // ── Standalone image ──
    case "img": {
      if (imageMap) {
        const src = element.attr("src") || "";
        const imageKey = imageMap.get(src);
        if (imageKey) blocks.push(createImageBlock(imageKey));
      }
      break;
    }

    // ── <br> at top level → empty text block ──
    case "br": {
      blocks.push(createTextBlock([{ text_run: { content: "\n" } }]));
      break;
    }

    // ── Container tags → recurse into children ──
    default: {
      if (CONTAINER_TAGS.has(tag)) {
        // Check if this container has only inline content (no block children)
        const hasBlockChildren = element.children().toArray().some((child) => {
          const childTag = (child as any).tagName?.toLowerCase();
          return childTag && BLOCK_TAGS.has(childTag);
        });

        if (hasBlockChildren) {
          // Recurse into children
          processChildren($, element, blocks, imageMap);
        } else {
          // Treat entire container as a text block with inline content
          const inlineEls = extractInlineElements($, element, {});
          if (inlineEls.length > 0) {
            blocks.push(createTextBlock(inlineEls));
          }
        }
      } else {
        // Unknown tag - try to extract text
        const text = element.text().trim();
        if (text) {
          blocks.push(createTextBlock([{ text_run: { content: text } }]));
        }
      }
      break;
    }
  }
}

// ─── List processing ─────────────────────────────────────────────────

function processListItems(
  $: cheerio.CheerioAPI,
  listElement: cheerio.Cheerio<any>,
  blockType: 12 | 13,
  blocks: LarkBlock[],
  imageMap?: Map<string, string>
): void {
  listElement.children("li").each((_, li) => {
    const liEl = $(li);

    // Check for nested lists inside this <li>
    const nestedUl = liEl.children("ul");
    const nestedOl = liEl.children("ol");

    // Extract inline content of this <li> (excluding nested lists)
    const inlineEls = extractInlineElements($, liEl, {}, false, true);
    if (inlineEls.length > 0) {
      if (blockType === 12) {
        blocks.push(createBulletBlock(inlineEls));
      } else {
        blocks.push(createOrderedBlock(inlineEls));
      }
    }

    // Process nested lists recursively
    if (nestedUl.length > 0) {
      nestedUl.each((_, nested) => {
        processListItems($, $(nested), 12, blocks, imageMap);
      });
    }
    if (nestedOl.length > 0) {
      nestedOl.each((_, nested) => {
        processListItems($, $(nested), 13, blocks, imageMap);
      });
    }
  });
}

// ─── Blockquote processing ───────────────────────────────────────────

function processBlockquote(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  blocks: LarkBlock[],
  imageMap?: Map<string, string>
): void {
  // Collect all text content from blockquote, handling nested <p>, inline elements, etc.
  const parts: string[] = [];

  element.contents().each((_, child) => {
    const childTag = (child as any).tagName?.toLowerCase();
    const childEl = $(child);

    if ((child as any).type === "text") {
      const text = $(child).text().trim();
      if (text) parts.push(text);
    } else if (childTag === "p") {
      const text = childEl.text().trim();
      if (text) parts.push(text);
    } else if (childTag === "blockquote") {
      // Nested blockquote - flatten
      const text = childEl.text().trim();
      if (text) parts.push(text);
    } else {
      const text = childEl.text().trim();
      if (text) parts.push(text);
    }
  });

  // Fallback: if no children parsed, use full text
  const quoteText = parts.length > 0 ? parts.join("\n") : element.text().trim();
  if (quoteText) {
    blocks.push(createQuoteBlock(quoteText));
  }
}

// ─── Table processing ────────────────────────────────────────────────

function processTable(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  blocks: LarkBlock[]
): void {
  const rows: string[][] = [];
  element.find("tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr).find("th, td").each((_, cell) => {
      cells.push($(cell).text().trim());
    });
    if (cells.length > 0) rows.push(cells);
  });

  if (rows.length === 0) return;

  // Create header row as bold text
  if (rows.length > 0) {
    const headerRow = rows[0];
    blocks.push(createTextBlock([
      { text_run: { content: headerRow.join(" | "), text_element_style: { bold: true } } },
    ]));
    // Add separator
    blocks.push(createTextBlock([
      { text_run: { content: headerRow.map(() => "---").join(" | ") } },
    ]));
  }

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    blocks.push(createTextBlock([
      { text_run: { content: rows[i].join(" | ") } },
    ]));
  }
}

// ─── Inline element extraction (recursive with style inheritance) ────

/**
 * Recursively extract inline text elements from a cheerio element,
 * inheriting and merging styles as we descend into nested tags.
 *
 * @param skipImages - if true, skip <img> tags (used when images are handled separately)
 * @param skipNestedLists - if true, skip <ul>/<ol> children (used for <li> processing)
 */
function extractInlineElements(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
  parentStyle: InlineStyle,
  skipImages: boolean = false,
  skipNestedLists: boolean = false
): any[] {
  const elements: any[] = [];

  element.contents().each((_, node) => {
    if (node.type === "text") {
      const text = $(node).text();
      if (text && text.trim()) {
        elements.push(buildTextRun(text, parentStyle));
      }
      return;
    }

    if (node.type !== "tag") return;

    const el = $(node);
    const tag = (node as any).tagName?.toLowerCase() as string;

    // Skip nested lists when processing <li> inline content
    if (skipNestedLists && (tag === "ul" || tag === "ol")) return;

    // Skip images if requested
    if (skipImages && tag === "img") return;

    // Handle <br> as newline
    if (tag === "br") {
      elements.push({ text_run: { content: "\n" } });
      return;
    }

    // Handle inline formatting tags by merging styles
    const mergedStyle = { ...parentStyle };

    switch (tag) {
      case "strong":
      case "b":
        mergedStyle.bold = true;
        break;
      case "em":
      case "i":
        mergedStyle.italic = true;
        break;
      case "code":
        mergedStyle.inline_code = true;
        break;
      case "del":
      case "s":
      case "strike":
        mergedStyle.strikethrough = true;
        break;
      case "u":
      case "ins":
        mergedStyle.underline = true;
        break;
      case "a": {
        const href = el.attr("href") || "";
        if (href) {
          mergedStyle.link = { url: encodeURI(href) };
        }
        break;
      }
      case "mark": {
        // Treat <mark> as bold+italic highlight
        mergedStyle.bold = true;
        break;
      }
      case "sub":
      case "sup":
      case "small":
        // These don't have direct Lark equivalents, just pass through
        break;
      case "span": {
        // Check for inline styles on span
        const style = el.attr("style") || "";
        if (style.includes("font-weight") && (style.includes("bold") || style.includes("700") || style.includes("800") || style.includes("900"))) {
          mergedStyle.bold = true;
        }
        if (style.includes("font-style") && style.includes("italic")) {
          mergedStyle.italic = true;
        }
        if (style.includes("text-decoration") && style.includes("underline")) {
          mergedStyle.underline = true;
        }
        if (style.includes("text-decoration") && style.includes("line-through")) {
          mergedStyle.strikethrough = true;
        }
        break;
      }
      case "img":
        // Skip images in inline context
        return;
      case "p":
        // <p> inside inline context (e.g., inside <li>) - extract and add newline
        {
          const nested = extractInlineElements($, el, mergedStyle, skipImages, skipNestedLists);
          elements.push(...nested);
          // Don't add trailing newline for last <p>
          const siblings = el.parent().children("p");
          if (siblings.length > 1 && siblings.index(el) < siblings.length - 1) {
            elements.push({ text_run: { content: "\n" } });
          }
        }
        return;
      default:
        // For unknown inline tags, just recurse
        break;
    }

    // Recurse into children with merged style
    const nested = extractInlineElements($, el, mergedStyle, skipImages, skipNestedLists);
    elements.push(...nested);
  });

  return elements;
}

/**
 * Build a text_run object with the given style
 */
function buildTextRun(content: string, style: InlineStyle): any {
  const textRun: any = { content };
  const styleObj: any = {};

  if (style.bold) styleObj.bold = true;
  if (style.italic) styleObj.italic = true;
  if (style.strikethrough) styleObj.strikethrough = true;
  if (style.underline) styleObj.underline = true;
  if (style.inline_code) styleObj.inline_code = true;
  if (style.link) styleObj.link = style.link;

  if (Object.keys(styleObj).length > 0) {
    textRun.text_element_style = styleObj;
  }

  return { text_run: textRun };
}

// ─── Block creators ──────────────────────────────────────────────────

function createTextBlock(elements: any[]): LarkBlock {
  return {
    block_type: 2,
    text: { elements, style: {} },
  };
}

function createHeadingBlock(blockType: number, elements: any[]): LarkBlock {
  const headingKey = `heading${blockType - 2}`;
  return {
    block_type: blockType,
    [headingKey]: { elements, style: {} },
  };
}

function createBulletBlock(elements: any[]): LarkBlock {
  return {
    block_type: 12,
    bullet: { elements, style: {} },
  };
}

function createOrderedBlock(elements: any[]): LarkBlock {
  return {
    block_type: 13,
    ordered: { elements, style: {} },
  };
}

function createQuoteBlock(text: string): LarkBlock {
  return {
    block_type: 15,
    quote: {
      elements: [{ text_run: { content: text } }],
      style: {},
    },
  };
}

function createCodeBlock(code: string, language: string): LarkBlock {
  const langCode = getLanguageCode(language);
  return {
    block_type: 14,
    code: {
      elements: [
        {
          text_run: {
            content: code,
          },
        },
      ],
      style: {
        language: langCode,
        wrap: false,
      },
    },
  };
}

function createImageBlock(imageKey: string): LarkBlock {
  return {
    block_type: 27,
    image: { token: imageKey },
  };
}

function createDividerBlock(): LarkBlock {
  return {
    block_type: 22,
    divider: {},
  };
}

// ─── Image reference extraction ──────────────────────────────────────

/**
 * Extract image references from Markdown content
 */
export function extractImageReferences(markdown: string): string[] {
  const imageRegex = /!\[.*?\]\((.*?)\)/g;
  const images: string[] = [];
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    images.push(match[1]);
  }
  return images;
}

/**
 * Extract image references from HTML content
 */
export function extractImageReferencesFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const images: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) images.push(src);
  });
  return images;
}
