import { describe, expect, it } from "vitest";
import {
  clampRatio,
  createProportionCalibrator,
  ratiosFromSamples,
  type ProportionSample,
} from "./tryon-calibration";
import { armTargetsFromWorld, buildBodyFrame } from "./tryon-coords";
import { createTrackMemory, dtAlpha, stepTracking, type TrackPose } from "./tryon-track";

const model = {
  shoulderWidth: 0.74,
  torsoHeight: 0.8,
  upperArmLengthL: 0.4,
  upperArmLengthR: 0.4,
  forearmLengthL: 0.35,
  forearmLengthR: 0.35,
};

function sample(at: number, upper = 0.25): ProportionSample {
  return {
    at,
    shoulderPx: 120,
    torsoPx: 160,
    torsoWorld: 0.5,
    upperWorldL: upper,
    upperWorldR: upper,
    forearmWorldL: 0.22,
    forearmWorldR: 0.22,
    hipWidthPx: 90,
  };
}

function pose(hipVis = 1): TrackPose {
  const point = (x: number, y: number, visibility = 1) => ({ x, y, visibility });
  const world = (x: number, y: number, z = 0, visibility = 1) => ({ x, y, z, visibility });
  return {
    leftShoulder: point(100, 80, 0.9),
    rightShoulder: point(220, 82, 0.9),
    leftElbow: point(90, 150, 0.8),
    rightElbow: point(230, 152, 0.8),
    leftWrist: point(88, 210, 0.8),
    rightWrist: point(236, 212, 0.8),
    leftHip: point(120, 240, hipVis),
    rightHip: point(200, 242, 0.9),
    world: {
      leftShoulder: world(-0.2, 0.4),
      rightShoulder: world(0.2, 0.4),
      leftElbow: world(-0.28, 0.1),
      rightElbow: world(0.28, 0.1),
      leftWrist: world(-0.3, -0.15),
      rightWrist: world(0.3, -0.15),
      leftHip: world(-0.12, -0.2, 0, hipVis),
      rightHip: world(0.12, -0.2),
    },
  };
}

describe("proportion calibration", () => {
  it("uses the median so one outlier does not move the ratio", () => {
    const samples = [0.25, 0.26, 0.24, 0.25, 0.27, 2.5, 0.25, 0.23].map((upper, index) => sample(index * 120, upper));
    const ratios = ratiosFromSamples(samples, model, 1200);
    expect(ratios.ready).toBe(true);
    expect(ratios.upperL).toBeLessThan(1.2);
  });

  it("locks ratios after they are ready until reset", () => {
    const calibrator = createProportionCalibrator();
    for (let index = 0; index < 10; index += 1) calibrator.push(sample(index * 100, 0.25));
    const ready = calibrator.current(model, 1000);
    expect(ready.ready).toBe(true);
    for (let index = 0; index < 10; index += 1) calibrator.push(sample(2000 + index * 100, 0.5));
    expect(calibrator.current(model, 3000).upperL).toBe(ready.upperL);
    calibrator.reset();
    expect(calibrator.current(model, 4000).ready).toBe(false);
  });

  it("clamps ratios outside 0.75–1.35", () => {
    expect(clampRatio(4)).toBe(1.35);
    expect(clampRatio(0.1)).toBe(0.75);
    const extreme = Array.from({ length: 10 }, (_, index) => sample(index * 100, 2));
    const ratios = ratiosFromSamples(extreme, model, 1000);
    expect(ratios.upperL).toBeLessThanOrEqual(1.35);
    expect(ratios.upperL).toBeGreaterThanOrEqual(0.75);
  });
});

