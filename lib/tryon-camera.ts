/**
 * Live try-on camera.
 *
 * Spaces, applied in this order:
 * 1. Source video pixels.
 * 2. Cover crop.
 * 3. One selfie mirror.
 * 4. Stage pixels, y down.
 * 5. MediaPipe world landmarks.
 * 6. Body frame (right, up, forward).
 * 7. Skeleton-local / garment-root space, +Y up, +Z toward the camera when frontal.
 * 8. Renderer world. The camera sits at the origin and looks down −Z.
 * 9. Perspective NDC.
 * 10. Stage pixels again.
 *
 * Vertical FOV is a fixed laptop-webcam assumption, not a measured calibration.
 * The torso plane stays at z = −D. Scale is chosen so the projected shoulder
 * span matches the image. XY is chosen so the shoulder midpoint matches.
 * Wrist depth is not an input: a hand moving forward does not refit the shoulders.
 */

import * as THREE from "three";
import type { Vec3 } from "./tryon-coords";

export const WEBCAM_VERTICAL_FOV_DEG = 55;
export const TORSO_PLANE_DISTANCE = 1.6;
export const PERSPECTIVE_CAMERA_LABEL = "perspective 55°";

export type PerspectivePlacement = {
  position: Vec3;
  scale: number;
};

export function createTryOnCamera(stageWidth: number, stageHeight: number) {
  const camera = new THREE.PerspectiveCamera(
    WEBCAM_VERTICAL_FOV_DEG,
    Math.max(stageWidth, 1) / Math.max(stageHeight, 1),
    0.01,
    20,
  );
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function resizeTryOnCamera(camera: THREE.PerspectiveCamera, stageWidth: number, stageHeight: number) {
  camera.aspect = Math.max(stageWidth, 1) / Math.max(stageHeight, 1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/** Visible world height on the plane z = −D. */
export function torsoPlaneHeight(distance = TORSO_PLANE_DISTANCE) {
  const fovRad = THREE.MathUtils.degToRad(WEBCAM_VERTICAL_FOV_DEG);
  return 2 * distance * Math.tan(fovRad / 2);
}

export function projectWorldToStage(
  camera: THREE.PerspectiveCamera,
  world: Vec3,
  stageWidth: number,
  stageHeight: number,
) {
  camera.updateMatrixWorld(true);
  const projected = new THREE.Vector3(world.x, world.y, world.z).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * stageWidth,
    y: (-projected.y * 0.5 + 0.5) * stageHeight,
  };
}

/** Intersect the pixel ray with a constant-z plane. The camera looks down −Z. */
export function stageToWorldOnPlane(
  camera: THREE.PerspectiveCamera,
  screenX: number,
  screenY: number,
  stageWidth: number,
  stageHeight: number,
  planeZ: number,
): Vec3 {
  camera.updateMatrixWorld(true);
  const ndc = new THREE.Vector3(
    (screenX / stageWidth) * 2 - 1,
    1 - (screenY / stageHeight) * 2,
    0.5,
  );
  ndc.unproject(camera);
  const direction = planeZ / ndc.z;
  return { x: ndc.x * direction, y: ndc.y * direction, z: planeZ };
}

export function perspectiveShoulderPlacement(input: {
  camera: THREE.PerspectiveCamera;
  stageWidth: number;
  stageHeight: number;
  shoulderMidX: number;
  shoulderMidY: number;
  shoulderSpanPx: number;
  modelShoulderWidth: number;
  /** Shoulder midpoint in group space before the group position and scale. */
  shoulderLocal: Vec3;
}): PerspectivePlacement {
  const visibleHeight = torsoPlaneHeight();
  const scale = (input.shoulderSpanPx / Math.max(input.stageHeight, 1))
    * visibleHeight
    / Math.max(input.modelShoulderWidth, 1e-4);
  const shoulderZ = -TORSO_PLANE_DISTANCE + input.shoulderLocal.z * scale;
  const worldMid = stageToWorldOnPlane(
    input.camera,
    input.shoulderMidX,
    input.shoulderMidY,
    input.stageWidth,
    input.stageHeight,
    shoulderZ,
  );
  return {
    position: {
      x: worldMid.x - input.shoulderLocal.x * scale,
      y: worldMid.y - input.shoulderLocal.y * scale,
      z: -TORSO_PLANE_DISTANCE,
    },
    scale,
  };
}

export function groupLocalToWorld(placement: PerspectivePlacement, local: Vec3): Vec3 {
  return {
    x: placement.position.x + local.x * placement.scale,
    y: placement.position.y + local.y * placement.scale,
    z: placement.position.z + local.z * placement.scale,
  };
}

/**
 * Camera-world Z for an elbow or wrist.
 * MediaPipe world Z is smaller when the joint is closer to the camera.
 * The torso plane stays put; only this joint's plane moves.
 */
export function armJointPlaneZ(input: {
  torsoPlaneZ: number;
  shoulderWorldZ: number;
  jointWorldZ: number;
  worldShoulderMeters: number;
  modelShoulderWidth: number;
  groupScale: number;
}) {
  const unitsPerMeter = (input.modelShoulderWidth * input.groupScale) / Math.max(input.worldShoulderMeters, 1e-4);
  const closerToCamera = input.shoulderWorldZ - input.jointWorldZ;
  const planeZ = input.torsoPlaneZ + closerToCamera * unitsPerMeter;
  return Math.min(-0.05, Math.max(-8, planeZ));
}

/**
 * Screen pixel at planeZ, expressed in garment-root local space after the group
 * position, rotation, and scale. The group rotation is removed here so the arm
 * solver does not apply it a second time.
 */
export function screenPointToRootLocal(
  camera: THREE.PerspectiveCamera,
  screenX: number,
  screenY: number,
  stageWidth: number,
  stageHeight: number,
  planeZ: number,
  group: { position: Vec3; quaternion: THREE.Quaternion; scale: number },
  rootOffset: Vec3,
): Vec3 {
  const world = stageToWorldOnPlane(camera, screenX, screenY, stageWidth, stageHeight, planeZ);
  const relative = new THREE.Vector3(world.x, world.y, world.z).sub(
    new THREE.Vector3(group.position.x, group.position.y, group.position.z),
  );
  relative.applyQuaternion(group.quaternion.clone().invert());
  relative.divideScalar(group.scale);
  return {
    x: relative.x - rootOffset.x,
    y: relative.y - rootOffset.y,
    z: relative.z - rootOffset.z,
  };
}

/** Tracked shoulder-depth yaw. 0.70 rad is about 40 degrees; full side and back stay outside this clamp. */
export const TRACKED_YAW_GAIN = 1.2;
export const TRACKED_YAW_LIMIT = 0.7;

export function trackedGroupYaw(leftShoulderZ: number, rightShoulderZ: number) {
  return THREE.MathUtils.clamp(
    (leftShoulderZ - rightShoulderZ) * TRACKED_YAW_GAIN,
    -TRACKED_YAW_LIMIT,
    TRACKED_YAW_LIMIT,
  );
}

export type HeldProjectionJoint = { label: string; x: number; y: number };

/**
 * Last successfully projected joints. Lost tracking, low confidence, and a failed
 * anchor fit read this same pose. A new accept replaces it. Clear drops it.
 */
export function createHeldProjection() {
  let saved: { joints: HeldProjectionJoint[]; at: number } | null = null;
  return {
    accept(joints: HeldProjectionJoint[], at: number) {
      saved = { joints: joints.map((joint) => ({ ...joint })), at };
    },
    project(at: number) {
      if (!saved) return null;
      return {
        joints: saved.joints.map((joint) => ({ ...joint })),
        reason: "pose_held" as const,
        ageMs: at - saved.at,
      };
    },
    clear() {
      saved = null;
    },
  };
}
