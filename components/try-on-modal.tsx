"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import type { Garment3DRenderer, GarmentPose, PoseUpdateOptions, ScreenPoint, WorldPoint } from "@/lib/garment-3d";
import { resolveTryOnAsset, type TryOnResolved } from "@/lib/tryon-asset";
import { confidenceToOpacity } from "@/lib/tryon-body";
import {
  CALIBRATION_SHOULDER_VIS,
  createProportionCalibrator,
  worldLength,
  type ProportionRatios,
  IDENTITY_RATIOS,
} from "@/lib/tryon-calibration";
import {
  createTrackMemory,
  dtAlpha,
  stepTracking,
  type TrackMemory,
  type TrackingState,
} from "@/lib/tryon-track";
import {
  cameraLandmarksFromPose,
  createTryOnDebugMeter,
  emptyDebugSnapshot,
  formatConf,
  formatMs,
  isTryOnDebugQueryEnabled,
  jointConfidenceFromPose,
  snapshotFromMeter,
  type TryOnDebugSnapshot,
  type TryOnDelegate,
} from "@/lib/tryon-debug";
import {
  drawMirroredCover,
  fixtureUrlForSource,
  normalizedToMirroredStage,
  type TryOnVideoSource,
} from "@/lib/tryon-coords";
import { drawHandsMask, drawHeadMask, type HeadPoints } from "@/lib/tryon-mask";

/** Camera constraints — keep in sync with privacy tests (local only, no frame upload). */
export const TRYON_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

type Status = "intro" | "starting" | "active" | "camera-error" | "tracking-error";
type Landmark = { x: number; y: number; z?: number; visibility?: number };
type PoseResult = { landmarks?: Landmark[][]; worldLandmarks?: Landmark[][]; segmentationMasks?: SegmentationMask[] };
type SegmentationMask = {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  getAsFloat32Array: () => Float32Array;
  close?: () => void;
};
type PoseLandmarker = { detectForVideo: (video: HTMLVideoElement, timestamp: number) => PoseResult; close: () => void };
type GarmentRenderer = Garment3DRenderer;

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const JOINTS = { leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24 } as const;
const HEAD_JOINTS = { nose: 0, leftEar: 7, rightEar: 8 } as const;
const pointKeys = Object.keys(JOINTS) as (keyof typeof JOINTS)[];
const CLAIM_NOTE = "Live 3D garment preview only — not a size recommendation, not a fitting-room replacement, and not photoreal clothing swap.";
const DEBUG_UI_INTERVAL_MS = 200;

