import assert from "node:assert/strict";
import { isNewerVersion, normalizeVersion, parseSemver } from "./semver";

assert.equal(normalizeVersion("v1.2.3"), "1.2.3");
assert.equal(normalizeVersion("1.1.0-web"), "1.1.0");
assert.deepEqual(parseSemver("v1.2.3"), [1, 2, 3]);
assert.equal(parseSemver("nope"), null);

assert.equal(isNewerVersion("1.2.0", "1.1.0"), true);
assert.equal(isNewerVersion("v1.1.1", "1.1.0-web"), true);
assert.equal(isNewerVersion("1.1.0", "1.1.0"), false);
assert.equal(isNewerVersion("1.0.9", "1.1.0"), false);
assert.equal(isNewerVersion("bad", "1.1.0"), false);

console.log("semver.test.ts: ok");
