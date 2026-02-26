import { marked } from "marked";
import * as cheerio from "cheerio";

/**
 * Lark DocX block types:
 * 1 = page, 2 = text, 3 = heading1, 4 = heading2, 5 = heading3,
 * 6 = heading4, 7 = heading5, 8 = heading6, 9 = heading7, 10 = heading8, 11 = heading9
 * 11 = bullet, 12 = ordered, 13 = code, 14 = quote, 27 = image
 */

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
        const quoteText = element.text().trim();
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
    block_type: 2,
    text: { elements, style: {} },
  };
}

function createOrderedBlock(elements: any[]): LarkBlock {
  return {
    block_type: 2,
    text: { elements, style: {} },
  };
}

function createQuoteBlock(text: string): LarkBlock {
  return {
    block_type: 2,
    text: {
      elements: [{ text_run: { content: text } }],
      style: {},
    },
  };
}

function createCodeBlock(code: string, language: string): LarkBlock {
  // Lark code block uses block_type 14 for code
  return {
    block_type: 2,
    text: {
      elements: [
        {
          text_run: {
            content: code,
            text_element_style: { inline_code: true },
          },
        },
      ],
      style: {},
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
