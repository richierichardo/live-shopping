/** Tracking states for the live garment preview. Holds brief dropouts instead of clearing the pose. */

export type TrackingState = "acquiring" | "tracking" | "degraded" | "lost";

export const HOLD_MS = 400;
export const LOST_MS = 500;
export const SHOULDER_VIS_MIN = 0.45;
export const HIP_VIS_MIN = 0.35;
export const ARM_VIS_MIN = 0.35;
const MODEL_HIP_TO_SHOULDER = 0.7 / 0.78;

export type TrackPoint = { x: number; y: number; visibility?: number };
export type TrackWorld = { x: number; y: number; z: number; visibility?: number };

export type TrackPose = {
  leftShoulder: TrackPoint;
  rightShoulder: TrackPoint;
  leftElbow: TrackPoint;
  rightElbow: TrackPoint;
  leftWrist: TrackPoint;
  rightWrist: TrackPoint;
  leftHip: TrackPoint;
  rightHip: TrackPoint;
  world: {
    leftShoulder: TrackWorld;
    rightShoulder: TrackWorld;
    leftElbow: TrackWorld;
    rightElbow: TrackWorld;
    leftWrist: TrackWorld;
    rightWrist: TrackWorld;
    leftHip: TrackWorld;
    rightHip: TrackWorld;
  };
};

export type TrackMemory = {
  lastGoodTorsoAt: number | null;
  lastPose: TrackPose | null;
  hipWidthPx: number;
  armHoldFrom: { L: number | null; R: number | null };
};

export type TrackStep = {
  memory: TrackMemory;
  pose: TrackPose | null;
  state: TrackingState;
};

export function createTrackMemory(): TrackMemory {
  return {
    lastGoodTorsoAt: null,
    lastPose: null,
    hipWidthPx: 0,
    armHoldFrom: { L: null, R: null },
  };
}

export function dtAlpha(dtSeconds: number, tauSeconds = 0.08) {
  if (!(dtSeconds > 0) || !Number.isFinite(dtSeconds)) return 1;
  return 1 - Math.exp(-dtSeconds / tauSeconds);
}

function vis(point: { visibility?: number } | undefined) {
  return point?.visibility ?? 0;
}

function clonePose(pose: TrackPose): TrackPose {
  return {
    leftShoulder: { ...pose.leftShoulder },
    rightShoulder: { ...pose.rightShoulder },
    leftElbow: { ...pose.leftElbow },
    rightElbow: { ...pose.rightElbow },
    leftWrist: { ...pose.leftWrist },
    rightWrist: { ...pose.rightWrist },
    leftHip: { ...pose.leftHip },
    rightHip: { ...pose.rightHip },
    world: {
      leftShoulder: { ...pose.world.leftShoulder },
      rightShoulder: { ...pose.world.rightShoulder },
      leftElbow: { ...pose.world.leftElbow },
      rightElbow: { ...pose.world.rightElbow },
      leftWrist: { ...pose.world.leftWrist },
      rightWrist: { ...pose.world.rightWrist },
      leftHip: { ...pose.world.leftHip },
      rightHip: { ...pose.world.rightHip },
    },
  };
}

function copyJoint(target: TrackPose, source: TrackPose, key: "leftElbow" | "rightElbow" | "leftWrist" | "rightWrist" | "leftHip" | "rightHip") {
  target[key] = { ...source[key] };
  target.world[key] = { ...source.world[key] };
}

