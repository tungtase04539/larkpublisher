import { describe, expect, it } from "vitest";
import {
  markdownToLarkBlocks,
  htmlToLarkBlocks,
  extractImageReferences,
  extractImageReferencesFromHtml,
} from "./contentParser";

// ─── Markdown tests ──────────────────────────────────────────────────

describe("markdownToLarkBlocks", () => {
  it("should convert a simple paragraph", () => {
    const blocks = markdownToLarkBlocks("Hello world");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].block_type).toBe(2);
  });

  it("should convert headings", () => {
    const blocks = markdownToLarkBlocks("# Heading 1\n\n## Heading 2\n\n### Heading 3");
    expect(blocks.length).toBe(3);
    expect(blocks[0].block_type).toBe(3);
    expect(blocks[1].block_type).toBe(4);
    expect(blocks[2].block_type).toBe(5);
  });

  it("should convert bold and italic text", () => {
    const blocks = markdownToLarkBlocks("**bold** and *italic*");
    expect(blocks.length).toBeGreaterThan(0);
    const elements = blocks[0].text?.elements;
    expect(elements).toBeDefined();
    const hasBold = elements?.some((e: any) => e.text_run?.text_element_style?.bold === true);
    expect(hasBold).toBe(true);
  });

  it("should convert unordered lists to bullet blocks (type 12)", () => {
    const blocks = markdownToLarkBlocks("- Item 1\n- Item 2\n- Item 3");
    expect(blocks.length).toBe(3);
    blocks.forEach((block) => {
      expect(block.block_type).toBe(12);
      expect(block.bullet).toBeDefined();
    });
  });

  it("should convert ordered lists to ordered blocks (type 13)", () => {
    const blocks = markdownToLarkBlocks("1. First\n2. Second\n3. Third");
    expect(blocks.length).toBe(3);
    blocks.forEach((block) => {
      expect(block.block_type).toBe(13);
      expect(block.ordered).toBeDefined();
    });
  });

  it("should convert fenced code blocks to code blocks (type 14)", () => {
    const md = "```javascript\nconsole.log('hello');\n```";
    const blocks = markdownToLarkBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(14);
    expect(blocks[0].code).toBeDefined();
    expect(blocks[0].code.elements[0].text_run.content).toContain("console.log");
    expect(blocks[0].code.style.language).toBe(30);
  });

  it("should convert code blocks without language to PlainText", () => {
    const md = "```\nsome code here\n```";
    const blocks = markdownToLarkBlocks(md);
    expect(blocks[0].block_type).toBe(14);
    expect(blocks[0].code.style.language).toBe(1);
  });

  it("should convert python code blocks", () => {
    const md = "```python\nprint('hello')\n```";
    const blocks = markdownToLarkBlocks(md);
    expect(blocks[0].code.style.language).toBe(49);
  });

  it("should convert typescript code blocks", () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    const blocks = markdownToLarkBlocks(md);
    expect(blocks[0].code.style.language).toBe(63);
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
    const md = `# Title\n\nParagraph.\n\n## Section\n\n- Item 1\n- Item 2\n\nAnother paragraph.`;
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
  });

  it("should handle complex markdown with code, lists, headings", () => {
    const md = `# API Reference\n\n## Installation\n\n\`\`\`bash\nnpm install my-package\n\`\`\`\n\n### Usage\n\n1. Import the module\n2. Call the function\n\n> Note: This is important\n\n- Feature A\n- Feature B`;
    const blocks = markdownToLarkBlocks(md);
    const headings = blocks.filter((b) => b.block_type >= 3 && b.block_type <= 11);
    expect(headings.length).toBe(3);
    const codeBlocks = blocks.filter((b) => b.block_type === 14);
    expect(codeBlocks.length).toBe(1);
    expect(codeBlocks[0].code.style.language).toBe(7);
    const orderedBlocks = blocks.filter((b) => b.block_type === 13);
    expect(orderedBlocks.length).toBe(2);
    const quoteBlocks = blocks.filter((b) => b.block_type === 15);
    expect(quoteBlocks.length).toBe(1);
    const bulletBlocks = blocks.filter((b) => b.block_type === 12);
    expect(bulletBlocks.length).toBe(2);
  });
});

