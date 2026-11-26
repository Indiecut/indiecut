import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStyleToRange,
  deleteRange,
  insertTextAt,
  normalizeTextProps,
  plainContent,
  replaceContentKeepingBaseStyle,
  runsFromPlain,
  sliceRuns,
} from "./runs";

describe("text runs", () => {
  it("normalizes missing runs from content", () => {
    const n = normalizeTextProps({ content: "Hello" });
    assert.equal(n.content, "Hello");
    assert.equal(n.runs?.length, 1);
    assert.equal(n.runs?.[0]?.text, "Hello");
  });

  it("syncs content from runs", () => {
    const n = normalizeTextProps({
      content: "ignored",
      runs: [
        { text: "Hi ", style: { color: "#f00" } },
        { text: "there", style: { color: "#0f0" } },
      ],
    });
    assert.equal(n.content, "Hi there");
    assert.equal(n.runs?.length, 2);
  });

  it("applies style to a range and coalesces", () => {
    const runs = runsFromPlain("ABCDEF");
    const next = applyStyleToRange(runs, 2, 4, { color: "#38bdf8" });
    assert.equal(plainContent(next), "ABCDEF");
    assert.equal(next.length, 3);
    assert.equal(next[1]?.style?.color, "#38bdf8");
    assert.equal(next[1]?.text, "CD");
  });

  it("inserts and deletes by code-point index", () => {
    let runs = runsFromPlain("AC");
    runs = insertTextAt(runs, 1, "B", { color: "#fff" });
    assert.equal(plainContent(runs), "ABC");
    runs = deleteRange(runs, 1, 2);
    assert.equal(plainContent(runs), "AC");
  });

  it("slices runs", () => {
    const runs = [
      { text: "Hello ", style: { color: "#f00" } },
      { text: "World", style: { color: "#0f0" } },
    ];
    const mid = sliceRuns(runs, 3, 8);
    assert.equal(plainContent(mid), "lo Wo");
  });

  it("replaceContentKeepingBaseStyle preserves first run style", () => {
    const props = normalizeTextProps({
      content: "Old",
      runs: [{ text: "Old", style: { color: "#abcabc", fontSize: 40 } }],
    });
    const next = replaceContentKeepingBaseStyle(props, "New text");
    assert.equal(next.content, "New text");
    assert.equal(next.runs?.[0]?.style?.color, "#abcabc");
  });
});
