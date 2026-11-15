import { useEffect, useMemo, useRef, useState } from "react";
import { IconPause, IconPlay } from "../icons/Icons";
import {
  addSoundEffectToTimeline,
  SOUND_EFFECT_DRAG_MIME,
} from "../media/addSoundEffectToTimeline";
import { MediaCardAddButton } from "../layout/MediaCardAddButton";
import { LibraryShell } from "../layout/PresetLibraries";
import {
  SOUND_EFFECT_CATEGORY_LABEL,
  SOUND_EFFECT_CATEGORY_ORDER,
  SOUND_EFFECTS,
  soundEffectUrl,
  type SoundEffectCategory,
  type SoundEffectEntry,
} from "./catalog";
import "./SoundEffectsLibrary.css";

type CategoryFilter = SoundEffectCategory | "all";

export function SoundEffectsLibrary() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const stopPreview = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingId(null);
  };

  const togglePreview = (entry: SoundEffectEntry) => {
    if (playingId === entry.id) {
      stopPreview();
      return;
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlayingId(null));
      audio.addEventListener("error", () => setPlayingId(null));
    }

    let url: string;
    try {
      url = soundEffectUrl(entry.file);
    } catch (err) {
      console.error(err);
      setPlayingId(null);
      return;
    }

    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    void audio.play().then(
      () => setPlayingId(entry.id),
      () => setPlayingId(null),
    );
  };

  const categories = useMemo(
    () => [
      { id: "all", label: "All" },
      ...SOUND_EFFECT_CATEGORY_ORDER.map((id) => ({
        id,
        label: SOUND_EFFECT_CATEGORY_LABEL[id],
      })),
    ],
    [],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SOUND_EFFECTS.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.includes(q))
      );
    });
  }, [category, search]);

  return (
    <LibraryShell
      title="Sound effects"
      searchPlaceholder="Search sound effects"
      categories={categories}
      activeCategory={category}
      onCategory={(id) => setCategory(id as CategoryFilter)}
      search={search}
      onSearch={setSearch}
    >
      <div className="sfx-list" role="list">
        {visible.length === 0 ? (
          <p className="sfx-list__empty">No sound effects match your search.</p>
        ) : (
          visible.map((entry) => (
            <SoundEffectRow
              key={entry.id}
              entry={entry}
              playing={playingId === entry.id}
              onTogglePlay={() => togglePreview(entry)}
            />
          ))
        )}
      </div>
    </LibraryShell>
  );
}

function SoundEffectRow({
  entry,
  playing,
  onTogglePlay,
}: {
  entry: SoundEffectEntry;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const add = () => {
    if (adding) return;
    setAdding(true);
    void addSoundEffectToTimeline(entry.id)
      .catch((err) => {
        console.error(err);
        window.alert(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setAdding(false));
  };

  return (
    <div
      className={playing ? "sfx-row sfx-row--playing" : "sfx-row"}
      role="listitem"
      draggable
      title={`${entry.name} — preview or + to add at playhead`}
      onDoubleClick={add}
      onDragStart={(e) => {
        e.dataTransfer.setData(SOUND_EFFECT_DRAG_MIME, entry.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button
        type="button"
        className="sfx-row__play"
        aria-label={playing ? `Stop ${entry.name}` : `Preview ${entry.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
      >
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>
      <div className="sfx-row__body">
        <span className="sfx-row__name">{entry.name}</span>
        <span className="sfx-row__desc">{entry.description}</span>
      </div>
      <span className="sfx-row__cat">
        {SOUND_EFFECT_CATEGORY_LABEL[entry.category]}
      </span>
      <div className="sfx-row__add">
        <MediaCardAddButton
          label={
            adding
              ? `Adding ${entry.name}…`
              : `Add ${entry.name} to timeline at playhead`
          }
          onAdd={add}
        />
      </div>
    </div>
  );
}