// ─── HTML tests - Basic ──────────────────────────────────────────────

describe("htmlToLarkBlocks - basic", () => {
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

  it("should convert all heading levels", () => {
    const blocks = htmlToLarkBlocks("<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>");
    expect(blocks.map((b) => b.block_type)).toEqual([3, 4, 5, 6, 7, 8]);
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
    expect(blocks[0].code.style.language).toBe(28);
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
    const hasLink = elements?.some((e: any) => e.text_run?.text_element_style?.link?.url);
    expect(hasLink).toBe(true);
  });

  it("should convert <hr> to divider block", () => {
    const blocks = htmlToLarkBlocks("<p>Above</p><hr><p>Below</p>");
    expect(blocks.length).toBe(3);
    expect(blocks[1].block_type).toBe(22);
  });
});

// ─── HTML tests - Nested structures ──────────────────────────────────

describe("htmlToLarkBlocks - nested structures", () => {
  it("should handle content wrapped in <div>", () => {
    const blocks = htmlToLarkBlocks("<div><p>Paragraph inside div</p></div>");
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(2);
    expect(blocks[0].text.elements[0].text_run.content).toContain("Paragraph inside div");
  });

  it("should handle deeply nested containers", () => {
    const html = `
      <div>
        <section>
          <article>
            <h2>Nested Heading</h2>
            <p>Nested paragraph</p>
          </article>
        </section>
      </div>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(2);
    expect(blocks[0].block_type).toBe(4); // h2
    expect(blocks[1].block_type).toBe(2); // p
  });

  it("should handle <div> with only inline content as text block", () => {
    const blocks = htmlToLarkBlocks("<div>Just some text in a div</div>");
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(2);
    expect(blocks[0].text.elements[0].text_run.content).toContain("Just some text in a div");
  });

  it("should handle <section> with mixed content", () => {
    const html = `
      <section>
        <h3>Section Title</h3>
        <p>Section content</p>
        <ul><li>Item A</li><li>Item B</li></ul>
      </section>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(4);
    expect(blocks[0].block_type).toBe(5); // h3
    expect(blocks[1].block_type).toBe(2); // p
    expect(blocks[2].block_type).toBe(12); // bullet
    expect(blocks[3].block_type).toBe(12); // bullet
  });
});

// ─── HTML tests - Nested formatting ──────────────────────────────────

