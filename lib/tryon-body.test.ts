import { describe, expect, it } from "vitest";
import type { GarmentPose } from "./garment-3d";
import { confidenceToOpacity, measureBodyProxy } from "./tryon-body";

function point(x: number, y: number, visibility = 1) {
  return { x, y, visibility };
}

function world(x: number, y: number, z: number, visibility = 1) {
  return { x, y, z, visibility };
}

function samplePose(): GarmentPose {
  return {
    leftShoulder: point(120, 140),
    rightShoulder: point(280, 145),
    leftElbow: point(90, 220),
    rightElbow: point(310, 225),
    leftWrist: point(70, 300),
    rightWrist: point(330, 305),
    leftHip: point(150, 360),
    rightHip: point(250, 365),
    world: {
      leftShoulder: world(-0.2, 0.4, 0.05),
      rightShoulder: world(0.2, 0.4, -0.02),
      leftElbow: world(-0.3, 0.1, 0.04),
      rightElbow: world(0.3, 0.1, -0.01),
      leftWrist: world(-0.35, -0.2, 0.03),
      rightWrist: world(0.35, -0.2, 0),
      leftHip: world(-0.12, -0.3, 0.02),
      rightHip: world(0.12, -0.3, -0.01),
    },
  };
}

describe("measureBodyProxy", () => {
  it("returns positive non-uniform scales for a valid torso", () => {
    const proxy = measureBodyProxy(samplePose(), null, 400, 500);
    expect(proxy).not.toBeNull();
    expect(proxy!.scaleX).toBeGreaterThan(0);
    expect(proxy!.scaleY).toBeGreaterThan(0);
    expect(proxy!.scaleZ).toBeGreaterThan(0);
    expect(proxy!.poseConfidence).toBeGreaterThan(0.5);
  });

  it("honors product anchors for scale reference", () => {
    const wide = measureBodyProxy(samplePose(), null, 400, 500, {
      shoulderWidth: 0.5,
      torsoHeight: 1.08,
      hemY: -0.5,
    });
    const narrow = measureBodyProxy(samplePose(), null, 400, 500, {
      shoulderWidth: 1.2,
      torsoHeight: 1.08,
      hemY: -0.5,
    });
    expect(wide!.scaleX).toBeGreaterThan(narrow!.scaleX);
  });

  it("rejects inverted shoulder order", () => {
    const pose = samplePose();
    const swap = pose.leftShoulder;
    pose.leftShoulder = pose.rightShoulder;
    pose.rightShoulder = swap;
    expect(measureBodyProxy(pose, null, 400, 500)).toBeNull();
  });
});

describe("confidenceToOpacity", () => {
  it("fades between low and high confidence", () => {
    expect(confidenceToOpacity(0.1)).toBe(0);
    expect(confidenceToOpacity(0.55)).toBe(1);
    expect(confidenceToOpacity(0.4)).toBeGreaterThan(0);
    expect(confidenceToOpacity(0.4)).toBeLessThan(1);
  });
});
