import { useEffect, useState } from "react";
import { AudioBasicPanel } from "../inspector/AudioBasicPanel";
import {
  EffectClipPanel,
  FilterClipPanel,
  TransitionInspectorPanel,
} from "../inspector/FxPanels";
import { CaptionBasicPanel } from "../inspector/CaptionBasicPanel";
import { StickerBasicPanel } from "../inspector/StickerBasicPanel";
import { TextBasicPanel } from "../inspector/TextBasicPanel";
import { VideoBasicPanel } from "../inspector/VideoBasicPanel";
import { formatTimecode, timelineDurationMs } from "../engine/time";
import type { Clip, MediaAssetRef, Track } from "../project/types";
import { findClip, useEditorStore } from "../store/editorStore";
import { findSticker, loadStickerManifest } from "../stickers/manifest";
import "./InspectorPanel.css";

function formatMediaDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function kindLabel(kind: MediaAssetRef["kind"]): string {
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "image") return "Image";
  return kind;
}

const RESOLUTION_LABELS: Record<string, string> = {
  adapted: "Adapted",
  "720p": "720p",
  "1080p": "1080p",
  "2k": "2K",
};

const COLOR_SPACE_LABELS: Record<string, string> = {
  sdr_rec709: "Standard SDR - Rec.709",
};

export function InspectorPanel() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  const selectedMediaId = useEditorStore((s) => s.selectedMediaId);
  const previewFitMode = useEditorStore((s) => s.previewFitMode);

  const selectedTransition = selectedTransitionId
    ? findClip(project.tracks, selectedTransitionId)
    : null;

  if (selectedTransition?.clip.transition) {
    const { clip, track } = selectedTransition;
    return (
      <div className="inspector-panel">
        <div className="inspector-panel__header">
          <h2 className="inspector-panel__title inspector-panel__title--accent">
            Transition
          </h2>
        </div>
        <div className="inspector-panel__body inspector-panel__body--flush">
          <TransitionInspectorPanel clip={clip} track={track} />
        </div>
      </div>
    );
  }

  const selected = selectedClipId
    ? findClip(project.tracks, selectedClipId)
    : null;

  if (selected) {
    const { clip, track } = selected;
    const isVisual = clip.kind === "video" || clip.kind === "image";

    if (isVisual) {
      const media =
        clip.mediaId
          ? (project.mediaIndex.find((m) => m.id === clip.mediaId) ?? null)
          : null;
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">
              {media?.name ?? (clip.kind === "image" ? "Image" : "Video")}
            </h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <VideoBasicPanel
              clip={clip}
              track={track}
              media={media}
              frameWidth={project.width}
              frameHeight={project.height}
              fit={previewFitMode === "full" ? "cover" : "contain"}
            />
          </div>
        </div>
      );
    }

    if (clip.kind === "text") {
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">
              {clip.text?.content?.trim() || "Text"}
            </h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <TextBasicPanel clip={clip} track={track} />
          </div>
        </div>
      );
    }

    if (clip.kind === "caption") {
      const cueCount = clip.caption?.cues.length ?? 0;
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">
              Captions{cueCount > 0 ? ` · ${cueCount}` : ""}
            </h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <CaptionBasicPanel clip={clip} track={track} />
          </div>
        </div>
      );
    }

    if (clip.kind === "sticker") {
      return (
        <StickerInspector clip={clip} track={track} />
      );
    }

    if (clip.kind === "filter") {
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">Filter</h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <FilterClipPanel clip={clip} track={track} />
          </div>
        </div>
      );
    }

    if (clip.kind === "effect") {
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">Effect</h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <EffectClipPanel clip={clip} track={track} />
          </div>
        </div>
      );
    }

    if (clip.kind === "audio") {
      const media =
        clip.mediaId
          ? (project.mediaIndex.find((m) => m.id === clip.mediaId) ?? null)
          : null;
      return (
        <div className="inspector-panel">
          <div className="inspector-panel__header">
            <h2 className="inspector-panel__title">
              {media?.name ?? "Audio"}
            </h2>
          </div>
          <div className="inspector-panel__body inspector-panel__body--flush">
            <AudioBasicPanel clip={clip} track={track} />
          </div>
        </div>
      );
    }

    return (
      <div className="inspector-panel">
        <div className="inspector-panel__header">
          <h2 className="inspector-panel__title">Clip</h2>
        </div>
        <div className="inspector-panel__body">
          <dl className="inspector-panel__meta">
            <div className="inspector-panel__row">
              <dt>Kind</dt>
              <dd>{clip.kind}</dd>
            </div>
            <div className="inspector-panel__row">
              <dt>Start</dt>
              <dd>{formatTimecode(clip.startMs, project.fps)}</dd>
            </div>
            <div className="inspector-panel__row">
              <dt>Duration</dt>
              <dd>{formatTimecode(clip.durationMs, project.fps)}</dd>
            </div>
          </dl>
          <p className="inspector-panel__hint">
            No inspector for this clip type.
          </p>
        </div>
      </div>
    );
  }

  const selectedMedia = selectedMediaId
    ? (project.mediaIndex.find((m) => m.id === selectedMediaId) ?? null)
    : null;

  if (selectedMedia) {
    return <MediaAssetInspector media={selectedMedia} />;
  }

  const durationMs = timelineDurationMs(project.tracks);
  const resolutionLabel =
    RESOLUTION_LABELS[project.resolutionMode] ?? project.resolutionMode;
  const colorSpaceLabel =
    COLOR_SPACE_LABELS[project.colorSpace] ?? project.colorSpace;

  return (
    <div className="inspector-panel">
      <div className="inspector-panel__header">
        <h2 className="inspector-panel__title">Project info</h2>
      </div>
      <div className="inspector-panel__body">
        <dl className="inspector-panel__meta">
          <div className="inspector-panel__row">
            <dt>Name</dt>
            <dd>{project.title}</dd>
          </div>
          <div className="inspector-panel__row">
            <dt>Resolution</dt>
            <dd>{resolutionLabel}</dd>
          </div>
          <div className="inspector-panel__row">
            <dt>Frame rate</dt>
            <dd>{project.fps} fps</dd>
          </div>
          <div className="inspector-panel__row">
            <dt>Color space</dt>
            <dd>{colorSpaceLabel}</dd>
          </div>
          <div className="inspector-panel__row">
            <dt>Duration</dt>
            <dd>{formatTimecode(durationMs, project.fps)}</dd>
          </div>
        </dl>
        <p className="inspector-panel__hint">
          Select a clip on the timeline or a media item to inspect.
        </p>
      </div>
    </div>
  );
}