function maskCanvas(mask: SegmentationMask, canvas: HTMLCanvasElement) {
  if (mask.canvas) return mask.canvas;
  const context = canvas.getContext("2d");
  if (!context) return null;
  canvas.width = mask.width;
  canvas.height = mask.height;
  const values = mask.getAsFloat32Array();
  const image = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < values.length; i += 1) {
    const alpha = Math.round(Math.max(0, Math.min(1, values[i])) * 255);
    const offset = i * 4;
    image.data[offset] = 255;
    image.data[offset + 1] = 255;
    image.data[offset + 2] = 255;
    image.data[offset + 3] = alpha;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function TryOnModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [status, setStatus] = useState<Status>("intro");
  const [statusText, setStatusText] = useState("Rotate the 3D model before starting the camera.");
  const [fps, setFps] = useState(0);
  const [showPoseOverlay, setShowPoseOverlay] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [skeletonOnly, setSkeletonOnly] = useState(false);
  const [videoSource, setVideoSource] = useState<TryOnVideoSource>("live");
  const [debugSnapshot, setDebugSnapshot] = useState<TryOnDebugSnapshot>(() => emptyDebugSnapshot());
  const [poseLost, setPoseLost] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [assetFallbackBanner, setAssetFallbackBanner] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const garmentCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskScratchRef = useRef<HTMLCanvasElement | null>(null);
  const zoneMaskRef = useRef<HTMLCanvasElement | null>(null);
  const tryOnAssetRef = useRef<TryOnResolved>(resolveTryOnAsset(product));
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const garmentRendererRef = useRef<GarmentRenderer | null>(null);
  const smoothedPoseRef = useRef<GarmentPose | null>(null);
  const smoothedHeadRef = useRef<HeadPoints | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const fpsCountRef = useRef({ frames: 0, start: 0 });
  const lastFpsRef = useRef(30);
  const poseConfidenceRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const debugMeterRef = useRef(createTryOnDebugMeter());
  const lastDebugUiAtRef = useRef(0);
  const calibratorRef = useRef(createProportionCalibrator());
  const trackMemoryRef = useRef<TrackMemory>(createTrackMemory());
  const trackingStateRef = useRef<TrackingState>("acquiring");
  const ratiosRef = useRef<ProportionRatios>({ ...IDENTITY_RATIOS });
  const lastSmoothAtRef = useRef(0);
  const lastRenderAtRef = useRef(0);
  const showPoseOverlayRef = useRef(showPoseOverlay);
  const debugPanelOpenRef = useRef(debugPanelOpen);
  const skeletonOnlyRef = useRef(skeletonOnly);
  const videoSourceRef = useRef(videoSource);
  showPoseOverlayRef.current = showPoseOverlay;
  debugPanelOpenRef.current = debugPanelOpen;
  skeletonOnlyRef.current = skeletonOnly;
  videoSourceRef.current = videoSource;
  debugMeterRef.current.skeletonOnly = skeletonOnly;
  debugMeterRef.current.videoSource = videoSource;

  const qualityTier = (width: number) => {
    const narrow = width < 520 || (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
    const highDpr = typeof window !== "undefined" && (window.devicePixelRatio || 1) > 2;
    const lowFps = lastFpsRef.current > 0 && lastFpsRef.current < 18;
    const low = narrow || highDpr || lowFps;
    return {
      dpr: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    };
  };

  const applyLayerOpacity = (opacity: number) => {
    const value = String(Math.max(0, Math.min(1, opacity)));
    garmentCanvasRef.current?.style.setProperty("opacity", value);
  };

  tryOnAssetRef.current = resolveTryOnAsset(product);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    smoothedPoseRef.current = null;
    smoothedHeadRef.current = null;
    calibratorRef.current.reset();
    trackMemoryRef.current = createTrackMemory();
    trackingStateRef.current = "acquiring";
    ratiosRef.current = { ...IDENTITY_RATIOS };
    lastSmoothAtRef.current = 0;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    for (const canvas of [overlayCanvasRef.current]) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const garment = garmentCanvasRef.current;
    if (garment) garment.style.removeProperty("opacity");
    poseConfidenceRef.current = 0;
    const renderer = garmentRendererRef.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (renderer && bounds) renderer.inspect(bounds.width, bounds.height);
  }, []);

  useEffect(() => {
    let mounted = true;
    const canvas = garmentCanvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let renderer: GarmentRenderer | null = null;
    import("@/lib/garment-3d").then(async ({ createGarment3DRenderer }) => {
      if (!mounted) return;
      try {
        const asset = resolveTryOnAsset(product);
        tryOnAssetRef.current = asset;
        renderer = await createGarment3DRenderer(canvas, {
          productName: product.name,
          color: product.colors[0]?.hex ?? "#171715",
          glbUrl: asset.glb,
          sleeveLength: asset.sleeveLength,
          anchors: asset.anchors,
        });
        if (!mounted) {
          renderer.dispose();
          return;
        }
        garmentRendererRef.current = renderer;
        const assetInfo = renderer.getAssetInfo();
        debugMeterRef.current.assetSource = assetInfo.source;
        debugMeterRef.current.assetFallbackReason = assetInfo.fallbackReason;
        if (assetInfo.source === "procedural" && asset.glb) {
          setAssetFallbackBanner(
            assetInfo.fallbackReason
              ? `GLB failed — procedural fallback (${assetInfo.fallbackReason})`
              : "GLB failed — procedural fallback",
          );
        } else {
          setAssetFallbackBanner(null);
        }
        renderer.setSkeletonOnly(skeletonOnlyRef.current);
        const bounds = stage.getBoundingClientRect();
        renderer.inspect(bounds.width, bounds.height);
      } catch {
        if (mounted) {
          setModelError(true);
          setStatusText("The local 3D model could not be rendered in this browser.");
        }
      }
    }).catch(() => {
      if (mounted) setModelError(true);
    });
    const observer = new ResizeObserver(() => {
      const bounds = stage.getBoundingClientRect();
      if (status === "active") renderer?.updatePose(smoothedPoseRef.current, bounds.width, bounds.height);
      else renderer?.inspect(bounds.width, bounds.height);
    });
    observer.observe(stage);
    return () => {
      mounted = false;
      observer.disconnect();
      stopCamera();
      renderer?.dispose();
      garmentRendererRef.current = null;
    };
    // Initialize one renderer per modal/product. Status is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, stopCamera]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isTryOnDebugQueryEnabled(window.location.search)) {
      setDebugPanelOpen(true);
      setShowPoseOverlay(true);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "d" || event.key === "D") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        event.preventDefault();
        setDebugPanelOpen((open) => {
          const next = !open;
          if (next) setShowPoseOverlay(true);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    garmentRendererRef.current?.setSkeletonOnly(skeletonOnly);
  }, [skeletonOnly]);

  /**
   * MediaPipe landmarks are in unmirrored camera space; the video element is CSS-mirrored.
   * Convert once into selfie-mirrored screen pixels for garment + occlusion.
   */
  const mapPose = (landmarks: Landmark[], world: Landmark[], width: number, height: number, video: HTMLVideoElement): { pose: GarmentPose; head: HeadPoints } => {
    const screen: Partial<Record<keyof typeof JOINTS, ScreenPoint>> = {};
    const worldPoints: Partial<Record<keyof typeof JOINTS, WorldPoint>> = {};
    const mapScreen = (landmark: Landmark) =>
      normalizedToMirroredStage(landmark, video.videoWidth, video.videoHeight, width, height);
    for (const key of pointKeys) {
      const index = JOINTS[key];
      const landmark = landmarks[index];
      const worldPoint = world[index] ?? landmark;
      screen[key] = mapScreen(landmark);
      worldPoints[key] = {
        x: -(worldPoint.x ?? 0),
        y: worldPoint.y ?? 0,
        z: worldPoint.z ?? 0,
        visibility: worldPoint.visibility,
      };
    }
    const head: HeadPoints = {
      nose: mapScreen(landmarks[HEAD_JOINTS.nose] ?? landmarks[0]),
      leftEar: mapScreen(landmarks[HEAD_JOINTS.leftEar] ?? landmarks[0]),
      rightEar: mapScreen(landmarks[HEAD_JOINTS.rightEar] ?? landmarks[0]),
    };
    return {
      pose: {
        leftShoulder: screen.leftShoulder!, rightShoulder: screen.rightShoulder!,
        leftElbow: screen.leftElbow!, rightElbow: screen.rightElbow!,
        leftWrist: screen.leftWrist!, rightWrist: screen.rightWrist!,
        leftHip: screen.leftHip!, rightHip: screen.rightHip!,
        world: {
          leftShoulder: worldPoints.leftShoulder!, rightShoulder: worldPoints.rightShoulder!,
          leftElbow: worldPoints.leftElbow!, rightElbow: worldPoints.rightElbow!,
          leftWrist: worldPoints.leftWrist!, rightWrist: worldPoints.rightWrist!,
          leftHip: worldPoints.leftHip!, rightHip: worldPoints.rightHip!,
        },
      },
      head,
    };
  };

  const syncCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number, dpr: number) => {
    const nextW = Math.round(width * dpr);
    const nextH = Math.round(height * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  };

  const publishDebugSnapshot = (now = performance.now()) => {
    if (now - lastDebugUiAtRef.current < DEBUG_UI_INTERVAL_MS) return;
    lastDebugUiAtRef.current = now;
    setDebugSnapshot(snapshotFromMeter(debugMeterRef.current, now));
  };

  const paintModelSkeletonOverlay = (width: number, height: number) => {
    if (!(showPoseOverlayRef.current || debugPanelOpenRef.current || skeletonOnlyRef.current)) return;
    const overlay = overlayCanvasRef.current;
    const overCtx = overlay?.getContext("2d");
    const debugFrame = garmentRendererRef.current?.getDebugFrame();
    const modelJoints = debugFrame?.modelJoints ?? [];
    if (!overlay || !overCtx) return;
    const quality = qualityTier(width);
    syncCanvasSize(overlay, width, height, quality.dpr);
    overCtx.setTransform(quality.dpr, 0, 0, quality.dpr, 0, 0);
    if (modelJoints.length > 0) {
      overCtx.strokeStyle = "#ff7a59";
      overCtx.fillStyle = "#ff7a59";
      overCtx.lineWidth = 1.5;
      const byLabel = new Map(modelJoints.map((joint) => [joint.label, joint]));
      const modelPairs: [string, string][] = [
        ["shoulder.L", "upper_arm.L"], ["upper_arm.L", "forearm.L"],
        ["shoulder.R", "upper_arm.R"], ["upper_arm.R", "forearm.R"],
        ["shoulder.L", "shoulder.R"], ["pelvis", "spine"], ["spine", "chest"], ["chest", "neck"],
      ];
      for (const [aName, bName] of modelPairs) {
        const a = byLabel.get(aName);
        const b = byLabel.get(bName);
        if (!a || !b) continue;
        overCtx.beginPath();
        overCtx.moveTo(a.x, a.y);
        overCtx.lineTo(b.x, b.y);
        overCtx.stroke();
      }
      for (const joint of modelJoints) {
        overCtx.beginPath();
        overCtx.arc(joint.x, joint.y, 3.5, 0, Math.PI * 2);
        overCtx.fill();
      }
    }
    const residuals = debugFrame?.anchorResiduals ?? [];
    if (residuals.length > 0) {
      overCtx.strokeStyle = "#7ec8ff";
      overCtx.fillStyle = "#7ec8ff";
      overCtx.lineWidth = 1;
      overCtx.font = "700 9px Arial";
      for (const residual of residuals) {
        overCtx.beginPath();
        overCtx.moveTo(residual.cameraX, residual.cameraY);
        overCtx.lineTo(residual.modelX, residual.modelY);
        overCtx.stroke();
        overCtx.beginPath();
        overCtx.arc(residual.modelX, residual.modelY, 4, 0, Math.PI * 2);
        overCtx.fill();
        overCtx.fillText(`${residual.label} ${residual.errorPx.toFixed(0)}px`, residual.modelX + 6, residual.modelY - 6);
      }
    }
  };

  const drawComposite = (result: PoseResult, pose: GarmentPose | null, head: HeadPoints | null, width: number, height: number, video: HTMLVideoElement, confidence: number) => {
    const compositeStarted = performance.now();
    const overlay = overlayCanvasRef.current;
    const overCtx = overlay?.getContext("2d");
    if (!overlay || !overCtx) return;

    const quality = qualityTier(width);
    const dpr = quality.dpr;
    syncCanvasSize(overlay, width, height, dpr);
    overCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overCtx.clearRect(0, 0, width, height);

    const layerOpacity = confidenceToOpacity(confidence);
    applyLayerOpacity(layerOpacity);

    if (!pose || layerOpacity < 0.04) {
      debugMeterRef.current.compositeMs.push(performance.now() - compositeStarted);
      return;
    }

    const seg = result.segmentationMasks?.[0];
    const scratch = maskScratchRef.current ?? document.createElement("canvas");
    maskScratchRef.current = scratch;
    const personMask = seg ? maskCanvas(seg, scratch) : null;

    // Head and hands from the live video sit in front of the single 3D garment.
    const zone = zoneMaskRef.current ?? document.createElement("canvas");
    zoneMaskRef.current = zone;
    const zoneCtx = zone.getContext("2d");
    if (zoneCtx) {
      syncCanvasSize(zone, width, height, 1);
      zoneCtx.setTransform(1, 0, 0, 1, 0, 0);
      zoneCtx.clearRect(0, 0, width, height);
      zoneCtx.fillStyle = "#fff";
      zoneCtx.strokeStyle = "#fff";
      if (head) drawHeadMask(zoneCtx, head, width, height);
      drawHandsMask(zoneCtx, pose, width);
    }
    overCtx.save();
    drawMirroredCover(overCtx, video, video.videoWidth, video.videoHeight, width, height);
    if (personMask && seg) {
      overCtx.globalCompositeOperation = "destination-in";
      drawMirroredCover(overCtx, personMask, seg.width, seg.height, width, height);
    }
    overCtx.globalCompositeOperation = "destination-in";
    overCtx.drawImage(zone, 0, 0, width, height);
    overCtx.restore();

    const showOverlay = showPoseOverlayRef.current || debugPanelOpenRef.current || skeletonOnlyRef.current;
    if (showOverlay) {
      overCtx.lineWidth = 2;
      overCtx.strokeStyle = "#6cf2d1";
      overCtx.fillStyle = "#ffca59";
      const pairs: [ScreenPoint, ScreenPoint][] = [
        [pose.leftShoulder, pose.leftElbow], [pose.leftElbow, pose.leftWrist],
        [pose.rightShoulder, pose.rightElbow], [pose.rightElbow, pose.rightWrist],
        [pose.leftShoulder, pose.rightShoulder], [pose.leftHip, pose.rightHip],
      ];
      for (const [a, b] of pairs) { overCtx.beginPath(); overCtx.moveTo(a.x, a.y); overCtx.lineTo(b.x, b.y); overCtx.stroke(); }
      for (const key of pointKeys) {
        const point = pose[key];
        overCtx.beginPath(); overCtx.arc(point.x, point.y, 4, 0, Math.PI * 2); overCtx.fill();
      }
      overCtx.fillStyle = "#fff";
      overCtx.font = "700 10px Arial";
      overCtx.fillText("L", pose.leftShoulder.x - 8, pose.leftShoulder.y - 9);
      overCtx.fillText("R", pose.rightShoulder.x + 4, pose.rightShoulder.y - 9);
      overCtx.fillText(`conf ${(confidence * 100).toFixed(0)}%`, 10, 18);
    }
    debugMeterRef.current.compositeMs.push(performance.now() - compositeStarted);
  };

  const renderFrame = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const renderer = garmentRendererRef.current;
    const stage = stageRef.current;
    if (!video || !landmarker || !renderer || !stage || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const now = performance.now();
    const meter = debugMeterRef.current;
    if (video.currentTime !== lastTimeRef.current) {
      lastTimeRef.current = video.currentTime;
      const inferenceStarted = performance.now();
      const result = landmarker.detectForVideo(video, now);
      meter.inferenceMs.push(performance.now() - inferenceStarted);
      meter.inferenceFps.mark(now);
      const landmarks = result.landmarks?.[0];
      const world = result.worldLandmarks?.[0] ?? landmarks;
      let rawPose: GarmentPose | null = null;
      let head: HeadPoints | null = null;
      if (landmarks && world && landmarks.length > 24 && world.length > 24) {
        const mapped = mapPose(landmarks, world, bounds.width, bounds.height, video);
        rawPose = mapped.pose;
        head = mapped.head;
        const shoulderVis = Math.min(rawPose.leftShoulder.visibility ?? 0, rawPose.rightShoulder.visibility ?? 0);
        const shoulderPx = Math.hypot(rawPose.rightShoulder.x - rawPose.leftShoulder.x, rawPose.rightShoulder.y - rawPose.leftShoulder.y);
        const torsoPx = Math.hypot(
          (rawPose.leftShoulder.x + rawPose.rightShoulder.x) * 0.5 - (rawPose.leftHip.x + rawPose.rightHip.x) * 0.5,
          (rawPose.leftShoulder.y + rawPose.rightShoulder.y) * 0.5 - (rawPose.leftHip.y + rawPose.rightHip.y) * 0.5,
        );
        if (
          shoulderVis >= CALIBRATION_SHOULDER_VIS
          && rawPose.leftShoulder.x < rawPose.rightShoulder.x
          && (rawPose.leftHip.visibility ?? 0) >= 0.35
          && (rawPose.rightHip.visibility ?? 0) >= 0.35
        ) {
          calibratorRef.current.push({
            at: now,
            shoulderPx,
            torsoPx,
            torsoWorld: worldLength(rawPose.world.leftShoulder, rawPose.world.leftHip),
            upperWorldL: worldLength(rawPose.world.leftShoulder, rawPose.world.leftElbow),
            upperWorldR: worldLength(rawPose.world.rightShoulder, rawPose.world.rightElbow),
            forearmWorldL: worldLength(rawPose.world.leftElbow, rawPose.world.leftWrist),
            forearmWorldR: worldLength(rawPose.world.rightElbow, rawPose.world.rightWrist),
            hipWidthPx: Math.abs(rawPose.rightHip.x - rawPose.leftHip.x),
          });
        }
      }
      const modelAnchors = renderer.getDebugFrame().modelAnchors;
      const ratios = modelAnchors
        ? calibratorRef.current.current(modelAnchors, now)
        : { ...IDENTITY_RATIOS };
      ratiosRef.current = ratios;
      const tracked = stepTracking(trackMemoryRef.current, now, rawPose, ratios.ready);
      trackMemoryRef.current = tracked.memory;
      trackingStateRef.current = tracked.state;
      const pose = tracked.state === "lost" ? smoothedPoseRef.current : tracked.pose;
      const dtSeconds = lastSmoothAtRef.current > 0 ? (now - lastSmoothAtRef.current) / 1000 : 1 / 30;
      lastSmoothAtRef.current = now;
      const smooth = dtAlpha(dtSeconds, 0.08);
      const confidence = pose
        ? Math.min(
          pose.leftShoulder.visibility ?? 0,
          pose.rightShoulder.visibility ?? 0,
          Math.max(pose.leftHip.visibility ?? 0, pose.rightHip.visibility ?? 0),
        )
        : 0;
      const previous = smoothedPoseRef.current;
      const previousHead = smoothedHeadRef.current;
      if (pose && previous && tracked.state !== "lost") {
        for (const key of pointKeys) {
          const currentPoint = pose[key];
          const oldPoint = previous[key];
          const jointVis = currentPoint.visibility ?? 1;
          const alpha = smooth * Math.max(0.35, Math.min(1, jointVis));
          currentPoint.x = oldPoint.x + (currentPoint.x - oldPoint.x) * alpha;
          currentPoint.y = oldPoint.y + (currentPoint.y - oldPoint.y) * alpha;
          currentPoint.visibility = jointVis;
          const currentWorld = pose.world[key];
          const oldWorld = previous.world[key];
          currentWorld.x = oldWorld.x + (currentWorld.x - oldWorld.x) * alpha;
          currentWorld.y = oldWorld.y + (currentWorld.y - oldWorld.y) * alpha;
          currentWorld.z = oldWorld.z + (currentWorld.z - oldWorld.z) * alpha;
        }
      }
      if (head && previousHead && tracked.state !== "lost") {
        for (const key of Object.keys(head) as (keyof HeadPoints)[]) {
          const jointVis = head[key].visibility ?? 1;
          const alpha = smooth * Math.max(0.35, Math.min(1, jointVis));
          head[key].x = previousHead[key].x + (head[key].x - previousHead[key].x) * alpha;
          head[key].y = previousHead[key].y + (head[key].y - previousHead[key].y) * alpha;
        }
      }
      const confidenceAlpha = dtAlpha(dtSeconds, 0.12);
      poseConfidenceRef.current = pose && tracked.state !== "lost"
        ? poseConfidenceRef.current + (confidence - poseConfidenceRef.current) * confidenceAlpha
        : poseConfidenceRef.current * (1 - confidenceAlpha * 0.5);
      if (tracked.state !== "lost") {
        smoothedPoseRef.current = pose;
        smoothedHeadRef.current = head ?? smoothedHeadRef.current;
      }
      if (pose && tracked.state !== "lost") meter.lastPoseAcceptedAt = now;
      meter.joints = jointConfidenceFromPose(pose);
      meter.cameraLandmarks = cameraLandmarksFromPose(pose);
      meter.trackingState = tracked.state;
      meter.shoulderRatio = ratios.shoulder;
      meter.torsoRatio = ratios.torso;
      meter.upperArmRatio = (ratios.upperL + ratios.upperR) * 0.5;
      if (tracked.state === "lost") meter.hideReason = "tracking_lost";
      setPoseLost(tracked.state === "lost" || tracked.state === "acquiring");
      drawComposite(result, smoothedPoseRef.current, smoothedHeadRef.current, bounds.width, bounds.height, video, poseConfidenceRef.current);
      result.segmentationMasks?.forEach((mask) => mask.close?.());
      const sample = fpsCountRef.current;
      sample.frames += 1;
      if (now - sample.start > 900) {
        const nextFps = Math.round((sample.frames * 1000) / (now - sample.start));
        lastFpsRef.current = nextFps;
        setFps(nextFps);
        fpsCountRef.current = { frames: 0, start: now };
      }
    }
    const ratios = ratiosRef.current;
    const renderDt = lastRenderAtRef.current > 0 ? Math.min(0.1, (now - lastRenderAtRef.current) / 1000) : 1 / 30;
    lastRenderAtRef.current = now;
    renderer.updatePose(smoothedPoseRef.current, bounds.width, bounds.height, {
      head: smoothedHeadRef.current,
      confidence: poseConfidenceRef.current,
      anchors: tryOnAssetRef.current.anchors,
      skeletonOnly: skeletonOnlyRef.current,
      trackingState: trackingStateRef.current,
      dtSeconds: renderDt,
      segmentScales: {
        upperL: ratios.upperL,
        upperR: ratios.upperR,
        forearmL: ratios.forearmL,
        forearmR: ratios.forearmR,
      },
    });
    const debugFrame = renderer.getDebugFrame();
    meter.renderMs.push(debugFrame.lastRenderMs);
    meter.renderFps.mark(now);
    meter.hideReason = debugFrame.hideReason === "none" && !smoothedPoseRef.current
      ? "tracking_lost"
      : debugFrame.hideReason;
    meter.modelJoints = debugFrame.modelJoints;
    meter.assetSource = debugFrame.asset.source;
    meter.assetFallbackReason = debugFrame.asset.fallbackReason;
    meter.anchorResiduals = debugFrame.anchorResiduals.map((item) => ({
      label: item.label,
      errorPx: item.errorPx,
    }));
    meter.videoSource = videoSourceRef.current;
    paintModelSkeletonOverlay(bounds.width, bounds.height);
    publishDebugSnapshot(now);
    frameRef.current = requestAnimationFrame(renderFrame);
  };

  const ensureLandmarker = async (): Promise<TryOnDelegate> => {
    if (landmarkerRef.current) return debugMeterRef.current.delegate;
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    try {
      landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
      });
      return "GPU";
    } catch {
      landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
      });
      return "CPU";
    }
  };

  const bindVideoElement = async (source: TryOnVideoSource) => {
    const video = videoRef.current;
    if (!video) throw new Error("Camera preview unavailable");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    video.pause();
    video.removeAttribute("src");
    video.srcObject = null;
    video.loop = source !== "live";
    video.muted = true;
    video.playsInline = true;

    if (source === "live") {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");
      const stream = await navigator.mediaDevices.getUserMedia(TRYON_CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      video.srcObject = stream;
    } else {
      const url = fixtureUrlForSource(source);
      if (!url) throw new Error("Fixture unavailable");
      video.src = url;
    }
    await video.play();
  };

  const beginTrackingSession = async (source: TryOnVideoSource) => {
    setStatus("starting");
    setStatusText(source === "live"
      ? "Starting camera and loading pose tracking…"
      : `Loading fixture (${source}) and pose tracking…`);
    try {
      await bindVideoElement(source);
      const delegate = await ensureLandmarker();
      const meter = createTryOnDebugMeter();
      meter.delegate = delegate;
      meter.skeletonOnly = skeletonOnlyRef.current;
      meter.videoSource = source;
      const assetInfo = garmentRendererRef.current?.getAssetInfo();
      if (assetInfo) {
        meter.assetSource = assetInfo.source;
        meter.assetFallbackReason = assetInfo.fallbackReason;
      }
      debugMeterRef.current = meter;
      setVideoSource(source);
      videoSourceRef.current = source;
      smoothedPoseRef.current = null;
      lastTimeRef.current = -1;
      lastSmoothAtRef.current = 0;
      calibratorRef.current.reset();
      trackMemoryRef.current = createTrackMemory();
      trackingStateRef.current = "acquiring";
      ratiosRef.current = { ...IDENTITY_RATIOS };
      setPoseLost(true);
      fpsCountRef.current = { frames: 0, start: performance.now() };
      setStatus("active");
      setStatusText(source === "live"
        ? "Pose tracking active · video and processing stay on this device."
        : `Fixture replay (${source}) · MediaPipe stays on this device.`);
      if (frameRef.current === null) renderFrame();
    } catch (error) {
      const cameraStarted = Boolean(streamRef.current) || source !== "live";
      stopCamera();
      setVideoSource("live");
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (cameraStarted && (message.includes("mediapipe") || message.includes("fetch") || message.includes("wasm") || message.includes("model"))) {
        setStatus("tracking-error");
        setStatusText("Pose model could not load. The 3D model remains available to inspect.");
      } else if (source !== "live") {
        setStatus("tracking-error");
        setStatusText("Fixture video could not be played. Check public/fixtures and try again.");
      } else {
        setStatus("camera-error");
        setStatusText("Camera permission was denied or no camera is available. The 3D model remains available to inspect.");
      }
    }
  };

  const startCamera = async () => {
    await beginTrackingSession("live");
  };

  const switchVideoSource = async (source: TryOnVideoSource) => {
    if (status !== "active" && status !== "starting") {
      await beginTrackingSession(source);
      return;
    }
    try {
      await bindVideoElement(source);
      setVideoSource(source);
      videoSourceRef.current = source;
      debugMeterRef.current.videoSource = source;
      smoothedPoseRef.current = null;
      lastTimeRef.current = -1;
      lastSmoothAtRef.current = 0;
      trackMemoryRef.current = createTrackMemory();
      trackingStateRef.current = "acquiring";
      setStatusText(source === "live"
        ? "Pose tracking active · video and processing stay on this device."
        : `Fixture replay (${source}) · MediaPipe stays on this device.`);
    } catch {
      setStatusText("Could not switch video source.");
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (status !== "intro" && status !== "camera-error" && status !== "tracking-error") return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !garmentRendererRef.current) return;
    garmentRendererRef.current.rotateInspect(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y);
    dragRef.current = { x: event.clientX, y: event.clientY };
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds) garmentRendererRef.current.inspect(bounds.width, bounds.height);
  };

  const cameraMode = status === "active" || status === "starting";
  const showPlaceholder = status === "starting" || status === "camera-error" || status === "tracking-error" || modelError;
  return <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tryon-modal" role="dialog" aria-modal="true" aria-labelledby="tryon-title">
      <div className="tryon-modal-top"><div><p className="eyebrow"><span className="live-dot" /> GOODLUCH / LIVE PREVIEW</p><h2 id="tryon-title">See it <em>move.</em></h2></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close try-on"><CloseIcon /></button></div>
      <div className="tryon-workspace">
        <div className={`camera-stage ${cameraMode ? "is-camera-active" : "is-model-inspect"}`} ref={stageRef}>
          <video ref={videoRef} className="camera-video" playsInline muted aria-label="Mirrored live camera preview" />
          <canvas ref={garmentCanvasRef} className="camera-garment" aria-label="Interactive 3D garment model" />
          <canvas ref={overlayCanvasRef} className="camera-occlusion" aria-hidden="true" />
          {showPlaceholder && <div className="camera-placeholder"><strong>{modelError ? "3D model unavailable" : status === "starting" ? "Getting the camera ready" : "Preview paused"}</strong><p>{modelError ? "WebGL could not initialize in this browser." : statusText}</p></div>}
          <div className="camera-stage-top"><span>CAM / 01</span><span className={status === "active" ? "camera-live" : "camera-idle"}>{status === "active" ? "LIVE SIM" : status === "intro" ? "3D MODEL" : "STANDBY"}</span></div>
          {status === "active" ? <div className="camera-stage-bottom"><span>Move into frame · shoulders visible</span><span>{fps} FPS · inf {debugSnapshot.inferenceFps || "–"} / rnd {debugSnapshot.renderFps || "–"}</span></div> : status === "intro" && <div className="camera-stage-bottom"><span>DRAG TO ROTATE · CAMERA OFF</span><span>LOCAL 3D MESH</span></div>}
          {status === "active" && poseLost && <div className="pose-lost" role="status">Step back into frame · shoulders and hips need to be visible</div>}
          {assetFallbackBanner && <div className="tryon-asset-fallback" role="alert">{assetFallbackBanner}</div>}
          {status === "active" && (
            <div className="tryon-debug-controls">
              <button className="debug-toggle" aria-pressed={showPoseOverlay} onClick={() => setShowPoseOverlay((value) => !value)}>{showPoseOverlay ? "Hide pose" : "Show pose"}</button>
              <button className="debug-toggle" aria-pressed={debugPanelOpen} onClick={() => setDebugPanelOpen((value) => !value)}>{debugPanelOpen ? "Hide meter" : "Debug"}</button>
            </div>
          )}
          {debugPanelOpen && (
            <aside className="tryon-debug-panel" aria-label="Try-on debug metrics">
              <header>
                <strong>TRY-ON DEBUG</strong>
                <span>press D · ?tryonDebug=1</span>
              </header>
              <dl>
                <div><dt>inf FPS</dt><dd>{debugSnapshot.inferenceFps}</dd></div>
                <div><dt>rnd FPS</dt><dd>{debugSnapshot.renderFps}</dd></div>
                <div><dt>infer</dt><dd>{formatMs(debugSnapshot.inferenceMs)}</dd></div>
                <div><dt>comp</dt><dd>{formatMs(debugSnapshot.compositeMs)}</dd></div>
                <div><dt>render</dt><dd>{formatMs(debugSnapshot.renderMs)}</dd></div>
                <div><dt>pose age</dt><dd>{debugSnapshot.poseAgeMs < 0 ? "—" : formatMs(debugSnapshot.poseAgeMs)}</dd></div>
                <div><dt>delegate</dt><dd>{debugSnapshot.delegate}</dd></div>
                <div><dt>asset</dt><dd>{debugSnapshot.assetSource}</dd></div>
                <div><dt>track</dt><dd>{debugSnapshot.trackingState}</dd></div>
                <div><dt>hide</dt><dd>{debugSnapshot.hideReason}</dd></div>
              </dl>
              <p className="tryon-debug-joints">
                scale S {debugSnapshot.shoulderRatio.toFixed(2)} · T {debugSnapshot.torsoRatio.toFixed(2)} · arm {debugSnapshot.upperArmRatio.toFixed(2)}
              </p>
              {debugSnapshot.assetFallbackReason && (
                <p className="tryon-debug-fallback">fallback: {debugSnapshot.assetFallbackReason}</p>
              )}
              <p className="tryon-debug-joints">
                S {formatConf(debugSnapshot.joints.leftShoulder)}/{formatConf(debugSnapshot.joints.rightShoulder)}
                {" · "}E {formatConf(debugSnapshot.joints.leftElbow)}/{formatConf(debugSnapshot.joints.rightElbow)}
                {" · "}W {formatConf(debugSnapshot.joints.leftWrist)}/{formatConf(debugSnapshot.joints.rightWrist)}
                {" · "}H {formatConf(debugSnapshot.joints.leftHip)}/{formatConf(debugSnapshot.joints.rightHip)}
              </p>
              <label className="tryon-debug-skeleton">
                <input
                  type="checkbox"
                  checked={skeletonOnly}
                  onChange={(event) => setSkeletonOnly(event.target.checked)}
                />
                Skeleton only (hide garment mesh)
              </label>
              <label className="tryon-debug-source">
                Video source
                <select
                  value={videoSource}
                  onChange={(event) => { void switchVideoSource(event.target.value as TryOnVideoSource); }}
                >
                  <option value="live">Live camera</option>
                  <option value="target">Fixture target</option>
                  <option value="failed">Fixture failed</option>
                </select>
              </label>
              {debugSnapshot.anchorResiduals.length > 0 && (
                <p className="tryon-debug-residuals">
                  anchors{" "}
                  {debugSnapshot.anchorResiduals.map((item) => `${item.label}:${item.errorPx.toFixed(0)}px`).join(" · ")}
                </p>
              )}
            </aside>
          )}
          <canvas className="camera-pointer-catcher" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }} aria-hidden="true" />
        </div>
        <aside className="tryon-info"><p className="eyebrow">NOW PREVIEWING · LIVE 3D GARMENT PREVIEW · {tryOnAssetRef.current.coverage.toUpperCase()}</p><div className="tryon-product-thumb"><img src={product.images[0]} alt="" /></div><h3>{product.name}</h3><p className="tryon-visual-note">{CLAIM_NOTE} Local pose tracking places one 3D garment on your torso, with your head and hands in front. Frames never leave this device.</p><div className="tryon-steps"><div><span>01</span><p>Drag the model to inspect its volume before camera access.</p></div><div><span>02</span><p>Start camera only when ready; face forward and raise an arm.</p></div><div><span>03</span><p>Close the camera to stop its stream and return to the model.</p></div></div>
          {status === "intro" || status === "camera-error" || status === "tracking-error" ? <button className="button button-dark camera-start" onClick={startCamera} disabled={modelError}>{status === "intro" ? "Allow camera & start" : "Try again"}<span>↗</span></button> : <button className="button button-outline camera-start" disabled={status === "starting"} onClick={() => { stopCamera(); setVideoSource("live"); setStatus("intro"); setStatusText("Rotate the 3D model before starting the camera."); }}>{status === "active" ? "Stop camera" : "Starting…"}</button>}
          <p className="privacy-note">Camera starts only after your click. Frames stay in this browser and are never uploaded.</p>
        </aside>
      </div>
    </section>
  </div>;
}

function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
