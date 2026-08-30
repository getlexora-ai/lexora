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
