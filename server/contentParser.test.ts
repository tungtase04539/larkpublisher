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
      // Check that at least one element has bold styling
      const hasBold = elements?.some(
        (e: any) => e.text_run?.text_element_style?.bold === true
      );
      expect(hasBold).toBe(true);
    });

    it("should convert unordered lists to text blocks", () => {
      const blocks = markdownToLarkBlocks("- Item 1\n- Item 2\n- Item 3");
      expect(blocks.length).toBe(3);
    });

    it("should convert ordered lists to text blocks", () => {
      const blocks = markdownToLarkBlocks("1. First\n2. Second\n3. Third");
      expect(blocks.length).toBe(3);
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

    it("should convert HTML lists", () => {
      const blocks = htmlToLarkBlocks("<ul><li>A</li><li>B</li></ul>");
      expect(blocks.length).toBe(2);
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
