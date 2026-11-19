import * as THREE from "three";
import { GARMENT_RIG } from "./garment-rig";

export type SkinVertex = { indices: [number, number, number, number]; weights: [number, number, number, number] };
export type BoneMap = Map<(typeof GARMENT_RIG.bones)[number], THREE.Bone>;
export type BoneIndexMap = Map<(typeof GARMENT_RIG.bones)[number], number>;

export type BuiltGarment = {
  root: THREE.Group;
  bones: BoneMap;
  skeleton: THREE.Skeleton;
  meshes: THREE.SkinnedMesh[];
  textures: THREE.Texture[];
  collar: THREE.Mesh;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function makeBone(name: string, parent: THREE.Bone, position: THREE.Vector3, bones: BoneMap) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.copy(position);
  parent.add(bone);
  bones.set(name as (typeof GARMENT_RIG.bones)[number], bone);
  return bone;
}

export function createSkeleton(root: THREE.Group) {
  const bones: BoneMap = new Map();
  const rootBone = new THREE.Bone();
  rootBone.name = "root";
  root.add(rootBone);
  bones.set("root", rootBone);

  const pelvis = makeBone("pelvis", rootBone, new THREE.Vector3(0, -0.44, 0), bones);
  const spine = makeBone("spine", pelvis, new THREE.Vector3(0, 0.25, 0), bones);
  const chest = makeBone("chest", spine, new THREE.Vector3(0, 0.39, 0), bones);
  makeBone("neck", chest, new THREE.Vector3(0, 0.22, 0), bones);

  const leftShoulder = makeBone("shoulder.L", chest, new THREE.Vector3(-0.37, 0.16, 0), bones);
  const leftUpperArm = makeBone("upper_arm.L", leftShoulder, new THREE.Vector3(-0.05, -0.035, 0), bones);
  makeBone("forearm.L", leftUpperArm, new THREE.Vector3(-0.22, -0.32, 0.01), bones);

  const rightShoulder = makeBone("shoulder.R", chest, new THREE.Vector3(0.37, 0.16, 0), bones);
  const rightUpperArm = makeBone("upper_arm.R", rightShoulder, new THREE.Vector3(0.05, -0.035, 0), bones);
  makeBone("forearm.R", rightUpperArm, new THREE.Vector3(0.22, -0.32, 0.01), bones);

  const boneNames = GARMENT_RIG.bones;
  const index: BoneIndexMap = new Map(boneNames.map((name, i) => [name, i]));
  const skeleton = new THREE.Skeleton(boneNames.map((name) => bones.get(name)!));
  return { bones, index, skeleton, rootBone, pelvis, spine, chest };
}

function setSkin(a: number, b = a, mix = 0): SkinVertex {
  const normalizedMix = THREE.MathUtils.clamp(mix, 0, 1);
  return {
    indices: [a, b, a, a] as [number, number, number, number],
    weights: [1 - normalizedMix, normalizedMix, 0, 0] as [number, number, number, number],
  };
}

function skinForTorsoY(y: number, index: BoneIndexMap): SkinVertex {
  const pelvis = index.get("pelvis")!;
  const spine = index.get("spine")!;
  const chest = index.get("chest")!;
  const neck = index.get("neck")!;
  if (y < -0.34) return setSkin(pelvis, spine, THREE.MathUtils.smoothstep(y, -0.48, -0.25));
  if (y < 0.13) return setSkin(spine, chest, THREE.MathUtils.smoothstep(y, -0.34, 0.13));
  return setSkin(chest, neck, THREE.MathUtils.smoothstep(y, 0.34, 0.52) * 0.18);
}

/** Side-of-chest vertices share the shoulder bone so the armpit stays attached. */
export function torsoVertexSkin(x: number, y: number, index: BoneIndexMap): SkinVertex {
  const base = skinForTorsoY(y, index);
  if (y < 0.2 || y > 0.5) return base;
  const absX = Math.abs(x);
  if (absX < 0.2) return base;
  const chest = index.get("chest")!;
  const shoulder = index.get(x < 0 ? "shoulder.L" : "shoulder.R")!;
  return setSkin(chest, shoulder, THREE.MathUtils.smoothstep(absX, 0.2, 0.38));
}

