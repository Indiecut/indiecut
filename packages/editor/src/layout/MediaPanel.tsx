import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { CaptionsLibrary } from "../ai/captions/CaptionsLibrary";
import {
  IconMedia,
  IconAllAssets,
  IconAudio,
  IconImage,
  IconHeart,
  IconText,
  IconCaptions,
  IconStickers,
  IconEffects,
  IconTransitions,
  IconFilters,
  IconTrackVideo,
  IconMic,
} from "../icons/Icons";
import { addMediaToTimeline, MEDIA_DRAG_MIME } from "../media/addToTimeline";
import {
  addStickerToTimeline,
  STICKER_DRAG_MIME,
} from "../media/addStickerToTimeline";
import {
  addTextToTimeline,
  addTextTemplateToTimeline,
  TEXT_DRAG_MIME,
  TEXT_TEMPLATE_DRAG_MIME,
  type TextPresetId,
} from "../media/addTextToTimeline";
import {
  importDroppedFiles,
  importMediaViaDialog,
} from "../media/importMedia";
import { useThumbUrl } from "../media/useThumbUrl";
import type { AssetTab, MediaAssetRef, MediaKind } from "../project/types";
import {
  filterStickers,
  loadStickerManifest,
  stickerGroupsFromManifest,
  type StickerManifestEntry,
} from "../stickers/manifest";
import { stickerThumbDataUrl } from "../stickers/rasterizeSvg";
import { useEditorStore } from "../store/editorStore";
import {
  loadTextTemplateManifest,
  TEXT_TEMPLATE_CATEGORY_LABEL,
  TEXT_TEMPLATE_CATEGORY_ORDER,
  type TextTemplateCategory,
  type TextTemplateEntry,
} from "../textTemplates/registry";
import { SoundEffectsLibrary } from "../soundEffects/SoundEffectsLibrary";
import { MediaCardAddButton } from "./MediaCardAddButton";
import {
  EffectsLibrary,
  FiltersLibrary,
  LibraryShell,
  TransitionsLibrary,
} from "./PresetLibraries";
import "./MediaPanel.css";

const TABS: AssetTab[] = [
  "Media",
  "Audio",
  "Text",
  "Captions",
  "Stickers",
  "Effects",
  "Transitions",
  "Filters",
];

const TAB_ICONS: Record<AssetTab, ComponentType<{ size?: number }>> = {
  Media: IconMedia,
  Audio: IconAudio,
  Text: IconText,
  Captions: IconCaptions,
  Stickers: IconStickers,
  Effects: IconEffects,
  Transitions: IconTransitions,
  Filters: IconFilters,
};

type KindFilter = "all" | MediaKind | "favorites";

type MediaContextMenuState = {
  assetId: string;
  x: number;
  y: number;
  favorite: boolean;
};

