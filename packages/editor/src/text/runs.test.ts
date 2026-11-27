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
  syncRunsToContent,
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

  it("syncRunsToContent keeps mixed styles when deleting one character", () => {
    const props = normalizeTextProps({
      content: "Hi!",
      runs: [
        { text: "Hi", style: { color: "#ff0000", fontSize: 40 } },
        { text: "!", style: { color: "#00ff00", fontSize: 60 } },
      ],
    });
    const next = syncRunsToContent(props, "H!");
    assert.equal(next.content, "H!");
    assert.equal(next.runs?.length, 2);
    assert.equal(next.runs?.[0]?.text, "H");
    assert.equal(next.runs?.[0]?.style?.color, "#ff0000");
    assert.equal(next.runs?.[1]?.text, "!");
    assert.equal(next.runs?.[1]?.style?.color, "#00ff00");
  });

  it("syncRunsToContent keeps neighbor style when inserting", () => {
    const props = normalizeTextProps({
      content: "AC",
      runs: [
        { text: "A", style: { color: "#ff0000" } },
        { text: "C", style: { color: "#0000ff" } },
      ],
    });
    const next = syncRunsToContent(props, "ABC");
    assert.equal(next.content, "ABC");
    assert.equal(next.runs?.[0]?.style?.color, "#ff0000");
    assert.equal(next.runs?.[0]?.text, "AB");
    assert.equal(next.runs?.[1]?.style?.color, "#0000ff");
    assert.equal(next.runs?.[1]?.text, "C");
  });

  it("syncRunsToContent preserves styles on both sides of a mid replace", () => {
    const props = normalizeTextProps({
      content: "Hello World!",
      runs: [
        { text: "Hello ", style: { color: "#f00" } },
        { text: "World", style: { color: "#0f0", fontWeight: 800 } },
        { text: "!", style: { color: "#00f" } },
      ],
    });
    const next = syncRunsToContent(props, "Hello Earth!");
    assert.equal(next.content, "Hello Earth!");
    assert.equal(next.runs?.[0]?.style?.color, "#f00");
    assert.match(next.runs?.[0]?.text ?? "", /^Hello /);
    // Inserted text inherits the left neighbor; trailing "!" keeps its style.
    const last = next.runs?.[next.runs.length - 1];
    assert.equal(last?.text, "!");
    assert.equal(last?.style?.color, "#00f");
  });
});

