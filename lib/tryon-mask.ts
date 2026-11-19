/** Screen-space helpers for on-device try-on occlusion (mirrored selfie coords). */

export type MaskPoint = { x: number; y: number; visibility?: number };

export type UpperBodyPose = {
  leftShoulder: MaskPoint;
  rightShoulder: MaskPoint;
  leftElbow: MaskPoint;
  rightElbow: MaskPoint;
  leftWrist: MaskPoint;
  rightWrist: MaskPoint;
  leftHip: MaskPoint;
  rightHip: MaskPoint;
};

export type HeadPoints = {
  nose: MaskPoint;
  leftEar: MaskPoint;
  rightEar: MaskPoint;
};

function visible(point: MaskPoint, min = 0.25) {
  return (point.visibility ?? 1) >= min;
}

/** Soft head / upper-neck disc so the face stays above the garment. */
export function drawHeadMask(ctx: CanvasRenderingContext2D, head: HeadPoints, width: number, height: number) {
  if (!visible(head.nose, 0.2)) return;
  const earSpan = Math.abs(head.rightEar.x - head.leftEar.x);
  const radiusX = Math.max(width * 0.09, earSpan * 0.72, 42);
  const radiusY = Math.max(height * 0.11, radiusX * 1.15);
  const cx = head.nose.x;
  const cy = head.nose.y - radiusY * 0.12;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Rough torso AABB — used to enlarge hand masks when wrists cross the chest. */
export function wristOverTorso(pose: UpperBodyPose, wrist: MaskPoint) {
  const minX = Math.min(pose.leftShoulder.x, pose.rightShoulder.x, pose.leftHip.x, pose.rightHip.x);
  const maxX = Math.max(pose.leftShoulder.x, pose.rightShoulder.x, pose.leftHip.x, pose.rightHip.x);
  const minY = Math.min(pose.leftShoulder.y, pose.rightShoulder.y) - 12;
  const maxY = Math.max(pose.leftHip.y, pose.rightHip.y);
  const padX = (maxX - minX) * 0.08;
  return wrist.x >= minX - padX && wrist.x <= maxX + padX && wrist.y >= minY && wrist.y <= maxY;
}

export type HandDisc = { x: number; y: number; radius: number };

/** Palm-sized disc centered on the wrist. Slightly larger when the hand crosses the chest. */
export function handOcclusionDisc(pose: UpperBodyPose, wrist: MaskPoint, width: number): HandDisc {
  const base = Math.max(22, width * 0.045);
  const overChest = wristOverTorso(pose, wrist);
  return { x: wrist.x, y: wrist.y, radius: overChest ? base * 1.25 : base };
}

/** Wrist discs for foreground occlusion. The forearm stays on the 3D sleeve. */
export function drawHandsMask(ctx: CanvasRenderingContext2D, pose: UpperBodyPose, width: number) {
  for (const wrist of [pose.leftWrist, pose.rightWrist]) {
    if (!visible(wrist, 0.28)) continue;
    const disc = handOcclusionDisc(pose, wrist, width);
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, disc.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
