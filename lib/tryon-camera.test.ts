import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { orthoToStage } from "./tryon-coords";
import { createSkeleton } from "./garment-mesh";
import { captureArmLengthBind, createArmSolverMemory, solveArmChain } from "./arm-solver";
import {
  armJointPlaneZ,
  createHeldProjection,
  createTryOnCamera,
  groupLocalToWorld,
  perspectiveShoulderPlacement,
  projectWorldToStage,
  screenPointToRootLocal,
  TRACKED_YAW_GAIN,
  TRACKED_YAW_LIMIT,
  trackedGroupYaw,
} from "./tryon-camera";

const stageWidth = 400;
const stageHeight = 360;
const modelShoulderWidth = 0.8;

function place(midX: number, midY: number, span: number) {
  const camera = createTryOnCamera(stageWidth, stageHeight);
  const placement = perspectiveShoulderPlacement({
    camera,
    stageWidth,
    stageHeight,
    shoulderMidX: midX,
    shoulderMidY: midY,
    shoulderSpanPx: span,
    modelShoulderWidth,
    shoulderLocal: { x: 0, y: 0.12, z: 0 },
  });
  const left = projectWorldToStage(
    camera,
    groupLocalToWorld(placement, { x: -modelShoulderWidth / 2, y: 0.12, z: 0 }),
    stageWidth,
    stageHeight,
  );
  const right = projectWorldToStage(
    camera,
    groupLocalToWorld(placement, { x: modelShoulderWidth / 2, y: 0.12, z: 0 }),
    stageWidth,
    stageHeight,
  );
  return { camera, placement, left, right };
}

function pixelDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("perspective try-on camera", () => {
  it("projects a frontal shoulder pair within 1px", () => {
    const placed = place(220, 150, 120);
    expect(pixelDistance(placed.left, { x: 160, y: 150 })).toBeLessThan(1);
    expect(pixelDistance(placed.right, { x: 280, y: 150 })).toBeLessThan(1);
  });

  it("follows a 40px sideways shift without stretching the shoulders", () => {
    const before = place(220, 150, 120);
    const after = place(260, 150, 120);
    const spanBefore = pixelDistance(before.left, before.right);
    const spanAfter = pixelDistance(after.left, after.right);
    expect(pixelDistance(after.left, { x: 200, y: 150 })).toBeLessThan(2);
    expect(pixelDistance(after.right, { x: 320, y: 150 })).toBeLessThan(2);
    expect(Math.abs(spanAfter - spanBefore) / spanBefore).toBeLessThan(0.02);
  });

  it("moves a forward wrist in perspective while the ortho map stays put", () => {
    const placed = place(220, 150, 120);
    const wristBack = groupLocalToWorld(placed.placement, { x: 0.25, y: -0.05, z: 0 });
    const wristForward = groupLocalToWorld(placed.placement, { x: 0.25, y: -0.05, z: 0.25 });
    const backPx = projectWorldToStage(placed.camera, wristBack, stageWidth, stageHeight);
    const forwardPx = projectWorldToStage(placed.camera, wristForward, stageWidth, stageHeight);
    expect(pixelDistance(backPx, forwardPx)).toBeGreaterThan(1);

    const orthoBack = orthoToStage(wristBack.x, wristBack.y, stageWidth, stageHeight);
    const orthoForward = orthoToStage(wristForward.x, wristForward.y, stageWidth, stageHeight);
    expect(orthoBack.x).toBeCloseTo(orthoForward.x, 6);
    expect(orthoBack.y).toBeCloseTo(orthoForward.y, 6);

    const shoulders = place(220, 150, 120);
    const refit = place(220, 150, 120);
    const shoulderMove = Math.max(
      pixelDistance(shoulders.left, refit.left),
      pixelDistance(shoulders.right, refit.right),
    );
    expect(shoulderMove).toBeLessThan(0.08 * 120);
  });
});