describe("htmlToLarkBlocks - nested formatting", () => {
  it("should handle bold inside paragraph", () => {
    const blocks = htmlToLarkBlocks("<p><strong>Bold text</strong> normal text</p>");
    expect(blocks.length).toBe(1);
    const elements = blocks[0].text.elements;
    const boldEl = elements.find((e: any) => e.text_run?.text_element_style?.bold);
    expect(boldEl).toBeDefined();
    expect(boldEl.text_run.content).toContain("Bold text");
  });

  it("should handle nested bold+italic", () => {
    const blocks = htmlToLarkBlocks("<p><strong><em>Bold and italic</em></strong></p>");
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.bold).toBe(true);
    expect(el.text_run.text_element_style?.italic).toBe(true);
  });

  it("should handle italic inside bold", () => {
    const blocks = htmlToLarkBlocks("<p><b>Bold <i>and italic</i> only bold</b></p>");
    expect(blocks.length).toBe(1);
    const elements = blocks[0].text.elements;
    // Should have at least: bold text, bold+italic text, bold text
    expect(elements.length).toBeGreaterThanOrEqual(2);
    const boldItalic = elements.find(
      (e: any) => e.text_run?.text_element_style?.bold && e.text_run?.text_element_style?.italic
    );
    expect(boldItalic).toBeDefined();
  });

  it("should handle inline code in paragraph", () => {
    const blocks = htmlToLarkBlocks("<p>Use <code>npm install</code> to install</p>");
    expect(blocks.length).toBe(1);
    const elements = blocks[0].text.elements;
    const codeEl = elements.find((e: any) => e.text_run?.text_element_style?.inline_code);
    expect(codeEl).toBeDefined();
    expect(codeEl.text_run.content).toBe("npm install");
  });

  it("should handle <span> with inline styles", () => {
    const blocks = htmlToLarkBlocks('<p><span style="font-weight: bold;">Span bold</span></p>');
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.bold).toBe(true);
  });

  it("should handle <span> with italic style", () => {
    const blocks = htmlToLarkBlocks('<p><span style="font-style: italic;">Span italic</span></p>');
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.italic).toBe(true);
  });

  it("should handle <span> with underline style", () => {
    const blocks = htmlToLarkBlocks('<p><span style="text-decoration: underline;">Underlined</span></p>');
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.underline).toBe(true);
  });

  it("should handle <span> with strikethrough style", () => {
    const blocks = htmlToLarkBlocks('<p><span style="text-decoration: line-through;">Struck</span></p>');
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.strikethrough).toBe(true);
  });

  it("should handle <del> and <s> for strikethrough", () => {
    const blocks = htmlToLarkBlocks("<p><del>Deleted</del> and <s>struck</s></p>");
    expect(blocks.length).toBe(1);
    const elements = blocks[0].text.elements;
    const strikes = elements.filter((e: any) => e.text_run?.text_element_style?.strikethrough);
    expect(strikes.length).toBe(2);
  });

  it("should handle <u> for underline", () => {
    const blocks = htmlToLarkBlocks("<p><u>Underlined text</u></p>");
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.underline).toBe(true);
  });

  it("should handle link with formatting inside", () => {
    const blocks = htmlToLarkBlocks('<p><a href="https://example.com"><strong>Bold link</strong></a></p>');
    expect(blocks.length).toBe(1);
    const el = blocks[0].text.elements[0];
    expect(el.text_run.text_element_style?.bold).toBe(true);
    expect(el.text_run.text_element_style?.link?.url).toContain("example.com");
  });
});

// ─── HTML tests - Code blocks ────────────────────────────────────────

describe("htmlToLarkBlocks - code blocks", () => {
  it("should convert <pre><code> to code block", () => {
    const blocks = htmlToLarkBlocks("<pre><code>const x = 1;</code></pre>");
    expect(blocks[0].block_type).toBe(14);
    expect(blocks[0].code.elements[0].text_run.content).toBe("const x = 1;");
  });

  it("should detect language from class attribute", () => {
    const blocks = htmlToLarkBlocks('<pre><code class="language-python">print("hi")</code></pre>');
    expect(blocks[0].code.style.language).toBe(49);
  });

  it("should detect language from lang- prefix", () => {
    const blocks = htmlToLarkBlocks('<pre><code class="lang-javascript">var x;</code></pre>');
    expect(blocks[0].code.style.language).toBe(30);
  });

  it("should detect language from data-language attribute", () => {
    const blocks = htmlToLarkBlocks('<pre><code data-language="typescript">const x: number;</code></pre>');
    expect(blocks[0].code.style.language).toBe(63);
  });

  it("should handle <pre> without <code> child", () => {
    const blocks = htmlToLarkBlocks("<pre>raw preformatted text</pre>");
    expect(blocks[0].block_type).toBe(14);
    expect(blocks[0].code.elements[0].text_run.content).toBe("raw preformatted text");
    expect(blocks[0].code.style.language).toBe(1); // PlainText
  });

  it("should handle multi-line code blocks", () => {
    const code = "function hello() {\n  console.log('world');\n}";
    const blocks = htmlToLarkBlocks(`<pre><code class="language-javascript">${code}</code></pre>`);
    expect(blocks[0].code.elements[0].text_run.content).toBe(code);
  });
});

// ─── HTML tests - Lists ──────────────────────────────────────────────

