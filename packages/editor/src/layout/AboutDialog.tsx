import { getPlatform } from "@indiecut/platform";
import { useEditorStore } from "../store/editorStore";
import "./AppModal.css";

export function AboutDialog() {
  const open = useEditorStore((s) => s.aboutDialogOpen);
  const setOpen = useEditorStore((s) => s.setAboutDialogOpen);
  const version = getPlatform()?.version?.trim() || "—";

  if (!open) return null;

  const onClose = () => setOpen(false);

  const openLink = (url: string) => {
    void getPlatform()?.shell.openExternal(url);
  };

  return (
    <div
      className="app-modal"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="app-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-indiecut-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal__header app-modal__header--about">
          <img
            className="app-modal__about-icon"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            width={40}
            height={40}
            draggable={false}
          />
          <h2 id="about-indiecut-title" className="app-modal__title">
            About IndieCut
          </h2>
        </div>
        <div className="app-modal__body">
          <p className="app-modal__message">
            Open-source CapCut alternative and AI video editor.
          </p>
          <p className="app-modal__version">
            Version <span className="app-modal__version-num">{version}</span>
          </p>
          <div className="app-modal__link-row">
            <button
              type="button"
              className="app-modal__btn app-modal__btn--ghost"
              onClick={() => openLink("https://indiecut.io")}
            >
              Website
            </button>
            <button
              type="button"
              className="app-modal__btn app-modal__btn--ghost"
              onClick={() => openLink("https://discord.gg/fMKJqPsBan")}
            >
              Discord
            </button>
            <button
              type="button"
              className="app-modal__btn app-modal__btn--ghost"
              onClick={() =>
                openLink("https://github.com/Indiecut/indiecut")
              }
            >
              GitHub
            </button>
          </div>
        </div>
        <div className="app-modal__footer">
          <button
            type="button"
            className="app-modal__btn app-modal__btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
