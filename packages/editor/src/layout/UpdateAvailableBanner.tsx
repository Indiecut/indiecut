import { getPlatform } from "@indiecut/platform";
import { useEffect, useState } from "react";
import {
  checkForAppUpdate,
  dismissAppUpdate,
  type AppUpdateInfo,
} from "../update/checkForAppUpdate";
import "./UpdateAvailableBanner.css";

const CHECK_DELAY_MS = 2800;

export function UpdateAvailableBanner() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkForAppUpdate()
        .then((next) => {
          if (!cancelled && next) setInfo(next);
        })
        .catch(() => {
          /* ignore network / parse errors */
        });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!info) return null;

  const onUpdate = () => {
    void getPlatform()?.shell.openExternal(info.releaseUrl);
  };

  const onDismiss = () => {
    const version = info.latestVersion;
    setInfo(null);
    void dismissAppUpdate(version);
  };

  return (
    <div
      className="update-banner"
      role="status"
      aria-live="polite"
      aria-label="App update available"
    >
      <p className="update-banner__text">
        <span className="update-banner__title">Update available</span>
        <span className="update-banner__detail">
          IndieCut {info.latestVersion} is ready
          {info.currentVersion ? ` (you have ${info.currentVersion})` : ""}.
        </span>
      </p>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__btn update-banner__btn--primary"
          onClick={onUpdate}
        >
          Update now
        </button>
        <button
          type="button"
          className="update-banner__btn update-banner__btn--ghost"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
