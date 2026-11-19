"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import type { GarmentPose, PoseUpdateOptions, ScreenPoint, WorldPoint } from "@/lib/garment-3d";
import { resolveTryOnAsset, type TryOnResolved } from "@/lib/tryon-asset";
import { confidenceToOpacity } from "@/lib/tryon-body";
import { drawHandsMask, drawHeadMask, drawUpperBodyMask, type HeadPoints } from "@/lib/tryon-mask";
import { drawWarpedTexture, torsoQuadFromPose } from "@/lib/tryon-warp";

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
type GarmentRenderer = {
  inspect: (width: number, height: number) => void;
  rotateInspect: (deltaX: number, deltaY: number) => void;
  updatePose: (pose: GarmentPose | null, width: number, height: number, options?: PoseUpdateOptions) => void;
  resetInspect: () => void;
  dispose: () => void;
};

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const JOINTS = { leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24 } as const;
const HEAD_JOINTS = { nose: 0, leftEar: 7, rightEar: 8 } as const;
const pointKeys = Object.keys(JOINTS) as (keyof typeof JOINTS)[];
const CLAIM_NOTE = "Visual simulation only — not a size recommendation, not a fitting-room replacement, and not photoreal clothing swap.";

function coverRect(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return { scale, x: (width - sourceWidth * scale) / 2, y: (height - sourceHeight * scale) / 2 };
}

