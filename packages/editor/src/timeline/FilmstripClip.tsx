import { useEffect, useMemo, useState } from "react";
import { useThumbUrl } from "../media/useThumbUrl";
import type { Clip, MediaAssetRef } from "../project/types";
import {
  getCachedTileUrl,
  requestFilmstripTile,
  tileDurationMs,
  zoomBucket,
  TILE_WIDTH,
} from "./filmstripCache";

type Props = {
  clip: Clip;
  asset: MediaAssetRef | undefined;
  projectPath: string;
  pxPerSec: number;
  /** Visible overlap within clip in ms (relative to clip start) */
  visibleStartMs: number;
  visibleEndMs: number;
};

export function FilmstripClip({
  clip,
  asset,
  projectPath,
  pxPerSec,
  visibleStartMs,
  visibleEndMs,
}: Props) {
  const thumbUrl = useThumbUrl(projectPath, asset?.thumbPath);
  const [urls, setUrls] = useState<Record<number, string>>({});

  const tileMs = tileDurationMs(pxPerSec);
  const bucket = zoomBucket(pxPerSec);

  const tileIndexes = useMemo(() => {
    if (!asset || asset.kind !== "video") return [] as number[];
    const start = Math.max(0, Math.floor(visibleStartMs / tileMs));
    const end = Math.max(start, Math.ceil(visibleEndMs / tileMs));
    const indexes: number[] = [];
    for (let i = start; i < end; i++) indexes.push(i);
    return indexes;
  }, [asset, visibleStartMs, visibleEndMs, tileMs]);

  // Seed from cache whenever indexes/bucket change.
  useEffect(() => {
    if (!asset || asset.kind !== "video") return;
    const seeded: Record<number, string> = {};
    for (const idx of tileIndexes) {
      const cached = getCachedTileUrl(asset.id, idx, bucket);
      if (cached) seeded[idx] = cached;
    }
    if (Object.keys(seeded).length > 0) {
      setUrls((prev) => ({ ...prev, ...seeded }));
    }
  }, [asset, tileIndexes, bucket]);

  useEffect(() => {
    if (!asset || asset.kind !== "video" || !projectPath) return;
    let cancelled = false;

    void (async () => {
      for (const idx of tileIndexes) {
        if (cancelled) return;
        const cached = getCachedTileUrl(asset.id, idx, bucket);
        if (cached) {
          setUrls((prev) =>
            prev[idx] === cached ? prev : { ...prev, [idx]: cached },
          );
          continue;
        }
        const sourceMs = clip.inMs + idx * tileMs + tileMs / 2;
        const url = await requestFilmstripTile({
          asset,
          projectPath,
          sourceMs,
          tileIndex: idx,
          pxPerSec,
        });
        if (cancelled) return;
        if (url) {
          setUrls((prev) =>
            prev[idx] === url ? prev : { ...prev, [idx]: url },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    asset,
    projectPath,
    tileIndexes,
    bucket,
    clip.inMs,
    tileMs,
    pxPerSec,
  ]);

  if (!asset) {
    return <span className="timeline-panel__clip-label">{clip.kind}</span>;
  }

  if (asset.kind === "image") {
    return (
      <div className="timeline-panel__filmstrip">
        {thumbUrl ? (
          <div
            className="timeline-panel__filmstrip-repeat"
            style={{ backgroundImage: `url("${thumbUrl}")` }}
            aria-hidden
          />
        ) : (
          <span className="timeline-panel__clip-label">{asset.name}</span>
        )}
        <span className="timeline-panel__clip-label timeline-panel__clip-label--overlay">
          {asset.name}
        </span>
      </div>
    );
  }

  if (asset.kind === "audio") {
    return <span className="timeline-panel__clip-label">{asset.name}</span>;
  }

  return (
    <div className="timeline-panel__filmstrip">
      {tileIndexes.map((idx) => {
        const url = urls[idx] ?? getCachedTileUrl(asset.id, idx, bucket);
        return (
          <div
            key={`${bucket}:${idx}`}
            className="timeline-panel__filmstrip-tile"
            style={{
              width: TILE_WIDTH,
              left: idx * tileMs * (pxPerSec / 1000),
            }}
          >
            {url ? (
              <img src={url} alt="" draggable={false} />
            ) : thumbUrl ? (
              <img src={thumbUrl} alt="" draggable={false} />
            ) : null}
          </div>
        );
      })}
      <span className="timeline-panel__clip-label timeline-panel__clip-label--overlay">
        {asset.name}
      </span>
    </div>
  );
}