export function sleeveSkin(t: number, side: "L" | "R", index: BoneIndexMap): SkinVertex {
  const chest = index.get("chest")!;
  const shoulder = index.get(`shoulder.${side}` as (typeof GARMENT_RIG.bones)[number])!;
  const upper = index.get(`upper_arm.${side}` as (typeof GARMENT_RIG.bones)[number])!;
  const forearm = index.get(`forearm.${side}` as (typeof GARMENT_RIG.bones)[number])!;
  if (t < 0.16) return setSkin(chest, shoulder, THREE.MathUtils.smoothstep(t, 0, 0.16));
  if (t < 0.34) return setSkin(shoulder, upper, THREE.MathUtils.smoothstep(t, 0.16, 0.34));
  if (t < 0.46) return setSkin(upper);
  if (t < 0.74) return setSkin(upper, forearm, THREE.MathUtils.smoothstep(t, 0.46, 0.74));
  return setSkin(forearm);
}

function geometryFromRings(
  rings: { center: THREE.Vector3; axis: THREE.Vector3; side: THREE.Vector3; depth: THREE.Vector3; radius: number; depthRadius: number; v: number; skin: SkinVertex; skinAt?: (point: THREE.Vector3) => SkinVertex }[],
  ringSegments: number,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  rings.forEach((ring, ringIndex) => {
    for (let segment = 0; segment <= ringSegments; segment += 1) {
      const angle = (segment / ringSegments) * Math.PI * 2;
      const point = ring.center.clone()
        .addScaledVector(ring.side, Math.sin(angle) * ring.radius)
        .addScaledVector(ring.depth, Math.cos(angle) * ring.depthRadius);
      positions.push(point.x, point.y, point.z);
      uvs.push((segment / ringSegments + 0.5) % 1, ring.v);
      const skin = ring.skinAt ? ring.skinAt(point) : ring.skin;
      skinIndices.push(...skin.indices);
      skinWeights.push(...skin.weights);
      if (ringIndex < rings.length - 1 && segment < ringSegments) {
        const a = ringIndex * (ringSegments + 1) + segment;
        const b = a + ringSegments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function lerpProfile(
  profile: { y: number; width: number; depth: number }[],
  steps: number,
) {
  const samples: { y: number; width: number; depth: number }[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const scaled = t * (profile.length - 1);
    const segment = Math.min(Math.floor(scaled), profile.length - 2);
    const localT = scaled - segment;
    const a = profile[segment];
    const b = profile[segment + 1];
    samples.push({
      y: THREE.MathUtils.lerp(a.y, b.y, localT),
      width: THREE.MathUtils.lerp(a.width, b.width, localT),
      depth: THREE.MathUtils.lerp(a.depth, b.depth, localT),
    });
  }
  return samples;
}

export function makeTorsoGeometry(index: BoneIndexMap) {
  const profile = [
    { y: -0.59, width: 0.37, depth: 0.12 },
    { y: -0.52, width: 0.385, depth: 0.125 },
    { y: -0.48, width: 0.39, depth: 0.13 },
    { y: -0.36, width: 0.385, depth: 0.132 },
    { y: -0.24, width: 0.38, depth: 0.135 },
    { y: -0.1, width: 0.385, depth: 0.14 },
    { y: 0.02, width: 0.39, depth: 0.145 },
    { y: 0.14, width: 0.41, depth: 0.152 },
    { y: 0.27, width: 0.43, depth: 0.175 },
    { y: 0.36, width: 0.42, depth: 0.17 },
    { y: 0.43, width: 0.41, depth: 0.15 },
    { y: 0.48, width: 0.37, depth: 0.14 },
    { y: 0.51, width: 0.34, depth: 0.13 },
  ];
  const rings = lerpProfile(profile, 28).map((item) => ({
    center: new THREE.Vector3(0, item.y, 0),
    axis: WORLD_UP,
    side: new THREE.Vector3(1, 0, 0),
    depth: new THREE.Vector3(0, 0, 1),
    radius: item.width,
    depthRadius: item.depth,
    v: THREE.MathUtils.clamp((item.y + 0.59) / 1.1, 0, 1),
    skin: skinForTorsoY(item.y, index),
    skinAt: (point: THREE.Vector3) => torsoVertexSkin(point.x, point.y, index),
  }));
  return geometryFromRings(rings, 48);
}

function restSleeveChain(side: "L" | "R", sleeveLength: "long" | "short") {
  const sign = side === "L" ? -1 : 1;
  const shoulder = new THREE.Vector3(sign * 0.37, 0.36, 0);
  const elbow = shoulder.clone().add(new THREE.Vector3(sign * 0.05, -0.035, 0));
  const forearm = elbow.clone().add(new THREE.Vector3(sign * 0.22, -0.32, 0.01));
  const wrist = forearm.clone().add(new THREE.Vector3(sign * 0.22, -0.32, 0.01));
  const inset = new THREE.Vector3(sign * 0.2, 0.3, 0.02);
  if (sleeveLength === "short") {
    return {
      points: [inset, shoulder, shoulder.clone().lerp(elbow, 0.5), elbow, elbow.clone().lerp(forearm, 0.25)],
      radii: [0.18, 0.17, 0.155, 0.15, 0.14],
    };
  }
  return {
    points: [
      inset,
      shoulder,
      shoulder.clone().lerp(elbow, 0.5),
      elbow,
      elbow.clone().lerp(forearm, 0.45),
      forearm,
      forearm.clone().lerp(wrist, 0.55),
      wrist,
    ],
    radii: [0.18, 0.17, 0.155, 0.15, 0.13, 0.115, 0.1, 0.092],
  };
}

export function makeSleeveGeometry(side: "L" | "R", index: BoneIndexMap, sleeveLength: "long" | "short" = "long") {
  const { points, radii } = restSleeveChain(side, sleeveLength);
  const rings: Parameters<typeof geometryFromRings>[0] = [];
  const stepsPerSegment = 12;
  const totalSteps = stepsPerSegment * (points.length - 1);

  for (let step = 0; step <= totalSteps; step += 1) {
    const progress = step / totalSteps;
    const scaled = progress * (points.length - 1);
    const segment = Math.min(Math.floor(scaled), points.length - 2);
    const localT = scaled - segment;
    const center = points[segment].clone().lerp(points[segment + 1], localT);
    const radius = THREE.MathUtils.lerp(radii[segment], radii[segment + 1], localT);
    const axis = points[segment + 1].clone().sub(points[segment]).normalize();
    const reference = Math.abs(axis.dot(new THREE.Vector3(0, 0, 1))) > 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const sideAxis = reference.clone().cross(axis).normalize();
    const depthAxis = axis.clone().cross(sideAxis).normalize();
    rings.push({
      center,
      axis,
      side: sideAxis,
      depth: depthAxis,
      radius,
      depthRadius: radius * 0.9,
      v: progress,
      skin: sleeveSkin(progress, side, index),
    });
  }
  return geometryFromRings(rings, 24);
}

function paintBodyTexture(context: CanvasRenderingContext2D, productName: string, color: string, width: number, height: number) {
  const base = new THREE.Color(color);
  const fabric = context.createLinearGradient(0, 0, width, height);
  fabric.addColorStop(0, base.clone().lerp(new THREE.Color("#ffffff"), 0.14).getStyle());
  fabric.addColorStop(0.5, base.clone().multiplyScalar(0.82).getStyle());
  fabric.addColorStop(1, base.clone().lerp(new THREE.Color("#000000"), 0.16).getStyle());
  context.fillStyle = fabric;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.07;
  for (let y = 0; y < height; y += 6) {
    context.fillStyle = y % 12 === 0 ? "#ffffff" : "#000000";
    context.fillRect(0, y, width, 1);
  }
  context.globalAlpha = 1;

  const cx = width / 2;
  context.fillStyle = "#ded5c1";
  context.fillRect(cx - 94, 248, 188, 36);
  context.fillStyle = "#171715";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 22px Arial, sans-serif";
  context.fillText("GOODLUCH", cx, 266);

  context.fillStyle = "#eee7db";
  context.font = "900 28px Arial, sans-serif";
  context.fillText("RETRO", cx, 318);
  context.fillStyle = "#c2a36a";
  context.font = "900 15px Arial, sans-serif";
  context.fillText("RACING GROUP", cx, 346);

  context.strokeStyle = "rgba(139, 135, 125, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cx - 70, 368);
  context.lineTo(cx + 70, 368);
  context.stroke();

  context.fillStyle = "#d4cdbf";
  context.font = "700 12px Arial, sans-serif";
  context.fillText("FIND YOUR OWN LINE", cx, 392);

  context.font = "800 11px Arial, sans-serif";
  context.fillStyle = "#b8b1a4";
  context.fillText(productName.toUpperCase().slice(0, 36), cx, 430);

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? "#e4dece" : "#22231f";
      context.fillRect(cx - 80 + column * 16, 458 + row * 16, 16, 16);
    }
  }
}

function paintSleeveTexture(context: CanvasRenderingContext2D, color: string, width: number, height: number) {
  const base = new THREE.Color(color);
  context.fillStyle = base.clone().multiplyScalar(0.86).getStyle();
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.1;
  for (let y = 0; y < height; y += 8) context.fillRect(0, y, width, 1);
  context.globalAlpha = 1;

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? "#e4dece" : "#1c1c1a";
      context.fillRect(16 + column * 14, 36 + row * 14, 14, 14);
    }
  }

  context.fillStyle = "#d8cfbd";
  context.fillRect(0, height - 66, width, 12);
  context.fillStyle = "#171715";
  context.fillRect(0, height - 54, width, 10);
  context.strokeStyle = "rgba(232, 225, 207, .5)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(14, 22);
  context.lineTo(14, height - 22);
  context.moveTo(width - 14, 22);
  context.lineTo(width - 14, height - 22);
  context.stroke();
}

export function makeBodyTexture(productName: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create 3D garment texture");
  paintBodyTexture(context, productName, color, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function makeSleeveTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create 3D sleeve texture");
  paintSleeveTexture(context, color, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Node-safe albedo via DataTexture (no DOM canvas). Used by the GLB bake script. */
export function makeBodyDataTexture(productName: string, color: string) {
  const width = 512;
  const height = 512;
  const data = new Uint8Array(width * height * 4);
  const base = new THREE.Color(color);
  const r0 = Math.round(base.r * 255);
  const g0 = Math.round(base.g * 255);
  const b0 = Math.round(base.b * 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const shade = 0.75 + 0.2 * (x / width) + 0.1 * (y / height);
      data[i] = Math.min(255, Math.round(r0 * shade));
      data[i + 1] = Math.min(255, Math.round(g0 * shade));
      data[i + 2] = Math.min(255, Math.round(b0 * shade));
      data[i + 3] = 255;
    }
  }
  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  };
  fillRect(168, 120, 176, 28, 222, 213, 193);
  fillRect(190, 168, 132, 34, 238, 231, 219);
  fillRect(176, 210, 160, 18, 194, 163, 106);
  fillRect(196, 250, 120, 10, 212, 205, 191);
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const light = (row + column) % 2 === 0;
      fillRect(176 + column * 16, 280 + row * 16, 16, 16, light ? 228 : 34, light ? 222 : 35, light ? 206 : 31);
    }
  }
  void productName;
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function makeSleeveDataTexture(color: string) {
  const width = 256;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  const base = new THREE.Color(color).multiplyScalar(0.86);
  const r0 = Math.round(base.r * 255);
  const g0 = Math.round(base.g * 255);
  const b0 = Math.round(base.b * 255);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = r0;
    data[o + 1] = g0;
    data[o + 2] = b0;
    data[o + 3] = 255;
  }
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const light = (row + column) % 2 === 0;
      for (let y = 20 + row * 14; y < 34 + row * 14; y += 1) {
        for (let x = 16 + column * 14; x < 30 + column * 14; x += 1) {
          const o = (y * width + x) * 4;
          data[o] = light ? 228 : 28;
          data[o + 1] = light ? 222 : 28;
          data[o + 2] = light ? 206 : 26;
        }
      }
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function assignGarmentMap(material: THREE.MeshStandardMaterial, map: THREE.Texture) {
  material.map = map;
  material.color.set(0xffffff);
  material.needsUpdate = true;
}

function makeSkinnedMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGarment(
  productName: string,
  color: string,
  options: { useDataTextures?: boolean; sleeveLength?: "long" | "short"; torsoMap?: THREE.Texture } = {},
): BuiltGarment {
  const root = new THREE.Group();
  root.name = "garment_root";
  const { bones, index, skeleton } = createSkeleton(root);
  const sleeveLength = options.sleeveLength ?? "long";
  const torsoTexture = options.torsoMap
    ?? (options.useDataTextures ? makeBodyDataTexture(productName, color) : makeBodyTexture(productName, color));
  const sleeveTexture = options.useDataTextures
    ? makeSleeveDataTexture(color)
    : makeSleeveTexture(color);
  const clothMaterial = new THREE.MeshStandardMaterial({
    map: torsoTexture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const sleeveMaterial = new THREE.MeshStandardMaterial({
    map: sleeveTexture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const meshes: THREE.SkinnedMesh[] = [];

  const torso = makeSkinnedMesh(makeTorsoGeometry(index), clothMaterial);
  torso.name = "torso";
  root.add(torso);
  meshes.push(torso);
  const sleeveLeft = makeSkinnedMesh(makeSleeveGeometry("L", index, sleeveLength), sleeveMaterial);
  sleeveLeft.name = "sleeve_L";
  root.add(sleeveLeft);
  meshes.push(sleeveLeft);
  const sleeveRight = makeSkinnedMesh(makeSleeveGeometry("R", index, sleeveLength), sleeveMaterial.clone());
  sleeveRight.name = "sleeve_R";
  root.add(sleeveRight);
  meshes.push(sleeveRight);
  meshes.forEach((mesh) => mesh.bind(skeleton));

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.125, 0.02, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.86 }),
  );
  collar.name = "collar";
  collar.position.set(0, 0.07, 0);
  collar.rotation.x = Math.PI / 2;
  bones.get("neck")!.add(collar);
  root.updateMatrixWorld(true);
  return { root, bones, skeleton, meshes, textures: [torsoTexture, sleeveTexture], collar };
}
