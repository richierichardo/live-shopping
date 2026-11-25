/** Explicit garment-local bind anchors for screen fitting and arm chain lengths. */

import type { Vec3 } from "./tryon-coords";
import { orthoToStage, stageToOrtho } from "./tryon-coords";

export type ModelAnchorPoints = {
  shoulderL: Vec3;
  shoulderR: Vec3;
  elbowL: Vec3;
  elbowR: Vec3;
  wristL: Vec3;
  wristR: Vec3;
  pelvis: Vec3;
  neck: Vec3;
  hem: Vec3;
  shoulderWidth: number;
  torsoHeight: number;
  upperArmLengthL: number;
  upperArmLengthR: number;
  forearmLengthL: number;
  forearmLengthR: number;
};

export type AnchorResidual = {
  label: string;
  cameraX: number;
  cameraY: number;
  modelX: number;
  modelY: number;
  errorPx: number;
  /** errorPx as a percent of the camera shoulder span. */
  errorPct: number;
};

export type AnchorFitResult = {
  /** Ortho-space torso mid used as garment group position (before root offset). */
  position: Vec3;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Root offset so bind torso/hem align; applied on garment.root. */
  rootOffset: Vec3;
  residuals: AnchorResidual[];
};

function dist(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mid(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Build anchors from bind-pose bone positions already expressed in garment root space. */
export function buildModelAnchors(input: {
  shoulderL: Vec3;
  shoulderR: Vec3;
  elbowL: Vec3;
  elbowR: Vec3;
  wristL: Vec3;
  wristR: Vec3;
  pelvis: Vec3;
  neck: Vec3;
  hemY: number;
}): ModelAnchorPoints {
  const shoulderMid = mid(input.shoulderL, input.shoulderR);
  const hem: Vec3 = { x: input.pelvis.x, y: input.hemY, z: input.pelvis.z };
  return {
    shoulderL: input.shoulderL,
    shoulderR: input.shoulderR,
    elbowL: input.elbowL,
    elbowR: input.elbowR,
    wristL: input.wristL,
    wristR: input.wristR,
    pelvis: input.pelvis,
    neck: input.neck,
    hem,
    shoulderWidth: dist(input.shoulderL, input.shoulderR),
    torsoHeight: dist(shoulderMid, input.pelvis),
    upperArmLengthL: dist(input.shoulderL, input.elbowL),
    upperArmLengthR: dist(input.shoulderR, input.elbowR),
    forearmLengthL: dist(input.elbowL, input.wristL),
    forearmLengthR: dist(input.elbowR, input.wristR),
  };
}

/**
 * Fit garment position/scale from screen shoulders + hips against model anchors.
 * hem stays on the model record for a later garment pass. It does not move the shoulder or pelvis.
 */
export function computeAnchorFit(
  pose: {
    leftShoulder: { x: number; y: number; visibility?: number };
    rightShoulder: { x: number; y: number; visibility?: number };
    leftHip: { x: number; y: number; visibility?: number };
    rightHip: { x: number; y: number; visibility?: number };
  },
  model: ModelAnchorPoints,
  stageWidth: number,
  stageHeight: number,
  depthHint = 0,
): AnchorFitResult | null {
  const ls = pose.leftShoulder;
  const rs = pose.rightShoulder;
  const lh = pose.leftHip;
  const rh = pose.rightHip;

  const screenShoulder = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  const screenHip = Math.hypot(rh.x - lh.x, rh.y - lh.y);
  const shoulderMid = { x: (ls.x + rs.x) * 0.5, y: (ls.y + rs.y) * 0.5 };
  const hipMid = { x: (lh.x + rh.x) * 0.5, y: (lh.y + rh.y) * 0.5 };
  const screenTorso = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);

  if (screenShoulder < 12 || screenTorso < 14 || ls.x >= rs.x || shoulderMid.y >= hipMid.y) {
    return null;
  }

  const modelShoulder = Math.max(model.shoulderWidth, 1e-4);
  const modelTorso = Math.max(model.torsoHeight, 1e-4);
  const modelHip = modelShoulder * (0.7 / 0.78);

  const blendedWidth = screenShoulder * 0.62 + screenHip * 0.38;
  const modelWidth = modelShoulder * 0.62 + modelHip * 0.38;
  const scaleX = blendedWidth / modelWidth;
  const scaleY = screenTorso / modelTorso;
  const xy = (scaleX + scaleY) * 0.5;
  const depthNudge = 1 + clamp(Math.abs(depthHint) * 1.4, 0, 0.12);
  const scaleZ = clamp(
    0.9 * xy * depthNudge,
    Math.min(scaleX, scaleY) * 0.78,
    Math.max(scaleX, scaleY) * 1.08,
  );

  const leftShoulderO = stageToOrtho(ls.x, ls.y, stageWidth, stageHeight, 0);
  const rightShoulderO = stageToOrtho(rs.x, rs.y, stageWidth, stageHeight, 0);
  const leftHipO = stageToOrtho(lh.x, lh.y, stageWidth, stageHeight, 0);
  const rightHipO = stageToOrtho(rh.x, rh.y, stageWidth, stageHeight, 0);
  const shoulderMidO = mid(leftShoulderO, rightShoulderO);
  const hipMidO = mid(leftHipO, rightHipO);
  const torsoMidO = mid(shoulderMidO, hipMidO);

  const bindShoulderMid = mid(model.shoulderL, model.shoulderR);
  const bindTorsoMid = mid(bindShoulderMid, model.pelvis);
  const rootOffset: Vec3 = {
    x: -bindTorsoMid.x,
    y: -bindTorsoMid.y,
    z: -bindTorsoMid.z,
  };

  const projectModel = (local: Vec3) => {
    const world = {
      x: torsoMidO.x + (local.x + rootOffset.x) * scaleX,
      y: torsoMidO.y + (local.y + rootOffset.y) * scaleY,
      z: torsoMidO.z + (local.z + rootOffset.z) * scaleZ,
    };
    return orthoToStage(world.x, world.y, stageWidth, stageHeight);
  };

  const pairs: { label: string; camera: { x: number; y: number }; local: Vec3 }[] = [
    { label: "shoulder.L", camera: ls, local: model.shoulderL },
    { label: "shoulder.R", camera: rs, local: model.shoulderR },
    { label: "pelvis", camera: hipMid, local: model.pelvis },
  ];

  const residuals: AnchorResidual[] = pairs.map(({ label, camera, local }) => {
    const projected = projectModel(local);
    const errorPx = Math.hypot(projected.x - camera.x, projected.y - camera.y);
    return {
      label,
      cameraX: camera.x,
      cameraY: camera.y,
      modelX: projected.x,
      modelY: projected.y,
      errorPx,
      errorPct: (errorPx / Math.max(screenShoulder, 1e-4)) * 100,
    };
  });

  return {
    position: torsoMidO,
    scaleX,
    scaleY,
    scaleZ,
    rootOffset,
    residuals,
  };
}
