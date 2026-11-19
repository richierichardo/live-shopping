/** Explicit try-on coordinate spaces and one-shot cover/mirror transforms. */

export type Vec3 = { x: number; y: number; z: number };

export type CoverRect = {
  scale: number;
  x: number;
  y: number;
};

export type StagePoint = {
  x: number;
  y: number;
  visibility?: number;
};

export type BodyFrame = {
  /** MediaPipe world-space torso midpoint. */
  origin: Vec3;
  /** Left → right shoulder (mirrored world). */
  right: Vec3;
  /** Hip → shoulder. */
  up: Vec3;
  /** Out of chest (right × up). */
  forward: Vec3;
  /** Approximate meters → stage pixels from shoulder span. */
  metersToPixels: number;
};

export const TRYON_FIXTURES = {
  target: "/fixtures/U%20need%20IT%20team%20Dm.mp4",
  failed: "/fixtures/hasil%20gagal.mp4",
} as const;

export type TryOnVideoSource = "live" | "target" | "failed";

export function fixtureUrlForSource(source: TryOnVideoSource): string | null {
  if (source === "target") return TRYON_FIXTURES.target;
  if (source === "failed") return TRYON_FIXTURES.failed;
  return null;
}

export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  stageWidth: number,
  stageHeight: number,
): CoverRect {
  const scale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);
  return {
    scale,
    x: (stageWidth - sourceWidth * scale) / 2,
    y: (stageHeight - sourceHeight * scale) / 2,
  };
}

/**
 * MediaPipe normalized landmark (unmirrored camera) → selfie-mirrored stage pixels.
 * Cover crop + mirror applied exactly once.
 */
export function normalizedToMirroredStage(
  landmark: { x: number; y: number; visibility?: number },
  sourceWidth: number,
  sourceHeight: number,
  stageWidth: number,
  stageHeight: number,
): StagePoint {
  const crop = coverRect(sourceWidth, sourceHeight, stageWidth, stageHeight);
  const rawX = crop.x + landmark.x * sourceWidth * crop.scale;
  const rawY = crop.y + landmark.y * sourceHeight * crop.scale;
  return {
    x: stageWidth - rawX,
    y: rawY,
    visibility: landmark.visibility,
  };
}

/** Draw source with the same cover+mirror used for landmarks. */
export function drawMirroredCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  stageWidth: number,
  stageHeight: number,
) {
  const rect = coverRect(sourceWidth, sourceHeight, stageWidth, stageHeight);
  context.save();
  context.translate(stageWidth, 0);
  context.scale(-1, 1);
  context.drawImage(source, rect.x, rect.y, sourceWidth * rect.scale, sourceHeight * rect.scale);
  context.restore();
}

/**
 * Mirrored stage pixels → Three.js orthographic space.
 * Screen: +x right, +y down. Ortho: +x right, +y up, origin stage center.
 * Z must be supplied explicitly (no silent 0 for tracked joints).
 */
export function stageToOrtho(
  screenX: number,
  screenY: number,
  stageWidth: number,
  stageHeight: number,
  z: number,
): Vec3 {
  return {
    x: screenX - stageWidth / 2,
    y: stageHeight / 2 - screenY,
    z,
  };
}

export function orthoToStage(
  worldX: number,
  worldY: number,
  stageWidth: number,
  stageHeight: number,
): { x: number; y: number } {
  return {
    x: worldX + stageWidth / 2,
    y: stageHeight / 2 - worldY,
  };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < 1e-8) return { x: 0, y: 1, z: 0 };
  return scale(v, 1 / len);
}

function mid3(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}

function asVec3(p: { x: number; y: number; z: number }): Vec3 {
  return { x: p.x, y: p.y, z: p.z };
}

