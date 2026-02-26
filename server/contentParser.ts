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
 * Lark CodeLanguage enum (from official docs):
 * 1 = PlainText, 2 = ABAP, 3 = Ada, 4 = Apache, 5 = Apex,
 * 6 = Assembly, 7 = Bash, 8 = CSharp, 9 = C++, 10 = C,
 * 11 = COBOL, 12 = CSS, 13 = CoffeeScript, 14 = D, 15 = Dart,
 * 16 = Delphi, 17 = Django, 18 = Dockerfile, 19 = Erlang, 20 = Fortran,
 * 21 = FoxPro, 22 = Go, 23 = Groovy, 24 = HTML, 25 = HTMLBars,
 * 26 = HTTP, 27 = Haskell, 28 = JSON, 29 = Java, 30 = JavaScript,
 * 31 = Julia, 32 = Kotlin, 33 = LateX, 34 = Lisp, 35 = Logo,
 * 36 = Lua, 37 = MATLAB, 38 = Makefile, 39 = Markdown, 40 = Nginx,
 * 41 = Objective-C, 42 = OpenEdgeABL, 43 = PHP, 44 = Perl, 45 = PostScript,
 * 46 = Power Shell, 47 = Prolog, 48 = ProtoBuf, 49 = Python, 50 = R,
 * 51 = RPG, 52 = Ruby, 53 = Rust, 54 = SAS, 55 = SCSS,
 * 56 = SQL, 57 = Scala, 58 = Scheme, 59 = Scratch, 60 = Shell,
 * 61 = Swift, 62 = Thrift, 63 = TypeScript, 64 = VBScript, 65 = Visual Basic,
 * 66 = XML, 67 = YAML
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
  return LANGUAGE_MAP[normalized] || 1; // default to PlainText
}

export interface LarkBlock {
  block_type: number;
  [key: string]: any;
}

export interface ImageReference {
  localPath: string;
  placeholder: string;
}

/**
 * Convert Markdown content to Lark DocX blocks
 */
export function markdownToLarkBlocks(
  markdown: string,
  imageMap?: Map<string, string> // localPath -> lark image_key
): LarkBlock[] {
  const html = marked.parse(markdown, { async: false }) as string;
  return htmlToLarkBlocks(html, imageMap);
}

/**
 * Convert HTML content to Lark DocX blocks
 */
