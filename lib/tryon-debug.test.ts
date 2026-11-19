import { describe, expect, it } from "vitest";
import {
  cameraLandmarksFromPose,
  createTryOnDebugMeter,
  emptyDebugSnapshot,
  formatConf,
  formatMs,
  isTryOnDebugQueryEnabled,
  jointConfidenceFromPose,
  snapshotFromMeter,
} from "./tryon-debug";

const samplePose = {
  leftShoulder: { x: 10, y: 20, visibility: 0.9 },
  rightShoulder: { x: 80, y: 22, visibility: 0.85 },
  leftElbow: { x: 8, y: 60, visibility: 0.7 },
  rightElbow: { x: 90, y: 62, visibility: 0.65 },
  leftWrist: { x: 6, y: 100, visibility: 0.5 },
  rightWrist: { x: 95, y: 102, visibility: 0.4 },
  leftHip: { x: 30, y: 140, visibility: 0.8 },
  rightHip: { x: 70, y: 142, visibility: 0.75 },
};

describe("tryon-debug", () => {
  it("builds joint confidence and camera landmarks from a synthetic pose", () => {
    const joints = jointConfidenceFromPose(samplePose);
    expect(joints.leftShoulder).toBeCloseTo(0.9);
    expect(joints.rightWrist).toBeCloseTo(0.4);

    const landmarks = cameraLandmarksFromPose(samplePose);
    expect(landmarks).toHaveLength(8);
    expect(landmarks[0]).toMatchObject({ label: "LS", kind: "camera", x: 10, y: 20 });
  });

  it("snapshots meter fields used by the debug panel", () => {
    const meter = createTryOnDebugMeter();
    meter.delegate = "GPU";
    meter.assetSource = "glb";
    meter.hideReason = "none";
    meter.inferenceMs.push(12);
    meter.compositeMs.push(4);
    meter.renderMs.push(6);
    meter.lastPoseAcceptedAt = 1000;
    meter.joints = jointConfidenceFromPose(samplePose);
    meter.cameraLandmarks = cameraLandmarksFromPose(samplePose);
    meter.modelJoints = [{ x: 1, y: 2, label: "chest", kind: "model" }];

    const snapshot = snapshotFromMeter(meter, 1100);
    expect(snapshot.delegate).toBe("GPU");
    expect(snapshot.assetSource).toBe("glb");
    expect(snapshot.hideReason).toBe("none");
    expect(snapshot.poseAgeMs).toBe(100);
    expect(snapshot.inferenceMs).toBeCloseTo(12);
    expect(snapshot.cameraLandmarks).toHaveLength(8);
    expect(snapshot.modelJoints[0]?.label).toBe("chest");
  });

  it("parses tryonDebug query and formats helpers", () => {
    expect(isTryOnDebugQueryEnabled("?tryonDebug=1")).toBe(true);
    expect(isTryOnDebugQueryEnabled("tryonDebug=true")).toBe(true);
    expect(isTryOnDebugQueryEnabled("?tryonDebug=0")).toBe(false);
    expect(formatMs(12.34)).toBe("12.3ms");
    expect(formatConf(0.42)).toBe("42%");
    expect(emptyDebugSnapshot().hideReason).toBe("inactive");
  });
});
