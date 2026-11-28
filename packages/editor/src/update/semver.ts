/** Strip leading `v` and any prerelease/build suffix (`-web`, `-beta.1`, `+meta`). */
export function normalizeVersion(raw: string): string {
  return raw
    .trim()
    .replace(/^v/i, "")
    .replace(/[-+].*$/, "");
}

export function parseSemver(
  raw: string,
): [number, number, number] | null {
  const cleaned = normalizeVersion(raw);
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True when `latest` is a higher semver than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}