describe("tracking state", () => {
  it("keeps a pose when one hip drops for 100ms", () => {
    let memory = createTrackMemory();
    const first = stepTracking(memory, 0, pose(1), true);
    memory = first.memory;
    const dropped = stepTracking(memory, 100, pose(0), true);
    expect(dropped.state).toBe("degraded");
    expect(dropped.pose).not.toBeNull();
    expect(dropped.pose!.leftHip.x).toBeLessThan(dropped.pose!.rightHip.x);
  });

  it("becomes lost after 600ms without a torso", () => {
    let memory = createTrackMemory();
    memory = stepTracking(memory, 0, pose(1), true).memory;
    const lost = stepTracking(memory, 600, null, true);
    expect(lost.state).toBe("lost");
    expect(lost.pose).not.toBeNull();
    expect(lost.reasons).toEqual(["lost_timeout"]);
    expect(lost.heldJoints).toContain("leftWrist");
  });

  it("names a filled hip and a briefly held arm", () => {
    let memory = createTrackMemory();
    const first = stepTracking(memory, 0, pose(1), true);
    expect(first.reasons).toEqual([]);
    expect(first.heldJoints).toEqual([]);
    memory = first.memory;
    const dropped = stepTracking(memory, 100, pose(0), true);
    expect(dropped.reasons).toContain("hip_filled");
    expect(dropped.heldJoints).toContain("leftHip");

    const weak = pose(1);
    weak.leftElbow = { x: 40, y: 140, visibility: 0.1 };
    weak.leftWrist = { x: 30, y: 200, visibility: 0.1 };
    const held = stepTracking(memory, 150, weak, true);
    expect(held.state).toBe("degraded");
    expect(held.reasons).toContain("arm_held");
    expect(held.heldJoints).toEqual(expect.arrayContaining(["leftElbow", "leftWrist"]));
    expect(held.pose!.leftElbow.x).toBe(first.pose!.leftElbow.x);
    expect(held.pose!.leftElbow.x).not.toBe(40);
  });

  it("holds the torso briefly, then reports no shoulders before any pose", () => {
    let memory = createTrackMemory();
    memory = stepTracking(memory, 0, pose(1), true).memory;
    const held = stepTracking(memory, 200, null, true);
    expect(held.state).toBe("degraded");
    expect(held.reasons).toEqual(["torso_held"]);
    expect(held.heldJoints).toContain("rightShoulder");

    const none = stepTracking(createTrackMemory(), 0, null, false);
    expect(none.state).toBe("acquiring");
    expect(none.reasons).toEqual(["no_shoulders"]);
    expect(none.pose).toBeNull();
  });
});

describe("arm chain and smoothing", () => {
  it("places the forearm start on the model elbow", () => {
    const body = pose(1);
    const frame = buildBodyFrame(body);
    const chain = armTargetsFromWorld(body, "L", { x: -0.37, y: 0.3, z: 0 }, 0.4, 0.35, frame!);
    expect(chain).not.toBeNull();
    const gap = Math.hypot(chain!.wrist.x - chain!.elbow.x, chain!.wrist.y - chain!.elbow.y, chain!.wrist.z - chain!.elbow.z);
    expect(gap).toBeCloseTo(0.35, 2);
    const upper = Math.hypot(chain!.elbow.x + 0.37, chain!.elbow.y - 0.3, chain!.elbow.z);
    expect(upper).toBeCloseTo(0.4, 2);
  });

  it("uses a smaller blend for a short frame than a long frame", () => {
    expect(dtAlpha(0.016)).toBeLessThan(dtAlpha(0.1));
    expect(dtAlpha(0.1)).toBeLessThan(1);
  });

  it("still moves the elbow when only world Z changes", () => {
    const body = pose(1);
    const frame = buildBodyFrame(body);
    const shoulder = { x: -0.37, y: 0.3, z: 0 };
    const flat = armTargetsFromWorld(body, "L", shoulder, 0.4, 0.35, frame!);
    const deep = armTargetsFromWorld({
      ...body,
      world: { ...body.world, leftElbow: { ...body.world.leftElbow, z: 0.3 } },
    }, "L", shoulder, 0.4, 0.35, frame!);
    expect(Math.abs(deep!.elbow.z - flat!.elbow.z)).toBeGreaterThan(0.05);
  });
});
