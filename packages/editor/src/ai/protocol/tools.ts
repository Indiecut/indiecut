import type { AnthropicTool } from "../providers/anthropic";
import {
  buildCapabilityIndex,
  describeCapability,
} from "../catalog/buildCatalog";
import type { CatalogBuildOpts } from "../catalog/types";
import "../catalog/domains";
import { executeDocumentPatch } from "./documentPatch";
import { executeInspect } from "./inspect";
import { executeSkillRun } from "./skillRun";
import { executeStageCapture } from "./stageCapture";
import { executeTimelineEdit } from "./timelineEdit";
import type { RegisteredTool, ToolResult } from "../tools/types";

const LIST_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", description: "Optional search string" },
    domain: { type: "string", description: "Filter by domain id" },
    skill: { type: "string", description: "Filter by skill id" },
  },
  additionalProperties: false,
};

const DESCRIBE_SCHEMA = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "Capability id from capabilities_list",
    },
  },
  required: ["id"],
  additionalProperties: false,
};

const INSPECT_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [
        "selection",
        "clip",
        "project",
        "playhead",
        "skim",
        "track",
        "stickers",
        "media",
      ],
    },
    clipId: { type: "string" },
    trackId: { type: "string" },
    centerMs: { type: "number" },
    windowMs: { type: "number" },
  },
  additionalProperties: false,
};

const DOCUMENT_PATCH_SCHEMA = {
  type: "object",
  properties: {
    ops: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: [
              "set",
              "unset",
              "keyframe.set",
              "keyframe.clear",
              "keyframe.clearAll",
            ],
          },
          target: {
            type: "string",
            enum: ["clip", "project", "session", "track"],
          },
          clipId: { type: "string" },
          trackId: { type: "string" },
          path: { type: "string" },
          animPath: { type: "string" },
          value: {},
          timeOffsetMs: { type: "number" },
          easing: { type: "string" },
        },
        required: ["op"],
      },
    },
  },
  required: ["ops"],
  additionalProperties: false,
};

const TIMELINE_EDIT_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "move",
        "trim",
        "split",
        "delete",
        "insertText",
        "insertSticker",
        "insertMedia",
        "addTrack",
        "reorderTrack",
      ],
    },
    clipId: { type: "string" },
    clipIds: { type: "array", items: { type: "string" } },
    startMs: { type: "number" },
    durationMs: { type: "number" },
    inMs: { type: "number" },
    outMs: { type: "number" },
    atMs: { type: "number" },
    trackId: { type: "string" },
    content: { type: "string" },
    runs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          style: { type: "object" },
        },
        required: ["text"],
      },
      description:
        "Rich text spans for insertText: { text, style? } with per-span font/color/gradient/highlight/stroke",
    },
    stickerId: { type: "string" },
    mediaId: { type: "string" },
    preset: { type: "string" },
    fontFamily: { type: "string" },
    fontSize: { type: "number" },
    fontWeight: {},
    color: { type: "string" },
    gradient: { type: ["string", "null"] },
    align: { type: "string", enum: ["left", "center", "right"] },
    strokeColor: { type: "string" },
    strokeWidth: { type: "number" },
    shadowColor: { type: "string" },
    shadowBlur: { type: "number" },
    letterSpacing: { type: "number" },
    lineHeight: { type: "number" },
    trackType: { type: "string" },
    index: { type: "number" },
    transform: { type: "object" },
  },
  required: ["action"],
  additionalProperties: true,
};

const STAGE_CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["composite", "media"] },
    clipId: { type: "string" },
    maxWidth: { type: "number" },
    quality: { type: "number" },
  },
  additionalProperties: false,
};

const SKILL_RUN_SCHEMA = {
  type: "object",
  properties: {
    skill: {
      type: "string",
      description:
        "Skill id e.g. image.generate, image.editFrame, voice.generate, captions.auto",
    },
    input: { type: "object" },
    prompt: { type: "string" },
    text: { type: "string" },
    startMs: { type: "number" },
    durationMs: { type: "number" },
    voiceId: { type: "string" },
    trackId: { type: "string" },
    source: { type: "string" },
    clipId: { type: "string" },
    language: { type: "string" },
  },
  required: ["skill"],
  additionalProperties: true,
};

