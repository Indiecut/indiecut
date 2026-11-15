import {
  BufferTarget,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import {
  addClipToTrack,
  ensureTrackForRange,
} from "../engine/timelineOps";
import type { Clip } from "../project/types";
import { getEditorStore } from "../store/editorStore";
import { adoptProjectMediaFile } from "./importMedia";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
}

export type VoiceoverSession = {
  /** Stop encoding and write the file; returns placed clip or null if cancelled/empty. */
  stop: () => Promise<Clip | null>;
  /** Abort without placing a clip. */
  cancel: () => Promise<void>;
};

/**
 * Start encoding mic audio to media/vo_*.m4a via MediaBunny.
 * Call stop() to finalize and place on an audio track at startPlayheadMs.
 */
export async function startVoiceoverCapture(args: {
  mediaStream: MediaStream;
  startPlayheadMs: number;
}): Promise<VoiceoverSession> {
  const { mediaStream, startPlayheadMs } = args;
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const store = getEditorStore();
  const projectPath = store.project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before recording");
  }

  const micTrack = mediaStream.getAudioTracks()[0];
  if (!micTrack) {
    throw new Error("No microphone track");
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const audioSource = new MediaStreamAudioTrackSource(micTrack, {
    codec: "aac",
    quality: new Quality({ bitrate: 128_000 }),
  });
  output.addAudioTrack(audioSource);
  await output.start();

  let finished = false;

  const finalizeToDisk = async (): Promise<string | null> => {
    if (finished) return null;
    finished = true;
    try {
      audioSource.close();
    } catch {
      /* ignore */
    }
    try {
      await output.finalize();
    } catch (err) {
      console.warn("Voiceover finalize failed", err);
      return null;
    }
    const buf = target.buffer;
    if (!buf || buf.byteLength < 64) return null;

    const assetId = newAssetId();
    const relPath = `media/${assetId}.m4a`;
    await bridge.fs.writeProjectFile(
      projectPath,
      relPath,
      new Uint8Array(buf),
    );
    return relPath;
  };

  return {
    stop: async () => {
      const relPath = await finalizeToDisk();
      if (!relPath) return null;

      const adopted = await adoptProjectMediaFile(relPath);
      store.patchMediaAsset(adopted.id, {
        name: `Voiceover ${new Date().toLocaleTimeString()}`,
      });

      const durationMs = Math.max(adopted.durationMs, 200);
      let tracks = getEditorStore().project.tracks;
      const ensured = ensureTrackForRange(
        tracks,
        "audio",
        startPlayheadMs,
        durationMs,
        {},
      );
      tracks = ensured.tracks;
      const track = tracks.find((t) => t.id === ensured.trackId);
      if (!track || track.locked) {
        throw new Error("No free audio track for voiceover");
      }

      const placed: Clip = {
        id: newClipId(),
        kind: "audio",
        mediaId: adopted.id,
        startMs: startPlayheadMs,
        durationMs,
        inMs: 0,
        outMs: durationMs,
      };

      const next = addClipToTrack(tracks, track.id, placed);
      if (!next) throw new Error("Failed to place voiceover clip");

      getEditorStore().commitTracks(next, "Record voiceover", {
        clipId: placed.id,
        trackId: track.id,
      });
      return placed;
    },
    cancel: async () => {
      await finalizeToDisk();
    },
  };
}

/** Apply input gain via Web Audio and return a MediaStream for encoding + metering. */
export function createGainedMicStream(
  sourceStream: MediaStream,
  gainValue: number,
): {
  stream: MediaStream;
  analyser: AnalyserNode;
  setGain: (v: number) => void;
  dispose: () => void;
} {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(sourceStream);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(2, gainValue));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(analyser);
  gain.connect(dest);

  return {
    stream: dest.stream,
    analyser,
    setGain: (v: number) => {
      gain.gain.value = Math.max(0, Math.min(2, v));
    },
    dispose: () => {
      try {
        source.disconnect();
        gain.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close();
    },
  };
}