export function htmlToLarkBlocks(
  html: string,
  imageMap?: Map<string, string>
): LarkBlock[] {
  const $ = cheerio.load(html);
  const blocks: LarkBlock[] = [];

  // Process top-level elements
  $("body").children().each((_, el) => {
    const element = $(el);
    const tagName = (el as any).tagName?.toLowerCase();

    switch (tagName) {
      case "h1":
        blocks.push(createHeadingBlock(3, extractTextElements($, element)));
        break;
      case "h2":
        blocks.push(createHeadingBlock(4, extractTextElements($, element)));
        break;
      case "h3":
        blocks.push(createHeadingBlock(5, extractTextElements($, element)));
        break;
      case "h4":
        blocks.push(createHeadingBlock(6, extractTextElements($, element)));
        break;
      case "h5":
        blocks.push(createHeadingBlock(7, extractTextElements($, element)));
        break;
      case "h6":
        blocks.push(createHeadingBlock(8, extractTextElements($, element)));
        break;
      case "p":
        // Check if paragraph contains only an image
        const img = element.find("img");
        if (img.length > 0 && imageMap) {
          const src = img.attr("src") || "";
          const imageKey = imageMap.get(src);
          if (imageKey) {
            blocks.push(createImageBlock(imageKey));
          }
          // Also add any text content
          const textContent = element.text().trim();
          if (textContent) {
            blocks.push(createTextBlock(extractTextElements($, element)));
          }
        } else {
          const elements = extractTextElements($, element);
          if (elements.length > 0) {
            blocks.push(createTextBlock(elements));
          }
        }
        break;
      case "ul":
        element.children("li").each((_, li) => {
          const liEl = $(li);
          blocks.push(createBulletBlock(extractTextElements($, liEl)));
        });
        break;
      case "ol":
        element.children("li").each((_, li) => {
          const liEl = $(li);
          blocks.push(createOrderedBlock(extractTextElements($, liEl)));
        });
        break;
      case "blockquote":
        // Extract all text from blockquote, handling nested <p> tags
        const quoteParts: string[] = [];
        element.find("p").each((_, p) => {
          const pText = $(p).text().trim();
          if (pText) quoteParts.push(pText);
        });
        const quoteText = quoteParts.length > 0 ? quoteParts.join("\n") : element.text().trim();
        if (quoteText) {
          blocks.push(createQuoteBlock(quoteText));
        }
        break;
      case "pre":
        const codeEl = element.find("code");
        const codeText = codeEl.length > 0 ? codeEl.text() : element.text();
        const langClass = codeEl.attr("class") || "";
        const langMatch = langClass.match(/language-(\w+)/);
        const language = langMatch ? langMatch[1] : "plain_text";
        blocks.push(createCodeBlock(codeText, language));
        break;
      case "hr":
        blocks.push(createDividerBlock());
        break;
      case "table":
        // Convert table to text blocks since Lark DocX API doesn't support table blocks easily
        const rows: string[] = [];
        element.find("tr").each((_, tr) => {
          const cells: string[] = [];
          $(tr).find("th, td").each((_, cell) => {
            cells.push($(cell).text().trim());
          });
          rows.push(cells.join(" | "));
        });
        if (rows.length > 0) {
          rows.forEach((row) => {
            blocks.push(
              createTextBlock([{ text_run: { content: row } }])
            );
          });
        }
        break;
      case "img":
        if (imageMap) {
          const src = element.attr("src") || "";
          const imageKey = imageMap.get(src);
          if (imageKey) {
            blocks.push(createImageBlock(imageKey));
          }
        }
        break;
      default:
        // Try to extract text from unknown elements
        const text = element.text().trim();
        if (text) {
          blocks.push(createTextBlock([{ text_run: { content: text } }]));
        }
        break;
    }
  });

  return blocks;
}

/**
 * Extract text elements with formatting from a cheerio element
 */
function extractTextElements(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>
): any[] {
  const elements: any[] = [];

  element.contents().each((_, node) => {
    if (node.type === "text") {
      const text = $(node).text();
      if (text.trim()) {
        elements.push({ text_run: { content: text } });
      }
    } else if (node.type === "tag") {
      const el = $(node);
      const tagName = (node as any).tagName?.toLowerCase();
      const text = el.text();

      if (!text.trim()) return;

      switch (tagName) {
        case "strong":
        case "b":
          elements.push({
            text_run: {
              content: text,
              text_element_style: { bold: true },
            },
          });
          break;
        case "em":
        case "i":
          elements.push({
            text_run: {
              content: text,
              text_element_style: { italic: true },
            },
          });
          break;
        case "code":
          // Inline code within text (not fenced code block)
          elements.push({
            text_run: {
              content: text,
              text_element_style: { inline_code: true },
            },
          });
          break;
        case "a":
          const href = el.attr("href") || "";
          elements.push({
            text_run: {
              content: text,
              text_element_style: {
                link: { url: encodeURI(href) },
              },
            },
          });
          break;
        case "del":
        case "s":
          elements.push({
            text_run: {
              content: text,
              text_element_style: { strikethrough: true },
            },
          });
          break;
        case "u":
          elements.push({
            text_run: {
              content: text,
              text_element_style: { underline: true },
            },
          });
          break;
        default:
          elements.push({ text_run: { content: text } });
          break;
      }
    }
  });

  return elements;
}

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

/**
 * Create a Lark Code Block (block_type = 14)
 * Uses the "code" data key with language enum in style
 */
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