let catalogOpts: CatalogBuildOpts = {};

export function setProtocolCatalogOpts(opts: CatalogBuildOpts): void {
  catalogOpts = opts;
}

function buildProtocolTools(): RegisteredTool[] {
  return [
    {
      name: "capabilities_list",
      description:
        "List IndieCut capabilities (compact index). Filter by query, domain, or skill.",
      input_schema: LIST_SCHEMA,
      mutates: false,
      handler: (input) => {
        let rows = buildCapabilityIndex(catalogOpts);
        const query =
          typeof input.query === "string" ? input.query.toLowerCase() : "";
        const domain =
          typeof input.domain === "string" ? input.domain : undefined;
        const skill = typeof input.skill === "string" ? input.skill : undefined;
        if (domain) rows = rows.filter((r) => r.domain === domain);
        if (skill) rows = rows.filter((r) => r.skill === skill);
        if (query) {
          rows = rows.filter(
            (r) =>
              r.id.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query) ||
              r.summary.toLowerCase().includes(query),
          );
        }
        return {
          ok: true,
          summary: `${rows.length} capabilities`,
          data: { capabilities: rows },
        } satisfies ToolResult;
      },
    },
    {
      name: "capability_describe",
      description:
        "Full contract for one capability id: JSON Schema, constraints, examples, optional recipe.",
      input_schema: DESCRIBE_SCHEMA,
      mutates: false,
      handler: async (input) => {
        const id = typeof input.id === "string" ? input.id : "";
        if (!id) {
          return {
            ok: false,
            summary: "id is required",
            data: { error: "missing_id" },
          };
        }
        const desc = await describeCapability(id);
        if (!desc) {
          return {
            ok: false,
            summary: `Unknown capability: ${id}`,
            data: { error: "unknown_capability", id },
          };
        }
        return {
          ok: true,
          summary: `Described ${id}`,
          data: desc,
        };
      },
    },
    {
      name: "inspect",
      description:
        "Read live state: selection, project, skim, track, clip, playhead, stickers, media.",
      input_schema: INSPECT_SCHEMA,
      mutates: false,
      handler: (input) => executeInspect(input),
    },
    {
      name: "document_patch",
      description:
        "Apply validated patch ops (set/unset/keyframe.*) on clip, project, session, or track.",
      input_schema: DOCUMENT_PATCH_SCHEMA,
      mutates: true,
      handler: (input, ctx) => executeDocumentPatch(input, ctx.batch),
    },
    {
      name: "timeline_edit",
      description:
        "Structural timeline ops: move, trim, split, delete, insertText/Sticker/Media, add/reorder tracks.",
      input_schema: TIMELINE_EDIT_SCHEMA,
      mutates: true,
      handler: (input, ctx) => executeTimelineEdit(input, ctx.batch),
    },
    {
      name: "stage_capture",
      description:
        "Capture preview composite or source media plate for vision.",
      input_schema: STAGE_CAPTURE_SCHEMA,
      mutates: false,
      handler: (input, ctx) => executeStageCapture(input, ctx.signal),
    },
    {
      name: "skill_run",
      description:
        "Run a gated skill: image.generate, image.editFrame, voice.generate, captions.auto.",
      input_schema: SKILL_RUN_SCHEMA,
      mutates: true,
      handler: (input, ctx) => executeSkillRun(input, ctx.batch, ctx.signal),
    },
  ];
}

export function getRegisteredTools(
  opts: CatalogBuildOpts = {},
): RegisteredTool[] {
  setProtocolCatalogOpts(opts);
  return buildProtocolTools();
}

export function getAnthropicTools(opts: CatalogBuildOpts = {}): AnthropicTool[] {
  return getRegisteredTools(opts).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

export function findTool(name: string): RegisteredTool | undefined {
  return buildProtocolTools().find((t) => t.name === name);
}

export type { RegisteredTool, ToolResult };
