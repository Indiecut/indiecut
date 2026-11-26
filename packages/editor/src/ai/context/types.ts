import type { ClipKind, TrackType } from "../../project/types";
import type { AiTextSummary } from "./textSummary";

export type AiSkillId =
  | "timeline"
  | "image.generate"
  | "image.editFrame"
  | "voice.generate"
  | "captions.auto"
  | string;

/** Chat interaction mode — Ask suggests only; Agent can mutate via tools. */
export type ChatInteractionMode = "ask" | "agent";

export type AiClipSummary = {
  id: string;
  kind: ClipKind;
  trackId: string;
  trackType: TrackType;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  transform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  opacity?: number;
  blendMode?: string;
  text?: AiTextSummary;
  animation?: Record<string, unknown> | null;
  stickerId?: string;
  stickerStyle?: Record<string, unknown>;
  mediaId?: string;
  mediaName?: string;
  captionCueCount?: number;
  audio?: { volumeDb?: number };
  /** Animatable paths that currently have keyframes. */
  keyedPaths?: string[];
};

export type AiTrackSkim = {
  id: string;
  type: TrackType;
  locked: boolean;
  hidden: boolean;
  clipCount: number;
  clips: Array<{
    id: string;
    kind: ClipKind;
    startMs: number;
    durationMs: number;
    label?: string;
  }>;
  omitted?: string;
};

export type AiChatTurnSummary = {
  role: "user" | "assistant" | "system";
  summary: string;
};

export type AiContextPack = {
  project: {
    id: string;
    title: string;
    width: number;
    height: number;
    fps: number;
    aspectRatio: string;
    durationMs: number;
    playheadMs: number;
  };
  selection: {
    clipIds: string[];
    clips: AiClipSummary[];
  };
  timelineSkim: AiTrackSkim[];
  chatTail: AiChatTurnSummary[];
  availableSkills: AiSkillId[];
  availableDomains: string[];
  projectChanged?: boolean;
};

export type VisionMode = "auto" | "always" | "off";

export type CheapCompositeAttachment = {
  kind: "composite";
  playheadMs: number;
  width: number;
  height: number;
  mimeType: string;
  /** Base64 (no data: prefix). */
  base64: string;
};

/** User-uploaded reference image (already downscaled for the API). */
export type UserReferenceAttachment = {
  kind: "user_reference";
  id: string;
  name: string;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 (no data: prefix). */
  base64: string;
};
