/** Live try-on debug instrumentation — metrics only, no frame upload. */

export type TryOnHideReason =
  | "none"
  | "null_pose"
  | "low_confidence"
  | "calibration_failed"
  | "tracking_lost"
  | "inactive";

export type TryOnAssetSource = "glb" | "procedural";

export type TryOnDelegate = "GPU" | "CPU" | "unknown";

export type TryOnTrackingState = "acquiring" | "tracking" | "degraded" | "lost";

export type JointConfidenceMap = {
  leftShoulder: number;
  rightShoulder: number;
  leftElbow: number;
  rightElbow: number;
  leftWrist: number;
  rightWrist: number;
  leftHip: number;
  rightHip: number;
};

export type DebugScreenJoint = {
  x: number;
  y: number;
  label: string;
  kind: "camera" | "model";
};

export type DebugAnchorResidual = {
  label: string;
  errorPx: number;
};

export type TryOnDebugSnapshot = {
  inferenceFps: number;
  renderFps: number;
  inferenceMs: number;
  compositeMs: number;
  renderMs: number;
  poseAgeMs: number;
  joints: JointConfidenceMap;
  delegate: TryOnDelegate;
  assetSource: TryOnAssetSource;
  assetFallbackReason: string | null;
  hideReason: TryOnHideReason;
  cameraLandmarks: DebugScreenJoint[];
  modelJoints: DebugScreenJoint[];
  skeletonOnly: boolean;
  videoSource: "live" | "target" | "failed";
  anchorResiduals: DebugAnchorResidual[];
  trackingState: TryOnTrackingState;
  shoulderRatio: number;
  torsoRatio: number;
  upperArmRatio: number;
};

export const EMPTY_JOINT_CONFIDENCE: JointConfidenceMap = {
  leftShoulder: 0,
  rightShoulder: 0,
  leftElbow: 0,
  rightElbow: 0,
  leftWrist: 0,
  rightWrist: 0,
  leftHip: 0,
  rightHip: 0,
};

export function emptyDebugSnapshot(partial?: Partial<TryOnDebugSnapshot>): TryOnDebugSnapshot {
  return {
    inferenceFps: 0,
    renderFps: 0,
    inferenceMs: 0,
    compositeMs: 0,
    renderMs: 0,
    poseAgeMs: 0,
    joints: { ...EMPTY_JOINT_CONFIDENCE },
    delegate: "unknown",
    assetSource: "procedural",
    assetFallbackReason: null,
    hideReason: "inactive",
    cameraLandmarks: [],
    modelJoints: [],
    skeletonOnly: false,
    videoSource: "live",
    anchorResiduals: [],
    trackingState: "acquiring",
    shoulderRatio: 1,
    torsoRatio: 1,
    upperArmRatio: 1,
    ...partial,
  };
}

/** Rolling average helper for millisecond timings. */
export class TimingWindow {
  private values: number[] = [];
  constructor(private readonly capacity = 30) {}

  push(ms: number) {
    this.values.push(ms);
    if (this.values.length > this.capacity) this.values.shift();
  }

  average() {
    if (this.values.length === 0) return 0;
    let sum = 0;
    for (const value of this.values) sum += value;
    return sum / this.values.length;
  }

  last() {
    return this.values.length === 0 ? 0 : this.values[this.values.length - 1]!;
  }
}

/** Separate inference vs render FPS from wall-clock marks. */
export class FpsCounter {
  private marks: number[] = [];

  mark(now = performance.now()) {
    this.marks.push(now);
    const cutoff = now - 1000;
    while (this.marks.length > 0 && this.marks[0]! < cutoff) this.marks.shift();
  }

  fps() {
    return this.marks.length;
  }
}

export type TryOnDebugMeterState = {
  inferenceMs: TimingWindow;
  compositeMs: TimingWindow;
  renderMs: TimingWindow;
  inferenceFps: FpsCounter;
  renderFps: FpsCounter;
  lastPoseAcceptedAt: number | null;
  delegate: TryOnDelegate;
  assetSource: TryOnAssetSource;
  assetFallbackReason: string | null;
  hideReason: TryOnHideReason;
  joints: JointConfidenceMap;
  cameraLandmarks: DebugScreenJoint[];
  modelJoints: DebugScreenJoint[];
  skeletonOnly: boolean;
  videoSource: "live" | "target" | "failed";
  anchorResiduals: DebugAnchorResidual[];
  trackingState: TryOnTrackingState;
  shoulderRatio: number;
  torsoRatio: number;
  upperArmRatio: number;
};

