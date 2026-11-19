/** On-device 2.5D torso texture warp (no upload, no VTON). */

import type { UpperBodyPose } from "./tryon-mask";

export type WarpPoint = { x: number; y: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function bilinear(tl: WarpPoint, tr: WarpPoint, br: WarpPoint, bl: WarpPoint, u: number, v: number): WarpPoint {
  const topX = lerp(tl.x, tr.x, u);
  const topY = lerp(tl.y, tr.y, u);
  const botX = lerp(bl.x, br.x, u);
  const botY = lerp(bl.y, br.y, u);
  return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
}

/** Torso quad in mirrored screen space: TL, TR, BR, BL. */
export function torsoQuadFromPose(pose: UpperBodyPose, height: number): [WarpPoint, WarpPoint, WarpPoint, WarpPoint] {
  const shoulderMidY = (pose.leftShoulder.y + pose.rightShoulder.y) / 2;
  const neckInset = Math.max(16, height * 0.035);
  const padX = Math.max(10, Math.abs(pose.rightShoulder.x - pose.leftShoulder.x) * 0.06);
  const topY = shoulderMidY - neckInset;
  const tl = { x: pose.leftShoulder.x - padX, y: topY };
  const tr = { x: pose.rightShoulder.x + padX, y: topY };
  const br = { x: pose.rightHip.x + padX * 0.85, y: pose.rightHip.y };
  const bl = { x: pose.leftHip.x - padX * 0.85, y: pose.leftHip.y };
  return [tl, tr, br, bl];
}

/**
 * Warp a front garment image onto a torso quad via a bilinear grid.
 * Image must already be loaded from a local/public URL — never uploads frames.
 */
export function drawWarpedTexture(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  quad: [WarpPoint, WarpPoint, WarpPoint, WarpPoint],
  opacity = 0.85,
  steps = 10,
) {
  const [tl, tr, br, bl] = quad;
  const iw = "naturalWidth" in image && typeof image.naturalWidth === "number" && image.naturalWidth > 0
    ? image.naturalWidth
    : "width" in image && typeof image.width === "number"
      ? Number(image.width)
      : 0;
  const ih = "naturalHeight" in image && typeof image.naturalHeight === "number" && image.naturalHeight > 0
    ? image.naturalHeight
    : "height" in image && typeof image.height === "number"
      ? Number(image.height)
      : 0;
  if (!iw || !ih) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;

  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      const v0 = j / steps;
      const v1 = (j + 1) / steps;
      const p00 = bilinear(tl, tr, br, bl, u0, v0);
      const p10 = bilinear(tl, tr, br, bl, u1, v0);
      const p11 = bilinear(tl, tr, br, bl, u1, v1);
      const p01 = bilinear(tl, tr, br, bl, u0, v1);

      const sx = u0 * iw;
      const sy = v0 * ih;
      const sw = Math.max(1, (u1 - u0) * iw);
      const sh = Math.max(1, (v1 - v0) * ih);

      // Two triangles per cell keep edges tight on non-rectangular torsos.
      fillTexturedTriangle(ctx, image, sx, sy, sw, sh, p00, p10, p11, 0, 0, 1, 0, 1, 1);
      fillTexturedTriangle(ctx, image, sx, sy, sw, sh, p00, p11, p01, 0, 0, 1, 1, 0, 1);
    }
  }
  ctx.restore();
}

function fillTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  p0: WarpPoint,
  p1: WarpPoint,
  p2: WarpPoint,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();

  // Affine map from local UV of this cell → destination triangle.
  const denom = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(denom) < 1e-8) {
    ctx.restore();
    return;
  }
  const m11 = (p0.x * (v1 - v2) + p1.x * (v2 - v0) + p2.x * (v0 - v1)) / denom;
  const m12 = (p0.x * (u2 - u1) + p1.x * (u0 - u2) + p2.x * (u1 - u0)) / denom;
  const m21 = (p0.y * (v1 - v2) + p1.y * (v2 - v0) + p2.y * (v0 - v1)) / denom;
  const m22 = (p0.y * (u2 - u1) + p1.y * (u0 - u2) + p2.y * (u1 - u0)) / denom;
  const dx = (p0.x * (u1 * v2 - u2 * v1) + p1.x * (u2 * v0 - u0 * v2) + p2.x * (u0 * v1 - u1 * v0)) / denom;
  const dy = (p0.y * (u1 * v2 - u2 * v1) + p1.y * (u2 * v0 - u0 * v2) + p2.y * (u0 * v1 - u1 * v0)) / denom;

  ctx.setTransform(m11, m21, m12, m22, dx, dy);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 1, 1);
  ctx.restore();
}
