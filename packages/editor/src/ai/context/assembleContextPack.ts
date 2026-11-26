import { timelineDurationMs } from "../../engine/time";
import type { Clip, Track } from "../../project/types";
import { findClip, getEditorStore } from "../../store/editorStore";
import type { ChatMessage } from "../persistence/chatTranscript";
import {
  listAvailableDomains,
  listAvailableSkills,
} from "../catalog";
import { hasElevenLabsVoice, hasGeminiKey } from "../secrets/aiSecrets";
import { buildChatTail } from "./chatTail";
import { summarizeTextProps } from "./textSummary";
import type {
  AiClipSummary,
  AiContextPack,
  AiSkillId,
  AiTrackSkim,
} from "./types";
import "../catalog/domains";

const SKIM_WINDOW_MS = 12_000;
const MAX_SKIM_CLIPS_PER_TRACK = 24;

function staticNum(
  prop: { staticValue: number } | undefined,
  fallback: number,
): number {
  return prop?.staticValue ?? fallback;
}

function clipLabel(clip: Clip, mediaName?: string): string | undefined {
  if (clip.kind === "text" && clip.text?.content) {
    const t = clip.text.content.trim();
    return t.length > 40 ? `${t.slice(0, 37)}…` : t;
  }
  if (clip.stickerId) return `sticker:${clip.stickerId}`;
  if (mediaName) return mediaName;
  if (clip.mediaId) return clip.mediaId;
  return clip.kind;
}

function summarizeClip(
  track: Track,
  clip: Clip,
  mediaName?: string,
): AiClipSummary {
  const summary: AiClipSummary = {
    id: clip.id,
    kind: clip.kind,
    trackId: track.id,
    trackType: track.type,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    inMs: clip.inMs,
    outMs: clip.outMs,
  };

  if (clip.transform) {
    summary.transform = {
      x: staticNum(clip.transform.x, 0),
      y: staticNum(clip.transform.y, 0),
      scaleX: staticNum(clip.transform.scaleX, 1),
      scaleY: staticNum(clip.transform.scaleY, 1),
      rotation: staticNum(clip.transform.rotation, 0),
    };
  }
  if (clip.opacity) {
    summary.opacity = staticNum(clip.opacity, 1);
  }
  if (clip.blendMode) summary.blendMode = clip.blendMode;

  if (clip.kind === "text" && clip.text) {
    summary.text = summarizeTextProps(clip.text);
  }
  if (clip.animation) {
    summary.animation = { ...clip.animation } as Record<string, unknown>;
  }

  if (clip.stickerId) {
    summary.stickerId = clip.stickerId;
    if (clip.stickerStyle) {
      summary.stickerStyle = { ...clip.stickerStyle };
    }
  }

  if (clip.mediaId) {
    summary.mediaId = clip.mediaId;
    if (mediaName) summary.mediaName = mediaName;
  }

  if (clip.kind === "caption" && clip.caption) {
    summary.captionCueCount = clip.caption.cues?.length ?? 0;
  }

  if (clip.audio) {
    summary.audio = {
      volumeDb: clip.audio.volumeDb?.staticValue,
    };
  }

  const keyedPaths: string[] = [];
  const check = (path: string, prop?: { keyframes?: unknown[] }) => {
    if (prop?.keyframes && prop.keyframes.length > 0) keyedPaths.push(path);
  };
  if (clip.transform) {
    check("transform.x", clip.transform.x);
    check("transform.y", clip.transform.y);
    check("transform.scaleX", clip.transform.scaleX);
    check("transform.scaleY", clip.transform.scaleY);
    check("transform.rotation", clip.transform.rotation);
  }
  check("opacity", clip.opacity);
  check("audio.volumeDb", clip.audio?.volumeDb);
  if (keyedPaths.length) summary.keyedPaths = keyedPaths;

  return summary;
}

export type BuildTimelineSkimOpts = {
  tracks: Track[];
  centerMs: number;
  windowMs?: number;
  selectedIds?: Set<string>;
  mediaNameById?: Map<string, string>;
};

