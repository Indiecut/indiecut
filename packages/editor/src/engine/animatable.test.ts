import assert from "node:assert/strict";
import {
  applyEasingPreset,
  clampAnimatableToDuration,
  clampKeyframeHandle,
  coerceAnimatableNumber,
  coerceTransform,
  collectKeyframeClusters,
  deleteKeyframeById,
  diamondState,
  evaluateClipMasks,
  evaluateClipVolumeDb,
  evaluateProperty,
  frameEpsilonMs,
  handlesForPreset,
  humanizeAnimatablePathForClip,
  listKeyedAnimatablePaths,
  makeKeyframe,
  moveKeyframe,
  moveKeyframeCluster,
  moveKeyframeXY,
  setAnimatableValue,
  setKeyframeValueById,
  shiftAnimatable,
  solveCubicBezier,
  staticAnimatable,
  toggleKeyframe,
  toggleKeyframeGroup,
  updateKeyframeHandles,
  defaultAnimatableTransform,
} from "./animatable";
import type { Clip } from "../project/types";
import {
  parseProjectJson,
  parseTextProps,
  serializeProject,
} from "../project/persistence";
import { createEmptyProject } from "../project/createProject";
import { createDefaultMask } from "../project/maskDefaults";

// --- solveCubicBezier ---
assert.equal(solveCubicBezier(0, 0, 1, 1, 0.5), 0.5);
assert.equal(solveCubicBezier(0, 0, 1, 1, 0), 0);
assert.equal(solveCubicBezier(0, 0, 1, 1, 1), 1);
const easeOut = solveCubicBezier(0, 0, 0.58, 1, 0.5);
assert.ok(easeOut > 0.5, "ease_out should accelerate early");

// --- evaluateProperty ---
const staticProp = staticAnimatable(42);
assert.equal(evaluateProperty(staticProp, 100), 42);

const linear = {
  staticValue: 0,
  keyframes: [
    makeKeyframe(0, 0),
    makeKeyframe(1000, 100),
  ],
};
assert.equal(evaluateProperty(linear, -10), 0);
assert.equal(evaluateProperty(linear, 0), 0);
assert.equal(evaluateProperty(linear, 1000), 100);
assert.equal(evaluateProperty(linear, 2000), 100);
assert.ok(Math.abs(evaluateProperty(linear, 500) - 50) < 1e-6);

const hold = {
  staticValue: 0,
  keyframes: [
    makeKeyframe(0, 10, { tangentMode: "hold" }),
    makeKeyframe(1000, 90),
  ],
};
assert.equal(evaluateProperty(hold, 500), 10);

// --- epsilon / diamond ---
assert.ok(Math.abs(frameEpsilonMs(30) - 1000 / 30) < 1e-9);
assert.equal(diamondState(staticProp, 0, 30), "dim");
assert.equal(diamondState(linear, 500, 30), "hollow");
assert.equal(diamondState(linear, 0, 30), "solid");

// --- setAnimatableValue / toggle ---
const clip: Clip = {
  id: "c1",
  kind: "video",
  startMs: 0,
  durationMs: 5000,
  inMs: 0,
  outMs: 5000,
  transform: defaultAnimatableTransform(),
};

const p1 = setAnimatableValue(clip, "opacity", 0.5, 0, 30);
assert.ok(p1.opacity);
assert.equal(p1.opacity.staticValue, 0.5);
assert.equal(p1.opacity.keyframes.length, 0);

const withKey = { ...clip, ...toggleKeyframe(clip, "opacity", 0, 30) };
assert.equal(withKey.opacity?.keyframes.length, 1);

const autoKey = setAnimatableValue(withKey, "opacity", 0.2, 1000, 30);
assert.equal(autoKey.opacity?.keyframes.length, 2);