describe("screen-aligned arm targets", () => {
  const stageWidth = 400;
  const stageHeight = 360;

  function poseRig() {
    const camera = createTryOnCamera(stageWidth, stageHeight);
    const garmentGroup = new THREE.Group();
    const garmentRoot = new THREE.Group();
    garmentGroup.add(garmentRoot);
    garmentRoot.position.set(0.02, -0.04, 0);
    const built = createSkeleton(garmentRoot);
    garmentGroup.updateMatrixWorld(true);
    const groupLocal = (boneName: "shoulder.L" | "shoulder.R") => garmentGroup.worldToLocal(
      built.bones.get(boneName)!.getWorldPosition(new THREE.Vector3()),
    );
    const left = groupLocal("shoulder.L");
    const right = groupLocal("shoulder.R");
    const span = left.distanceTo(right);
    const placement = perspectiveShoulderPlacement({
      camera,
      stageWidth,
      stageHeight,
      shoulderMidX: 220,
      shoulderMidY: 150,
      shoulderSpanPx: 120,
      modelShoulderWidth: span,
      shoulderLocal: {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
        z: (left.z + right.z) / 2,
      },
    });
    garmentGroup.position.set(placement.position.x, placement.position.y, placement.position.z);
    garmentGroup.scale.setScalar(placement.scale);
    garmentGroup.rotation.set(0, 0.22, 0.1);
    garmentGroup.updateMatrixWorld(true);
    return { camera, garmentGroup, garmentRoot, built, placement, span };
  }

  it("projects a bent elbow and a forward wrist near the screen points after group rotation", () => {
    const rig = poseRig();
    const chain = {
      root: rig.garmentRoot,
      shoulder: rig.built.bones.get("shoulder.L")!,
      upper: rig.built.bones.get("upper_arm.L")!,
      forearm: rig.built.bones.get("forearm.L")!,
    };
    const bind = captureArmLengthBind(chain.forearm);
    rig.garmentRoot.updateMatrixWorld(true);
    const origin = rig.garmentRoot.worldToLocal(chain.upper.getWorldPosition(new THREE.Vector3()));
    const upperDir = bind.upperRest.clone().normalize();
    const elbow = origin.clone().add(upperDir.multiplyScalar(bind.upperLength));
    const wrist = elbow.clone().add(new THREE.Vector3(0, 0, 1).multiplyScalar(bind.forearmLength));
    const elbowWorld = rig.garmentRoot.localToWorld(elbow.clone());
    const wristWorld = rig.garmentRoot.localToWorld(wrist.clone());
    const elbowScreen = projectWorldToStage(rig.camera, elbowWorld, stageWidth, stageHeight);
    const wristScreen = projectWorldToStage(rig.camera, wristWorld, stageWidth, stageHeight);
    const worldShoulderMeters = 0.4;
    const unitsPerMeter = (rig.span * rig.placement.scale) / worldShoulderMeters;
    const mediaZ = (worldZ: number) => -(worldZ - rig.placement.position.z) / unitsPerMeter;
    const toTarget = (screen: { x: number; y: number }, worldZ: number) => {
      const planeZ = armJointPlaneZ({
        torsoPlaneZ: rig.placement.position.z,
        shoulderWorldZ: 0,
        jointWorldZ: mediaZ(worldZ),
        worldShoulderMeters,
        modelShoulderWidth: rig.span,
        groupScale: rig.placement.scale,
      });
      return screenPointToRootLocal(
        rig.camera,
        screen.x,
        screen.y,
        stageWidth,
        stageHeight,
        planeZ,
        { position: rig.placement.position, quaternion: rig.garmentGroup.quaternion, scale: rig.placement.scale },
        { x: rig.garmentRoot.position.x, y: rig.garmentRoot.position.y, z: rig.garmentRoot.position.z },
      );
    };
    const elbowTarget = toTarget(elbowScreen, elbowWorld.z);
    const wristTarget = toTarget(wristScreen, wristWorld.z);
    const solved = solveArmChain({
      chain,
      bind,
      memory: createArmSolverMemory(),
      elbowTarget: new THREE.Vector3(elbowTarget.x, elbowTarget.y, elbowTarget.z),
      wristTarget: new THREE.Vector3(wristTarget.x, wristTarget.y, wristTarget.z),
      upperRatio: 1,
      forearmRatio: 1,
      dtSeconds: 1,
      solveUpper: true,
      solveForearm: true,
    });
    expect(solved.upperActual).toBeCloseTo(solved.upperTarget, 3);
    expect(solved.forearmActual).toBeCloseTo(solved.forearmTarget, 3);
    const solvedElbow = projectWorldToStage(
      rig.camera,
      rig.garmentRoot.localToWorld(solved.elbow.clone()),
      stageWidth,
      stageHeight,
    );
    const solvedWrist = projectWorldToStage(
      rig.camera,
      rig.garmentRoot.localToWorld(solved.wrist.clone()),
      stageWidth,
      stageHeight,
    );
    expect(pixelDistance(solvedElbow, elbowScreen)).toBeLessThan(0.15 * 120);
    expect(pixelDistance(solvedWrist, wristScreen)).toBeLessThan(0.25 * 120);
    expect(solved.wrist.z).toBeGreaterThan(solved.elbow.z + 0.05);
  });

  it("keeps the shoulder lock when a closer wrist changes depth", () => {
    const rig = poseRig();
    rig.garmentGroup.rotation.set(0, 0, 0);
    rig.garmentGroup.updateMatrixWorld(true);
    const left = projectWorldToStage(
      rig.camera,
      rig.built.bones.get("shoulder.L")!.getWorldPosition(new THREE.Vector3()),
      stageWidth,
      stageHeight,
    );
    const right = projectWorldToStage(
      rig.camera,
      rig.built.bones.get("shoulder.R")!.getWorldPosition(new THREE.Vector3()),
      stageWidth,
      stageHeight,
    );
    const midX = (left.x + right.x) / 2;
    const midY = (left.y + right.y) / 2;
    expect(pixelDistance({ x: midX, y: midY }, { x: 220, y: 150 })).toBeLessThan(2);

    const flat = armJointPlaneZ({
      torsoPlaneZ: rig.placement.position.z,
      shoulderWorldZ: 0,
      jointWorldZ: 0,
      worldShoulderMeters: 0.4,
      modelShoulderWidth: rig.span,
      groupScale: rig.placement.scale,
    });
    const closer = armJointPlaneZ({
      torsoPlaneZ: rig.placement.position.z,
      shoulderWorldZ: 0,
      jointWorldZ: -0.2,
      worldShoulderMeters: 0.4,
      modelShoulderWidth: rig.span,
      groupScale: rig.placement.scale,
    });
    expect(closer).toBeGreaterThan(flat);
    const screen = { x: 170, y: 240 };
    const flatLocal = screenPointToRootLocal(
      rig.camera, screen.x, screen.y, stageWidth, stageHeight, flat,
      { position: rig.placement.position, quaternion: rig.garmentGroup.quaternion, scale: rig.placement.scale },
      { x: rig.garmentRoot.position.x, y: rig.garmentRoot.position.y, z: rig.garmentRoot.position.z },
    );
    const closeLocal = screenPointToRootLocal(
      rig.camera, screen.x, screen.y, stageWidth, stageHeight, closer,
      { position: rig.placement.position, quaternion: rig.garmentGroup.quaternion, scale: rig.placement.scale },
      { x: rig.garmentRoot.position.x, y: rig.garmentRoot.position.y, z: rig.garmentRoot.position.z },
    );
    expect(closeLocal.z).toBeGreaterThan(flatLocal.z + 0.05);
    const leftAfter = projectWorldToStage(
      rig.camera,
      rig.built.bones.get("shoulder.L")!.getWorldPosition(new THREE.Vector3()),
      stageWidth,
      stageHeight,
    );
    expect(pixelDistance(left, leftAfter)).toBeLessThan(0.5);
  });
});

