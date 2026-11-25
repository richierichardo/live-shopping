/**
 * Parent-then-child arm solve shared by the live renderer and the skeleton tests.
 *
 * Spaces used here:
 * - Targets are garment-root local (+Y up, +Z forward), the same space as root.worldToLocal.
 * - Upper-arm rest is the bind forearm.position (the outgoing upper segment).
 * - Forearm rest is that bind vector in forearm local space: the outgoing wrist offset.
 *   There is no skinned wrist bone; the tip is this offset, not a new skin index.
 * - Length is the root-local distance after ancestor bone transforms. bone.scale stays
 *   (1, 1, 1), so a parent scale cannot multiply the forearm a second time.
 *   The garment group's screen scale is outside this length.
 */

import * as THREE from "three";
import { dtAlpha } from "./tryon-track";

export const ARM_SOLVER_TAU = 0.08;
export const UPPER_ARM_LIMIT = 2.4;
export const FOREARM_LIMIT = 2.2;

export type ArmSideChain = {
  root: THREE.Object3D;
  shoulder: THREE.Bone;
  upper: THREE.Bone;
  forearm: THREE.Bone;
};

export type ArmLengthBind = {
  /** Bind forearm.position. Its direction is the upper-arm rest axis and the forearm's outgoing axis. */
  upperRest: THREE.Vector3;
  forearmRest: THREE.Vector3;
  upperLength: number;
  forearmLength: number;
};

export type ArmSolverMemory = {
  upper: THREE.Quaternion;
  forearm: THREE.Quaternion;
  hasUpper: boolean;
  hasForearm: boolean;
};

export type ArmSolveResult = {
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  upperOrigin: THREE.Vector3;
  upperTarget: number;
  forearmTarget: number;
  upperActual: number;
  forearmActual: number;
};

export type ScreenJointResidual = {
  label: string;
  cameraX: number;
  cameraY: number;
  modelX: number;
  modelY: number;
  errorPx: number;
  /** errorPx as a percent of the camera shoulder span. */
  errorPct: number;
};

export function createArmSolverMemory(): ArmSolverMemory {
  return {
    upper: new THREE.Quaternion(),
    forearm: new THREE.Quaternion(),
    hasUpper: false,
    hasForearm: false,
  };
}

export function resetArmSolverMemory(memory: ArmSolverMemory) {
  memory.upper.identity();
  memory.forearm.identity();
  memory.hasUpper = false;
  memory.hasForearm = false;
}

/** Read bind lengths before any pose overwrites the bone positions. */
export function captureArmLengthBind(forearm: THREE.Bone): ArmLengthBind {
  const upperRest = forearm.position.clone();
  const upperLength = Math.max(upperRest.length(), 1e-4);
  return {
    upperRest,
    forearmRest: upperRest.clone(),
    upperLength,
    forearmLength: upperLength,
  };
}

/**
 * Set the upper length on the elbow offset and keep the forearm length on the wrist offset.
 * Parent scale is forced back to 1 so it cannot stack onto the child.
 */
export function applyArmLengths(forearm: THREE.Bone, bind: ArmLengthBind, upperRatio: number, forearmRatio: number) {
  forearm.parent?.scale.set(1, 1, 1);
  forearm.scale.set(1, 1, 1);
  const upperLength = bind.upperLength * upperRatio;
  const forearmLength = bind.forearmLength * forearmRatio;
  forearm.position.copy(bind.upperRest).normalize().multiplyScalar(upperLength);
  return { upperLength, forearmLength };
}

function clampTowardBind(bind: THREE.Quaternion, target: THREE.Quaternion, limit: number) {
  const angle = bind.angleTo(target);
  if (angle <= limit) return target;
  const t = limit / Math.max(angle, 1e-5);
  return bind.clone().slerp(target, t);
}