/** Body frame from mirrored MediaPipe world landmarks. */
export function buildBodyFrame(pose: {
  leftShoulder: { x: number; y: number };
  rightShoulder: { x: number; y: number };
  leftHip: { x: number; y: number };
  rightHip: { x: number; y: number };
  world: {
    leftShoulder: Vec3;
    rightShoulder: Vec3;
    leftHip: Vec3;
    rightHip: Vec3;
  };
}): BodyFrame | null {
  const ls = asVec3(pose.world.leftShoulder);
  const rs = asVec3(pose.world.rightShoulder);
  const lh = asVec3(pose.world.leftHip);
  const rh = asVec3(pose.world.rightHip);
  const shoulderMid = mid3(ls, rs);
  const hipMid = mid3(lh, rh);
  const origin = mid3(shoulderMid, hipMid);

  let right = normalize(sub(rs, ls));
  let up = normalize(sub(shoulderMid, hipMid));
  let forward = normalize(cross(right, up));
  // Re-orthogonalize in case landmarks are noisy.
  right = normalize(cross(up, forward));
  up = normalize(cross(forward, right));

  const worldShoulder = length(sub(rs, ls));
  const screenShoulder = Math.hypot(
    pose.rightShoulder.x - pose.leftShoulder.x,
    pose.rightShoulder.y - pose.leftShoulder.y,
  );
  if (worldShoulder < 1e-5 || screenShoulder < 1e-5) return null;

  return {
    origin,
    right,
    up,
    forward,
    metersToPixels: screenShoulder / worldShoulder,
  };
}

/** Express a MediaPipe-world direction in garment-local axes (X right, Y up, Z forward). */
export function worldDirectionToLocal(dir: Vec3, frame: BodyFrame): Vec3 {
  const n = normalize(dir);
  return {
    x: dot(n, frame.right),
    y: dot(n, frame.up),
    z: dot(n, frame.forward),
  };
}

export type ArmSide = "L" | "R";

export type ArmChainTargets = {
  upperDir: Vec3;
  forearmDir: Vec3;
  elbow: Vec3;
  wrist: Vec3;
};

/**
 * Build connected elbow/wrist targets in garment-local space from world 3D segment directions.
 * Forearm starts at the model elbow (not a flattened screen elbow).
 */
export function armTargetsFromWorld(
  pose: {
    world: {
      leftShoulder: Vec3;
      rightShoulder: Vec3;
      leftElbow: Vec3;
      rightElbow: Vec3;
      leftWrist: Vec3;
      rightWrist: Vec3;
    };
  },
  side: ArmSide,
  shoulderBind: Vec3,
  upperArmLength: number,
  forearmLength: number,
  frame: BodyFrame,
): ArmChainTargets | null {
  const shoulder = side === "L" ? pose.world.leftShoulder : pose.world.rightShoulder;
  const elbow = side === "L" ? pose.world.leftElbow : pose.world.rightElbow;
  const wrist = side === "L" ? pose.world.leftWrist : pose.world.rightWrist;

  const upperWorld = sub(asVec3(elbow), asVec3(shoulder));
  const forearmWorld = sub(asVec3(wrist), asVec3(elbow));
  if (length(upperWorld) < 1e-6 || length(forearmWorld) < 1e-6) return null;

  const upperDir = normalize(worldDirectionToLocal(upperWorld, frame));
  const forearmDir = normalize(worldDirectionToLocal(forearmWorld, frame));
  const elbowLocal = add(shoulderBind, scale(upperDir, upperArmLength));
  const wristLocal = add(elbowLocal, scale(forearmDir, forearmLength));
  return { upperDir, forearmDir, elbow: elbowLocal, wrist: wristLocal };
}

export function depthScaleFromWorldZ(
  worldZ: number,
  frame: BodyFrame,
  stageWidth: number,
): number {
  // Map meters of depth into ortho Z using the same shoulder-derived scale, capped for stability.
  const raw = worldZ * frame.metersToPixels;
  const cap = stageWidth * 0.35;
  return Math.max(-cap, Math.min(cap, raw));
}
