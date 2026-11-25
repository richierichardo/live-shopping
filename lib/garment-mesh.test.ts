import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applySolidGarmentColor, assignGarmentMap, createSkeleton, makeSleeveGeometry, makeTorsoGeometry, sleeveSkin } from "./garment-mesh";

describe("garment skin weights", () => {
  const root = new THREE.Group();
  const { index } = createSkeleton(root);
  const geometry = makeTorsoGeometry(index);
  const position = geometry.getAttribute("position");
  const skin = geometry.getAttribute("skinIndex");
  const shoulderL = index.get("shoulder.L")!;
  const shoulderR = index.get("shoulder.R")!;

  it("gives shoulder influence to side chest vertices and not the center", () => {
    let sideHasShoulder = false;
    let centerHasShoulder = false;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      if (y < 0.25 || y > 0.48) continue;
      const indices = [skin.getX(i), skin.getY(i), skin.getZ(i), skin.getW(i)];
      const shoulder = x < 0 ? shoulderL : shoulderR;
      if (Math.abs(x) > 0.34 && indices.includes(shoulder)) sideHasShoulder = true;
      if (Math.abs(x) < 0.05 && (indices.includes(shoulderL) || indices.includes(shoulderR))) centerHasShoulder = true;
    }
    expect(sideHasShoulder).toBe(true);
    expect(centerHasShoulder).toBe(false);
  });

  it("blends the elbow across upper arm and forearm with weights that sum to 1", () => {
    const skinVertex = sleeveSkin(0.6, "L", index);
    expect(skinVertex.indices[0]).not.toBe(skinVertex.indices[1]);
    expect(skinVertex.weights[0]).toBeGreaterThan(0);
    expect(skinVertex.weights[1]).toBeGreaterThan(0);
    expect(skinVertex.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it("sets material color to white when a map is assigned", () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x171717 });
    const map = new THREE.DataTexture(new Uint8Array([220, 210, 190, 255]), 1, 1);
    assignGarmentMap(material, map);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.map).toBe(map);
  });

  it("paints a solid product color and drops the texture map", () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    material.map = new THREE.DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1);
    applySolidGarmentColor(material, "#171715");
    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe("171715");
    expect(material.roughness).toBeCloseTo(0.88);
    expect(material.side).toBe(THREE.DoubleSide);
  });
});

describe("printed garment display path", () => {
  it("paints the torso with the body map and keeps the collar solid", () => {
    const source = readFileSync(path.join(process.cwd(), "lib", "garment-3d.ts"), "utf8");
    expect(source).toMatch(/makeBodyTexture\s*\(/);
    expect(source).toMatch(/makeSleeveTexture\s*\(/);
    expect(source).toContain('includes("sleeve") ? sleeveMap : paintedTorso');
    expect(source).toContain("assignGarmentMap(material, map)");
    expect(source).not.toContain("solidColor: true");
    const collarAt = source.indexOf('collar.name = "collar"');
    const collarPaint = source.slice(collarAt, collarAt + 500);
    expect(collarPaint).toContain("applySolidGarmentColor(collar.material, color)");
    expect(collarPaint).not.toContain("assignGarmentMap");
  });
});

describe("sleeve deformation", () => {
  it("keeps the armpit on the shoulder and the upper-arm vertex on the upper-arm bone after the elbow bends", () => {
    const root = new THREE.Group();
    const { bones, index, skeleton } = createSkeleton(root);
    const geometry = makeSleeveGeometry("L", index);
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(skeleton);

    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    const nearest = (progress: number) => {
      let chosen = 0;
      let best = Infinity;
      for (let i = 0; i < uv.count; i += 1) {
        const distance = Math.abs(uv.getY(i) - progress);
        if (distance < best) {
          best = distance;
          chosen = i;
        }
      }
      return chosen;
    };
    const armpitIndex = nearest(0.25);
    const upperIndex = nearest(0.55);
    const skinned = (vertex: number) => {
      const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
      return mesh.applyBoneTransform(vertex, point);
    };

    const shoulder = bones.get("shoulder.L")!;
    const upper = bones.get("upper_arm.L")!;
    const forearm = bones.get("forearm.L")!;
    root.updateMatrixWorld(true);
    const shoulderPoint = new THREE.Vector3();
    const upperPoint = new THREE.Vector3();
    shoulder.getWorldPosition(shoulderPoint);
    upper.getWorldPosition(upperPoint);
    const armpitGap = skinned(armpitIndex).distanceTo(shoulderPoint);
    const upperGap = skinned(upperIndex).distanceTo(upperPoint);
    const upperBefore = skinned(upperIndex).clone();

    forearm.rotateX(1.2);
    root.updateMatrixWorld(true);
    shoulder.getWorldPosition(shoulderPoint);
    expect(armpitGap).toBeLessThan(0.25);
    expect(skinned(armpitIndex).distanceTo(shoulderPoint)).toBeCloseTo(armpitGap, 3);

    forearm.rotation.set(0, 0, 0);
    upper.rotateZ(0.8);
    root.updateMatrixWorld(true);
    upper.getWorldPosition(upperPoint);
    const upperAfter = skinned(upperIndex);
    expect(upperAfter.distanceTo(upperPoint)).toBeCloseTo(upperGap, 3);
    expect(upperAfter.distanceTo(upperBefore)).toBeGreaterThan(0.05);
  });
});