function aimInParent(
  parent: THREE.Object3D,
  root: THREE.Object3D,
  restLocal: THREE.Vector3,
  desiredRoot: THREE.Vector3,
  limit: number,
  bindQuat: THREE.Quaternion,
) {
  if (desiredRoot.lengthSq() < 1e-8 || restLocal.lengthSq() < 1e-8) return bindQuat.clone();
  root.updateMatrixWorld(true);
  const parentWorld = parent.getWorldQuaternion(new THREE.Quaternion());
  const rootWorld = root.getWorldQuaternion(new THREE.Quaternion());
  const parentInRoot = rootWorld.invert().multiply(parentWorld);
  const dirInParent = desiredRoot.clone().normalize().applyQuaternion(parentInRoot.clone().invert());
  if (dirInParent.lengthSq() < 1e-8) return bindQuat.clone();
  const raw = new THREE.Quaternion().setFromUnitVectors(restLocal.clone().normalize(), dirInParent.normalize());
  return clampTowardBind(bindQuat, raw, limit);
}

function applySmoothed(
  bone: THREE.Bone,
  slot: THREE.Quaternion,
  armed: boolean,
  target: THREE.Quaternion,
  dtSeconds: number,
) {
  if (!armed) slot.identity();
  const alpha = dtAlpha(dtSeconds, ARM_SOLVER_TAU);
  bone.quaternion.copy(slot).slerp(target, alpha);
  slot.copy(bone.quaternion);
}

export function solveArmChain(input: {
  chain: ArmSideChain;
  bind: ArmLengthBind;
  memory: ArmSolverMemory;
  elbowTarget: THREE.Vector3;
  wristTarget: THREE.Vector3;
  upperRatio: number;
  forearmRatio: number;
  dtSeconds: number;
  solveUpper: boolean;
  solveForearm: boolean;
  bindUpperQuat?: THREE.Quaternion;
  bindForearmQuat?: THREE.Quaternion;
}): ArmSolveResult {
  const { chain, bind, memory } = input;
  const lengths = applyArmLengths(chain.forearm, bind, input.upperRatio, input.forearmRatio);
  chain.root.updateMatrixWorld(true);

  const upperOrigin = chain.root.worldToLocal(chain.upper.getWorldPosition(new THREE.Vector3()));
  if (input.solveUpper) {
    const desired = input.elbowTarget.clone().sub(upperOrigin);
    const target = aimInParent(
      chain.shoulder,
      chain.root,
      bind.upperRest,
      desired,
      UPPER_ARM_LIMIT,
      input.bindUpperQuat ?? new THREE.Quaternion(),
    );
    applySmoothed(chain.upper, memory.upper, memory.hasUpper, target, input.dtSeconds);
    memory.hasUpper = true;
  }

  chain.root.updateMatrixWorld(true);
  const elbowNow = chain.root.worldToLocal(chain.forearm.getWorldPosition(new THREE.Vector3()));
  if (input.solveForearm) {
    const desired = input.wristTarget.clone().sub(elbowNow);
    const target = aimInParent(
      chain.upper,
      chain.root,
      bind.forearmRest,
      desired,
      FOREARM_LIMIT,
      input.bindForearmQuat ?? new THREE.Quaternion(),
    );
    applySmoothed(chain.forearm, memory.forearm, memory.hasForearm, target, input.dtSeconds);
    memory.hasForearm = true;
  }

  chain.root.updateMatrixWorld(true);
  const upperAfter = chain.root.worldToLocal(chain.upper.getWorldPosition(new THREE.Vector3()));
  const elbow = chain.root.worldToLocal(chain.forearm.getWorldPosition(new THREE.Vector3()));
  const wristLocal = bind.forearmRest.clone().normalize().multiplyScalar(lengths.forearmLength);
  const wrist = chain.root.worldToLocal(chain.forearm.localToWorld(wristLocal));
  return {
    elbow,
    wrist,
    upperOrigin: upperAfter,
    upperTarget: lengths.upperLength,
    forearmTarget: lengths.forearmLength,
    upperActual: upperAfter.distanceTo(elbow),
    forearmActual: elbow.distanceTo(wrist),
  };
}

/** Pixel error from already-projected camera landmarks and skeleton joints. */
export function residualsFromScreenJoints(
  pairs: { label: string; cameraX: number; cameraY: number; modelX: number; modelY: number }[],
  shoulderSpanPx: number,
): ScreenJointResidual[] {
  const span = Math.max(shoulderSpanPx, 1e-4);
  return pairs.map((pair) => {
    const errorPx = Math.hypot(pair.modelX - pair.cameraX, pair.modelY - pair.cameraY);
    return { ...pair, errorPx, errorPct: (errorPx / span) * 100 };
  });
}
