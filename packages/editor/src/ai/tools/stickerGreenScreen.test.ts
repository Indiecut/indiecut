import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REMOVE_BG_KEY_COLOR } from "../../project/removeBgDefaults";
import {
  STICKER_GREEN_HEX,
  promptImpliesInfographic,
  promptImpliesStickerCutout,
  withStickerGreenScreen,
} from "./stickerGreenScreen";

describe("promptImpliesStickerCutout", () => {
  it("detects transparent background and sticker language", () => {
    assert.equal(
      promptImpliesStickerCutout("red rocket with transparent background"),
      true,
    );
    assert.equal(promptImpliesStickerCutout("logo with no background"), true);
    assert.equal(promptImpliesStickerCutout("cute cat sticker"), true);
    assert.equal(promptImpliesStickerCutout("a sunny beach scene"), false);
  });

  it("detects complex infographics as sticker cutouts", () => {
    assert.equal(promptImpliesInfographic("add a March calendar"), true);
    assert.equal(promptImpliesInfographic("a colorful pie chart"), true);
    assert.equal(promptImpliesInfographic("bar graph of sales"), true);
    assert.equal(promptImpliesInfographic("simple flowchart"), true);
    assert.equal(promptImpliesStickerCutout("add a pie graph of costs"), true);
    assert.equal(promptImpliesStickerCutout("an infographic about water"), true);
    assert.equal(promptImpliesStickerCutout("a sunny beach scene"), false);
  });
});

describe("withStickerGreenScreen", () => {
  it("appends chroma-green plate instructions matching remove-bg default", () => {
    const out = withStickerGreenScreen("A cute cartoon taco");
    assert.match(out, /^A cute cartoon taco\./);
    assert.match(out, new RegExp(STICKER_GREEN_HEX, "i"));
    assert.match(
      out,
      new RegExp(`RGB ${DEFAULT_REMOVE_BG_KEY_COLOR.join(",")}`),
    );
    assert.match(out, /chroma key/i);
    assert.match(out, /No text overlays/i);
  });

  it("allows on-graphic labels for infographics", () => {
    const out = withStickerGreenScreen("A clean pie chart of market share");
    assert.match(out, /Infographic cutout/i);
    assert.match(out, /labels/i);
    assert.doesNotMatch(out, /No text overlays/i);
    assert.match(out, new RegExp(STICKER_GREEN_HEX, "i"));
  });

  it("strips transparent-background wording then appends green screen", () => {
    const out = withStickerGreenScreen(
      "A red rocket icon with transparent background",
    );
    assert.match(out, /A red rocket icon/i);
    assert.doesNotMatch(out, /transparent/i);
    assert.match(out, new RegExp(STICKER_GREEN_HEX, "i"));
  });

  it("does not double-append when prompt already mentions green screen", () => {
    const prompt = "Cat mascot on a green screen background";
    assert.equal(withStickerGreenScreen(prompt), prompt);
  });

  it("does not double-append when prompt already has a hex color", () => {
    const prompt = "Rocket emoji on #00FF00 plate";
    assert.equal(withStickerGreenScreen(prompt), prompt);
  });
});