describe("tracked yaw and held pose", () => {
  const degrees = (value: number) => (value * Math.PI) / 180;

  it("rotates the group about 30 degrees and stops a 70 degree difference at 0.70 rad", () => {
    const group = new THREE.Group();
    group.rotation.y = trackedGroupYaw(degrees(30) / TRACKED_YAW_GAIN, 0);
    expect(group.rotation.y).toBeCloseTo(degrees(30), 5);
    group.rotation.y = trackedGroupYaw(degrees(70) / TRACKED_YAW_GAIN, 0);
    expect(group.rotation.y).toBeCloseTo(TRACKED_YAW_LIMIT, 5);
    group.rotation.y = trackedGroupYaw(-degrees(70) / TRACKED_YAW_GAIN, 0);
    expect(group.rotation.y).toBeCloseTo(-TRACKED_YAW_LIMIT, 5);
    group.rotation.y = trackedGroupYaw(0, 0);
    expect(group.rotation.y).toBe(0);
  });

  it("keeps the last projected joints after loss and a failed anchor, with a growing age", () => {
    const hold = createHeldProjection();
    expect(hold.project(500)).toBeNull();
    const joints = [
      { label: "upper_arm.L", x: 120, y: 80 },
      { label: "forearm.L", x: 100, y: 130 },
      { label: "wrist.L", x: 90, y: 170 },
    ];
    hold.accept(joints, 1000);
    const lost = hold.project(1400);
    expect(lost?.reason).toBe("pose_held");
    expect(lost?.ageMs).toBe(400);
    expect(lost?.joints).toEqual(joints);
    const anchorFailed = hold.project(2100);
    expect(anchorFailed?.reason).toBe("pose_held");
    expect(anchorFailed?.ageMs).toBe(1100);
    expect(anchorFailed?.joints).toEqual(joints);
    hold.accept([{ label: "wrist.L", x: 40, y: 90 }], 3000);
    expect(hold.project(3000)?.joints).toEqual([{ label: "wrist.L", x: 40, y: 90 }]);
    expect(hold.project(3000)?.ageMs).toBe(0);
    hold.clear();
    expect(hold.project(3200)).toBeNull();
  });
});