/** Timeline skim around a center time (shared by context pack + read tools). */
export function buildTimelineSkim(opts: BuildTimelineSkimOpts): AiTrackSkim[] {
  const windowMs = opts.windowMs ?? SKIM_WINDOW_MS;
  const lo = opts.centerMs - windowMs;
  const hi = opts.centerMs + windowMs;
  const selectedIds = opts.selectedIds ?? new Set<string>();
  const mediaNameById = opts.mediaNameById ?? new Map<string, string>();

  return opts.tracks.map((track) => {
    const relevant = track.clips.filter((c) => {
      if (selectedIds.has(c.id)) return true;
      const end = c.startMs + c.durationMs;
      return end >= lo && c.startMs <= hi;
    });

    const capped = relevant.slice(0, MAX_SKIM_CLIPS_PER_TRACK);
    const omitted =
      relevant.length > capped.length
        ? `${relevant.length - capped.length} more clips omitted`
        : track.clips.length > relevant.length
          ? `${track.clips.length - relevant.length} clips outside center window omitted`
          : undefined;

    return {
      id: track.id,
      type: track.type,
      locked: track.locked,
      hidden: track.hidden,
      clipCount: track.clips.length,
      clips: capped.map((c) => ({
        id: c.id,
        kind: c.kind,
        startMs: c.startMs,
        durationMs: c.durationMs,
        label: clipLabel(c, c.mediaId ? mediaNameById.get(c.mediaId) : undefined),
      })),
      omitted,
    };
  });
}

export type AssembleContextPackOpts = {
  messages: ChatMessage[];
  /** When true, hint that project changed since last assistant turn. */
  projectChanged?: boolean;
};

/** Build the host-owned context pack from the live editor store. */
export function assembleContextPack(
  opts: AssembleContextPackOpts,
): AiContextPack {
  const state = getEditorStore();
  const project = state.project;
  const mediaNameById = new Map(
    project.mediaIndex.map((m) => [m.id, m.name] as const),
  );
  const selectedIds = state.selectedClipIds.length
    ? state.selectedClipIds
    : state.selectedClipId
      ? [state.selectedClipId]
      : [];
  const selectedSet = new Set(selectedIds);

  const clips: AiClipSummary[] = [];
  for (const id of selectedIds) {
    const found = findClip(project.tracks, id);
    if (!found) continue;
    const mediaName = found.clip.mediaId
      ? mediaNameById.get(found.clip.mediaId)
      : undefined;
    clips.push(summarizeClip(found.track, found.clip, mediaName));
  }

  const catalogOpts = {
    imageGemini: hasGeminiKey(),
    voiceElevenlabs: hasElevenLabsVoice(),
  };
  const availableSkills: AiSkillId[] = [
    "timeline",
    ...listAvailableSkills(catalogOpts),
  ];

  return {
    project: {
      id: project.id,
      title: project.title,
      width: project.width,
      height: project.height,
      fps: project.fps,
      aspectRatio: project.aspectRatio,
      durationMs: timelineDurationMs(project.tracks),
      playheadMs: project.playheadMs,
    },
    selection: {
      clipIds: selectedIds,
      clips,
    },
    timelineSkim: buildTimelineSkim({
      tracks: project.tracks,
      centerMs: project.playheadMs,
      selectedIds: selectedSet,
      mediaNameById,
    }),
    chatTail: buildChatTail(opts.messages),
    availableSkills: [...new Set(availableSkills)],
    availableDomains: listAvailableDomains(catalogOpts),
    projectChanged: opts.projectChanged,
  };
}

/** Serialize context pack for the system prompt (compact JSON). */
export function formatContextPackForPrompt(pack: AiContextPack): string {
  return [
    "Current IndieCut project context (host-assembled; trust this over guesses):",
    "```json",
    JSON.stringify(pack),
    "```",
  ].join("\n");
}