function fillHip(
  pose: TrackPose,
  side: "left" | "right",
  hipWidthPx: number,
) {
  const missing = side === "left" ? pose.leftHip : pose.rightHip;
  const known = side === "left" ? pose.rightHip : pose.leftHip;
  const knownWorld = side === "left" ? pose.world.rightHip : pose.world.leftHip;
  const sign = side === "left" ? -1 : 1;
  const width = hipWidthPx > 8 ? hipWidthPx : Math.max(24, Math.abs(pose.rightShoulder.x - pose.leftShoulder.x) * MODEL_HIP_TO_SHOULDER);
  const filled: TrackPoint = {
    x: known.x + sign * width,
    y: known.y,
    visibility: Math.max(missing.visibility ?? 0, 0.2),
  };
  const filledWorld: TrackWorld = {
    x: knownWorld.x + sign * 0.18,
    y: knownWorld.y,
    z: knownWorld.z,
    visibility: filled.visibility,
  };
  if (side === "left") {
    pose.leftHip = filled;
    pose.world.leftHip = filledWorld;
  } else {
    pose.rightHip = filled;
    pose.world.rightHip = filledWorld;
  }
}

function shouldersOk(pose: TrackPose) {
  return vis(pose.leftShoulder) >= SHOULDER_VIS_MIN && vis(pose.rightShoulder) >= SHOULDER_VIS_MIN && pose.leftShoulder.x < pose.rightShoulder.x;
}

export function stepTracking(
  memory: TrackMemory,
  now: number,
  raw: TrackPose | null,
  calibrationReady: boolean,
): TrackStep {
  const next: TrackMemory = {
    lastGoodTorsoAt: memory.lastGoodTorsoAt,
    lastPose: memory.lastPose,
    hipWidthPx: memory.hipWidthPx,
    armHoldFrom: { ...memory.armHoldFrom },
  };

  if (raw && shouldersOk(raw) && (vis(raw.leftHip) >= HIP_VIS_MIN || vis(raw.rightHip) >= HIP_VIS_MIN)) {
    const pose = clonePose(raw);
    let degraded = false;
    const shoulderSpan = Math.abs(pose.rightShoulder.x - pose.leftShoulder.x);
    const fallbackHip = next.hipWidthPx > 8 ? next.hipWidthPx : shoulderSpan * MODEL_HIP_TO_SHOULDER;

    if (vis(pose.leftHip) < HIP_VIS_MIN && vis(pose.rightHip) >= HIP_VIS_MIN) {
      fillHip(pose, "left", fallbackHip);
      degraded = true;
    } else if (vis(pose.rightHip) < HIP_VIS_MIN && vis(pose.leftHip) >= HIP_VIS_MIN) {
      fillHip(pose, "right", fallbackHip);
      degraded = true;
    } else if (vis(pose.leftHip) >= HIP_VIS_MIN && vis(pose.rightHip) >= HIP_VIS_MIN) {
      next.hipWidthPx = Math.abs(pose.rightHip.x - pose.leftHip.x);
    }

    const holdArm = (side: "L" | "R") => {
      const elbowKey = side === "L" ? "leftElbow" : "rightElbow";
      const wristKey = side === "L" ? "leftWrist" : "rightWrist";
      const weak = vis(pose[elbowKey]) < ARM_VIS_MIN || vis(pose[wristKey]) < ARM_VIS_MIN;
      if (!weak) {
        next.armHoldFrom[side] = null;
        return;
      }
      const started = next.armHoldFrom[side] ?? now;
      next.armHoldFrom[side] = started;
      if (memory.lastPose && now - started <= HOLD_MS) {
        copyJoint(pose, memory.lastPose, elbowKey);
        copyJoint(pose, memory.lastPose, wristKey);
        degraded = true;
      }
    };
    holdArm("L");
    holdArm("R");

    next.lastGoodTorsoAt = now;
    next.lastPose = pose;
    const state: TrackingState = degraded ? "degraded" : calibrationReady ? "tracking" : "acquiring";
    return { memory: next, pose, state };
  }

  if (next.lastGoodTorsoAt != null && now - next.lastGoodTorsoAt <= LOST_MS) {
    return { memory: next, pose: next.lastPose, state: "degraded" };
  }
  if (next.lastGoodTorsoAt != null) {
    return { memory: next, pose: next.lastPose, state: "lost" };
  }
  return { memory: next, pose: null, state: "acquiring" };
}
