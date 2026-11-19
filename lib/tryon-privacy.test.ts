import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  path.join(process.cwd(), "components", "try-on-modal.tsx"),
  "utf8",
);

describe("try-on privacy and camera settings", () => {
  it("keeps user-facing camera constraints", () => {
    expect(modalSource).toContain('facingMode: "user"');
    expect(modalSource).toContain("width: { ideal: 1280 }");
    expect(modalSource).toContain("height: { ideal: 720 }");
    expect(modalSource).toContain("audio: false");
    expect(modalSource).toContain("TRYON_CAMERA_CONSTRAINTS");
    expect(modalSource).toContain("getUserMedia(TRYON_CAMERA_CONSTRAINTS)");
  });

  it("documents that frames stay local", () => {
    expect(modalSource).toMatch(/Frames stay in this browser and are never uploaded/i);
    expect(modalSource).toMatch(/never leave this device|never uploaded/i);
  });

  it("does not upload canvas/video frames to remote endpoints", () => {
    // Allowed: MediaPipe CDN model/WASM URLs only.
    const fetchCalls = [...modalSource.matchAll(/fetch\s*\(/g)];
    expect(fetchCalls.length).toBe(0);

    expect(modalSource).not.toMatch(/XMLHttpRequest/);
    expect(modalSource).not.toMatch(/navigator\.sendBeacon/);
    expect(modalSource).not.toMatch(/WebSocket\s*\(/);

    expect(modalSource).not.toMatch(/toBlob\s*\(/);
    expect(modalSource).not.toMatch(/drawWarpedTexture/);
    expect(modalSource).not.toMatch(/mask-image/);
    expect(modalSource).not.toMatch(/toDataURL\s*\(/);
    expect(modalSource).not.toMatch(/FormData[\s\S]{0,200}(?:video|canvas)/i);
  });

  it("allows MediaPipe CDN model loads but not frame endpoints", () => {
    expect(modalSource).toContain("cdn.jsdelivr.net/npm/@mediapipe/tasks-vision");
    expect(modalSource).toContain("storage.googleapis.com/mediapipe-models");
  });
});
