import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { products } from "./catalog";
import { PILOT_GLB_PATH, resolveTryOnAsset } from "./tryon-asset";

describe("resolveTryOnAsset", () => {
  it("resolves every catalog product with coverage, template, and anchors", () => {
    for (const product of products) {
      const asset = resolveTryOnAsset(product);
      expect(asset.coverage).toMatch(/longsleeve|tee|jersey/);
      expect(asset.templateId).toMatch(/longsleeve-v1|tee-v1|jersey-v1/);
      expect(asset.anchors.shoulderWidth).toBeGreaterThan(0);
      expect(asset.anchors.torsoHeight).toBeGreaterThan(0);
      expect(asset.src).toBeTruthy();
      expect(asset.sleeveLength).toMatch(/long|short/);
    }
  });

  it("keeps the Retro Racing pilot GLB path", () => {
    const pilot = products.find((item) => item.id === "gl-001");
    expect(pilot).toBeTruthy();
    const asset = resolveTryOnAsset(pilot!);
    expect(asset.glb).toBe(PILOT_GLB_PATH);
    expect(asset.coverage).toBe("longsleeve");
    expect(asset.templateId).toBe("longsleeve-v1");
  });

  it("exposes the pilot GLB file under public/models", () => {
    const filePath = path.join(process.cwd(), "public", PILOT_GLB_PATH.replace(/^\//, ""));
    expect(existsSync(filePath)).toBe(true);
  });

  it("does not require a unique GLB for non-pilot products", () => {
    const tee = products.find((item) => item.id === "gl-003");
    const asset = resolveTryOnAsset(tee!);
    expect(asset.glb).toBeUndefined();
    expect(asset.sleeveLength).toBe("short");
  });
});
