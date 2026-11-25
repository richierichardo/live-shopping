import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GARMENT_RIG } from "./garment-rig";
import {
  applySolidGarmentColor,
  assignGarmentMap,
  buildGarment,
  makeBodyTexture,
  makeSleeveTexture,
  type BoneMap,
  type BuiltGarment,
} from "./garment-mesh";
import {
  captureArmLengthBind,
  createArmSolverMemory,
  resetArmSolverMemory,
  residualsFromScreenJoints,
  solveArmChain,
  type ArmSolverMemory,
} from "./arm-solver";
import { buildModelAnchors, computeAnchorFit, type AnchorResidual, type ModelAnchorPoints } from "./tryon-anchors";
import { measureBodyProxy } from "./tryon-body";
import type { HeadPoints } from "./tryon-mask";
import type { DebugScreenJoint, SegmentLengthReport, TryOnAssetSource, TryOnHideReason } from "./tryon-debug";
import {
  createHeldProjection,
  createTryOnCamera,
  PERSPECTIVE_CAMERA_LABEL,
  armJointPlaneZ,
  perspectiveShoulderPlacement,
  projectWorldToStage,
  resizeTryOnCamera,
  screenPointToRootLocal,
  stageToWorldOnPlane,
  torsoPlaneHeight,
  TORSO_PLANE_DISTANCE,
  trackedGroupYaw,
} from "./tryon-camera";
import {
  buildBodyFrame,
  orthoToStage,
  stageToOrtho,
  type Vec3,
} from "./tryon-coords";
import type { TrackingState } from "./tryon-track";

export { GARMENT_RIG } from "./garment-rig";
export { stageToOrtho, orthoToStage, buildBodyFrame } from "./tryon-coords";

export type GarmentAssetInfo = {
  source: TryOnAssetSource;
  fallbackReason: string | null;
  requestedGlbUrl: string | null;
};

export type GarmentDebugFrame = {
  hideReason: TryOnHideReason;
  lastRenderMs: number;
  modelJoints: DebugScreenJoint[];
  asset: GarmentAssetInfo;
  anchorResiduals: AnchorResidual[];
  modelAnchors: ModelAnchorPoints | null;
  segmentLengths: SegmentLengthReport;
  cameraProjection: string;
};

export type ScreenPoint = { x: number; y: number; visibility?: number };
export type WorldPoint = { x: number; y: number; z: number; visibility?: number };
export type GarmentPose = {
  leftShoulder: ScreenPoint;
  rightShoulder: ScreenPoint;
  leftElbow: ScreenPoint;
  rightElbow: ScreenPoint;
  leftWrist: ScreenPoint;
  rightWrist: ScreenPoint;
  leftHip: ScreenPoint;
  rightHip: ScreenPoint;
  world: {
    leftShoulder: WorldPoint;
    rightShoulder: WorldPoint;
    leftElbow: WorldPoint;
    rightElbow: WorldPoint;
    leftWrist: WorldPoint;
    rightWrist: WorldPoint;
    leftHip: WorldPoint;
    rightHip: WorldPoint;
  };
};

export type GarmentRendererOptions = {
  productName: string;
  color?: string;
  glbUrl?: string;
  sleeveLength?: "long" | "short";
  anchors?: { shoulderWidth: number; torsoHeight: number; hemY: number };
};

export type PoseUpdateOptions = {
  head?: HeadPoints | null;
  /** 0–1 torso visibility; drives material opacity when pose is weak. */
  confidence?: number;
  anchors?: { shoulderWidth: number; torsoHeight: number; hemY: number } | null;
  /** Hide skinned meshes; keep bone transforms for skeleton-only debug. */
  skeletonOnly?: boolean;
  /** Diagnostic milestone: hide the garment mesh while landmarks are the working view. */
  hideGarment?: boolean;
  /** Relative arm-length scales from proportion calibration. 1 = bind length. */
  segmentScales?: { upperL: number; upperR: number; forearmL: number; forearmR: number };
  /** Seconds since the previous pose update, for time-based slerp. */
  dtSeconds?: number;
  trackingState?: TrackingState;
};