// uniform scale mirrors Y
const scalePatch = setAnimatableValue(clip, "transform.scaleX", 2, 0, 30);
assert.equal(scalePatch.transform?.scaleX.staticValue, 2);
assert.equal(scalePatch.transform?.scaleY.staticValue, 2);

// --- clamp / shift ---
const shifted = shiftAnimatable(linear, -200);
assert.equal(shifted.keyframes[0]!.timeOffsetMs, -200);
const clamped = clampAnimatableToDuration(shifted, 500);
assert.equal(clamped.keyframes.length, 0);

// --- coerce helpers ---
const wrapped = coerceAnimatableNumber(0.75, 1);
assert.equal(wrapped.staticValue, 0.75);
assert.equal(wrapped.keyframes.length, 0);

const flatT = coerceTransform({
  x: 10,
  y: 20,
  scaleX: 1.5,
  scaleY: 1.5,
  rotation: 45,
  uniformScale: true,
});
assert.ok(flatT);
assert.equal(flatT.x.staticValue, 10);
assert.equal(flatT.rotation.staticValue, 45);

const empty = createEmptyProject();
assert.equal(empty.version, 4);

// --- last-key delete bakes evaluated value ---
const keyedOpacity = {
  ...clip,
  opacity: {
    staticValue: 1,
    keyframes: [makeKeyframe(0, 0.25), makeKeyframe(1000, 0.75)],
  },
};
const afterDeleteLast = {
  ...keyedOpacity,
  ...toggleKeyframe(
    {
      ...keyedOpacity,
      opacity: {
        staticValue: 1,
        keyframes: [makeKeyframe(500, 0.4)],
      },
    },
    "opacity",
    500,
    30,
  ),
};
assert.equal(afterDeleteLast.opacity?.keyframes.length, 0);
assert.equal(afterDeleteLast.opacity?.staticValue, 0.4);

// --- mask / volume evaluate ---
const mask = createDefaultMask("circle");
mask.feather = {
  staticValue: 0,
  keyframes: [makeKeyframe(0, 0), makeKeyframe(1000, 100)],
};
const maskClip: Clip = {
  ...clip,
  masksEnabled: true,
  masks: [mask],
  audio: { volumeDb: { staticValue: 0, keyframes: [makeKeyframe(0, -12), makeKeyframe(1000, 0)] } },
};
const masksAt500 = evaluateClipMasks(maskClip, 500);
assert.ok(masksAt500);
assert.ok(Math.abs(masksAt500[0]!.feather - 50) < 1e-6);
assert.ok(Math.abs(evaluateClipVolumeDb(maskClip, 500) - -6) < 1e-6);

// --- group toggle + cluster ---
const groupPatch = toggleKeyframeGroup(
  clip,
  ["transform.x", "transform.y"],
  200,
  30,
);
assert.equal(groupPatch.transform?.x.keyframes.length, 1);
assert.equal(groupPatch.transform?.y.keyframes.length, 1);
const clustered: Clip = {
  ...clip,
  ...groupPatch,
  opacity: {
    staticValue: 1,
    keyframes: [makeKeyframe(200, 0.5)],
  },
};
const clusters = collectKeyframeClusters(clustered, 30);
assert.equal(clusters.length, 1);
assert.ok(clusters[0]!.paths.includes("opacity"));
const moved = moveKeyframeCluster(clustered, 200, 800, 30);
assert.equal(moved.opacity?.keyframes[0]!.timeOffsetMs, 800);
assert.equal(moved.transform?.x.keyframes[0]!.timeOffsetMs, 800);

