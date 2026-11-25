import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSkeleton } from "./garment-mesh";
import { orthoToStage } from "./tryon-coords";
import {
  captureArmLengthBind,
  createArmSolverMemory,
  residualsFromScreenJoints,
  solveArmChain,
  type ArmLengthBind,
  type ArmSideChain,
  type ArmSolveResult,
} from "./arm-solver";

const POSITION_TOLERANCE = 1e-3;

function rig() {
  const group = new THREE.Group();
  const built = createSkeleton(group);
  group.updateMatrixWorld(true);
  return {
    group,
    ...built,
    bind: {
      L: captureArmLengthBind(built.bones.get("forearm.L")!),
      R: captureArmLengthBind(built.bones.get("forearm.R")!),
    },
  };
}

function chainOf(built: ReturnType<typeof rig>, side: "L" | "R"): ArmSideChain {
  return {
    root: built.rootBone,
    shoulder: built.bones.get(`shoulder.${side}`)!,
    upper: built.bones.get(`upper_arm.${side}`)!,
    forearm: built.bones.get(`forearm.${side}`)!,
  };
}

function rootPoint(root: THREE.Object3D, object: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return root.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
}

function solve(
  chain: ArmSideChain,
  bind: ArmLengthBind,
  elbowTarget: THREE.Vector3,
  wristTarget: THREE.Vector3,
  ratios = { upper: 1, forearm: 1 },
  dtSeconds = 1,
) {
  return solveArmChain({
    chain,
    bind,
    memory: createArmSolverMemory(),
    elbowTarget,
    wristTarget,
    upperRatio: ratios.upper,
    forearmRatio: ratios.forearm,
    dtSeconds,
    solveUpper: true,
    solveForearm: true,
  });
}

function reach(origin: THREE.Vector3, bind: ArmLengthBind, upperDir: THREE.Vector3, forearmDir: THREE.Vector3, ratios = { upper: 1, forearm: 1 }) {
  const elbow = origin.clone().add(upperDir.clone().normalize().multiplyScalar(bind.upperLength * ratios.upper));
  const wrist = elbow.clone().add(forearmDir.clone().normalize().multiplyScalar(bind.forearmLength * ratios.forearm));
  return { elbow, wrist };
}

function direction(from: THREE.Vector3, to: THREE.Vector3) {
  return to.clone().sub(from).normalize();
}

