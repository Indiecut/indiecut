import { getPlatform } from "@indiecut/platform";
import {
  getSkippedUpdateVersion,
  setSkippedUpdateVersion,
} from "../prefs/appPrefs";
import { isNewerVersion, normalizeVersion } from "./semver";

const RELEASES_LATEST_API =
  "https://api.github.com/repos/Indiecut/indiecut/releases/latest";

export const RELEASES_LATEST_URL =
  "https://github.com/Indiecut/indiecut/releases/latest";

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseName?: string;
};

type GithubLatestRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
};

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  const currentRaw = getPlatform()?.version?.trim() || "";
  if (!currentRaw) return null;

  const skipped = await getSkippedUpdateVersion();

  let res: Response;
  try {
    res = await fetch(RELEASES_LATEST_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data: GithubLatestRelease;
  try {
    data = (await res.json()) as GithubLatestRelease;
  } catch {
    return null;
  }

  if (data.draft === true || data.prerelease === true) return null;
  if (typeof data.tag_name !== "string" || !data.tag_name.trim()) return null;

  const latestVersion = normalizeVersion(data.tag_name);
  const currentVersion = normalizeVersion(currentRaw);
  if (!isNewerVersion(latestVersion, currentVersion)) return null;

  if (skipped && normalizeVersion(skipped) === latestVersion) return null;

  const releaseUrl =
    typeof data.html_url === "string" && data.html_url.startsWith("http")
      ? data.html_url
      : RELEASES_LATEST_URL;

  return {
    currentVersion,
    latestVersion,
    releaseUrl,
    releaseName:
      typeof data.name === "string" && data.name.trim()
        ? data.name.trim()
        : undefined,
  };
}

export async function dismissAppUpdate(latestVersion: string): Promise<void> {
  await setSkippedUpdateVersion(normalizeVersion(latestVersion));
}
