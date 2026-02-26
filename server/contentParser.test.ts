import { describe, expect, it } from "vitest";
import {
  markdownToLarkBlocks,
  htmlToLarkBlocks,
  extractImageReferences,
  extractImageReferencesFromHtml,
} from "./contentParser";

describe("contentParser", () => {
  describe("markdownToLarkBlocks", () => {
    it("should convert a simple paragraph", () => {
      const blocks = markdownToLarkBlocks("Hello world");
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].block_type).toBe(2); // text block
    });

    it("should convert headings", () => {
      const blocks = markdownToLarkBlocks("# Heading 1\n\n## Heading 2\n\n### Heading 3");
      expect(blocks.length).toBe(3);
      expect(blocks[0].block_type).toBe(3); // heading1
      expect(blocks[1].block_type).toBe(4); // heading2
      expect(blocks[2].block_type).toBe(5); // heading3
    });

    it("should convert bold and italic text", () => {
      const blocks = markdownToLarkBlocks("**bold** and *italic*");
      expect(blocks.length).toBeGreaterThan(0);
      const elements = blocks[0].text?.elements;
      expect(elements).toBeDefined();
      const hasBold = elements?.some(
        (e: any) => e.text_run?.text_element_style?.bold === true
      );
      expect(hasBold).toBe(true);
    });

    it("should convert unordered lists to bullet blocks (type 12)", () => {
      const blocks = markdownToLarkBlocks("- Item 1\n- Item 2\n- Item 3");
      expect(blocks.length).toBe(3);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(12);
        expect(block.bullet).toBeDefined();
        expect(block.bullet.elements).toBeDefined();
      });
    });

    it("should convert ordered lists to ordered blocks (type 13)", () => {
      const blocks = markdownToLarkBlocks("1. First\n2. Second\n3. Third");
      expect(blocks.length).toBe(3);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(13);
        expect(block.ordered).toBeDefined();
        expect(block.ordered.elements).toBeDefined();
      });
    });

    it("should convert fenced code blocks to code blocks (type 14)", () => {
      const md = "```javascript\nconsole.log('hello');\n```";
      const blocks = markdownToLarkBlocks(md);
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].code).toBeDefined();
      expect(blocks[0].code.elements).toBeDefined();
      expect(blocks[0].code.elements[0].text_run.content).toContain("console.log");
      // JavaScript = 30
      expect(blocks[0].code.style.language).toBe(30);
    });

    it("should convert code blocks without language to PlainText (lang=1)", () => {
      const md = "```\nsome code here\n```";
      const blocks = markdownToLarkBlocks(md);
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].code.style.language).toBe(1); // PlainText
    });

    it("should convert python code blocks with correct language", () => {
      const md = "```python\nprint('hello')\n```";
      const blocks = markdownToLarkBlocks(md);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].code.style.language).toBe(49); // Python
    });

    it("should convert typescript code blocks with correct language", () => {
      const md = "```typescript\nconst x: number = 1;\n```";
      const blocks = markdownToLarkBlocks(md);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].code.style.language).toBe(63); // TypeScript
    });

    it("should convert blockquotes to quote blocks (type 15)", () => {
      const md = "> This is a quote";
      const blocks = markdownToLarkBlocks(md);
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(15);
      expect(blocks[0].quote).toBeDefined();
      expect(blocks[0].quote.elements[0].text_run.content).toContain("This is a quote");
    });

    it("should handle mixed content", () => {
      const md = `# Title

This is a paragraph.

## Section

- Item 1
- Item 2

Another paragraph.`;
      const blocks = markdownToLarkBlocks(md);
      expect(blocks.length).toBeGreaterThan(3);
    });

    it("should handle empty content", () => {
      const blocks = markdownToLarkBlocks("");
      expect(blocks).toEqual([]);
    });

    it("should convert horizontal rules to divider blocks (type 22)", () => {
      const md = "Text above\n\n---\n\nText below";
      const blocks = markdownToLarkBlocks(md);
      const divider = blocks.find((b) => b.block_type === 22);
      expect(divider).toBeDefined();
      expect(divider!.divider).toBeDefined();
    });

    it("should handle complex markdown with code, lists, and headings", () => {
      const md = `# API Reference

## Installation

\`\`\`bash
npm install my-package
\`\`\`

### Usage

1. Import the module
2. Call the function

> Note: This is important

- Feature A
- Feature B`;
      const blocks = markdownToLarkBlocks(md);
      
      // Check heading blocks
      const headings = blocks.filter((b) => b.block_type >= 3 && b.block_type <= 11);
      expect(headings.length).toBe(3);
      
      // Check code block
      const codeBlocks = blocks.filter((b) => b.block_type === 14);
      expect(codeBlocks.length).toBe(1);
      expect(codeBlocks[0].code.style.language).toBe(7); // Bash
      
      // Check ordered list
      const orderedBlocks = blocks.filter((b) => b.block_type === 13);
      expect(orderedBlocks.length).toBe(2);
      
      // Check quote
      const quoteBlocks = blocks.filter((b) => b.block_type === 15);
      expect(quoteBlocks.length).toBe(1);
      
      // Check bullet list
      const bulletBlocks = blocks.filter((b) => b.block_type === 12);
      expect(bulletBlocks.length).toBe(2);
    });
  });

  describe("htmlToLarkBlocks", () => {
    it("should convert simple HTML paragraph", () => {
      const blocks = htmlToLarkBlocks("<p>Hello world</p>");
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(2);
    });

    it("should convert HTML headings", () => {
      const blocks = htmlToLarkBlocks("<h1>Title</h1><h2>Subtitle</h2>");
      expect(blocks.length).toBe(2);
      expect(blocks[0].block_type).toBe(3);
      expect(blocks[1].block_type).toBe(4);
    });

    it("should convert HTML unordered lists to bullet blocks", () => {
      const blocks = htmlToLarkBlocks("<ul><li>A</li><li>B</li></ul>");
      expect(blocks.length).toBe(2);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(12);
        expect(block.bullet).toBeDefined();
      });
    });

    it("should convert HTML ordered lists to ordered blocks", () => {
      const blocks = htmlToLarkBlocks("<ol><li>First</li><li>Second</li></ol>");
      expect(blocks.length).toBe(2);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(13);
        expect(block.ordered).toBeDefined();
      });
    });

    it("should convert HTML pre/code to code blocks", () => {
      const blocks = htmlToLarkBlocks('<pre><code class="language-json">{"key": "value"}</code></pre>');
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].code).toBeDefined();
      expect(blocks[0].code.style.language).toBe(28); // JSON
    });

    it("should convert HTML blockquote to quote blocks", () => {
      const blocks = htmlToLarkBlocks("<blockquote><p>A quote</p></blockquote>");
      expect(blocks.length).toBe(1);
      expect(blocks[0].block_type).toBe(15);
      expect(blocks[0].quote).toBeDefined();
    });

    it("should handle links", () => {
      const blocks = htmlToLarkBlocks('<p><a href="https://example.com">Link</a></p>');
      expect(blocks.length).toBe(1);
      const elements = blocks[0].text?.elements;
      expect(elements).toBeDefined();
      const hasLink = elements?.some(
        (e: any) => e.text_run?.text_element_style?.link?.url
      );
      expect(hasLink).toBe(true);
    });
  });

  describe("extractImageReferences", () => {
    it("should extract image paths from markdown", () => {
      const md = "![Alt](image1.png)\nSome text\n![Alt2](path/to/image2.jpg)";
      const images = extractImageReferences(md);
      expect(images).toEqual(["image1.png", "path/to/image2.jpg"]);
    });

    it("should return empty array when no images", () => {
      const images = extractImageReferences("No images here");
      expect(images).toEqual([]);
    });
  });

  describe("extractImageReferencesFromHtml", () => {
    it("should extract image sources from HTML", () => {
      const html = '<img src="a.png"><p>text</p><img src="b.jpg">';
      const images = extractImageReferencesFromHtml(html);
      expect(images).toEqual(["a.png", "b.jpg"]);
    });

    it("should return empty array when no images", () => {
      const images = extractImageReferencesFromHtml("<p>No images</p>");
      expect(images).toEqual([]);
    });
  });
});