export function createTryOnDebugMeter(): TryOnDebugMeterState {
  return {
    inferenceMs: new TimingWindow(),
    compositeMs: new TimingWindow(),
    renderMs: new TimingWindow(),
    inferenceFps: new FpsCounter(),
    renderFps: new FpsCounter(),
    lastPoseAcceptedAt: null,
    delegate: "unknown",
    assetSource: "procedural",
    assetFallbackReason: null,
    hideReason: "inactive",
    joints: { ...EMPTY_JOINT_CONFIDENCE },
    cameraLandmarks: [],
    modelJoints: [],
    skeletonOnly: false,
    videoSource: "live",
    anchorResiduals: [],
    trackingState: "acquiring",
    shoulderRatio: 1,
    torsoRatio: 1,
    upperArmRatio: 1,
  };
}

export function snapshotFromMeter(meter: TryOnDebugMeterState, now = performance.now()): TryOnDebugSnapshot {
  return {
    inferenceFps: meter.inferenceFps.fps(),
    renderFps: meter.renderFps.fps(),
    inferenceMs: meter.inferenceMs.average(),
    compositeMs: meter.compositeMs.average(),
    renderMs: meter.renderMs.average(),
    poseAgeMs: meter.lastPoseAcceptedAt == null ? -1 : Math.max(0, now - meter.lastPoseAcceptedAt),
    joints: { ...meter.joints },
    delegate: meter.delegate,
    assetSource: meter.assetSource,
    assetFallbackReason: meter.assetFallbackReason,
    hideReason: meter.hideReason,
    cameraLandmarks: meter.cameraLandmarks.slice(),
    modelJoints: meter.modelJoints.slice(),
    skeletonOnly: meter.skeletonOnly,
    videoSource: meter.videoSource,
    anchorResiduals: meter.anchorResiduals.slice(),
    trackingState: meter.trackingState,
    shoulderRatio: meter.shoulderRatio,
    torsoRatio: meter.torsoRatio,
    upperArmRatio: meter.upperArmRatio,
  };
}

export function jointConfidenceFromPose(pose: {
  leftShoulder: { visibility?: number };
  rightShoulder: { visibility?: number };
  leftElbow: { visibility?: number };
  rightElbow: { visibility?: number };
  leftWrist: { visibility?: number };
  rightWrist: { visibility?: number };
  leftHip: { visibility?: number };
  rightHip: { visibility?: number };
} | null): JointConfidenceMap {
  if (!pose) return { ...EMPTY_JOINT_CONFIDENCE };
  return {
    leftShoulder: pose.leftShoulder.visibility ?? 0,
    rightShoulder: pose.rightShoulder.visibility ?? 0,
    leftElbow: pose.leftElbow.visibility ?? 0,
    rightElbow: pose.rightElbow.visibility ?? 0,
    leftWrist: pose.leftWrist.visibility ?? 0,
    rightWrist: pose.rightWrist.visibility ?? 0,
    leftHip: pose.leftHip.visibility ?? 0,
    rightHip: pose.rightHip.visibility ?? 0,
  };
}

export function cameraLandmarksFromPose(pose: {
  leftShoulder: { x: number; y: number };
  rightShoulder: { x: number; y: number };
  leftElbow: { x: number; y: number };
  rightElbow: { x: number; y: number };
  leftWrist: { x: number; y: number };
  rightWrist: { x: number; y: number };
  leftHip: { x: number; y: number };
  rightHip: { x: number; y: number };
} | null): DebugScreenJoint[] {
  if (!pose) return [];
  const entries: [string, { x: number; y: number }][] = [
    ["LS", pose.leftShoulder],
    ["RS", pose.rightShoulder],
    ["LE", pose.leftElbow],
    ["RE", pose.rightElbow],
    ["LW", pose.leftWrist],
    ["RW", pose.rightWrist],
    ["LH", pose.leftHip],
    ["RH", pose.rightHip],
  ];
  return entries.map(([label, point]) => ({
    x: point.x,
    y: point.y,
    label,
    kind: "camera" as const,
  }));
}

export function isTryOnDebugQueryEnabled(search: string | null | undefined): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("tryonDebug");
  return value === "1" || value === "true";
}

export function formatMs(ms: number) {
  return `${ms.toFixed(1)}ms`;
}

export function formatConf(value: number) {
  return `${Math.round(value * 100)}%`;
}
