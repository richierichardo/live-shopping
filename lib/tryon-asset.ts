import type { Product, TryOnAnchors, TryOnAsset, TryOnCoverage, TryOnTemplateId } from "./catalog";
import { MODEL_SHOULDER_WIDTH, MODEL_TORSO_HEIGHT } from "./garment-rig";

export type { TryOnAnchors };

export type TryOnResolved = {
  src: string;
  label: string;
  coverage: TryOnCoverage;
  templateId: TryOnTemplateId;
  anchors: TryOnAnchors;
  glb?: string;
  collarMask?: string;
  backSrc?: string;
  /** Procedural mesh uses short sleeves for tee/jersey. */
  sleeveLength: "long" | "short";
};

const TEMPLATE_DEFAULTS: Record<
  TryOnTemplateId,
  { coverage: TryOnCoverage; anchors: TryOnAnchors; sleeveLength: "long" | "short"; label: string }
> = {
  "longsleeve-v1": {
    coverage: "longsleeve",
    anchors: { shoulderWidth: MODEL_SHOULDER_WIDTH, torsoHeight: MODEL_TORSO_HEIGHT, hemY: -0.52 },
    sleeveLength: "long",
    label: "Longsleeve template",
  },
  "tee-v1": {
    coverage: "tee",
    anchors: { shoulderWidth: MODEL_SHOULDER_WIDTH * 0.98, torsoHeight: MODEL_TORSO_HEIGHT * 0.92, hemY: -0.42 },
    sleeveLength: "short",
    label: "Tee template",
  },
  "jersey-v1": {
    coverage: "jersey",
    anchors: { shoulderWidth: MODEL_SHOULDER_WIDTH * 1.02, torsoHeight: MODEL_TORSO_HEIGHT * 0.94, hemY: -0.44 },
    sleeveLength: "short",
    label: "Jersey template",
  },
};

export function coverageFromCategory(category: Product["category"]): TryOnCoverage {
  if (category === "Longsleeve") return "longsleeve";
  if (category === "Jersey") return "jersey";
  return "tee";
}

export function templateIdForCoverage(coverage: TryOnCoverage): TryOnTemplateId {
  if (coverage === "longsleeve") return "longsleeve-v1";
  if (coverage === "jersey") return "jersey-v1";
  return "tee-v1";
}

/** Normalize catalog try-on metadata so every SKU has a safe fitting contract. */
export function resolveTryOnAsset(product: Product): TryOnResolved {
  const coverage = product.tryOnAsset?.coverage ?? coverageFromCategory(product.category);
  const templateId = product.tryOnAsset?.templateId ?? templateIdForCoverage(coverage);
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const asset: Partial<TryOnAsset> = product.tryOnAsset ?? {};
  const anchors: TryOnAnchors = {
    shoulderWidth: asset.anchors?.shoulderWidth ?? defaults.anchors.shoulderWidth,
    torsoHeight: asset.anchors?.torsoHeight ?? defaults.anchors.torsoHeight,
    hemY: asset.anchors?.hemY ?? defaults.anchors.hemY,
  };

  return {
    src: asset.src ?? product.images[0] ?? "/images/tryon-shirt.svg",
    label: asset.label ?? defaults.label,
    coverage: asset.coverage ?? defaults.coverage,
    templateId,
    anchors,
    glb: asset.glb,
    collarMask: asset.collarMask,
    backSrc: asset.backSrc,
    sleeveLength: defaults.sleeveLength,
  };
}

export const PILOT_GLB_PATH = "/models/longsleeve-racing.glb";
