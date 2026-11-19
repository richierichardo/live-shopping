import { describe, expect, it } from "vitest";
import {
  armTargetsFromWorld,
  buildBodyFrame,
  coverRect,
  fixtureUrlForSource,
  normalizedToMirroredStage,
  orthoToStage,
  stageToOrtho,
  TRYON_FIXTURES,
} from "./tryon-coords";

describe("tryon-coords", () => {
  it("applies cover crop once and mirrors so anatomical left is on screen left", () => {
    const landscape = coverRect(1280, 720, 800, 450);
    expect(landscape.scale).toBeCloseTo(800 / 1280);

    const portrait = coverRect(720, 1280, 400, 600);
    expect(portrait.scale).toBeGreaterThan(0);

    // Camera-left (small normalized x) lands on stage-right after the single selfie mirror.
    const cameraLeft = normalizedToMirroredStage({ x: 0.2, y: 0.4 }, 1280, 720, 800, 450);
    const cameraRight = normalizedToMirroredStage({ x: 0.8, y: 0.4 }, 1280, 720, 800, 450);
    expect(cameraLeft.x).toBeGreaterThan(cameraRight.x);
    // MediaPipe person-left is on the camera-right; after mirror it is stage-left.
    const personLeft = normalizedToMirroredStage({ x: 0.75, y: 0.4 }, 1280, 720, 800, 450);
    const personRight = normalizedToMirroredStage({ x: 0.25, y: 0.4 }, 1280, 720, 800, 450);
    expect(personLeft.x).toBeLessThan(personRight.x);
  });

  it("round-trips stage ↔ ortho with nonzero Z", () => {
    const ortho = stageToOrtho(120, 80, 400, 300, 42);
    expect(ortho.z).toBe(42);
    const stage = orthoToStage(ortho.x, ortho.y, 400, 300);
    expect(stage.x).toBeCloseTo(120);
    expect(stage.y).toBeCloseTo(80);
  });

  it("changes local arm targets when elbow/wrist world Z changes", () => {
    const basePose = {
      leftShoulder: { x: 100, y: 80 },
      rightShoulder: { x: 200, y: 80 },
      leftHip: { x: 120, y: 220 },
      rightHip: { x: 180, y: 220 },
      world: {
        leftShoulder: { x: -0.2, y: 0.4, z: 0 },
        rightShoulder: { x: 0.2, y: 0.4, z: 0 },
        leftElbow: { x: -0.35, y: 0.1, z: 0 },
        rightElbow: { x: 0.35, y: 0.1, z: 0 },
        leftWrist: { x: -0.4, y: -0.2, z: 0 },
        rightWrist: { x: 0.4, y: -0.2, z: 0 },
        leftHip: { x: -0.15, y: -0.3, z: 0 },
        rightHip: { x: 0.15, y: -0.3, z: 0 },
      },
    };
    const frame = buildBodyFrame(basePose);
    expect(frame).not.toBeNull();
    const shoulder = { x: -0.37, y: 0.3, z: 0 };
    const flat = armTargetsFromWorld(basePose, "L", shoulder, 0.4, 0.35, frame!);
    const deepPose = {
      ...basePose,
      world: {
        ...basePose.world,
        leftElbow: { x: -0.35, y: 0.1, z: 0.25 },
        leftWrist: { x: -0.4, y: -0.2, z: 0.4 },
      },
    };
    const deep = armTargetsFromWorld(deepPose, "L", shoulder, 0.4, 0.35, frame!);
    expect(flat).not.toBeNull();
    expect(deep).not.toBeNull();
    expect(Math.abs(deep!.elbow.z - flat!.elbow.z)).toBeGreaterThan(0.05);
    // Forearm remains connected to model elbow.
    const sep = Math.hypot(
      deep!.wrist.x - deep!.elbow.x,
      deep!.wrist.y - deep!.elbow.y,
      deep!.wrist.z - deep!.elbow.z,
    );
    expect(sep).toBeCloseTo(0.35, 1);
  });

  it("exposes fixture URLs for target and failed replays", () => {
    expect(fixtureUrlForSource("target")).toBe(TRYON_FIXTURES.target);
    expect(fixtureUrlForSource("failed")).toBe(TRYON_FIXTURES.failed);
    expect(fixtureUrlForSource("live")).toBeNull();
  });
});
