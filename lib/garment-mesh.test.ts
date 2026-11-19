import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { assignGarmentMap, createSkeleton, makeTorsoGeometry, sleeveSkin } from "./garment-mesh";

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
});