describe("htmlToLarkBlocks - lists", () => {
  it("should handle nested unordered lists", () => {
    const html = `<ul>
      <li>Parent 1
        <ul><li>Child 1.1</li><li>Child 1.2</li></ul>
      </li>
      <li>Parent 2</li>
    </ul>`;
    const blocks = htmlToLarkBlocks(html);
    // Parent 1 + Child 1.1 + Child 1.2 + Parent 2
    expect(blocks.length).toBe(4);
    blocks.forEach((b) => expect(b.block_type).toBe(12));
  });

  it("should handle nested ordered lists", () => {
    const html = `<ol>
      <li>Step 1
        <ol><li>Sub-step 1.1</li></ol>
      </li>
      <li>Step 2</li>
    </ol>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(3);
    // Parent items are ordered, nested items are also ordered
    expect(blocks[0].block_type).toBe(13);
    expect(blocks[1].block_type).toBe(13);
    expect(blocks[2].block_type).toBe(13);
  });

  it("should handle mixed nested lists (ul inside ol)", () => {
    const html = `<ol>
      <li>Step 1
        <ul><li>Detail A</li><li>Detail B</li></ul>
      </li>
    </ol>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(3);
    expect(blocks[0].block_type).toBe(13); // ordered
    expect(blocks[1].block_type).toBe(12); // bullet
    expect(blocks[2].block_type).toBe(12); // bullet
  });

  it("should handle list items with <p> inside", () => {
    const html = "<ul><li><p>Item with paragraph</p></li></ul>";
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(12);
  });
});

// ─── HTML tests - Blockquotes ────────────────────────────────────────

describe("htmlToLarkBlocks - blockquotes", () => {
  it("should handle blockquote with <p> children", () => {
    const blocks = htmlToLarkBlocks("<blockquote><p>Line 1</p><p>Line 2</p></blockquote>");
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(15);
    expect(blocks[0].quote.elements[0].text_run.content).toContain("Line 1");
    expect(blocks[0].quote.elements[0].text_run.content).toContain("Line 2");
  });

  it("should handle blockquote without <p> children", () => {
    const blocks = htmlToLarkBlocks("<blockquote>Direct text quote</blockquote>");
    expect(blocks.length).toBe(1);
    expect(blocks[0].block_type).toBe(15);
    expect(blocks[0].quote.elements[0].text_run.content).toContain("Direct text quote");
  });
});

// ─── HTML tests - Tables ─────────────────────────────────────────────