export type Garment3DRenderer = {
  inspect: (width: number, height: number) => void;
  rotateInspect: (deltaX: number, deltaY: number) => void;
  updatePose: (pose: GarmentPose | null, width: number, height: number, options?: PoseUpdateOptions) => void;
  resetInspect: () => void;
  dispose: () => void;
  getAssetInfo: () => GarmentAssetInfo;
  getDebugFrame: () => GarmentDebugFrame;
  setSkeletonOnly: (enabled: boolean) => void;
  setHideGarment: (enabled: boolean) => void;
};

function emptySegmentLengths(): SegmentLengthReport {
  return {
    upperL: { target: 0, actual: 0 },
    upperR: { target: 0, actual: 0 },
    forearmL: { target: 0, actual: 0 },
    forearmR: { target: 0, actual: 0 },
  };
}

/** GLTFExporter strips dots from node names (`shoulder.L` → `shoulderL`). Restore contract names. */
function normalizeBoneNames(root: THREE.Object3D) {
  const rigNames = GARMENT_RIG.bones as readonly string[];
  root.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    if (rigNames.includes(object.name)) return;
    const match = /^(.*)([LR])$/.exec(object.name);
    if (!match) return;
    const dotted = `${match[1]}.${match[2]}`;
    if (rigNames.includes(dotted)) object.name = dotted;
  });
}

function collectBones(root: THREE.Object3D): BoneMap {
  const bones: BoneMap = new Map();
  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      const name = object.name as (typeof GARMENT_RIG.bones)[number];
      if ((GARMENT_RIG.bones as readonly string[]).includes(object.name)) {
        bones.set(name, object);
      }
    }
  });
  return bones;
}

function garmentFromProcedural(
  productName: string,
  color: string,
  sleeveLength: "long" | "short" = "long",
): BuiltGarment {
  return buildGarment(productName, color, { sleeveLength });
}

async function garmentFromGlb(
  url: string,
  productName: string,
  color: string,
): Promise<BuiltGarment> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.name = "garment_root";
  normalizeBoneNames(root);

  const bones = collectBones(root);
  for (const name of GARMENT_RIG.bones) {
    if (!bones.has(name)) {
      throw new Error(`GLB missing required bone: ${name}`);
    }
  }

  const meshes: THREE.SkinnedMesh[] = [];
  const textures: THREE.Texture[] = [];
  let collar: THREE.Mesh | null = null;

  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      meshes.push(object);
      object.frustumCulled = false;
    } else if (object instanceof THREE.Mesh && object.name === "collar") {
      collar = object;
    }
  });

  if (meshes.length === 0) throw new Error("GLB has no SkinnedMesh");

  const paintedTorso = makeBodyTexture(productName, color);
  const sleeveMap = makeSleeveTexture(color);
  textures.push(paintedTorso, sleeveMap);
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    const previous = material.map;
    const map = mesh.name.toLowerCase().includes("sleeve") ? sleeveMap : paintedTorso;
    assignGarmentMap(material, map);
    if (previous && previous !== map) previous.dispose();
  }

  // Re-bind every skinned mesh to one shared skeleton built from contract bones.
  root.updateMatrixWorld(true);
  const orderedBones = GARMENT_RIG.bones.map((name) => bones.get(name)!);
  const skeleton = new THREE.Skeleton(orderedBones);
  for (const mesh of meshes) {
    mesh.bind(skeleton);
    mesh.normalizeSkinWeights();
  }

  if (!collar) {
    collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.125, 0.02, 12, 48),
      new THREE.MeshStandardMaterial({ color, roughness: 0.88, side: THREE.DoubleSide }),
    );
    collar.name = "collar";
  }
  if (collar.material instanceof THREE.MeshStandardMaterial) {
    applySolidGarmentColor(collar.material, color);
  }
  const neck = bones.get("neck");
  if (neck && collar.parent !== neck) {
    neck.add(collar);
    collar.position.set(0, 0.07, 0);
    collar.rotation.x = Math.PI / 2;
  }

  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  return { root, bones, skeleton, meshes, textures, collar };
}