describe("arm solver on a Three.js skeleton", () => {
  it("holds the rest pose at the bind joints", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    const origin = rootPoint(chain.root, chain.upper);
    const elbowBind = rootPoint(chain.root, chain.forearm);
    const wristBind = chain.root.worldToLocal(chain.forearm.localToWorld(built.bind.L.forearmRest.clone()));
    const solved = solve(chain, built.bind.L, elbowBind, wristBind);
    expect(solved.elbow.distanceTo(elbowBind)).toBeLessThan(POSITION_TOLERANCE);
    expect(solved.wrist.distanceTo(wristBind)).toBeLessThan(POSITION_TOLERANCE);
    expect(solved.upperOrigin.distanceTo(origin)).toBeLessThan(POSITION_TOLERANCE);
  });

  it("extends both arms from the upper-arm joint", () => {
    const built = rig();
    for (const side of ["L", "R"] as const) {
      const chain = chainOf(built, side);
      const origin = rootPoint(chain.root, chain.upper);
      const outward = new THREE.Vector3(side === "L" ? -1 : 1, 0, 0);
      const targets = reach(origin, built.bind[side], outward, outward);
      const solved = solve(chain, built.bind[side], targets.elbow, targets.wrist);
      expect(solved.elbow.distanceTo(targets.elbow)).toBeLessThan(POSITION_TOLERANCE);
      expect(solved.wrist.distanceTo(targets.wrist)).toBeLessThan(POSITION_TOLERANCE);
      expect(direction(solved.upperOrigin, solved.elbow).dot(outward)).toBeGreaterThan(0.999);
    }
  });

  it("keeps the forearm direction while the upper arm rotates", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    const origin = rootPoint(chain.root, chain.upper);
    const targets = reach(origin, built.bind.L, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
    const solved = solve(chain, built.bind.L, targets.elbow, targets.wrist);
    expect(direction(solved.upperOrigin, solved.elbow).dot(new THREE.Vector3(-1, 0, 0))).toBeGreaterThan(0.999);
    expect(direction(solved.elbow, solved.wrist).dot(new THREE.Vector3(0, -1, 0))).toBeGreaterThan(0.999);
    expect(solved.wrist.distanceTo(targets.wrist)).toBeLessThan(POSITION_TOLERANCE);
  });

  it("bends the elbow and reaches a hand forward on Z", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    const origin = rootPoint(chain.root, chain.upper);
    const bent = reach(origin, built.bind.L, built.bind.L.upperRest, new THREE.Vector3(-1, 0, 0));
    const bentSolved = solve(chain, built.bind.L, bent.elbow, bent.wrist);
    expect(direction(bentSolved.elbow, bentSolved.wrist).dot(new THREE.Vector3(-1, 0, 0))).toBeGreaterThan(0.999);

    const fresh = rig();
    const forwardChain = chainOf(fresh, "L");
    const forwardOrigin = rootPoint(forwardChain.root, forwardChain.upper);
    const forward = reach(forwardOrigin, fresh.bind.L, fresh.bind.L.upperRest, new THREE.Vector3(0, -0.25, 1));
    const forwardSolved = solve(forwardChain, fresh.bind.L, forward.elbow, forward.wrist);
    expect(forwardSolved.wrist.z).toBeGreaterThan(forwardSolved.elbow.z + fresh.bind.L.forearmLength * 0.5);
    expect(forwardSolved.wrist.distanceTo(forward.wrist)).toBeLessThan(POSITION_TOLERANCE);
  });

  it("matches unequal segment lengths without stacking parent scale", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    const origin = rootPoint(chain.root, chain.upper);
    const ratios = { upper: 1.2, forearm: 1.2 };
    const targets = reach(origin, built.bind.L, built.bind.L.upperRest, built.bind.L.forearmRest, ratios);
    const solved = solve(chain, built.bind.L, targets.elbow, targets.wrist, ratios);
    expect(solved.upperActual / built.bind.L.upperLength).toBeCloseTo(1.2, 3);
    expect(solved.forearmActual / built.bind.L.forearmLength).toBeCloseTo(1.2, 3);
    expect(solved.forearmActual / built.bind.L.forearmLength).toBeLessThan(1.3);
    expect(chain.upper.scale.x).toBe(1);
    expect(chain.forearm.scale.x).toBe(1);
    expect(solved.elbow.distanceTo(targets.elbow)).toBeLessThan(POSITION_TOLERANCE);

    const uneven = rig();
    const unevenChain = chainOf(uneven, "R");
    const unevenOrigin = rootPoint(unevenChain.root, unevenChain.upper);
    const unevenRatios = { upper: 1.3, forearm: 0.8 };
    const unevenTargets = reach(unevenOrigin, uneven.bind.R, uneven.bind.R.upperRest, new THREE.Vector3(0.2, -1, 0.1), unevenRatios);
    const unevenSolved = solve(unevenChain, uneven.bind.R, unevenTargets.elbow, unevenTargets.wrist, unevenRatios);
    expect(unevenSolved.upperActual / uneven.bind.R.upperLength).toBeCloseTo(1.3, 3);
    expect(unevenSolved.forearmActual / uneven.bind.R.forearmLength).toBeCloseTo(0.8, 3);
  });

  it("follows a rotated root in world space", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    built.rootBone.rotation.y = 0.4;
    const origin = rootPoint(chain.root, chain.upper);
    const targets = reach(origin, built.bind.L, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
    const solved = solve(chain, built.bind.L, targets.elbow, targets.wrist);
    expect(direction(solved.elbow, solved.wrist).dot(new THREE.Vector3(0, -1, 0))).toBeGreaterThan(0.999);
    const elbowWorld = chain.root.localToWorld(solved.elbow.clone());
    const wristWorld = chain.root.localToWorld(solved.wrist.clone());
    const expected = new THREE.Vector3(0, -1, 0).applyQuaternion(built.rootBone.getWorldQuaternion(new THREE.Quaternion()));
    expect(direction(elbowWorld, wristWorld).dot(expected)).toBeGreaterThan(0.999);
  });

  it("settles after tau and honors different frame steps", () => {
    const run = (dt: number, frames: number) => {
      const built = rig();
      const chain = chainOf(built, "L");
      const origin = rootPoint(chain.root, chain.upper);
      const targets = reach(origin, built.bind.L, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1, 0, 0));
      const memory = createArmSolverMemory();
      let solved: ArmSolveResult | null = null;
      for (let frame = 0; frame < frames; frame += 1) {
        solved = solveArmChain({
          chain,
          bind: built.bind.L,
          memory,
          elbowTarget: targets.elbow,
          wristTarget: targets.wrist,
          upperRatio: 1,
          forearmRatio: 1,
          dtSeconds: dt,
          solveUpper: true,
          solveForearm: true,
        });
      }
      const error = direction(origin, solved!.elbow).angleTo(new THREE.Vector3(-1, 0, 0));
      return error;
    };

    expect(run(0.02, 1)).toBeGreaterThan(0.4);
    expect(run(0.02, 5)).toBeGreaterThan(run(0.1, 5));
    expect(run(0.02, 40)).toBeLessThan(1e-3);
    expect(run(0.1, 8)).toBeLessThan(1e-3);
  });

  it("reads residual from the joint after it moves", () => {
    const built = rig();
    const chain = chainOf(built, "L");
    built.group.scale.setScalar(200);
    built.group.updateMatrixWorld(true);
    const elbowBind = rootPoint(chain.root, chain.forearm);
    const project = (local: THREE.Vector3) => {
      const world = chain.root.localToWorld(local.clone());
      return orthoToStage(world.x, world.y, 400, 360);
    };
    const rest = project(elbowBind);
    const origin = rootPoint(chain.root, chain.upper);
    const targets = reach(origin, built.bind.L, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0));
    const solved = solve(chain, built.bind.L, targets.elbow, targets.wrist);
    const moved = project(solved.elbow);
    const restResidual = residualsFromScreenJoints([
      { label: "elbow.L", cameraX: 180, cameraY: 120, modelX: rest.x, modelY: rest.y },
    ], 120)[0]!;
    const movedResidual = residualsFromScreenJoints([
      { label: "elbow.L", cameraX: 180, cameraY: 120, modelX: moved.x, modelY: moved.y },
    ], 120)[0]!;
    expect(Math.abs(movedResidual.errorPx - restResidual.errorPx)).toBeGreaterThan(1);
    expect(movedResidual.modelX).not.toBeCloseTo(restResidual.modelX, 1);
    expect(movedResidual.errorPct).toBeCloseTo((movedResidual.errorPx / 120) * 100, 5);
  });
});
