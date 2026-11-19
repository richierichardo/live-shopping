import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GARMENT_RIG } from "./garment-rig";
import {
  buildGarment,
  makeBodyTexture,
  makeSleeveTexture,
  type BoneMap,
  type BuiltGarment,
} from "./garment-mesh";
import { measureBodyProxy } from "./tryon-body";
import type { HeadPoints } from "./tryon-mask";

export { GARMENT_RIG } from "./garment-rig";

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
  frontTextureUrl?: string;
  sleeveLength?: "long" | "short";
  anchors?: { shoulderWidth: number; torsoHeight: number; hemY: number };
};

export type PoseUpdateOptions = {
  head?: HeadPoints | null;
  /** 0–1 torso visibility; drives material opacity when pose is weak. */
  confidence?: number;
  anchors?: { shoulderWidth: number; torsoHeight: number; hemY: number } | null;
};

export type Garment3DRenderer = {
  inspect: (width: number, height: number) => void;
  rotateInspect: (deltaX: number, deltaY: number) => void;
  updatePose: (pose: GarmentPose | null, width: number, height: number, options?: PoseUpdateOptions) => void;
  resetInspect: () => void;
  dispose: () => void;
};

const BONE_DOWN = new THREE.Vector3(0, -1, 0);
const ARM_BONES = ["upper_arm.L", "forearm.L", "upper_arm.R", "forearm.R"] as const;
const BONE_SLERP = 0.42;
const ARM_ANGLE_LIMIT = 1.25;

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

async function loadOptionalTexture(url?: string): Promise<THREE.Texture | null> {
  if (!url) return null;
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

function garmentFromProcedural(
  productName: string,
  color: string,
  sleeveLength: "long" | "short" = "long",
  torsoMap?: THREE.Texture | null,
): BuiltGarment {
  return buildGarment(productName, color, { sleeveLength, torsoMap: torsoMap ?? undefined });
}

async function garmentFromGlb(
  url: string,
  productName: string,
  color: string,
  torsoMap?: THREE.Texture | null,
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
      const material = object.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.side = THREE.DoubleSide;
        material.roughness = 0.88;
        material.metalness = 0.02;
        if (material.map) textures.push(material.map);
      }
    } else if (object instanceof THREE.Mesh && object.name === "collar") {
      collar = object;
    }
  });

  if (meshes.length === 0) throw new Error("GLB has no SkinnedMesh");

  // Bake script ships solid materials (no DOM canvas). Paint product / Retro Racing maps here.
  const paintedTorso = torsoMap ?? makeBodyTexture(productName, color);
  const sleeveMap = makeSleeveTexture(color);
  textures.push(paintedTorso, sleeveMap);
  for (const mesh of meshes) {
    const material = mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    if (mesh.name.toLowerCase().includes("sleeve")) material.map = sleeveMap;
    else material.map = paintedTorso;
    material.needsUpdate = true;
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
      new THREE.MeshStandardMaterial({ color: 0x111210, roughness: 0.86 }),
    );
    collar.name = "collar";
    collar.position.set(0, 0.49, 0);
    collar.rotation.x = Math.PI / 2;
    root.add(collar);
  }

  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  return { root, bones, skeleton, meshes, textures, collar };
}

/**
 * Selfie-mirrored screen pixels → Three.js orthographic world.
 * Screen: x right, y down from top. Three ortho: x right, y up, origin at stage center.
 */