function drawMirroredCover(context: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const rect = coverRect(sourceWidth, sourceHeight, width, height);
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(source, rect.x, rect.y, sourceWidth * rect.scale, sourceHeight * rect.scale);
  context.restore();
}

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
  const [showDebug, setShowDebug] = useState(false);
  const [poseLost, setPoseLost] = useState(true);
  const [modelError, setModelError] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const garmentCanvasRef = useRef<HTMLCanvasElement>(null);
  const underlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const warpCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const upperMaskRef = useRef<HTMLCanvasElement | null>(null);
  const maskScratchRef = useRef<HTMLCanvasElement | null>(null);
  const zoneMaskRef = useRef<HTMLCanvasElement | null>(null);
  const tryOnAssetRef = useRef<TryOnResolved>(resolveTryOnAsset(product));
  const frontImageRef = useRef<HTMLImageElement | null>(null);
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
  const maskBlobUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  const qualityTier = (width: number) => {
    const narrow = width < 520 || (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
    const highDpr = typeof window !== "undefined" && (window.devicePixelRatio || 1) > 2;
    const lowFps = lastFpsRef.current > 0 && lastFpsRef.current < 18;
    const low = narrow || highDpr || lowFps;
    return {
      low,
      dpr: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
      maskEvery: low ? 3 : 2,
      garmentMaskEvery: low ? 6 : 4,
    };
  };

  const applyLayerOpacity = (opacity: number) => {
    const value = String(Math.max(0, Math.min(1, opacity)));
    underlayCanvasRef.current?.style.setProperty("opacity", value);
    warpCanvasRef.current?.style.setProperty("opacity", value);
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
    if (videoRef.current) videoRef.current.srcObject = null;
    for (const canvas of [underlayCanvasRef.current, warpCanvasRef.current, overlayCanvasRef.current]) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const garment = garmentCanvasRef.current;
    if (garment) {
      garment.style.removeProperty("mask-image");
      garment.style.removeProperty("-webkit-mask-image");
      garment.style.removeProperty("opacity");
    }
    underlayCanvasRef.current?.style.removeProperty("opacity");
    warpCanvasRef.current?.style.removeProperty("opacity");
    if (maskBlobUrlRef.current) {
      URL.revokeObjectURL(maskBlobUrlRef.current);
      maskBlobUrlRef.current = null;
    }
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
        const front = new Image();
        front.decoding = "async";
        front.src = asset.src;
        frontImageRef.current = front;
        renderer = await createGarment3DRenderer(canvas, {
          productName: product.name,
          color: product.colors[0]?.hex ?? "#171715",
          glbUrl: asset.glb,
          frontTextureUrl: asset.src,
          sleeveLength: asset.sleeveLength,
          anchors: asset.anchors,
        });
        if (!mounted) {
          renderer.dispose();
          return;
        }
        garmentRendererRef.current = renderer;
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
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toMirroredScreen = (landmark: Landmark, width: number, height: number, video: HTMLVideoElement): ScreenPoint => {
    const crop = coverRect(video.videoWidth, video.videoHeight, width, height);
    const rawX = crop.x + landmark.x * video.videoWidth * crop.scale;
    const rawY = crop.y + landmark.y * video.videoHeight * crop.scale;
    return { x: width - rawX, y: rawY, visibility: landmark.visibility };
  };

  /**
   * MediaPipe landmarks are in unmirrored camera space; the video element is CSS-mirrored.
   * Convert once into selfie-mirrored screen pixels for garment + occlusion.
   */
  const mapPose = (landmarks: Landmark[], world: Landmark[], width: number, height: number, video: HTMLVideoElement): { pose: GarmentPose; head: HeadPoints } => {
    const screen: Partial<Record<keyof typeof JOINTS, ScreenPoint>> = {};
    const worldPoints: Partial<Record<keyof typeof JOINTS, WorldPoint>> = {};
    for (const key of pointKeys) {
      const index = JOINTS[key];
      const landmark = landmarks[index];
      const worldPoint = world[index] ?? landmark;
      screen[key] = toMirroredScreen(landmark, width, height, video);
      worldPoints[key] = {
        x: -(worldPoint.x ?? 0),
        y: worldPoint.y ?? 0,
        z: worldPoint.z ?? 0,
        visibility: worldPoint.visibility,
      };
    }
    const head: HeadPoints = {
      nose: toMirroredScreen(landmarks[HEAD_JOINTS.nose] ?? landmarks[0], width, height, video),
      leftEar: toMirroredScreen(landmarks[HEAD_JOINTS.leftEar] ?? landmarks[0], width, height, video),
      rightEar: toMirroredScreen(landmarks[HEAD_JOINTS.rightEar] ?? landmarks[0], width, height, video),
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

  const paintUpperMask = (pose: GarmentPose, width: number, height: number) => {
    const mask = upperMaskRef.current ?? document.createElement("canvas");
    upperMaskRef.current = mask;
    const dpr = 1;
    syncCanvasSize(mask, width, height, dpr);
    const ctx = mask.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.filter = "blur(3px)";
    drawUpperBodyMask(ctx, pose, width, height);
    ctx.filter = "none";
    return mask;
  };

  const drawComposite = (result: PoseResult, pose: GarmentPose | null, head: HeadPoints | null, width: number, height: number, video: HTMLVideoElement, frameNumber: number, confidence: number) => {
    const underlay = underlayCanvasRef.current;
    const warp = warpCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const garment = garmentCanvasRef.current;
    const underCtx = underlay?.getContext("2d");
    const warpCtx = warp?.getContext("2d");
    const overCtx = overlay?.getContext("2d");
    if (!underlay || !overlay || !underCtx || !overCtx) return;

    const quality = qualityTier(width);
    const dpr = quality.dpr;
    syncCanvasSize(underlay, width, height, dpr);
    if (warp && warpCtx) syncCanvasSize(warp, width, height, dpr);
    syncCanvasSize(overlay, width, height, dpr);
    underCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (warpCtx) warpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    underCtx.clearRect(0, 0, width, height);
    overCtx.clearRect(0, 0, width, height);

    const layerOpacity = confidenceToOpacity(confidence);
    applyLayerOpacity(layerOpacity);

    if (!pose || layerOpacity < 0.04) {
      warpCtx?.clearRect(0, 0, width, height);
      if (garment) {
        garment.style.removeProperty("mask-image");
        garment.style.removeProperty("-webkit-mask-image");
      }
      return;
    }

    const updateMask = frameNumber % quality.maskEvery === 0;
    const updateGarmentMask = frameNumber % quality.garmentMaskEvery === 0;
    const upperMask = updateMask ? paintUpperMask(pose, width, height) : upperMaskRef.current;
    const seg = result.segmentationMasks?.[0];
    const scratch = maskScratchRef.current ?? document.createElement("canvas");
    maskScratchRef.current = scratch;
    const personMask = seg ? maskCanvas(seg, scratch) : null;

    // 1) Soft-darken shirt area under the garment (person ∩ upper body).
    if (upperMask && personMask) {
      underCtx.save();
      drawMirroredCover(underCtx, video, video.videoWidth, video.videoHeight, width, height);
      underCtx.globalCompositeOperation = "destination-in";
      drawMirroredCover(underCtx, personMask, seg!.width, seg!.height, width, height);
      underCtx.globalCompositeOperation = "destination-in";
      underCtx.drawImage(upperMask, 0, 0, width, height);
      underCtx.globalCompositeOperation = "source-atop";
      underCtx.fillStyle = "rgba(12, 12, 11, 0.72)";
      underCtx.fillRect(0, 0, width, height);
      underCtx.restore();
    } else if (upperMask) {
      underCtx.fillStyle = "rgba(12, 12, 11, 0.55)";
      underCtx.drawImage(upperMask, 0, 0, width, height);
      underCtx.globalCompositeOperation = "source-in";
      underCtx.fillRect(0, 0, width, height);
      underCtx.globalCompositeOperation = "source-over";
    }

    // 1b) Local 2.5D warp of front texture onto torso quad (never uploads frames).
    const front = frontImageRef.current;
    if (warpCtx && front && front.complete && (front.naturalWidth > 0 || front.width > 0)) {
      warpCtx.clearRect(0, 0, width, height);
      warpCtx.save();
      const quad = torsoQuadFromPose(pose, height);
      drawWarpedTexture(warpCtx, front, quad, 0.85, quality.low ? 6 : 10);
      if (personMask && seg) {
        warpCtx.globalCompositeOperation = "destination-in";
        drawMirroredCover(warpCtx, personMask, seg.width, seg.height, width, height);
      }
      if (upperMask) {
        warpCtx.globalCompositeOperation = "destination-in";
        warpCtx.drawImage(upperMask, 0, 0, width, height);
      }
      warpCtx.restore();
    }

    // 2) Clip garment to upper body (refresh blob URL sparingly for mobile FPS).
    if (garment && upperMask && updateGarmentMask) {
      upperMask.toBlob((blob) => {
        if (!blob || !garmentCanvasRef.current) return;
        if (maskBlobUrlRef.current) URL.revokeObjectURL(maskBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        maskBlobUrlRef.current = url;
        const el = garmentCanvasRef.current;
        el.style.setProperty("mask-image", `url(${url})`);
        el.style.setProperty("-webkit-mask-image", `url(${url})`);
        el.style.setProperty("mask-size", "100% 100%");
        el.style.setProperty("-webkit-mask-size", "100% 100%");
        el.style.setProperty("mask-mode", "alpha");
      }, "image/webp", quality.low ? 0.55 : 0.7);
    }

    // 3) Redraw head + hands from the live video above the garment.
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

    if (showDebugRef.current) {
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
    if (video.currentTime !== lastTimeRef.current) {
      lastTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, now);
      const landmarks = result.landmarks?.[0];
      const world = result.worldLandmarks?.[0] ?? landmarks;
      let pose: GarmentPose | null = null;
      let head: HeadPoints | null = null;
      let confidence = 0;
      if (landmarks && world && landmarks.length > 24 && world.length > 24) {
        const torsoIndices = [JOINTS.leftShoulder, JOINTS.rightShoulder, JOINTS.leftHip, JOINTS.rightHip];
        confidence = Math.min(...torsoIndices.map((index) => landmarks[index].visibility ?? 1));
        if (confidence > 0.18) {
          const mapped = mapPose(landmarks, world, bounds.width, bounds.height, video);
          pose = mapped.pose;
          head = mapped.head;
        }
      }
      const previous = smoothedPoseRef.current;
      const previousHead = smoothedHeadRef.current;
      // Visibility-weighted EMA: low-confidence joints move slower to avoid floaty mesh.
      const baseAlpha = previous && pose ? 0.2 : 1;
      if (pose && previous) {
        for (const key of pointKeys) {
          const currentPoint = pose[key];
          const oldPoint = previous[key];
          const vis = currentPoint.visibility ?? 1;
          const alpha = baseAlpha * Math.max(0.2, Math.min(1, vis));
          currentPoint.x = oldPoint.x + (currentPoint.x - oldPoint.x) * alpha;
          currentPoint.y = oldPoint.y + (currentPoint.y - oldPoint.y) * alpha;
          currentPoint.visibility = vis;
          const currentWorld = pose.world[key];
          const oldWorld = previous.world[key];
          const wVis = currentWorld.visibility ?? vis;
          const wAlpha = baseAlpha * Math.max(0.2, Math.min(1, wVis));
          currentWorld.x = oldWorld.x + (currentWorld.x - oldWorld.x) * wAlpha;
          currentWorld.y = oldWorld.y + (currentWorld.y - oldWorld.y) * wAlpha;
          currentWorld.z = oldWorld.z + (currentWorld.z - oldWorld.z) * wAlpha;
        }
      }
      if (head && previousHead) {
        for (const key of Object.keys(head) as (keyof HeadPoints)[]) {
          const vis = head[key].visibility ?? 1;
          const alpha = baseAlpha * Math.max(0.2, Math.min(1, vis));
          head[key].x = previousHead[key].x + (head[key].x - previousHead[key].x) * alpha;
          head[key].y = previousHead[key].y + (head[key].y - previousHead[key].y) * alpha;
        }
      }
      // Smooth confidence so opacity fades instead of blinking.
      poseConfidenceRef.current = pose
        ? poseConfidenceRef.current * 0.65 + confidence * 0.35
        : poseConfidenceRef.current * 0.75;
      smoothedPoseRef.current = pose;
      smoothedHeadRef.current = head;
      setPoseLost(poseConfidenceRef.current < 0.28);
      drawComposite(result, pose, head, bounds.width, bounds.height, video, fpsCountRef.current.frames, poseConfidenceRef.current);
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
    renderer.updatePose(smoothedPoseRef.current, bounds.width, bounds.height, {
      head: smoothedHeadRef.current,
      confidence: poseConfidenceRef.current,
      anchors: tryOnAssetRef.current.anchors,
    });
    frameRef.current = requestAnimationFrame(renderFrame);
  };

  const startCamera = async () => {
    setStatus("starting");
    setStatusText("Starting camera and loading pose tracking…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");
      // Privacy: frames stay on-device; constraints must match TRYON_CAMERA_CONSTRAINTS / tests.
      const stream = await navigator.mediaDevices.getUserMedia(TRYON_CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview unavailable");
      video.srcObject = stream;
      await video.play();
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      try {
        landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
        });
      } catch {
        landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
        });
      }
      smoothedPoseRef.current = null;
      setPoseLost(true);
      fpsCountRef.current = { frames: 0, start: performance.now() };
      setStatus("active");
      setStatusText("Pose tracking active · video and processing stay on this device.");
      renderFrame();
    } catch (error) {
      const cameraStarted = Boolean(streamRef.current);
      stopCamera();
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (cameraStarted && (message.includes("mediapipe") || message.includes("fetch") || message.includes("wasm") || message.includes("model"))) {
        setStatus("tracking-error");
        setStatusText("Pose model could not load. The 3D model remains available to inspect.");
      } else {
        setStatus("camera-error");
        setStatusText("Camera permission was denied or no camera is available. The 3D model remains available to inspect.");
      }
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
          <canvas ref={underlayCanvasRef} className="camera-underlay" aria-hidden="true" />
          <canvas ref={warpCanvasRef} className="camera-warp" aria-hidden="true" />
          <canvas ref={garmentCanvasRef} className="camera-garment" aria-label="Interactive 3D garment model" />
          <canvas ref={overlayCanvasRef} className="camera-occlusion" aria-hidden="true" />
          {showPlaceholder && <div className="camera-placeholder"><strong>{modelError ? "3D model unavailable" : status === "starting" ? "Getting the camera ready" : "Preview paused"}</strong><p>{modelError ? "WebGL could not initialize in this browser." : statusText}</p></div>}
          <div className="camera-stage-top"><span>CAM / 01</span><span className={status === "active" ? "camera-live" : "camera-idle"}>{status === "active" ? "LIVE SIM" : status === "intro" ? "3D MODEL" : "STANDBY"}</span></div>
          {status === "active" ? <div className="camera-stage-bottom"><span>Move into frame · shoulders visible</span><span>{fps} FPS</span></div> : status === "intro" && <div className="camera-stage-bottom"><span>DRAG TO ROTATE · CAMERA OFF</span><span>LOCAL 3D MESH</span></div>}
          {status === "active" && poseLost && <div className="pose-lost" role="status">Step back into frame · shoulders and hips need to be visible</div>}
          {status === "active" && <button className="debug-toggle" aria-pressed={showDebug} onClick={() => setShowDebug((value) => !value)}>{showDebug ? "Hide pose" : "Show pose"}</button>}
          <canvas className="camera-pointer-catcher" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }} aria-hidden="true" />
        </div>
        <aside className="tryon-info"><p className="eyebrow">NOW PREVIEWING · VISUAL SIMULATION · {tryOnAssetRef.current.coverage.toUpperCase()}</p><div className="tryon-product-thumb"><img src={product.images[0]} alt="" /></div><h3>{product.name}</h3><p className="tryon-visual-note">{CLAIM_NOTE} Local pose tracking dims your shirt, warps the front texture onto your torso, and keeps head/hands in front. Frames never leave this device.</p><div className="tryon-steps"><div><span>01</span><p>Drag the model to inspect its volume before camera access.</p></div><div><span>02</span><p>Start camera only when ready; face forward and raise an arm.</p></div><div><span>03</span><p>Close the camera to stop its stream and return to the model.</p></div></div>
          {status === "intro" || status === "camera-error" || status === "tracking-error" ? <button className="button button-dark camera-start" onClick={startCamera} disabled={modelError}>{status === "intro" ? "Allow camera & start" : "Try again"}<span>↗</span></button> : <button className="button button-outline camera-start" disabled={status === "starting"} onClick={() => { stopCamera(); setStatus("intro"); setStatusText("Rotate the 3D model before starting the camera."); }}>{status === "active" ? "Stop camera" : "Starting…"}</button>}
          <p className="privacy-note">Camera starts only after your click. Frames stay in this browser and are never uploaded.</p>
        </aside>
      </div>
    </section>
  </div>;
}

function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