/**
 * Image-plane helper for roll and lean. The live skeleton is projected with the perspective camera.
 */
export function screenToWorld(screenX: number, screenY: number, width: number, height: number, z: number) {
  const point = stageToOrtho(screenX, screenY, width, height, z);
  return new THREE.Vector3(point.x, point.y, point.z);
}

/** Orthographic XY map. Perspective joints use projectWorldToStage. */
export function worldToScreen(worldX: number, worldY: number, width: number, height: number) {
  return orthoToStage(worldX, worldY, width, height);
}

function toVec3(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

const MODEL_DEBUG_BONES = [
  "pelvis",
  "spine",
  "chest",
  "neck",
  "shoulder.L",
  "upper_arm.L",
  "forearm.L",
  "shoulder.R",
  "upper_arm.R",
  "forearm.R",
] as const;

export async function createGarment3DRenderer(
  canvas: HTMLCanvasElement,
  options: GarmentRendererOptions | string,
  legacyColor = "#171715",
): Promise<Garment3DRenderer> {
  const resolved = typeof options === "string"
    ? { productName: options, color: legacyColor }
    : options;
  const productName = resolved.productName;
  const color = resolved.color ?? "#171715";
  const glbUrl = resolved.glbUrl;
  const sleeveLength = resolved.sleeveLength ?? "long";
  const assetAnchors = resolved.anchors ?? null;
  // Torso and sleeves use the local canvas print. The collar stays a solid product color. Catalog photos stay on the product page.

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = createTryOnCamera(1, 1);
  scene.add(new THREE.HemisphereLight(0xfff7e8, 0x34332f, 2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
  keyLight.position.set(-1.2, 2.4, 3.2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xd4c39c, 1.55);
  fillLight.position.set(2.2, -0.6, 2.4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
  rimLight.position.set(0, 1.5, -2.5);
  scene.add(rimLight);

  let assetInfo: GarmentAssetInfo = {
    source: "procedural",
    fallbackReason: glbUrl ? null : "no_glb_requested",
    requestedGlbUrl: glbUrl ?? null,
  };
  let garment: BuiltGarment;
  if (glbUrl) {
    try {
      garment = await garmentFromGlb(glbUrl, productName, color);
      assetInfo = { source: "glb", fallbackReason: null, requestedGlbUrl: glbUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : "glb_load_failed";
      assetInfo = {
        source: "procedural",
        fallbackReason: message,
        requestedGlbUrl: glbUrl,
      };
      garment = garmentFromProcedural(productName, color, sleeveLength);
    }
  } else {
    garment = garmentFromProcedural(productName, color, sleeveLength);
  }

  const garmentGroup = new THREE.Group();
  garmentGroup.add(garment.root);
  scene.add(garmentGroup);

  let viewport = { width: 0, height: 0 };
  let inspectRotation = { x: -0.04, y: -0.32 };
  let disposed = false;
  let skeletonOnly = false;
  let hideGarment = false;
  let hideReason: TryOnHideReason = "inactive";
  let lastRenderMs = 0;
  let modelJoints: DebugScreenJoint[] = [];
  let anchorResiduals: AnchorResidual[] = [];
  let segmentLengths = emptySegmentLengths();
  const armMemory: Record<"L" | "R", ArmSolverMemory> = {
    L: createArmSolverMemory(),
    R: createArmSolverMemory(),
  };
  const wristWorld = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  let wristsReady = false;
  const _jointWorld = new THREE.Vector3();
  const heldProjection = createHeldProjection();
  type HeldBonePose = { position: THREE.Vector3; quaternion: THREE.Quaternion };
  type HeldPose = {
    groupPosition: THREE.Vector3;
    groupQuaternion: THREE.Quaternion;
    groupScale: number;
    rootPosition: THREE.Vector3;
    bones: Map<(typeof GARMENT_RIG.bones)[number], HeldBonePose>;
    wristL: THREE.Vector3;
    wristR: THREE.Vector3;
    wristsReady: boolean;
  };
  let heldPose: HeldPose | null = null;

  const captureHeldPose = () => {
    const bones: HeldPose["bones"] = new Map();
    for (const name of GARMENT_RIG.bones) {
      const bone = garment.bones.get(name);
      if (!bone) continue;
      bones.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    }
    heldPose = {
      groupPosition: garmentGroup.position.clone(),
      groupQuaternion: garmentGroup.quaternion.clone(),
      groupScale: garmentGroup.scale.x,
      rootPosition: garment.root.position.clone(),
      bones,
      wristL: wristWorld.L.clone(),
      wristR: wristWorld.R.clone(),
      wristsReady,
    };
  };

  const restoreHeldPose = () => {
    if (!heldPose) return false;
    garmentGroup.visible = true;
    garmentGroup.position.copy(heldPose.groupPosition);
    garmentGroup.quaternion.copy(heldPose.groupQuaternion);
    garmentGroup.scale.setScalar(heldPose.groupScale);
    garment.root.position.copy(heldPose.rootPosition);
    for (const [name, saved] of heldPose.bones) {
      const bone = garment.bones.get(name);
      if (!bone) continue;
      bone.position.copy(saved.position);
      bone.quaternion.copy(saved.quaternion);
      bone.scale.set(1, 1, 1);
    }
    wristWorld.L.copy(heldPose.wristL);
    wristWorld.R.copy(heldPose.wristR);
    wristsReady = heldPose.wristsReady;
    garmentGroup.updateMatrixWorld(true);
    return true;
  };

  const releaseHeldPose = () => {
    heldPose = null;
    heldProjection.clear();
  };

  const clearArmDiagnostics = (resetMemory: boolean) => {
    anchorResiduals = [];
    segmentLengths = emptySegmentLengths();
    wristsReady = false;
    if (!resetMemory) return;
    resetArmSolverMemory(armMemory.L);
    resetArmSolverMemory(armMemory.R);
  };

  const applySkeletonOnlyVisibility = () => {
    const showMesh = !skeletonOnly && !hideGarment;
    for (const mesh of garment.meshes) {
      mesh.visible = showMesh;
    }
    garment.collar.visible = showMesh;
  };

  const collectModelJoints = (width: number, height: number) => {
    garment.root.updateMatrixWorld(true);
    const next: DebugScreenJoint[] = [];
    for (const name of MODEL_DEBUG_BONES) {
      const bone = garment.bones.get(name);
      if (!bone) continue;
      bone.getWorldPosition(_jointWorld);
      const screen = projectWorldToStage(camera, toVec3(_jointWorld), width, height);
      next.push({ x: screen.x, y: screen.y, label: name, kind: "model" });
    }
    if (wristsReady) {
      for (const side of ["L", "R"] as const) {
        const screen = projectWorldToStage(camera, toVec3(wristWorld[side]), width, height);
        next.push({ x: screen.x, y: screen.y, label: `wrist.${side}`, kind: "model" });
      }
    }
    modelJoints = next;
  };

  const finishRender = (width: number, height: number, reason: TryOnHideReason) => {
    const started = performance.now();
    applySkeletonOnlyVisibility();
    if (garmentGroup.visible) collectModelJoints(width, height);
    else modelJoints = [];
    if (reason === "none") {
      captureHeldPose();
      heldProjection.accept(
        modelJoints.map((joint) => ({ label: joint.label, x: joint.x, y: joint.y })),
        performance.now(),
      );
    }
    renderer.render(scene, camera);
    lastRenderMs = performance.now() - started;
    hideReason = reason;
  };

  const holdOrHide = (width: number, height: number, reason: TryOnHideReason) => {
    const projected = heldProjection.project(performance.now());
    if (!projected || !restoreHeldPose()) {
      garmentGroup.visible = false;
      clearArmDiagnostics(false);
      finishRender(width, height, reason);
      return;
    }
    finishRender(width, height, "pose_held");
    modelJoints = projected.joints.map((joint) => ({
      x: joint.x,
      y: joint.y,
      label: joint.label,
      kind: "model" as const,
    }));
  };

  const resize = (width: number, height: number) => {
    if (disposed || width < 1 || height < 1) return;
    if (width === viewport.width && height === viewport.height) return;
    viewport = { width, height };
    resizeTryOnCamera(camera, width, height);
    renderer.setSize(width, height, false);
  };

  const inspect = (width: number, height: number) => {
    resize(width, height);
    releaseHeldPose();
    hideGarment = false;
    garmentGroup.visible = true;
    garmentGroup.position.set(0, 0, -TORSO_PLANE_DISTANCE);
    garmentGroup.scale.setScalar(torsoPlaneHeight() / 1.85);
    garmentGroup.rotation.set(inspectRotation.x, inspectRotation.y, 0);
    finishRender(width, height, "inactive");
  };

  const rotateInspect = (deltaX: number, deltaY: number) => {
    inspectRotation = {
      x: THREE.MathUtils.clamp(inspectRotation.x + deltaY * 0.008, -0.42, 0.42),
      y: inspectRotation.y + deltaX * 0.008,
    };
  };

  const bindPositions = new Map<THREE.Bone, THREE.Vector3>();
  const bindArmQuats = new Map<string, THREE.Quaternion>();
  for (const bone of garment.bones.values()) {
    bindPositions.set(bone, bone.position.clone());
    bindArmQuats.set(bone.name, bone.quaternion.clone());
  }
  const armLengthBind = {
    L: captureArmLengthBind(garment.bones.get("forearm.L")!),
    R: captureArmLengthBind(garment.bones.get("forearm.R")!),
  };

  // Bind-pose joints in root space — arm IK + explicit anchors for screen fitting.
  garment.root.updateMatrixWorld(true);
  const rootLocal = (boneName: (typeof GARMENT_RIG.bones)[number]) =>
    toVec3(garment.root.worldToLocal(garment.bones.get(boneName)!.getWorldPosition(new THREE.Vector3())));

  const forearmRestTip = (side: "L" | "R") => {
    const upper = garment.bones.get(`upper_arm.${side}`)!;
    const forearm = garment.bones.get(`forearm.${side}`)!;
    const dirParent = forearm.position.clone();
    const len = Math.max(dirParent.length(), 0.2);
    const elbowWorld = forearm.getWorldPosition(new THREE.Vector3());
    const worldDir = dirParent.normalize();
    worldDir.transformDirection(upper.matrixWorld);
    const tip = elbowWorld.add(worldDir.multiplyScalar(len));
    return toVec3(garment.root.worldToLocal(tip));
  };

  const hemY = assetAnchors?.hemY ?? -0.52;
  const modelAnchors = buildModelAnchors({
    shoulderL: rootLocal("shoulder.L"),
    shoulderR: rootLocal("shoulder.R"),
    elbowL: rootLocal("forearm.L"),
    elbowR: rootLocal("forearm.R"),
    wristL: forearmRestTip("L"),
    wristR: forearmRestTip("R"),
    pelvis: rootLocal("pelvis"),
    neck: rootLocal("neck"),
    hemY,
  });
  modelAnchors.upperArmLengthL = armLengthBind.L.upperLength;
  modelAnchors.upperArmLengthR = armLengthBind.R.upperLength;
  modelAnchors.forearmLengthL = armLengthBind.L.forearmLength;
  modelAnchors.forearmLengthR = armLengthBind.R.forearmLength;

  const resetBones = () => {
    for (const bone of garment.bones.values()) {
      bone.position.copy(bindPositions.get(bone)!);
      bone.quaternion.identity();
      bone.scale.set(1, 1, 1);
    }
  };

  const updatePose = (pose: GarmentPose | null, width: number, height: number, options?: PoseUpdateOptions) => {
    resize(width, height);
    if (typeof options?.skeletonOnly === "boolean") {
      skeletonOnly = options.skeletonOnly;
    }
    if (typeof options?.hideGarment === "boolean") {
      hideGarment = options.hideGarment;
    }
    if (options?.trackingState === "lost") {
      holdOrHide(width, height, "tracking_lost");
      return;
    }
    if (!pose) {
      holdOrHide(width, height, "null_pose");
      return;
    }

    const head = options?.head ?? null;
    const resolvedAnchors = options?.anchors ?? assetAnchors;
    const proxy = measureBodyProxy(pose, head, width, height, {
      shoulderWidth: modelAnchors.shoulderWidth,
      torsoHeight: modelAnchors.torsoHeight,
      hemY: resolvedAnchors?.hemY ?? hemY,
    });
    const confidence = options?.confidence ?? proxy?.poseConfidence ?? 0;
    // Soft fade is applied via CSS on the canvas; hide only when tracking is unusable.
    if (!proxy) {
      holdOrHide(width, height, "calibration_failed");
      return;
    }
    if (confidence < 0.18) {
      holdOrHide(width, height, "low_confidence");
      return;
    }

    const bodyFrame = buildBodyFrame(pose);
    const fit = computeAnchorFit(pose, modelAnchors, width, height, 0);
    if (!fit || !bodyFrame) {
      holdOrHide(width, height, "calibration_failed");
      return;
    }

    const leftShoulder = screenToWorld(pose.leftShoulder.x, pose.leftShoulder.y, width, height, 0);
    const rightShoulder = screenToWorld(pose.rightShoulder.x, pose.rightShoulder.y, width, height, 0);
    const leftHip = screenToWorld(pose.leftHip.x, pose.leftHip.y, width, height, 0);
    const rightHip = screenToWorld(pose.rightHip.x, pose.rightHip.y, width, height, 0);

    const shoulderMid = leftShoulder.clone().add(rightShoulder).multiplyScalar(0.5);
    const hipMid = leftHip.clone().add(rightHip).multiplyScalar(0.5);

    resetBones();
    const segments = options?.segmentScales ?? { upperL: 1, upperR: 1, forearmL: 1, forearmR: 1 };
    const shoulderSpanPx = Math.hypot(pose.rightShoulder.x - pose.leftShoulder.x, pose.rightShoulder.y - pose.leftShoulder.y);
    const placement = perspectiveShoulderPlacement({
      camera,
      stageWidth: width,
      stageHeight: height,
      shoulderMidX: (pose.leftShoulder.x + pose.rightShoulder.x) * 0.5,
      shoulderMidY: (pose.leftShoulder.y + pose.rightShoulder.y) * 0.5,
      shoulderSpanPx,
      modelShoulderWidth: modelAnchors.shoulderWidth,
      shoulderLocal: {
        x: (modelAnchors.shoulderL.x + modelAnchors.shoulderR.x) * 0.5 + fit.rootOffset.x,
        y: (modelAnchors.shoulderL.y + modelAnchors.shoulderR.y) * 0.5 + fit.rootOffset.y,
        z: (modelAnchors.shoulderL.z + modelAnchors.shoulderR.z) * 0.5 + fit.rootOffset.z,
      },
    });
    const shoulderRoll = Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x);
    const torsoLean = Math.atan2(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
    const yaw = trackedGroupYaw(pose.world.leftShoulder.z, pose.world.rightShoulder.z);

    garmentGroup.visible = true;
    garmentGroup.position.set(placement.position.x, placement.position.y, placement.position.z);
    garmentGroup.scale.setScalar(placement.scale);
    garmentGroup.rotation.set(0, yaw, THREE.MathUtils.clamp(shoulderRoll * 0.85 + torsoLean * 0.2, -0.4, 0.4));
    garment.root.position.set(fit.rootOffset.x, fit.rootOffset.y, fit.rootOffset.z);
    garmentGroup.updateMatrixWorld(true);

    const invQuat = garmentGroup.quaternion.clone().invert();
    const toLocal = (point: THREE.Vector3) => {
      const local = point.clone().sub(garmentGroup.position).applyQuaternion(invQuat);
      local.divideScalar(placement.scale);
      return local;
    };

    const neckWorld = stageToWorldOnPlane(
      camera,
      proxy.neckAnchor.x,
      proxy.neckAnchor.y,
      width,
      height,
      placement.position.z,
    );
    const localNeck = toLocal(new THREE.Vector3(neckWorld.x, neckWorld.y, neckWorld.z));

    const shoulderWorldZ = (pose.world.leftShoulder.z + pose.world.rightShoulder.z) * 0.5;
    const worldShoulderMeters = Math.hypot(
      pose.world.rightShoulder.x - pose.world.leftShoulder.x,
      pose.world.rightShoulder.y - pose.world.leftShoulder.y,
      pose.world.rightShoulder.z - pose.world.leftShoulder.z,
    );
    const rootOffset = { x: garment.root.position.x, y: garment.root.position.y, z: garment.root.position.z };
    const screenJoint = (screenX: number, screenY: number, jointWorldZ: number) => {
      const planeZ = armJointPlaneZ({
        torsoPlaneZ: placement.position.z,
        shoulderWorldZ,
        jointWorldZ,
        worldShoulderMeters,
        modelShoulderWidth: modelAnchors.shoulderWidth,
        groupScale: placement.scale,
      });
      return screenPointToRootLocal(
        camera,
        screenX,
        screenY,
        width,
        height,
        planeZ,
        { position: placement.position, quaternion: garmentGroup.quaternion, scale: placement.scale },
        rootOffset,
      );
    };
    const leftArm = {
      elbow: screenJoint(pose.leftElbow.x, pose.leftElbow.y, pose.world.leftElbow.z),
      wrist: screenJoint(pose.leftWrist.x, pose.leftWrist.y, pose.world.leftWrist.z),
    };
    const rightArm = {
      elbow: screenJoint(pose.rightElbow.x, pose.rightElbow.y, pose.world.rightElbow.z),
      wrist: screenJoint(pose.rightWrist.x, pose.rightWrist.y, pose.world.rightWrist.z),
    };

    // Roll and yaw stay on the garment group only. Chest and spine do not repeat them.
    garment.bones.get("chest")!.rotation.z = 0;
    garment.bones.get("spine")!.rotation.z = 0;
    garment.bones.get("shoulder.L")!.position.copy(bindPositions.get(garment.bones.get("shoulder.L")!)!);
    garment.bones.get("shoulder.R")!.position.copy(bindPositions.get(garment.bones.get("shoulder.R")!)!);

    // Aim neck toward the lower-face anchor so the collar tracks the head.
    const neck = garment.bones.get("neck");
    if (neck && (proxy.neckAnchor.visibility ?? 1) > 0.2) {
      const chest = garment.bones.get("chest")!;
      const neckBind = bindPositions.get(neck)!;
      const aim = localNeck.clone().sub(chest.position);
      const pitch = THREE.MathUtils.clamp(Math.atan2(aim.z, Math.max(0.05, aim.y)) * 0.35, -0.28, 0.22);
      const yawNeck = THREE.MathUtils.clamp(Math.atan2(aim.x, Math.max(0.05, aim.y)) * 0.4, -0.32, 0.32);
      neck.position.copy(neckBind);
      neck.rotation.set(pitch, 0, yawNeck);
      chest.rotation.x = 0;
    }

    const solveSide = (side: "L" | "R", arm: NonNullable<typeof leftArm> | null, shoulderVis: number, elbowVis: number, wristVis: number) => {
      const solved = solveArmChain({
        chain: {
          root: garment.root,
          shoulder: garment.bones.get(`shoulder.${side}`)!,
          upper: garment.bones.get(`upper_arm.${side}`)!,
          forearm: garment.bones.get(`forearm.${side}`)!,
        },
        bind: armLengthBind[side],
        memory: armMemory[side],
        elbowTarget: new THREE.Vector3(arm?.elbow.x ?? 0, arm?.elbow.y ?? 0, arm?.elbow.z ?? 0),
        wristTarget: new THREE.Vector3(arm?.wrist.x ?? 0, arm?.wrist.y ?? 0, arm?.wrist.z ?? 0),
        upperRatio: side === "L" ? segments.upperL : segments.upperR,
        forearmRatio: side === "L" ? segments.forearmL : segments.forearmR,
        dtSeconds: options?.dtSeconds ?? 1 / 30,
        solveUpper: Boolean(arm) && shoulderVis > 0.3 && elbowVis > 0.3,
        solveForearm: Boolean(arm) && elbowVis > 0.3 && wristVis > 0.3,
        bindUpperQuat: bindArmQuats.get(`upper_arm.${side}`),
        bindForearmQuat: bindArmQuats.get(`forearm.${side}`),
      });
      wristWorld[side].copy(garment.root.localToWorld(solved.wrist.clone()));
      return solved;
    };

    const leftSolved = solveSide("L", leftArm, pose.leftShoulder.visibility ?? 1, pose.leftElbow.visibility ?? 1, pose.leftWrist.visibility ?? 1);
    const rightSolved = solveSide("R", rightArm, pose.rightShoulder.visibility ?? 1, pose.rightElbow.visibility ?? 1, pose.rightWrist.visibility ?? 1);
    wristsReady = true;
    segmentLengths = {
      upperL: { target: leftSolved.upperTarget, actual: leftSolved.upperActual },
      upperR: { target: rightSolved.upperTarget, actual: rightSolved.upperActual },
      forearmL: { target: leftSolved.forearmTarget, actual: leftSolved.forearmActual },
      forearmR: { target: rightSolved.forearmTarget, actual: rightSolved.forearmActual },
    };

    const projectBone = (name: (typeof GARMENT_RIG.bones)[number]) => {
      garment.bones.get(name)!.getWorldPosition(_jointWorld);
      return projectWorldToStage(camera, toVec3(_jointWorld), width, height);
    };
    const projectWrist = (side: "L" | "R") => projectWorldToStage(camera, toVec3(wristWorld[side]), width, height);
    const upperL = projectBone("upper_arm.L");
    const upperR = projectBone("upper_arm.R");
    const elbowL = projectBone("forearm.L");
    const elbowR = projectBone("forearm.R");
    const wristL = projectWrist("L");
    const wristR = projectWrist("R");
    anchorResiduals = residualsFromScreenJoints([
      { label: "shoulder.L", cameraX: pose.leftShoulder.x, cameraY: pose.leftShoulder.y, modelX: upperL.x, modelY: upperL.y },
      { label: "elbow.L", cameraX: pose.leftElbow.x, cameraY: pose.leftElbow.y, modelX: elbowL.x, modelY: elbowL.y },
      { label: "wrist.L", cameraX: pose.leftWrist.x, cameraY: pose.leftWrist.y, modelX: wristL.x, modelY: wristL.y },
      { label: "shoulder.R", cameraX: pose.rightShoulder.x, cameraY: pose.rightShoulder.y, modelX: upperR.x, modelY: upperR.y },
      { label: "elbow.R", cameraX: pose.rightElbow.x, cameraY: pose.rightElbow.y, modelX: elbowR.x, modelY: elbowR.y },
      { label: "wrist.R", cameraX: pose.rightWrist.x, cameraY: pose.rightWrist.y, modelX: wristR.x, modelY: wristR.y },
    ], shoulderSpanPx);
    finishRender(width, height, "none");
  };

  return {
    inspect,
    rotateInspect,
    updatePose,
    resetInspect() { inspectRotation = { x: -0.04, y: -0.32 }; },
    getAssetInfo() {
      return { ...assetInfo };
    },
    getDebugFrame() {
      return {
        hideReason,
        lastRenderMs,
        modelJoints: modelJoints.slice(),
        asset: { ...assetInfo },
        anchorResiduals: anchorResiduals.slice(),
        modelAnchors: { ...modelAnchors },
        segmentLengths: {
          upperL: { ...segmentLengths.upperL },
          upperR: { ...segmentLengths.upperR },
          forearmL: { ...segmentLengths.forearmL },
          forearmR: { ...segmentLengths.forearmR },
        },
        cameraProjection: PERSPECTIVE_CAMERA_LABEL,
      };
    },
    setSkeletonOnly(enabled: boolean) {
      skeletonOnly = enabled;
      applySkeletonOnlyVisibility();
    },
    setHideGarment(enabled: boolean) {
      hideGarment = enabled;
      applySkeletonOnlyVisibility();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      garment.meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
      });
      garment.textures.forEach((texture) => texture.dispose());
      garment.collar.geometry.dispose();
      (garment.collar.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