const MEDIA_SIDENAV: {
  id: KindFilter;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}[] = [
  { id: "all", label: "All", Icon: IconAllAssets },
  { id: "video", label: "Video", Icon: IconTrackVideo },
  { id: "audio", label: "Audio", Icon: IconAudio },
  { id: "image", label: "Images", Icon: IconImage },
  { id: "favorites", label: "Favorites", Icon: IconHeart },
];

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MediaPanel() {
  const assetTab = useEditorStore((s) => s.assetTab);
  const setAssetTab = useEditorStore((s) => s.setAssetTab);
  const setRecordDialogOpen = useEditorStore((s) => s.setRecordDialogOpen);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const projectPath = useEditorStore((s) => s.project.projectPath);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [mediaMenu, setMediaMenu] = useState<MediaContextMenuState | null>(
    null,
  );
  const patchMediaAsset = useEditorStore((s) => s.patchMediaAsset);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return mediaIndex;
    if (kindFilter === "favorites") {
      return mediaIndex.filter((m) => m.favorite);
    }
    return mediaIndex.filter((m) => m.kind === kindFilter);
  }, [kindFilter, mediaIndex]);

  const openMediaMenu = useCallback(
    (e: ReactMouseEvent, asset: MediaAssetRef) => {
      e.preventDefault();
      e.stopPropagation();
      setMediaMenu({
        assetId: asset.id,
        x: e.clientX,
        y: e.clientY,
        favorite: !!asset.favorite,
      });
    },
    [],
  );

  const toggleFavorite = useCallback(
    (assetId: string, favorite: boolean) => {
      patchMediaAsset(assetId, { favorite: favorite || undefined });
    },
    [patchMediaAsset],
  );

  const onProgress = useCallback(
    (info: { assetId: string; progress: number }) => {
      setProgressMap((prev) => ({
        ...prev,
        [info.assetId]: info.progress,
      }));
    },
    [],
  );

  const runImport = useCallback(async () => {
    if (!projectPath) {
      window.alert("Open or create a project before importing media.");
      return;
    }
    setImporting(true);
    try {
      await importMediaViaDialog(onProgress);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }, [onProgress, projectPath]);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (!projectPath) {
        window.alert("Open or create a project before importing media.");
        return;
      }
      const files = e.dataTransfer.files;
      if (!files?.length) return;
      setImporting(true);
      try {
        await importDroppedFiles(files, onProgress);
      } catch (err) {
        console.error(err);
      } finally {
        setImporting(false);
      }
    },
    [onProgress, projectPath],
  );

  return (
    <div className="media-panel">
      <nav className="media-panel__tabs" aria-label="Asset categories">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              type="button"
              className={
                tab === assetTab
                  ? "media-panel__tab media-panel__tab--active"
                  : "media-panel__tab"
              }
              onClick={() => setAssetTab(tab)}
            >
              <Icon size={18} />
              <span>{tab}</span>
            </button>
          );
        })}
      </nav>

      <div className="media-panel__body">
        {assetTab === "Media" && (
          <aside className="media-panel__sidenav" aria-label="Media kinds">
            {MEDIA_SIDENAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={
                  kindFilter === id
                    ? "media-panel__sidenav-item media-panel__sidenav-item--active"
                    : "media-panel__sidenav-item"
                }
                onClick={() => setKindFilter(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </aside>
        )}

        <div className="media-panel__content">
          {assetTab === "Media" ? (
            <div
              className={
                dragOver
                  ? "media-panel__library media-panel__library--drag"
                  : "media-panel__library"
              }
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => void onDrop(e)}
            >
              {kindFilter === "favorites" && filtered.length === 0 ? (
                <div className="media-panel__empty">
                  <div className="media-panel__dropzone">
                    <p className="media-panel__hint">
                      No favorites yet. Right-click any media item and choose
                      Add to favorites.
                    </p>
                  </div>
                </div>
              ) : mediaIndex.length === 0 || filtered.length === 0 ? (
                <div className="media-panel__empty">
                  <div className="media-panel__dropzone">
                    {kindFilter === "audio" ? (
                      <>
                        <div className="media-panel__toolbar media-panel__toolbar--empty">
                          <button
                            type="button"
                            className="media-panel__toolbar-import"
                            onClick={() => void runImport()}
                            disabled={importing}
                          >
                            + Import
                          </button>
                          <button
                            type="button"
                            className="media-panel__toolbar-import"
                            onClick={() => setRecordDialogOpen(true)}
                          >
                            <IconMic size={14} /> Record
                          </button>
                        </div>
                        <p className="media-panel__hint">
                          Import audio or record a voiceover. Bundled sound
                          effects live under the Audio tab.
                        </p>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="media-panel__import-btn"
                          onClick={() => void runImport()}
                          disabled={importing}
                          aria-label="Import media"
                        >
                          <span className="media-panel__import-plus">+</span>
                        </button>
                        <span className="media-panel__import-label">Import</span>
                        <p className="media-panel__hint">
                          {kindFilter === "all"
                            ? "Import video, audio, or photos — or drag files here. Double-click an asset to place it on the timeline."
                            : `No ${kindFilter} assets yet. Import files or drag them here.`}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="media-panel__toolbar">
                    <button
                      type="button"
                      className="media-panel__toolbar-import"
                      onClick={() => void runImport()}
                      disabled={importing}
                    >
                      + Import
                    </button>
                    {kindFilter === "audio" && (
                      <button
                        type="button"
                        className="media-panel__toolbar-import"
                        onClick={() => setRecordDialogOpen(true)}
                      >
                        <IconMic size={14} /> Record
                      </button>
                    )}
                  </div>
                  <div className="media-panel__grid">
                    {filtered.map((asset) => (
                      <MediaCard
                        key={asset.id}
                        asset={asset}
                        projectPath={projectPath}
                        progress={progressMap[asset.id]}
                        onContextMenu={(e) => openMediaMenu(e, asset)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : assetTab === "Audio" ? (
            <SoundEffectsLibrary />
          ) : assetTab === "Text" ? (
            <TextLibrary />
          ) : assetTab === "Captions" ? (
            <CaptionsLibrary />
          ) : assetTab === "Stickers" ? (
            <StickersLibrary />
          ) : assetTab === "Effects" ? (
            <EffectsLibrary />
          ) : assetTab === "Transitions" ? (
            <TransitionsLibrary />
          ) : (
            <FiltersLibrary />
          )}
        </div>
      </div>

      {mediaMenu && (
        <MediaContextMenu
          menu={mediaMenu}
          onClose={() => setMediaMenu(null)}
          onToggleFavorite={() => {
            toggleFavorite(mediaMenu.assetId, !mediaMenu.favorite);
            setMediaMenu(null);
          }}
        />
      )}
    </div>
  );
}

function MediaContextMenu({
  menu,
  onClose,
  onToggleFavorite,
}: {
  menu: MediaContextMenuState;
  onClose: () => void;
  onToggleFavorite: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(menu.x, window.innerWidth - 180);
  const top = Math.min(menu.y, window.innerHeight - 80);

  return (
    <div
      ref={rootRef}
      className="media-context-menu"
      style={{ left, top }}
      role="menu"
      aria-label="Media item menu"
    >
      <button
        type="button"
        role="menuitem"
        className="media-context-menu__item"
        onClick={onToggleFavorite}
      >
        {menu.favorite ? "Remove from favorites" : "Add to favorites"}
      </button>
    </div>
  );
}

function templateSampleStyle(entry: TextTemplateEntry): CSSProperties {
  const r = entry.recipe;
  const strokeW = r.strokeWidth ?? 0;
  const blur = r.shadowBlur ?? 0;
  const ox = r.shadowOffsetX ?? 0;
  const oy = r.shadowOffsetY ?? 0;
  const shadowColor = r.shadowColor ?? "transparent";
  const bubble = r.bubble;
  const chromeOn = Boolean(bubble && bubble.type && bubble.type !== "none");
  return {
    color: r.color ?? "#ffffff",
    fontFamily: r.fontFamily,
    fontWeight: (r.fontWeight as CSSProperties["fontWeight"]) ?? 700,
    fontStyle: r.fontStyle ?? "normal",
    letterSpacing: r.letterSpacing != null ? `${r.letterSpacing}px` : undefined,
    WebkitTextStroke:
      strokeW > 0
        ? `${Math.min(2, strokeW * 0.4)}px ${r.strokeColor ?? "#000000"}`
        : undefined,
    textShadow:
      blur > 0 || ox !== 0 || oy !== 0
        ? `${ox * 0.4}px ${oy * 0.4}px ${Math.min(10, blur * 0.5)}px ${shadowColor}`
        : undefined,
    background: chromeOn ? bubble?.fill : undefined,
    border:
      chromeOn && (bubble?.strokeWidth ?? 0) > 0
        ? `${Math.min(2, bubble?.strokeWidth ?? 1)}px solid ${bubble?.stroke ?? "#000"}`
        : undefined,
    borderRadius:
      bubble?.type === "pill"
        ? 999
        : bubble?.type === "rounded-rect" || bubble?.type === "speech-round"
          ? 10
          : bubble?.type === "neon-frame" || bubble?.type === "promo-badge"
            ? 8
            : chromeOn
              ? 6
              : undefined,
    padding: chromeOn ? "6px 10px" : undefined,
    boxShadow:
      bubble?.type === "neon-frame"
        ? `0 0 10px ${bubble.stroke}`
        : undefined,
  };
}

function templateSampleLabel(entry: TextTemplateEntry): string {
  const firstLine = entry.defaultText.split("\n")[0] ?? entry.defaultText;
  return firstLine.length > 10 ? `${firstLine.slice(0, 9)}…` : firstLine;
}

type TextLibraryCategory = "add" | "all" | TextTemplateCategory;

const TEXT_BASIC_PRESETS: {
  preset: TextPresetId;
  label: string;
  subtitle: string;
}[] = [
  { preset: "title", label: "Title", subtitle: "64px" },
  { preset: "body", label: "Body", subtitle: "36px" },
];

function TextLibrary() {
  const [templates, setTemplates] = useState<TextTemplateEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<TextLibraryCategory>("add");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadTextTemplateManifest()
      .then((m) => {
        if (!cancelled) setTemplates(m.templates);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => [
      { id: "add", label: "Add text" },
      {
        id: "templates",
        label: "Shape styles",
        children: [
          { id: "all", label: "All (500)" },
          ...TEXT_TEMPLATE_CATEGORY_ORDER.map((id) => ({
            id,
            label: TEXT_TEMPLATE_CATEGORY_LABEL[id],
          })),
        ],
      },
    ],
    [],
  );

  const q = search.trim().toLowerCase();

  const basicVisible = useMemo(() => {
    if (category !== "add") return [];
    if (!q) return TEXT_BASIC_PRESETS;
    return TEXT_BASIC_PRESETS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.preset.includes(q) ||
        p.subtitle.toLowerCase().includes(q),
    );
  }, [category, q]);

  const templateVisible = useMemo(() => {
    if (!templates || category === "add") return [];
    return templates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.defaultText.toLowerCase().includes(q)
      );
    });
  }, [templates, category, q]);

  if (error) {
    return (
      <div className="media-panel__placeholder">
        <p>Failed to load templates: {error}</p>
      </div>
    );
  }

  if (!templates) {
    return (
      <div className="media-panel__placeholder">
        <p>Loading text…</p>
      </div>
    );
  }

  return (
    <LibraryShell
      title="Text"
      searchPlaceholder="Search text"
      categories={categories}
      activeCategory={category}
      onCategory={(id) => setCategory(id as TextLibraryCategory)}
      search={search}
      onSearch={setSearch}
    >
      <div className="media-panel__grid media-panel__grid--presets">
        {basicVisible.map((p) => (
          <TextPresetCard
            key={p.preset}
            preset={p.preset}
            label={p.label}
            subtitle={p.subtitle}
          />
        ))}
        {templateVisible.map((entry) => (
          <TextTemplateCard key={entry.id} entry={entry} />
        ))}
      </div>
    </LibraryShell>
  );
}

function TextPresetCard({
  preset,
  label,
  subtitle,
}: {
  preset: TextPresetId;
  label: string;
  subtitle: string;
}) {
  const add = () => addTextToTimeline(preset);
  return (
    <div
      className="media-card"
      role="button"
      tabIndex={0}
      draggable
      title="Double-click or + to add to timeline"
      onDoubleClick={add}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          add();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(TEXT_DRAG_MIME, preset);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="media-card__thumb media-card__thumb--text">
        <span
          className={
            preset === "title"
              ? "media-card__text-sample media-card__text-sample--title"
              : "media-card__text-sample"
          }
        >
          Aa
        </span>
        <MediaCardAddButton
          label={`Add ${label} text to timeline at playhead`}
          onAdd={add}
        />
      </div>
      <span className="media-card__name">{label}</span>
      <span className="media-card__meta">{subtitle}</span>
    </div>
  );
}

function TextTemplateCard({ entry }: { entry: TextTemplateEntry }) {
  const add = () => addTextTemplateToTimeline(entry.id);
  return (
    <div
      className="media-card"
      role="button"
      tabIndex={0}
      draggable
      title={`${entry.name} — double-click or + to add to timeline`}
      onDoubleClick={add}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          add();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(TEXT_TEMPLATE_DRAG_MIME, entry.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="media-card__thumb media-card__thumb--text media-card__thumb--text-template">
        <span
          className="media-card__text-sample media-card__text-sample--template"
          style={templateSampleStyle(entry)}
        >
          {templateSampleLabel(entry)}
        </span>
        <MediaCardAddButton
          label={`Add ${entry.name} to timeline at playhead`}
          onAdd={add}
        />
      </div>
      <span className="media-card__name">{entry.name}</span>
    </div>
  );
}

function StickersLibrary() {
  const [stickers, setStickers] = useState<StickerManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState("social");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await loadStickerManifest();
        if (cancelled) return;
        setStickers(manifest.stickers);
        const groups = stickerGroupsFromManifest(manifest.stickers);
        if (groups.length > 0 && !groups.some((g) => g.id === "social")) {
          setGroup(groups[0]!.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="media-panel__placeholder">
        <p>Failed to load stickers: {error}</p>
      </div>
    );
  }

  if (!stickers) {
    return (
      <div className="media-panel__placeholder">
        <p>Loading stickers…</p>
      </div>
    );
  }

  const categories = stickerGroupsFromManifest(
    filterStickers(stickers, { query: search }),
  ).map((g) => ({
    id: g.id,
    label: `${g.label} (${g.count})`,
  }));

  const activeGroup =
    categories.find((c) => c.id === group)?.id ?? categories[0]?.id ?? group;

  const visible = filterStickers(stickers, {
    group: activeGroup,
    query: search,
  });

  return (
    <LibraryShell
      title="Stickers"
      searchPlaceholder="Search stickers…"
      categories={
        categories.length > 0
          ? categories
          : [{ id: activeGroup, label: "No matches" }]
      }
      activeCategory={activeGroup}
      onCategory={setGroup}
      search={search}
      onSearch={setSearch}
    >
      {visible.length === 0 ? (
        <div className="media-panel__placeholder">
          <p>No stickers match.</p>
        </div>
      ) : (
        <div className="media-panel__grid media-panel__grid--stickers">
          {visible.map((entry) => (
            <StickerCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </LibraryShell>
  );
}

function StickerCard({ entry }: { entry: StickerManifestEntry }) {
  const add = () => {
    void addStickerToTimeline(entry.id);
  };
  return (
    <div
      className="media-card media-card--sticker"
      role="button"
      tabIndex={0}
      draggable
      title={`${entry.name} — double-click or + to add`}
      onDoubleClick={add}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          add();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(STICKER_DRAG_MIME, entry.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="media-card__thumb media-card__thumb--sticker">
        <img
          src={stickerThumbDataUrl(entry.id, 128)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <MediaCardAddButton
          label={`Add ${entry.name} to timeline at playhead`}
          onAdd={add}
        />
      </div>
      <span className="media-card__name">{entry.name}</span>
    </div>
  );
}

function MediaCard({
  asset,
  projectPath,
  progress,
  onContextMenu,
}: {
  asset: MediaAssetRef;
  projectPath: string;
  progress?: number;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const selectedMediaId = useEditorStore((s) => s.selectedMediaId);
  const selectMedia = useEditorStore((s) => s.selectMedia);
  const thumbUrl = useThumbUrl(projectPath, asset.thumbPath);
  const processing = asset.importStatus === "processing";
  const errored = asset.importStatus === "error";
  const ready = !processing && !errored;
  const selected = selectedMediaId === asset.id;
  const favorited = !!asset.favorite;

  return (
    <div
      className={[
        "media-card",
        selected ? "media-card--selected" : "",
        errored ? "media-card--error" : "",
        processing ? "media-card--processing" : "",
        favorited ? "media-card--favorite" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      draggable={ready}
      title={
        errored
          ? asset.importError || "Import failed"
          : "Click to inspect · right-click for favorites · double-click or + to add at playhead"
      }
      onClick={() => selectMedia(asset.id)}
      onDoubleClick={() => {
        if (ready) addMediaToTimeline(asset.id);
      }}
      onContextMenu={(e) => {
        selectMedia(asset.id);
        onContextMenu(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectMedia(asset.id);
        }
      }}
      onDragStart={(e) => {
        if (!ready) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(MEDIA_DRAG_MIME, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="media-card__thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" draggable={false} />
        ) : (
          <div className="media-card__placeholder-thumb" aria-hidden>
            {asset.kind === "audio" ? "♪" : asset.kind === "image" ? "▣" : "▶"}
          </div>
        )}
        {favorited && (
          <span className="media-card__favorite" aria-label="Favorite">
            <IconHeart size={12} />
          </span>
        )}
        {asset.kind !== "image" && asset.durationMs > 0 && (
          <span className="media-card__duration">
            {formatDuration(asset.durationMs)}
          </span>
        )}
        {ready && (
          <MediaCardAddButton
            label={`Add ${asset.name} to timeline at playhead`}
            onAdd={() => addMediaToTimeline(asset.id)}
          />
        )}
        {processing && (
          <div className="media-card__progress">
            <div
              className="media-card__progress-bar"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <span className="media-card__name" title={asset.name}>
        {asset.name}
      </span>
      {errored && (
        <span className="media-card__error" title={asset.importError || "Failed"}>
          {asset.importError || "Failed"}
        </span>
      )}
    </div>
  );
}