function MediaAssetInspector({ media }: { media: MediaAssetRef }) {
  const resolution =
    media.width && media.height ? `${media.width}×${media.height}` : null;

  return (
    <div className="inspector-panel">
      <div className="inspector-panel__header">
        <h2 className="inspector-panel__title">{media.name}</h2>
      </div>
      <div className="inspector-panel__body">
        <dl className="inspector-panel__meta">
          <div className="inspector-panel__row">
            <dt>Type</dt>
            <dd>{kindLabel(media.kind)}</dd>
          </div>
          {media.kind !== "image" && (
            <div className="inspector-panel__row">
              <dt>Duration</dt>
              <dd>{formatMediaDuration(media.durationMs)}</dd>
            </div>
          )}
          {resolution && (
            <div className="inspector-panel__row">
              <dt>Resolution</dt>
              <dd>{resolution}</dd>
            </div>
          )}
          {media.codec && (
            <div className="inspector-panel__row">
              <dt>Codec</dt>
              <dd>{media.codec}</dd>
            </div>
          )}
          {media.kind !== "audio" && media.hasAudio != null && (
            <div className="inspector-panel__row">
              <dt>Audio</dt>
              <dd>{media.hasAudio ? "Yes" : "No"}</dd>
            </div>
          )}
          {media.importStatus && media.importStatus !== "ready" && (
            <div className="inspector-panel__row">
              <dt>Status</dt>
              <dd>
                {media.importStatus === "error"
                  ? media.importError || "Error"
                  : media.importStatus}
              </dd>
            </div>
          )}
          <div className="inspector-panel__row">
            <dt>File</dt>
            <dd title={media.path}>{media.path}</dd>
          </div>
        </dl>
        <p className="inspector-panel__hint">
          Double-click the item or drag it onto the timeline to add it.
        </p>
      </div>
    </div>
  );
}

function StickerInspector({ clip, track }: { clip: Clip; track: Track }) {
  const [name, setName] = useState(clip.stickerId ?? "Sticker");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!clip.stickerId) return;
      try {
        const manifest = await loadStickerManifest();
        if (cancelled) return;
        const entry = findSticker(manifest, clip.stickerId);
        if (entry) setName(entry.name);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.stickerId]);

  return (
    <div className="inspector-panel">
      <div className="inspector-panel__header">
        <h2 className="inspector-panel__title">{name}</h2>
      </div>
      <div className="inspector-panel__body inspector-panel__body--flush">
        <StickerBasicPanel clip={clip} track={track} />
      </div>
    </div>
  );
}
