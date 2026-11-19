import { describe, expect, it } from "vitest";
import { wristOverTorso, type UpperBodyPose } from "./tryon-mask";

const pose: UpperBodyPose = {
  leftShoulder: { x: 100, y: 100 },
  rightShoulder: { x: 200, y: 100 },
  leftElbow: { x: 80, y: 160 },
  rightElbow: { x: 220, y: 160 },
  leftWrist: { x: 70, y: 210 },
  rightWrist: { x: 230, y: 210 },
  leftHip: { x: 110, y: 260 },
  rightHip: { x: 190, y: 260 },
};

describe("wristOverTorso", () => {
  it("detects wrists inside the torso box", () => {
    expect(wristOverTorso(pose, { x: 150, y: 180 })).toBe(true);
  });

  it("rejects wrists far outside the torso", () => {
    expect(wristOverTorso(pose, { x: 20, y: 180 })).toBe(false);
    expect(wristOverTorso(pose, { x: 150, y: 40 })).toBe(false);
  });
});
