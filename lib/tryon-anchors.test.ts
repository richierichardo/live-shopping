import { describe, expect, it } from "vitest";
import { buildModelAnchors, computeAnchorFit } from "./tryon-anchors";

const model = buildModelAnchors({
  shoulderL: { x: -0.37, y: 0.35, z: 0 },
  shoulderR: { x: 0.37, y: 0.35, z: 0 },
  elbowL: { x: -0.55, y: 0.0, z: 0.02 },
  elbowR: { x: 0.55, y: 0.0, z: 0.02 },
  wristL: { x: -0.7, y: -0.35, z: 0.04 },
  wristR: { x: 0.7, y: -0.35, z: 0.04 },
  pelvis: { x: 0, y: -0.4, z: 0 },
  neck: { x: 0, y: 0.48, z: 0.02 },
  hemY: -0.52,
});

describe("tryon-anchors", () => {
  it("builds explicit shoulder/elbow/wrist/pelvis/hem anchors", () => {
    expect(model.shoulderWidth).toBeGreaterThan(0.5);
    expect(model.torsoHeight).toBeGreaterThan(0.5);
    expect(model.upperArmLengthL).toBeGreaterThan(0.2);
    expect(model.forearmLengthL).toBeGreaterThan(0.2);
    expect(model.hem.y).toBe(-0.52);
  });

  it("fits a frontal synthetic pose with finite shoulder and pelvis residuals", () => {
    const pose = {
      leftShoulder: { x: 140, y: 90, visibility: 1 },
      rightShoulder: { x: 260, y: 92, visibility: 1 },
      leftHip: { x: 160, y: 240, visibility: 1 },
      rightHip: { x: 240, y: 242, visibility: 1 },
    };
    const fit = computeAnchorFit(pose, model, 400, 360, 0.05);
    expect(fit).not.toBeNull();
    expect(fit!.scaleX).toBeGreaterThan(0);
    expect(fit!.scaleY).toBeGreaterThan(0);
    expect(Number.isFinite(fit!.rootOffset.y)).toBe(true);
    expect(fit!.residuals.length).toBe(3);
    for (const residual of fit!.residuals) {
      expect(Number.isFinite(residual.errorPx)).toBe(true);
    }
    const shoulderResidual = fit!.residuals.find((item) => item.label === "shoulder.L");
    expect(shoulderResidual!.errorPx).toBeLessThan(80);
  });

  it("keeps shoulder and pelvis anchors when hemY changes", () => {
    const shallowHem = buildModelAnchors({
      shoulderL: model.shoulderL,
      shoulderR: model.shoulderR,
      elbowL: model.elbowL,
      elbowR: model.elbowR,
      wristL: model.wristL,
      wristR: model.wristR,
      pelvis: model.pelvis,
      neck: model.neck,
      hemY: -0.2,
    });
    const pose = {
      leftShoulder: { x: 140, y: 90 },
      rightShoulder: { x: 260, y: 92 },
      leftHip: { x: 160, y: 240 },
      rightHip: { x: 240, y: 242 },
    };
    const a = computeAnchorFit(pose, model, 400, 360)!;
    const b = computeAnchorFit(pose, shallowHem, 400, 360)!;
    expect(a.rootOffset.y).toBeCloseTo(b.rootOffset.y, 6);
    expect(a.rootOffset.x).toBeCloseTo(b.rootOffset.x, 6);
    const shoulderA = a.residuals.find((item) => item.label === "shoulder.L")!;
    const shoulderB = b.residuals.find((item) => item.label === "shoulder.L")!;
    const pelvisA = a.residuals.find((item) => item.label === "pelvis")!;
    const pelvisB = b.residuals.find((item) => item.label === "pelvis")!;
    expect(shoulderA.modelY).toBeCloseTo(shoulderB.modelY, 4);
    expect(pelvisA.modelY).toBeCloseTo(pelvisB.modelY, 4);
    expect(shallowHem.hem.y).toBe(-0.2);
  });
});