// --- v4 project round-trip ---
const v4Project = {
  ...JSON.parse(serializeProject(empty)),
  version: 4,
  tracks: [
    {
      id: "t1",
      type: "video",
      locked: false,
      hidden: false,
      clips: [
        {
          id: "c2",
          kind: "video",
          startMs: 0,
          durationMs: 1000,
          inMs: 0,
          outMs: 1000,
          transform: {
            x: { staticValue: 5, keyframes: [] },
            y: { staticValue: 0, keyframes: [] },
            scaleX: { staticValue: 1, keyframes: [] },
            scaleY: { staticValue: 1, keyframes: [] },
            rotation: { staticValue: 0, keyframes: [] },
            uniformScale: true,
          },
          opacity: { staticValue: 0.8, keyframes: [] },
          adjust: { brightness: { staticValue: 0.2, keyframes: [] } },
          audio: { volumeDb: { staticValue: -3, keyframes: [] } },
          masks: [
            {
              id: "m1",
              type: "circle",
              invert: false,
              feather: { staticValue: 10, keyframes: [] },
              position: {
                x: { staticValue: 1, keyframes: [] },
                y: { staticValue: 2, keyframes: [] },
              },
              rotationDeg: { staticValue: 0, keyframes: [] },
              size: {
                w: { staticValue: 100, keyframes: [] },
                h: { staticValue: 100, keyframes: [] },
              },
            },
          ],
        },
      ],
    },
  ],
};
const loadedV4 = parseProjectJson(JSON.stringify(v4Project));
assert.equal(loadedV4.version, 4);
assert.equal(loadedV4.tracks[0]!.clips[0]!.transform?.x.staticValue, 5);
assert.equal(loadedV4.tracks[0]!.clips[0]!.opacity?.staticValue, 0.8);
assert.equal(loadedV4.tracks[0]!.clips[0]!.adjust?.brightness?.staticValue, 0.2);
assert.equal(loadedV4.tracks[0]!.clips[0]!.audio?.volumeDb?.staticValue, -3);
assert.equal(loadedV4.tracks[0]!.clips[0]!.masks?.[0]?.feather.staticValue, 10);

assert.throws(
  () => parseProjectJson(JSON.stringify({ ...v4Project, version: 1 })),
  /Unsupported project version/,
);

const textProps = parseTextProps({
  content: "Hi",
  fontFamily: "system-ui, sans-serif",
  fontSize: 64,
  color: "#ffffff",
  align: "center",
  strokeWidth: 0,
  shadowColor: "rgba(0,0,0,0.55)",
  shadowBlur: 4,
  shadowOffsetX: 1.5,
  shadowOffsetY: 1.5,
});
assert.ok(textProps);
assert.equal(textProps!.shadowColor, "rgba(0,0,0,0.55)");
assert.equal(textProps!.shadowBlur, 4);

// --- moveKeyframe / applyEasingPreset / deleteKeyframeById ---
const easeHandles = handlesForPreset("ease_out");
assert.equal(easeHandles.easingPresetId, "ease_out");
assert.equal(easeHandles.outHandle.dx, 0);
assert.equal(easeHandles.outHandle.dy, 0);
assert.equal(easeHandles.inHandle.dx, 0.58);
assert.equal(easeHandles.inHandle.dy, 1);

const scaleClip: Clip = {
  ...clip,
  transform: {
    ...defaultAnimatableTransform(),
    scaleX: {
      staticValue: 1,
      keyframes: [
        makeKeyframe(0, 1, { id: "k_a" }),
        makeKeyframe(1000, 2, { id: "k_b" }),
      ],
    },
  },
};

const movedOne = moveKeyframe(scaleClip, "transform.scaleX", "k_a", 250, 30);
assert.equal(movedOne.transform?.scaleX.keyframes[0]!.timeOffsetMs, 250);
assert.equal(movedOne.transform?.scaleX.keyframes[0]!.id, "k_a");

const eased = applyEasingPreset(
  { ...scaleClip, ...movedOne },
  "transform.scaleX",
  "k_a",
  "ease_out",
);
const leftKey = eased.transform?.scaleX.keyframes.find((k) => k.id === "k_a");
const rightKey = eased.transform?.scaleX.keyframes.find((k) => k.id === "k_b");
assert.equal(leftKey?.easingPresetId, "ease_out");
assert.equal(leftKey?.outHandle.dx, 0);
assert.equal(rightKey?.inHandle.dx, 0.58);

