export const GARMENT_RIG = {
  version: 1,
  unit: "meter-like normalized units",
  forwardAxis: "+Z",
  upAxis: "+Y",
  bones: [
    "root", "pelvis", "spine", "chest", "neck",
    "shoulder.L", "upper_arm.L", "forearm.L",
    "shoulder.R", "upper_arm.R", "forearm.R",
  ],
} as const;

export const MODEL_SHOULDER_WIDTH = 0.78;
export const MODEL_TORSO_HEIGHT = 1.08;