describe("htmlToLarkBlocks - tables", () => {
  it("should convert table with header and data rows", () => {
    const html = `<table>
      <thead><tr><th>Name</th><th>Age</th></tr></thead>
      <tbody><tr><td>Alice</td><td>30</td></tr><tr><td>Bob</td><td>25</td></tr></tbody>
    </table>`;
    const blocks = htmlToLarkBlocks(html);
    // Header row (bold) + separator + 2 data rows = 4
    expect(blocks.length).toBe(4);
    // Header should be bold
    const headerEl = blocks[0].text.elements[0];
    expect(headerEl.text_run.text_element_style?.bold).toBe(true);
    expect(headerEl.text_run.content).toContain("Name");
    expect(headerEl.text_run.content).toContain("Age");
  });

  it("should handle table without thead", () => {
    const html = `<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── HTML tests - Real-world HTML ────────────────────────────────────

describe("htmlToLarkBlocks - real-world HTML", () => {
  it("should handle full HTML document with doctype, head, body", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Title</h1>
  <p>Content</p>
</body>
</html>`;
    const blocks = htmlToLarkBlocks(html);
    expect(blocks.length).toBe(2);
    expect(blocks[0].block_type).toBe(3);
    expect(blocks[1].block_type).toBe(2);
  });

  it("should handle HTML with <br> tags", () => {
    const blocks = htmlToLarkBlocks("<p>Line 1<br>Line 2<br>Line 3</p>");
    expect(blocks.length).toBe(1);
    const elements = blocks[0].text.elements;
    const hasNewline = elements.some((e: any) => e.text_run?.content === "\n");
    expect(hasNewline).toBe(true);
  });

  it("should handle complex real-world blog post HTML", () => {
    const html = `
<article>
  <h1>Getting Started with TypeScript</h1>
  <p>TypeScript is a <strong>typed superset</strong> of JavaScript that compiles to plain JavaScript.</p>
  <h2>Installation</h2>
  <pre><code class="language-bash">npm install -g typescript</code></pre>
  <h2>Basic Types</h2>
  <p>Here are some basic types:</p>
  <ul>
    <li><code>string</code> - text values</li>
    <li><code>number</code> - numeric values</li>
    <li><code>boolean</code> - true/false</li>
  </ul>
  <h3>Example</h3>
  <pre><code class="language-typescript">const greeting: string = "Hello, World!";
console.log(greeting);</code></pre>
  <blockquote><p>TypeScript adds optional static typing to JavaScript.</p></blockquote>
  <hr>
  <p>For more info, visit <a href="https://www.typescriptlang.org">TypeScript website</a>.</p>
</article>`;
    const blocks = htmlToLarkBlocks(html);

    // Check heading blocks
    const headings = blocks.filter((b) => b.block_type >= 3 && b.block_type <= 11);
    expect(headings.length).toBe(4); // h1 + h2 + h2 + h3

    // Check code blocks
    const codeBlocks = blocks.filter((b) => b.block_type === 14);
    expect(codeBlocks.length).toBe(2);
    expect(codeBlocks[0].code.style.language).toBe(7); // bash
    expect(codeBlocks[1].code.style.language).toBe(63); // typescript

    // Check bullet list
    const bulletBlocks = blocks.filter((b) => b.block_type === 12);
    expect(bulletBlocks.length).toBe(3);

    // Check quote
    const quoteBlocks = blocks.filter((b) => b.block_type === 15);
    expect(quoteBlocks.length).toBe(1);

    // Check divider
    const dividers = blocks.filter((b) => b.block_type === 22);
    expect(dividers.length).toBe(1);

    // Check link in last paragraph
    const textBlocks = blocks.filter((b) => b.block_type === 2);
    const lastText = textBlocks[textBlocks.length - 1];
    const hasLink = lastText.text.elements.some(
      (e: any) => e.text_run?.text_element_style?.link?.url
    );
    expect(hasLink).toBe(true);
  });

  it("should produce identical results for equivalent MD and HTML", () => {
    const md = "# Title\n\nA paragraph with **bold** and *italic*.\n\n```python\nprint('hello')\n```\n\n- Item 1\n- Item 2";
    const html = `<h1>Title</h1>
<p>A paragraph with <strong>bold</strong> and <em>italic</em>.</p>
<pre><code class="language-python">print('hello')</code></pre>
<ul><li>Item 1</li><li>Item 2</li></ul>`;

    const mdBlocks = markdownToLarkBlocks(md);
    const htmlBlocks = htmlToLarkBlocks(html);

    // Same number of blocks
    expect(mdBlocks.length).toBe(htmlBlocks.length);

    // Same block types
    expect(mdBlocks.map((b) => b.block_type)).toEqual(htmlBlocks.map((b) => b.block_type));

    // Code block language should match
    const mdCode = mdBlocks.find((b) => b.block_type === 14);
    const htmlCode = htmlBlocks.find((b) => b.block_type === 14);
    expect(mdCode?.code.style.language).toBe(htmlCode?.code.style.language);
  });
});

// ─── Image reference extraction ──────────────────────────────────────

describe("extractImageReferences", () => {
  it("should extract image paths from markdown", () => {
    const md = "![Alt](image1.png)\nSome text\n![Alt2](path/to/image2.jpg)";
    const images = extractImageReferences(md);
    expect(images).toEqual(["image1.png", "path/to/image2.jpg"]);
  });

  it("should return empty array when no images", () => {
    expect(extractImageReferences("No images here")).toEqual([]);
  });
});

describe("extractImageReferencesFromHtml", () => {
  it("should extract image sources from HTML", () => {
    const html = '<img src="a.png"><p>text</p><img src="b.jpg">';
    expect(extractImageReferencesFromHtml(html)).toEqual(["a.png", "b.jpg"]);
  });

  it("should return empty array when no images", () => {
    expect(extractImageReferencesFromHtml("<p>No images</p>")).toEqual([]);
  });

  it("should extract images from nested HTML", () => {
    const html = '<div><section><p><img src="nested.png"></p></section></div>';
    expect(extractImageReferencesFromHtml(html)).toEqual(["nested.png"]);
  });
});
