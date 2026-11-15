import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  addEffectToTimeline,
  EFFECT_DRAG_MIME,
} from "../media/addEffectToTimeline";
import {
  applyOrPlaceFilter,
  FILTER_DRAG_MIME,
  importCubeLutFile,
} from "../media/applyFilter";
import {
  attachTransitionPreset,
  TRANSITION_DRAG_MIME,
} from "../media/attachTransition";
import {
  EFFECT_CATEGORY_LABEL,
  groupEffectsByCategory,
  loadEffectManifest,
  type EffectCategory,
  type EffectManifestEntry,
} from "../effects/manifest";
import {
  FILTER_CATEGORY_LABEL,
  groupFiltersByCategory,
  loadFilterManifest,
  type FilterManifestEntry,
} from "../filters/manifest";
import type { FilterCategory } from "../project/types";
import {
  TRANSITION_CATEGORY_LABEL,
  groupTransitionsByCategory,
  loadTransitionManifest,
  type TransitionManifestEntry,
} from "../transitions/manifest";
import type { TransitionCategory } from "../project/types";
import { MediaCardAddButton } from "./MediaCardAddButton";

export type LibraryCategoryItem = {
  id: string;
  label: string;
  /** Nested sub-options (e.g. Templates → All / Trending). */
  children?: { id: string; label: string }[];
};

type LibraryShellProps = {
  title: string;
  searchPlaceholder: string;
  categories: LibraryCategoryItem[];
  activeCategory: string;
  onCategory: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  toolbar?: ReactNode;
  children: ReactNode;
  /** When true, omit the outer library wrapper (for nesting under another section). */
  embedded?: boolean;
};

