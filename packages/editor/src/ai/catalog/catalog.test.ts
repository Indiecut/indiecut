import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCapabilityIndex,
  describeCapability,
  formatDomainIndexForPrompt,
  listRegisteredCapabilities,
} from "./index";
import { getAnthropicTools } from "../protocol/tools";

describe("capability catalog", () => {
  it("registers core and depth capabilities with schema", () => {
    const caps = listRegisteredCapabilities();
    assert.ok(caps.length > 10);
    for (const c of caps) {
      assert.ok(c.id);
      assert.ok(c.schema);
      assert.ok(c.domain);
    }
    const ids = new Set(caps.map((c) => c.id));
    assert.ok(ids.has("clip.transform"));
    assert.ok(ids.has("project.spec"));
    assert.ok(ids.has("timeline.move"));
    assert.ok(ids.has("clip.audio"));
    assert.ok(ids.has("skill.image.generate"));
    assert.ok(ids.has("captions.auto"));
  });

  it("omits gated skills when keys missing", () => {
    const bare = buildCapabilityIndex({});
    assert.ok(!bare.some((r) => r.skill === "image.generate"));
    const gated = buildCapabilityIndex({ imageGemini: true });
    assert.ok(gated.some((r) => r.skill === "image.generate"));
  });

  it("describes a capability with JSON schema", async () => {
    const desc = await describeCapability("clip.transform");
    assert.ok(desc);
    assert.equal(desc.id, "clip.transform");
    assert.ok(desc.schema);
  });

  it("describes clip.text with runs and recipe", async () => {
    const desc = await describeCapability("clip.text");
    assert.ok(desc);
    assert.equal(desc.id, "clip.text");
    const schema = JSON.stringify(desc.schema);
    assert.match(schema, /runs/);
    assert.match(schema, /gradient/);
    assert.match(schema, /highlight/);
    const recipe = String(desc.recipe ?? "");
    assert.match(recipe, /text\.runs/);
    assert.doesNotMatch(recipe, /template catalog|500 templates/i);
  });

  it("exposes exactly 7 Anthropic protocol tools", () => {
    const tools = getAnthropicTools();
    assert.equal(tools.length, 7);
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "capabilities_list",
      "capability_describe",
      "document_patch",
      "inspect",
      "skill_run",
      "stage_capture",
      "timeline_edit",
    ]);
  });

  it("formats a domain index for the system prompt", () => {
    const text = formatDomainIndexForPrompt({ imageGemini: true });
    assert.match(text, /clip\.transform/);
    assert.match(text, /Capability domains/);
  });
});
