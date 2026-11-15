import assert from "node:assert/strict";
import { layoutPointToSourceUV } from "./removeBgSample";

// Identity transform, contain fit: center of layout → center of source
{
  const uv = layoutPointToSourceUV({
    layoutX: 960,
    layoutY: 540,
    layoutW: 1920,
    layoutH: 1080,
    srcW: 1920,
    srcH: 1080,
    fit: "contain",
    transform: null,
  });
  assert.ok(uv);
  assert.ok(Math.abs(uv!.u - 0.5) < 1e-3, `u=${uv!.u}`);
  assert.ok(Math.abs(uv!.v - 0.5) < 1e-3, `v=${uv!.v}`);
}

// Outside fitted rect → null
{
  const uv = layoutPointToSourceUV({
    layoutX: -10,
    layoutY: 540,
    layoutW: 1920,
    layoutH: 1080,
    srcW: 1920,
    srcH: 1080,
    fit: "contain",
    transform: null,
  });
  assert.equal(uv, null);
}

// Center click with half crop maps into crop interior
{
  const uv = layoutPointToSourceUV({
    layoutX: 960,
    layoutY: 540,
    layoutW: 1920,
    layoutH: 1080,
    srcW: 1920,
    srcH: 1080,
    fit: "contain",
    transform: null,
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  });
  assert.ok(uv);
  assert.ok(Math.abs(uv!.u - 0.5) < 1e-3, `u=${uv!.u}`);
  assert.ok(Math.abs(uv!.v - 0.5) < 1e-3, `v=${uv!.v}`);
}

console.log("removeBgSample.test.ts: ok");
