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

function expandOutward(origin: MaskPoint, point: MaskPoint, amount: number): MaskPoint {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (dx / length) * amount,
    y: point.y + (dy / length) * amount,
    visibility: point.visibility,
  };
}

/** Filled upper-body silhouette: torso polygon + thick arm corridors. */
export function drawUpperBodyMask(
  ctx: CanvasRenderingContext2D,
  pose: UpperBodyPose,
  width: number,
  height: number,
) {
  const pad = Math.max(18, width * 0.035);
  const shoulderMid = {
    x: (pose.leftShoulder.x + pose.rightShoulder.x) / 2,
    y: (pose.leftShoulder.y + pose.rightShoulder.y) / 2,
  };
  const hipMid = {
    x: (pose.leftHip.x + pose.rightHip.x) / 2,
    y: (pose.leftHip.y + pose.rightHip.y) / 2,
  };
  const neckY = shoulderMid.y - Math.max(28, height * 0.06);
  const leftShoulder = expandOutward(shoulderMid, pose.leftShoulder, pad);
  const rightShoulder = expandOutward(shoulderMid, pose.rightShoulder, pad);
  const leftHip = expandOutward(hipMid, pose.leftHip, pad * 0.85);
  const rightHip = expandOutward(hipMid, pose.rightHip, pad * 0.85);

  ctx.beginPath();
  ctx.moveTo(leftShoulder.x, neckY);
  ctx.lineTo(rightShoulder.x, neckY);
  ctx.lineTo(rightShoulder.x, rightShoulder.y);
  ctx.lineTo(rightHip.x, rightHip.y);
  ctx.lineTo(leftHip.x, leftHip.y);
  ctx.lineTo(leftShoulder.x, leftShoulder.y);
  ctx.closePath();
  ctx.fill();

  const armPairs: [MaskPoint, MaskPoint, number][] = [
    [pose.leftShoulder, pose.leftElbow, Math.max(34, width * 0.07)],
    [pose.leftElbow, pose.leftWrist, Math.max(28, width * 0.055)],
    [pose.rightShoulder, pose.rightElbow, Math.max(34, width * 0.07)],
    [pose.rightElbow, pose.rightWrist, Math.max(28, width * 0.055)],
  ];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [start, end, lineWidth] of armPairs) {
    if (!visible(start) || !visible(end)) continue;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(end.x, end.y, lineWidth * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
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

/** Wrist / hand blobs for foreground occlusion; larger when hands cross the torso. */
export function drawHandsMask(ctx: CanvasRenderingContext2D, pose: UpperBodyPose, width: number) {
  const hands: [MaskPoint, MaskPoint, number][] = [
    [pose.leftElbow, pose.leftWrist, Math.max(26, width * 0.05)],
    [pose.rightElbow, pose.rightWrist, Math.max(26, width * 0.05)],
  ];
  ctx.lineCap = "round";
  for (const [elbow, wrist, baseWidth] of hands) {
    if (!visible(wrist, 0.28)) continue;
    const overChest = wristOverTorso(pose, wrist);
    const lineWidth = overChest ? baseWidth * 1.45 : baseWidth;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    if (visible(elbow, 0.25)) {
      // When crossing the chest, cover more forearm so the sleeve does not cover the hand.
      const t = overChest ? 0.35 : 0.55;
      const mx = elbow.x + (wrist.x - elbow.x) * t;
      const my = elbow.y + (wrist.y - elbow.y) * t;
      ctx.moveTo(mx, my);
      ctx.lineTo(wrist.x, wrist.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(wrist.x, wrist.y, lineWidth * (overChest ? 0.85 : 0.65), 0, Math.PI * 2);
    ctx.fill();
  }
}
