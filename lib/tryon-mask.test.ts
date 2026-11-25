import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handOcclusionDisc, wristOverTorso, type UpperBodyPose } from "./tryon-mask";

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

describe("handOcclusionDisc", () => {
  it("centers the disc on the wrist and leaves the forearm uncovered", () => {
    const wrist = pose.leftWrist;
    const elbow = pose.leftElbow;
    const disc = handOcclusionDisc(pose, wrist, 640);
    expect(disc.x).toBe(wrist.x);
    expect(disc.y).toBe(wrist.y);
    const midpoint = {
      x: elbow.x + (wrist.x - elbow.x) * 0.35,
      y: elbow.y + (wrist.y - elbow.y) * 0.35,
    };
    const distance = Math.hypot(midpoint.x - disc.x, midpoint.y - disc.y);
    expect(distance).toBeGreaterThan(disc.radius);
  });

  it("grows the disc slightly when the wrist crosses the chest", () => {
    const outside = handOcclusionDisc(pose, pose.leftWrist, 640);
    const inside = handOcclusionDisc(pose, { x: 150, y: 180 }, 640);
    expect(inside.radius).toBeGreaterThan(outside.radius);
    expect(inside.x).toBe(150);
    expect(inside.y).toBe(180);
  });

  it("keeps the palm radius and the 1.25 chest factor", () => {
    const wide = 640;
    const wideBase = Math.max(22, wide * 0.045);
    const outside = handOcclusionDisc(pose, pose.leftWrist, wide);
    const overChest = handOcclusionDisc(pose, { x: 150, y: 180 }, wide);
    expect(outside.radius).toBeCloseTo(wideBase, 5);
    expect(overChest.radius).toBeCloseTo(wideBase * 1.25, 5);

    const narrow = 400;
    const narrowOutside = handOcclusionDisc(pose, pose.leftWrist, narrow);
    const narrowChest = handOcclusionDisc(pose, { x: 150, y: 180 }, narrow);
    expect(Math.max(22, narrow * 0.045)).toBe(22);
    expect(narrowOutside.radius).toBe(22);
    expect(narrowChest.radius).toBeCloseTo(22 * 1.25, 5);
  });
});

describe("foreground video zone", () => {
  const modalSource = readFileSync(path.join(process.cwd(), "components", "try-on-modal.tsx"), "utf8");

  it("draws video back only over the head and wrist discs", () => {
    const zoneStart = modalSource.indexOf("const zone = zoneMaskRef");
    const zoneEnd = modalSource.indexOf("overCtx.restore()", zoneStart);
    const zoneBlock = modalSource.slice(zoneStart, zoneEnd);
    const zonePaint = zoneBlock.slice(0, zoneBlock.indexOf("overCtx.save()"));
    expect(zonePaint).toContain("drawHeadMask(zoneCtx, head, width, height)");
    expect(zonePaint).toContain("drawHandsMask(zoneCtx, pose, width)");
    expect(zonePaint).not.toMatch(/fillRect\s*\(/);
    expect(zoneBlock).toContain('globalCompositeOperation = "destination-in"');
    expect(zoneBlock).toContain("drawImage(zone, 0, 0, width, height)");
    expect(zoneBlock).not.toContain("destination-out");
  });

  it("does not upload frames or warp a shirt photo over the torso", () => {
    expect(modalSource).not.toMatch(/toBlob\s*\(/);
    expect(modalSource).not.toMatch(/drawWarpedTexture/);
    expect(modalSource).not.toMatch(/toDataURL\s*\(/);
  });
});