export function screenToWorld(screenX: number, screenY: number, width: number, height: number, z = 0) {
  return new THREE.Vector3(screenX - width / 2, height / 2 - screenY, z);
}

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
  const frontTexture = await loadOptionalTexture(resolved.frontTextureUrl);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.position.z = 500;
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

  let garment: BuiltGarment;
  if (glbUrl) {
    try {
      garment = await garmentFromGlb(glbUrl, productName, color, frontTexture);
    } catch {
      garment = garmentFromProcedural(productName, color, sleeveLength, frontTexture);
    }
  } else {
    garment = garmentFromProcedural(productName, color, sleeveLength, frontTexture);
  }

  const garmentGroup = new THREE.Group();
  garmentGroup.add(garment.root);
  scene.add(garmentGroup);

  let viewport = { width: 0, height: 0 };
  let inspectRotation = { x: -0.04, y: -0.32 };
  let disposed = false;
  const prevArmQuats = new Map<string, THREE.Quaternion>();
  const targetArmQuats = new Map<string, THREE.Quaternion>();

  const resize = (width: number, height: number) => {
    if (disposed || width < 1 || height < 1) return;
    if (width === viewport.width && height === viewport.height) return;
    viewport = { width, height };
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const inspect = (width: number, height: number) => {
    resize(width, height);
    garmentGroup.visible = true;
    garmentGroup.position.set(0, 0, 0);
    garmentGroup.scale.setScalar(Math.min(width / 2.05, height / 1.85));
    garmentGroup.rotation.set(inspectRotation.x, inspectRotation.y, 0);
    renderer.render(scene, camera);
  };

  const rotateInspect = (deltaX: number, deltaY: number) => {
    inspectRotation = {
      x: THREE.MathUtils.clamp(inspectRotation.x + deltaY * 0.008, -0.42, 0.42),
      y: inspectRotation.y + deltaX * 0.008,
    };
  };

  const bindPositions = new Map<THREE.Bone, THREE.Vector3>();
  const bindChildDirections = new Map<THREE.Bone, THREE.Vector3>();
  const bindArmQuats = new Map<string, THREE.Quaternion>();
  for (const bone of garment.bones.values()) {
    bindPositions.set(bone, bone.position.clone());
    bindArmQuats.set(bone.name, bone.quaternion.clone());
    if (bone.children.length > 0 && bone.children[0] instanceof THREE.Bone) {
      bindChildDirections.set(bone, (bone.children[0] as THREE.Bone).position.clone().normalize());
    } else if (bone.position.lengthSq() > 1e-8) {
      bindChildDirections.set(bone, bone.position.clone().normalize());
    } else {
      bindChildDirections.set(bone, BONE_DOWN.clone());
    }
  }

  // Bind-pose shoulder tips in root space — arm IK starts here so sleeves stay attached.
  garment.root.updateMatrixWorld(true);
  const bindShoulderRoot = {
    L: garment.root.worldToLocal(garment.bones.get("shoulder.L")!.getWorldPosition(new THREE.Vector3())),
    R: garment.root.worldToLocal(garment.bones.get("shoulder.R")!.getWorldPosition(new THREE.Vector3())),
  };

  const resetBones = () => {
    for (const bone of garment.bones.values()) {
      bone.position.copy(bindPositions.get(bone)!);
      bone.quaternion.identity();
      bone.scale.set(1, 1, 1);
    }
  };

  const _parentWorld = new THREE.Quaternion();
  const _rootWorld = new THREE.Quaternion();
  const _parentInRoot = new THREE.Quaternion();
  const _dir = new THREE.Vector3();
  const _dirInParent = new THREE.Vector3();
  const _rest = new THREE.Vector3();

  const clampTowardBind = (name: string, target: THREE.Quaternion) => {
    const bind = bindArmQuats.get(name) ?? new THREE.Quaternion();
    const angle = bind.angleTo(target);
    if (angle <= ARM_ANGLE_LIMIT) return target;
    const t = ARM_ANGLE_LIMIT / Math.max(angle, 1e-5);
    return bind.clone().slerp(target, t);
  };

  const orientBone = (
    name: (typeof ARM_BONES)[number],
    parentName: "shoulder.L" | "upper_arm.L" | "shoulder.R" | "upper_arm.R",
    start: THREE.Vector3,
    end: THREE.Vector3,
  ) => {
    const bone = garment.bones.get(name)!;
    const parent = garment.bones.get(parentName)!;
    _dir.copy(end).sub(start);
    if (_dir.lengthSq() < 1e-5) return;
    _dir.normalize();

    garment.root.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parentWorld);
    garment.root.getWorldQuaternion(_rootWorld);
    _parentInRoot.copy(_rootWorld).invert().multiply(_parentWorld);
    _dirInParent.copy(_dir).applyQuaternion(_parentInRoot.clone().invert());
    _rest.copy(bindChildDirections.get(bone) ?? BONE_DOWN);
    if (_dirInParent.lengthSq() < 1e-5 || _rest.lengthSq() < 1e-5) return;
    const raw = new THREE.Quaternion().setFromUnitVectors(_rest, _dirInParent.normalize());
    targetArmQuats.set(name, clampTowardBind(name, raw));
  };

  const applyArmSlerp = () => {
    for (const name of ARM_BONES) {
      const bone = garment.bones.get(name);
      const target = targetArmQuats.get(name);
      if (!bone || !target) continue;
      const previous = prevArmQuats.get(name) ?? target;
      bone.quaternion.copy(previous).slerp(target, BONE_SLERP);
      prevArmQuats.set(name, bone.quaternion.clone());
    }
    targetArmQuats.clear();
  };

  const updatePose = (pose: GarmentPose | null, width: number, height: number, options?: PoseUpdateOptions) => {
    resize(width, height);
    if (!pose) {
      garmentGroup.visible = false;
      prevArmQuats.clear();
      renderer.render(scene, camera);
      return;
    }

    const head = options?.head ?? null;
    const proxy = measureBodyProxy(pose, head, width, height, options?.anchors ?? assetAnchors);
    const confidence = options?.confidence ?? proxy?.poseConfidence ?? 0;
    // Soft fade is applied via CSS on the canvas; hide only when tracking is unusable.
    if (!proxy || confidence < 0.18) {
      garmentGroup.visible = false;
      prevArmQuats.clear();
      renderer.render(scene, camera);
      return;
    }

    const leftShoulder = screenToWorld(pose.leftShoulder.x, pose.leftShoulder.y, width, height);
    const rightShoulder = screenToWorld(pose.rightShoulder.x, pose.rightShoulder.y, width, height);
    const leftElbow = screenToWorld(pose.leftElbow.x, pose.leftElbow.y, width, height);
    const rightElbow = screenToWorld(pose.rightElbow.x, pose.rightElbow.y, width, height);
    const leftWrist = screenToWorld(pose.leftWrist.x, pose.leftWrist.y, width, height);
    const rightWrist = screenToWorld(pose.rightWrist.x, pose.rightWrist.y, width, height);
    const leftHip = screenToWorld(pose.leftHip.x, pose.leftHip.y, width, height);
    const rightHip = screenToWorld(pose.rightHip.x, pose.rightHip.y, width, height);

    const shoulderMid = leftShoulder.clone().add(rightShoulder).multiplyScalar(0.5);
    const hipMid = leftHip.clone().add(rightHip).multiplyScalar(0.5);
    const torsoMid = shoulderMid.clone().add(hipMid).multiplyScalar(0.5);

    resetBones();
    const { scaleX, scaleY, scaleZ } = proxy;
    const shoulderRoll = Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x);
    const torsoLean = Math.atan2(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
    const yaw = THREE.MathUtils.clamp((pose.world.leftShoulder.z - pose.world.rightShoulder.z) * 1.2, -0.35, 0.35);

    garmentGroup.visible = true;
    garmentGroup.position.copy(torsoMid);
    garmentGroup.scale.set(scaleX, scaleY, scaleZ);
    garmentGroup.rotation.set(0, yaw, THREE.MathUtils.clamp(shoulderRoll * 0.85 + torsoLean * 0.2, -0.4, 0.4));
    garmentGroup.updateMatrixWorld(true);

    const invQuat = garmentGroup.quaternion.clone().invert();
    const toLocal = (point: THREE.Vector3) => {
      const local = point.clone().sub(garmentGroup.position).applyQuaternion(invQuat);
      local.x /= scaleX;
      local.y /= scaleY;
      local.z /= scaleZ;
      return local;
    };

    const localLeftElbow = toLocal(leftElbow);
    const localRightElbow = toLocal(rightElbow);
    const localLeftWrist = toLocal(leftWrist);
    const localRightWrist = toLocal(rightWrist);
    const localNeck = toLocal(screenToWorld(proxy.neckAnchor.x, proxy.neckAnchor.y, width, height));

    garment.root.position.set(0, 0, 0);

    // Raised arms: keep shoulders locked to bind and damp torso twist so the chest does not tear.
    const leftRaise = THREE.MathUtils.clamp((localLeftElbow.y - bindShoulderRoot.L.y) / 0.45, 0, 1);
    const rightRaise = THREE.MathUtils.clamp((localRightElbow.y - bindShoulderRoot.R.y) / 0.45, 0, 1);
    const raiseDamp = 1 - 0.55 * Math.max(leftRaise, rightRaise);

    garment.bones.get("chest")!.rotation.z = THREE.MathUtils.clamp((shoulderRoll * 0.35 + torsoLean * 0.15) * raiseDamp, -0.18, 0.18);
    garment.bones.get("spine")!.rotation.z = THREE.MathUtils.clamp(torsoLean * 0.18 * raiseDamp, -0.14, 0.14);
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
      chest.rotation.x = THREE.MathUtils.clamp(pitch * 0.25, -0.12, 0.1);
    }

    // Upper arms aim from bind shoulder sockets toward tracked elbows (keeps sleeves attached).
    if ((pose.leftShoulder.visibility ?? 1) > 0.3 && (pose.leftElbow.visibility ?? 1) > 0.3) {
      orientBone("upper_arm.L", "shoulder.L", bindShoulderRoot.L, localLeftElbow);
    }
    if ((pose.leftElbow.visibility ?? 1) > 0.3 && (pose.leftWrist.visibility ?? 1) > 0.3) {
      orientBone("forearm.L", "upper_arm.L", localLeftElbow, localLeftWrist);
    }
    if ((pose.rightShoulder.visibility ?? 1) > 0.3 && (pose.rightElbow.visibility ?? 1) > 0.3) {
      orientBone("upper_arm.R", "shoulder.R", bindShoulderRoot.R, localRightElbow);
    }
    if ((pose.rightElbow.visibility ?? 1) > 0.3 && (pose.rightWrist.visibility ?? 1) > 0.3) {
      orientBone("forearm.R", "upper_arm.R", localRightElbow, localRightWrist);
    }
    applyArmSlerp();
    renderer.render(scene, camera);
  };

  return {
    inspect,
    rotateInspect,
    updatePose,
    resetInspect() { inspectRotation = { x: -0.04, y: -0.32 }; },
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
