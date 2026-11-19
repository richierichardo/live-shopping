/**
 * One-shot bake: dense skinned longsleeve → public/models/longsleeve-racing.glb
 * Run: node scripts/build-longsleeve-glb.mjs
 *
 * Keep bone names in sync with lib/garment-rig.ts (GARMENT_RIG).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Minimal browser shims so three's GLTFExporter can run under Node.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      const toBuffer = typeof blob?.arrayBuffer === "function"
        ? blob.arrayBuffer()
        : Promise.resolve(blob);
      Promise.resolve(toBuffer).then((buffer) => {
        this.result = buffer;
        this.onloadend?.({ target: this });
      }).catch((error) => {
        this.onerror?.(error);
      });
    }
  };
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement() {
      throw new Error("document.createElement is unavailable in the GLB bake script");
    },
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "public", "models", "longsleeve-racing.glb");

const BONE_NAMES = [
  "root", "pelvis", "spine", "chest", "neck",
  "shoulder.L", "upper_arm.L", "forearm.L",
  "shoulder.R", "upper_arm.R", "forearm.R",
];

function makeBone(name, parent, position, bones) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.copy(position);
  parent.add(bone);
  bones.set(name, bone);
  return bone;
}

function createSkeleton(root) {
  const bones = new Map();
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

  const index = new Map(BONE_NAMES.map((name, i) => [name, i]));
  const skeleton = new THREE.Skeleton(BONE_NAMES.map((name) => bones.get(name)));
  return { bones, index, skeleton };
}

function setSkin(a, b = a, mix = 0) {
  const m = THREE.MathUtils.clamp(mix, 0, 1);
  return { indices: [a, b, a, a], weights: [1 - m, m, 0, 0] };
}

function skinForTorsoY(y, index) {
  const pelvis = index.get("pelvis");
  const spine = index.get("spine");
  const chest = index.get("chest");
  const neck = index.get("neck");
  if (y < -0.34) return setSkin(pelvis, spine, THREE.MathUtils.smoothstep(y, -0.48, -0.25));
  if (y < 0.13) return setSkin(spine, chest, THREE.MathUtils.smoothstep(y, -0.34, 0.13));
  return setSkin(chest, neck, THREE.MathUtils.smoothstep(y, 0.34, 0.52) * 0.18);
}

function torsoVertexSkin(x, y, index) {
  const base = skinForTorsoY(y, index);
  if (y < 0.2 || y > 0.5) return base;
  const absX = Math.abs(x);
  if (absX < 0.2) return base;
  const chest = index.get("chest");
  const shoulder = index.get(x < 0 ? "shoulder.L" : "shoulder.R");
  return setSkin(chest, shoulder, THREE.MathUtils.smoothstep(absX, 0.2, 0.38));
}

function sleeveSkin(t, side, index) {
  const chest = index.get("chest");
  const shoulder = index.get(`shoulder.${side}`);
  const upper = index.get(`upper_arm.${side}`);
  const forearm = index.get(`forearm.${side}`);
  if (t < 0.16) return setSkin(chest, shoulder, THREE.MathUtils.smoothstep(t, 0, 0.16));
  if (t < 0.34) return setSkin(shoulder, upper, THREE.MathUtils.smoothstep(t, 0.16, 0.34));
  if (t < 0.46) return setSkin(upper);
  if (t < 0.74) return setSkin(upper, forearm, THREE.MathUtils.smoothstep(t, 0.46, 0.74));
  return setSkin(forearm);
}

function geometryFromRings(rings, ringSegments) {
  const positions = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
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

function lerpProfile(profile, steps) {
  const samples = [];
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

function makeTorsoGeometry(index) {
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
  const up = new THREE.Vector3(0, 1, 0);
  const rings = lerpProfile(profile, 28).map((item) => ({
    center: new THREE.Vector3(0, item.y, 0),
    axis: up,
    side: new THREE.Vector3(1, 0, 0),
    depth: new THREE.Vector3(0, 0, 1),
    radius: item.width,
    depthRadius: item.depth,
    v: THREE.MathUtils.clamp((item.y + 0.59) / 1.1, 0, 1),
    skin: skinForTorsoY(item.y, index),
    skinAt: (point) => torsoVertexSkin(point.x, point.y, index),
  }));
  return geometryFromRings(rings, 48);
}

function makeSleeveGeometry(side, index) {
  const sign = side === "L" ? -1 : 1;
  const shoulder = new THREE.Vector3(sign * 0.37, 0.36, 0);
  const elbow = shoulder.clone().add(new THREE.Vector3(sign * 0.05, -0.035, 0));
  const forearm = elbow.clone().add(new THREE.Vector3(sign * 0.22, -0.32, 0.01));
  const wrist = forearm.clone().add(new THREE.Vector3(sign * 0.22, -0.32, 0.01));
  const points = [
    new THREE.Vector3(sign * 0.2, 0.3, 0.02),
    shoulder,
    shoulder.clone().lerp(elbow, 0.5),
    elbow,
    elbow.clone().lerp(forearm, 0.45),
    forearm,
    forearm.clone().lerp(wrist, 0.55),
    wrist,
  ];
  const radii = [0.18, 0.17, 0.155, 0.15, 0.13, 0.115, 0.1, 0.092];
  const rings = [];
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
    const reference = Math.abs(axis.dot(new THREE.Vector3(0, 0, 1))) > 0.92
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
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

function buildGarment() {
  const root = new THREE.Group();
  root.name = "garment_root";
  const { bones, index, skeleton } = createSkeleton(root);
  // Solid light cloth. Runtime replaces maps and keeps material.color white.
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d4cc, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide,
  });
  const sleeveMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d4cc, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide,
  });

  const meshes = [];
  const torso = new THREE.SkinnedMesh(makeTorsoGeometry(index), clothMaterial);
  torso.name = "torso";
  torso.frustumCulled = false;
  root.add(torso);
  meshes.push(torso);

  const sleeveLeft = new THREE.SkinnedMesh(makeSleeveGeometry("L", index), sleeveMaterial);
  sleeveLeft.name = "sleeve_L";
  sleeveLeft.frustumCulled = false;
  root.add(sleeveLeft);
  meshes.push(sleeveLeft);

  const sleeveRight = new THREE.SkinnedMesh(makeSleeveGeometry("R", index), sleeveMaterial.clone());
  sleeveRight.name = "sleeve_R";
  sleeveRight.frustumCulled = false;
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
  bones.get("neck").add(collar);
  root.updateMatrixWorld(true);
  return root;
}

async function main() {
  const scene = new THREE.Scene();
  scene.add(buildGarment());
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    embedImages: false,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  const buffer = Buffer.from(result);
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
