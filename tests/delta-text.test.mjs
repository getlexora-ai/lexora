// Pure unit tests for the Quill Delta flattener. No network, no key.
//   node --test tests/delta-text.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { deltaToLines, deltaToText, deltaToMarkdown, lineText } from "../src/lib/delta-text.ts";

test("deltaToText: joins inserts, splits on newlines, trims blank edges", () => {
  const delta = {
    ops: [
      { insert: "\n" }, // leading blank line — dropped
      { insert: "§ 1 Mietobjekt", attributes: { header: 2 } },
      { insert: "\nVermietet wird die Wohnung " },
      { insert: "Musterstraße 12", attributes: { bold: true } },
      { insert: ".\n" },
      { insert: "\n" }, // trailing blank line — dropped
    ],
  };
  assert.equal(
    deltaToText(delta),
    "§ 1 Mietobjekt\nVermietet wird die Wohnung Musterstraße 12.",
  );
});

test("deltaToLines: keeps block + inline formatting; skips embeds", () => {
  const delta = {
    ops: [
      { insert: "Heading" },
      { insert: "\n", attributes: { header: 1 } }, // Quill puts block attrs on the newline
      { insert: { image: "data:..." } }, // embed — skipped
      { insert: "item one" },
      { insert: "\n", attributes: { list: "bullet" } },
    ],
  };
  const lines = deltaToLines(delta);
  assert.equal(lines[0].header, 1);
  assert.equal(lineText(lines[0]), "Heading");
  assert.equal(lines[1].list, "bullet");
  assert.equal(lineText(lines[1]), "item one");
});

test("deltaToText: empty / missing ops yields empty string", () => {
  assert.equal(deltaToText({}), "");
  assert.equal(deltaToText({ ops: [] }), "");
});

test("deltaToMarkdown: keeps headings, bold, and blank lines (issue #7 round-trip)", () => {
  const delta = {
    ops: [
      { insert: "§ 1 Mietobjekt" },
      { insert: "\n", attributes: { header: 2 } },
      { insert: "Vermietet wird die Wohnung " },
      { insert: "Musterstraße 12", attributes: { bold: true } },
      { insert: ".\n\n" },
      { insert: "§ 2 Miete" },
      { insert: "\n", attributes: { header: 2 } },
    ],
  };
  assert.equal(
    deltaToMarkdown(delta),
    "## § 1 Mietobjekt\nVermietet wird die Wohnung **Musterstraße 12**.\n\n## § 2 Miete",
  );
});

test("deltaToMarkdown: numbers ordered lists and marks bullets", () => {
  const delta = {
    ops: [
      { insert: "first" },
      { insert: "\n", attributes: { list: "ordered" } },
      { insert: "second" },
      { insert: "\n", attributes: { list: "ordered" } },
      { insert: "a point" },
      { insert: "\n", attributes: { list: "bullet" } },
    ],
  };
  assert.equal(deltaToMarkdown(delta), "1. first\n2. second\n- a point");
});

test("deltaToMarkdown: bold marker excludes trailing space so marked can parse it", () => {
  const delta = {
    ops: [
      { insert: "The ", attributes: { bold: true } },
      { insert: "Landlord", attributes: { bold: true } },
      { insert: " agrees.\n" },
    ],
  };
  assert.equal(deltaToMarkdown(delta), "**The** **Landlord** agrees.");
});

/* ── Curated typographic controls (issue #10) ─────────────────────────────── */

test("deltaToLines: captures font / size / colour / script on runs", () => {
  const delta = {
    ops: [
      { insert: "Big red", attributes: { size: "24px", color: "#e60000", font: "serif" } },
      { insert: " and " },
      { insert: "n", attributes: {} },
      { insert: "2", attributes: { script: "super" } },
      { insert: " highlighted", attributes: { background: "#ffff00", strike: true } },
      { insert: "\n" },
    ],
  };
  const [line] = deltaToLines(delta);
  assert.equal(line.runs[0].size, "24px");
  assert.equal(line.runs[0].color, "#e60000");
  assert.equal(line.runs[0].font, "serif");
  assert.equal(line.runs[3].script, "super");
  assert.equal(line.runs[4].background, "#ffff00");
  assert.equal(line.runs[4].strike, true);
});

test("deltaToLines: captures align / indent / line-height / blockquote / code block on lines", () => {
  const delta = {
    ops: [
      { insert: "centered" },
      { insert: "\n", attributes: { align: "center", lineheight: "1.5" } },
      { insert: "indented twice" },
      { insert: "\n", attributes: { indent: 2 } },
      { insert: "a quote" },
      { insert: "\n", attributes: { blockquote: true } },
      { insert: "const x = 1;" },
      { insert: "\n", attributes: { "code-block": true } },
    ],
  };
  const lines = deltaToLines(delta);
  assert.equal(lines[0].align, "center");
  assert.equal(lines[0].lineHeight, "1.5");
  assert.equal(lines[1].indent, 2);
  assert.equal(lines[2].blockquote, true);
  assert.equal(lines[3].codeBlock, true);
});

test("deltaToLines: ignores align:left and indent:0 (Quill's defaults)", () => {
  const delta = {
    ops: [
      { insert: "plain" },
      { insert: "\n", attributes: { align: "left", indent: 0 } },
    ],
  };
  const [line] = deltaToLines(delta);
  assert.equal(line.align, undefined);
  assert.equal(line.indent, undefined);
});

test("deltaToMarkdown: strike → ~~…~~, blockquote → >, code block → indent", () => {
  const delta = {
    ops: [
      { insert: "keep " },
      { insert: "this", attributes: { strike: true } },
      { insert: "\n" },
      { insert: "quoted line" },
      { insert: "\n", attributes: { blockquote: true } },
      { insert: "code line" },
      { insert: "\n", attributes: { "code-block": true } },
    ],
  };
  assert.equal(deltaToMarkdown(delta), "keep ~~this~~\n> quoted line\n    code line");
});

test("deltaToMarkdown: font / size / colour do not appear (Markdown can't carry them)", () => {
  const delta = {
    ops: [
      { insert: "styled", attributes: { size: "32px", color: "#123456", font: "mono" } },
      { insert: "\n", attributes: { align: "right", lineheight: "2" } },
    ],
  };
  assert.equal(deltaToMarkdown(delta), "styled");
});
