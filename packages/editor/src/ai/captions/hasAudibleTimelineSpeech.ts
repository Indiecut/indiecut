import {
  anyTrackSoloed,
  trackContributes,
} from "../../engine/timelineOps";
import type { ProjectDocument } from "../../project/types";

/**
 * True when the project has at least one unmuted audible clip that would
 * contribute to export remix (same rules as export audio collection).
 */
export function hasAudibleTimelineSpeech(
  project: ProjectDocument,
): boolean {
  const { tracks, mediaIndex } = project;
  const soloActive = anyTrackSoloed(tracks);

  for (const track of tracks) {
    if (track.muted) continue;
    if (!trackContributes(track, soloActive)) continue;

    if (track.type === "audio") {
      for (const clip of track.clips) {
        if (clip.kind !== "audio" && clip.kind !== "video") continue;
        if (!clip.mediaId) continue;
        if (clip.muteAudio) continue;
        const asset = mediaIndex.find((m) => m.id === clip.mediaId);
        if (!asset || asset.kind === "image") continue;
        if (asset.kind === "video" && !asset.hasAudio) continue;
        return true;
      }
      continue;
    }

    if (track.type !== "video" && track.type !== "overlay") continue;
    for (const clip of track.clips) {
      if (clip.kind !== "video" && clip.kind !== "image") continue;
      if (!clip.mediaId) continue;
      if (clip.linkedClipId) continue;
      if (clip.muteAudio) continue;
      const asset = mediaIndex.find((m) => m.id === clip.mediaId);
      if (!asset || asset.kind === "image") continue;
      if (!asset.hasAudio) continue;
      return true;
    }
  }

  return false;
}
