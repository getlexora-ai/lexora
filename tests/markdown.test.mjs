// Unit tests for the editor's Markdown handling.
//   node --test tests/markdown.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeMarkdown,
  markdownToHtml,
  stripPageSeparators,
} from "../src/lib/markdown.ts";

test("looksLikeMarkdown: true for generated-contract markers", () => {
  assert.ok(looksLikeMarkdown("## § 1 Mietobjekt\nDer Vermieter …"));
  assert.ok(looksLikeMarkdown("Die **Nettokaltmiete** beträgt 1200 EUR."));
  assert.ok(looksLikeMarkdown("- erste Pflicht\n- zweite Pflicht"));
  assert.ok(looksLikeMarkdown("```\ncode\n```"));
});

test("looksLikeMarkdown: false for plain extracted contract text", () => {
  // numbered clauses + rule underline — what LLMWhisperer emits, NOT markdown
  const plain = [
    "MIETVERTRAG",
    "-----------",
    "1. Der Vermieter vermietet dem Mieter die Wohnung.",
    "2. Die Miete beträgt 1200 EUR monatlich.",
    "",
    "Ort, Datum: ______________________",
  ].join("\n");
  assert.equal(looksLikeMarkdown(plain), false);
  assert.equal(looksLikeMarkdown(""), false);
  assert.equal(looksLikeMarkdown("A single asterisk * is not bold."), false);
});

test("stripPageSeparators: drops <<< markers and collapses blank runs", () => {
  const input = "Seite eins.\n\n<<<\n\nSeite zwei.\n<<<\nSeite drei.";
  const out = stripPageSeparators(input);
  assert.ok(!out.includes("<<<"));
  assert.ok(out.includes("Seite eins."));
  assert.ok(out.includes("Seite zwei."));
  assert.ok(out.includes("Seite drei."));
  assert.ok(!/\n{3,}/.test(out));
});

test("markdownToHtml: headings and bold become real tags", () => {
  const html = markdownToHtml("## § 5 Kaution\n\nDie Kaution beträgt **2700 EUR** (§ 551 BGB).");
  assert.match(html, /<h2[^>]*>.*§ 5 Kaution.*<\/h2>/s);
  assert.match(html, /<strong>2700 EUR<\/strong>/);
});

test("markdownToHtml: is synchronous (returns a string, not a Promise)", () => {
  const html = markdownToHtml("plain line");
  assert.equal(typeof html, "string");
});
