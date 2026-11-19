/** Lightweight body proxy from pose landmarks (no SMPL / external body model). */

import type { TryOnAnchors } from "./catalog";
import type { GarmentPose } from "./garment-3d";
import { MODEL_SHOULDER_WIDTH, MODEL_TORSO_HEIGHT } from "./garment-rig";
import type { HeadPoints, MaskPoint } from "./tryon-mask";

export const MODEL_HIP_WIDTH = 0.7;

export type BodyProxy = {
  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  chestDepthHint: number;
  neckAnchor: MaskPoint;
  /** 0–1 from torso landmark visibility. */
  poseConfidence: number;
  /** Combined horizontal scale factor before Z. */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

function dist(a: MaskPoint, b: MaskPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: MaskPoint, b: MaskPoint): MaskPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Screen-space orthographic distances match garment-3d screenToWorld metric. */
export function measureBodyProxy(
  pose: GarmentPose,
  head: HeadPoints | null,
  _width: number,
  height: number,
  anchors?: TryOnAnchors | null,
): BodyProxy | null {
  const refShoulder = anchors?.shoulderWidth ?? MODEL_SHOULDER_WIDTH;
  const refTorso = anchors?.torsoHeight ?? MODEL_TORSO_HEIGHT;
  const refHip = MODEL_HIP_WIDTH * (refShoulder / MODEL_SHOULDER_WIDTH);
  const ls = pose.leftShoulder;
  const rs = pose.rightShoulder;
  const lh = pose.leftHip;
  const rh = pose.rightHip;
  const shoulderMid = mid(ls, rs);
  const hipMid = mid(lh, rh);
  const shoulderWidth = dist(ls, rs);
  const hipWidth = dist(lh, rh);
  const torsoLength = dist(shoulderMid, hipMid);

  if (
    shoulderWidth < 12 ||
    torsoLength < 14 ||
    ls.x >= rs.x ||
    shoulderMid.y >= hipMid.y
  ) {
    return null;
  }

  const torsoVis = Math.min(
    ls.visibility ?? 1,
    rs.visibility ?? 1,
    lh.visibility ?? 1,
    rh.visibility ?? 1,
  );

  // World Z spread between shoulders vs hips → shallow depth cue; fall back to width.
  const shoulderZ = Math.abs((pose.world.leftShoulder.z ?? 0) - (pose.world.rightShoulder.z ?? 0));
  const hipZ = Math.abs((pose.world.leftHip.z ?? 0) - (pose.world.rightHip.z ?? 0));
  const zSpread = Math.max(shoulderZ, hipZ);
  const widthAvg = (shoulderWidth + hipWidth) * 0.5;
  const chestDepthHint = widthAvg * (0.55 + clamp(zSpread * 2.2, 0, 0.35));

  const earMidY = head
    ? (head.leftEar.y + head.rightEar.y) * 0.5
    : shoulderMid.y - Math.max(28, height * 0.06);
  const nose = head?.nose;
  const neckAnchor: MaskPoint = {
    x: nose?.x ?? shoulderMid.x,
    y: nose ? nose.y + Math.max(18, height * 0.035) : (earMidY + shoulderMid.y) * 0.5,
    visibility: nose?.visibility ?? torsoVis,
  };

  // Blend shoulder + hip width so the garment follows torso contour, not a cardboard strip.
  const blendedWidth = shoulderWidth * 0.62 + hipWidth * 0.38;
  const modelWidth = refShoulder * 0.62 + refHip * 0.38;
  const scaleX = blendedWidth / modelWidth;
  const scaleY = torsoLength / refTorso;
  const xy = (scaleX + scaleY) * 0.5;
  // Depth tracks XY volume; world-Z spread nudges slightly thicker chests.
  const depthNudge = 1 + clamp(zSpread * 1.4, 0, 0.12);
  const scaleZ = clamp(
    0.9 * xy * depthNudge,
    Math.min(scaleX, scaleY) * 0.78,
    Math.max(scaleX, scaleY) * 1.08,
  );

  return {
    shoulderWidth,
    hipWidth,
    torsoLength,
    chestDepthHint,
    neckAnchor,
    poseConfidence: torsoVis,
    scaleX,
    scaleY,
    scaleZ,
  };
}

/** Soft opacity curve: fade in above low confidence, full by ~0.55. */
export function confidenceToOpacity(confidence: number) {
  if (confidence < 0.22) return 0;
  if (confidence >= 0.55) return 1;
  return (confidence - 0.22) / (0.55 - 0.22);
}