const mid = evaluateProperty(eased.transform!.scaleX, 625);
assert.ok(mid > 1.5, "ease_out should be past halfway by mid-segment");

const afterDeleteB = deleteKeyframeById(
  { ...scaleClip, ...eased },
  "transform.scaleX",
  "k_b",
);
assert.equal(afterDeleteB.transform?.scaleX.keyframes.length, 1);

const afterLast = deleteKeyframeById(
  { ...scaleClip, ...afterDeleteB },
  "transform.scaleX",
  "k_a",
);
assert.equal(afterLast.transform?.scaleX.keyframes.length, 0);
assert.ok(
  typeof afterLast.transform?.scaleX.staticValue === "number",
  "last key delete freezes staticValue",
);
assert.equal(listKeyedAnimatablePaths({ ...scaleClip, ...afterLast }).length, 0);

const label = humanizeAnimatablePathForClip(scaleClip, "transform.scaleX");
assert.equal(label, "Transform: Scale X");

// --- v4: setKeyframeValueById / moveKeyframeXY / updateKeyframeHandles ---
const clampedH = clampKeyframeHandle({ dx: 1.5, dy: 2.2 });
assert.equal(clampedH.dx, 1);
assert.equal(clampedH.dy, 2.2);
assert.equal(clampKeyframeHandle({ dx: -0.2, dy: -1 }).dx, 0);

const valued = setKeyframeValueById(scaleClip, "transform.scaleX", "k_b", 3.5);
assert.equal(valued.transform?.scaleX.keyframes.find((k) => k.id === "k_b")?.value, 3.5);
assert.equal(
  valued.transform?.scaleX.keyframes.find((k) => k.id === "k_b")?.timeOffsetMs,
  1000,
);

const movedXY = moveKeyframeXY(scaleClip, "transform.scaleX", "k_a", 400, 1.25, 30);
const movedA = movedXY.transform?.scaleX.keyframes.find((k) => k.id === "k_a");
assert.equal(movedA?.timeOffsetMs, 400);
assert.equal(movedA?.value, 1.25);

const customHandles = updateKeyframeHandles(scaleClip, "transform.scaleX", "k_a", {
  outHandle: { dx: 0.2, dy: 1.4 },
  inHandle: { dx: 0.8, dy: -0.3 },
  tangentMode: "broken",
});
const customLeft = customHandles.transform?.scaleX.keyframes.find((k) => k.id === "k_a");
const customRight = customHandles.transform?.scaleX.keyframes.find((k) => k.id === "k_b");
assert.equal(customLeft?.easingPresetId, "custom");
assert.equal(customLeft?.tangentMode, "broken");
assert.equal(customLeft?.outHandle.dx, 0.2);
assert.equal(customLeft?.outHandle.dy, 1.4);
assert.equal(customRight?.inHandle.dx, 0.8);
assert.equal(customRight?.inHandle.dy, -0.3);

const linearMid = evaluateProperty(scaleClip.transform!.scaleX, 500);
const customMid = evaluateProperty(customHandles.transform!.scaleX, 500);
assert.notEqual(customMid, linearMid, "custom handles should change mid-segment value");
assert.ok(Number.isFinite(customMid));

const selfIn = updateKeyframeHandles(scaleClip, "transform.scaleX", "k_b", {
  inHandleOnSelf: { dx: 0.4, dy: 0.9 },
  tangentMode: "aligned",
});
const selfInKey = selfIn.transform?.scaleX.keyframes.find((k) => k.id === "k_b");
assert.equal(selfInKey?.easingPresetId, "custom");
assert.equal(selfInKey?.inHandle.dx, 0.4);
assert.equal(selfInKey?.tangentMode, "aligned");

console.log("animatable.test.ts: ok");