export function LibraryShell({
  title,
  searchPlaceholder,
  categories,
  activeCategory,
  onCategory,
  search,
  onSearch,
  toolbar,
  children,
  embedded = false,
}: LibraryShellProps) {
  const layout = (
    <div className="media-panel__preset-layout">
      <aside className="media-panel__preset-cats" aria-label={title}>
        {categories.map((c) => {
          const childIds = c.children?.map((ch) => ch.id) ?? [];
          const childActive = childIds.includes(activeCategory);
          const parentActive = c.id === activeCategory || childActive;
          const showChildren = Boolean(c.children?.length) && parentActive;

          return (
            <div key={c.id} className="media-panel__preset-cat-group">
              <button
                type="button"
                className={
                  parentActive
                    ? "media-panel__preset-cat media-panel__preset-cat--active"
                    : "media-panel__preset-cat"
                }
                onClick={() =>
                  onCategory(c.children?.length ? c.children[0]!.id : c.id)
                }
              >
                {c.label}
              </button>
              {showChildren ? (
                <div className="media-panel__preset-cat-children">
                  {c.children!.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      className={
                        ch.id === activeCategory
                          ? "media-panel__preset-cat media-panel__preset-cat--child media-panel__preset-cat--active"
                          : "media-panel__preset-cat media-panel__preset-cat--child"
                      }
                      onClick={() => onCategory(ch.id)}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </aside>
      <div className="media-panel__preset-main">
        <div className="media-panel__preset-toolbar">
          <input
            type="search"
            className="media-panel__preset-search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {toolbar}
        </div>
        {children}
      </div>
    </div>
  );

  if (embedded) return layout;

  return (
    <div className="media-panel__library media-panel__library--presets">
      {layout}
    </div>
  );
}

function PresetCard({
  name,
  subtitle,
  swatchClass,
  onActivate,
  onDragStart,
}: {
  name: string;
  subtitle?: string;
  swatchClass: string;
  onActivate: () => void;
  onDragStart: (e: DragEvent) => void;
}) {
  return (
    <div
      className="media-card media-card--preset"
      role="button"
      tabIndex={0}
      draggable
      title={`${name} — double-click or + to apply`}
      onDoubleClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      onDragStart={onDragStart}
    >
      <div className={`media-card__thumb media-card__thumb--preset ${swatchClass}`}>
        <span className="media-card__preset-label">{name.slice(0, 1)}</span>
        <MediaCardAddButton
          label={`Add ${name} to timeline at playhead`}
          onAdd={onActivate}
        />
      </div>
      <span className="media-card__name">{name}</span>
      {subtitle ? <span className="media-card__meta">{subtitle}</span> : null}
    </div>
  );
}

export function EffectsLibrary() {
  const [items, setItems] = useState<EffectManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<EffectCategory | "all">("basic");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadEffectManifest()
      .then((m) => {
        if (!cancelled) setItems(m.effects);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="media-panel__placeholder">
        <p>Failed to load effects: {error}</p>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="media-panel__placeholder">
        <p>Loading effects…</p>
      </div>
    );
  }

  const groups = groupEffectsByCategory(items);
  const cats = [
    { id: "all", label: "All" },
    ...groups.map((g) => ({
      id: g.category,
      label: EFFECT_CATEGORY_LABEL[g.category],
    })),
  ];
  const q = search.trim().toLowerCase();
  const visible = items.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.id.includes(q) ||
      e.tags.some((t) => t.includes(q))
    );
  });

  return (
    <LibraryShell
      title="Video effects"
      searchPlaceholder="Search for effects"
      categories={cats}
      activeCategory={category}
      onCategory={(id) => setCategory(id as EffectCategory | "all")}
      search={search}
      onSearch={setSearch}
    >
      <div className="media-panel__grid media-panel__grid--presets">
        {visible.map((entry) => (
          <PresetCard
            key={entry.id}
            name={entry.name}
            subtitle="Basic"
            swatchClass={`media-card__swatch--effect-${entry.id}`}
            onActivate={() => void addEffectToTimeline(entry.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(EFFECT_DRAG_MIME, entry.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
          />
        ))}
      </div>
    </LibraryShell>
  );
}

export function TransitionsLibrary() {
  const [items, setItems] = useState<TransitionManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<TransitionCategory | "all">("fade");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadTransitionManifest()
      .then((m) => {
        if (!cancelled) setItems(m.transitions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="media-panel__placeholder">
        <p>Failed to load transitions: {error}</p>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="media-panel__placeholder">
        <p>Loading transitions…</p>
      </div>
    );
  }

  const groups = groupTransitionsByCategory(items);
  const cats = [
    { id: "all", label: "All" },
    ...groups.map((g) => ({
      id: g.category,
      label: TRANSITION_CATEGORY_LABEL[g.category],
    })),
  ];
  const q = search.trim().toLowerCase();
  const visible = items.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.id.includes(q) ||
      e.tags.some((t) => t.includes(q))
    );
  });

  return (
    <LibraryShell
      title="Transitions"
      searchPlaceholder="Search for transitions"
      categories={cats}
      activeCategory={category}
      onCategory={(id) => setCategory(id as TransitionCategory | "all")}
      search={search}
      onSearch={setSearch}
    >
      <div className="media-panel__grid media-panel__grid--presets">
        {visible.map((entry) => (
          <PresetCard
            key={entry.id}
            name={entry.name}
            subtitle={`${entry.defaultDurationMs}ms`}
            swatchClass={`media-card__swatch--transition-${entry.category}`}
            onActivate={() =>
              void attachTransitionPreset(entry.id, { preferPlayhead: true })
            }
            onDragStart={(e) => {
              e.dataTransfer.setData(TRANSITION_DRAG_MIME, entry.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
          />
        ))}
      </div>
    </LibraryShell>
  );
}

export function FiltersLibrary() {
  const [items, setItems] = useState<FilterManifestEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<FilterCategory | "all">("life");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFilterManifest()
      .then((m) => {
        if (!cancelled) setItems(m.filters);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cats = useMemo(() => {
    if (!items) return [{ id: "all", label: "All" }];
    const groups = groupFiltersByCategory(items);
    return [
      { id: "all", label: "All" },
      ...groups.map((g) => ({
        id: g.category,
        label: FILTER_CATEGORY_LABEL[g.category],
      })),
    ];
  }, [items]);

  if (error) {
    return (
      <div className="media-panel__placeholder">
        <p>Failed to load filters: {error}</p>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="media-panel__placeholder">
        <p>Loading filters…</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const visible = items.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.id.includes(q) ||
      e.tags.some((t) => t.includes(q))
    );
  });

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      await importCubeLutFile(file);
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <LibraryShell
      title="Filters"
      searchPlaceholder="Search for filters"
      categories={cats}
      activeCategory={category}
      onCategory={(id) => setCategory(id as FilterCategory | "all")}
      search={search}
      onSearch={setSearch}
      toolbar={
        <>
          <button
            type="button"
            className="media-panel__toolbar-import"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? "Importing…" : "Import LUT"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".cube,text/plain"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </>
      }
    >
      <div className="media-panel__grid media-panel__grid--presets">
        {visible.map((entry) => (
          <PresetCard
            key={entry.id}
            name={entry.name}
            subtitle={FILTER_CATEGORY_LABEL[entry.category]}
            swatchClass={`media-card__swatch--filter-${entry.category}`}
            onActivate={() => void applyOrPlaceFilter(entry.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(FILTER_DRAG_MIME, entry.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
          />
        ))}
      </div>
    </LibraryShell>
  );
}
