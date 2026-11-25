/** Relative body proportions for preview alignment. Not a centimeter measurement. */

export const RATIO_MIN = 0.75;
export const RATIO_MAX = 1.35;
export const CALIBRATION_WINDOW_MS = 800;
export const CALIBRATION_MIN_SAMPLES = 8;
export const CALIBRATION_SHOULDER_VIS = 0.55;

export type ProportionSample = {
  at: number;
  shoulderPx: number;
  torsoPx: number;
  torsoWorld: number;
  upperWorldL: number;
  upperWorldR: number;
  forearmWorldL: number;
  forearmWorldR: number;
  hipWidthPx: number;
};

export type ModelProportionRef = {
  shoulderWidth: number;
  torsoHeight: number;
  upperArmLengthL: number;
  upperArmLengthR: number;
  forearmLengthL: number;
  forearmLengthR: number;
};

export type ProportionRatios = {
  shoulder: number;
  torso: number;
  upperL: number;
  upperR: number;
  forearmL: number;
  forearmR: number;
  ready: boolean;
  hipWidthPx: number;
};

export const IDENTITY_RATIOS: ProportionRatios = {
  shoulder: 1,
  torso: 1,
  upperL: 1,
  upperR: 1,
  forearmL: 1,
  forearmR: 1,
  ready: false,
  hipWidthPx: 0,
};

export function clampRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, value));
}

export function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) * 0.5;
}

function column(samples: ProportionSample[], pick: (sample: ProportionSample) => number) {
  return samples.map(pick);
}

export function ratiosFromSamples(samples: ProportionSample[], model: ModelProportionRef, now: number): ProportionRatios {
  if (samples.length === 0) return { ...IDENTITY_RATIOS };
  const span = samples[samples.length - 1]!.at - samples[0]!.at;
  const ready = samples.length >= CALIBRATION_MIN_SAMPLES && span >= CALIBRATION_WINDOW_MS && now >= samples[0]!.at + CALIBRATION_WINDOW_MS;
  const shoulderPx = median(column(samples, (sample) => sample.shoulderPx));
  const torsoPx = median(column(samples, (sample) => sample.torsoPx));
  const torsoWorld = median(column(samples, (sample) => sample.torsoWorld));
  const modelShoulderToTorso = model.shoulderWidth / Math.max(model.torsoHeight, 1e-4);
  const obsShoulderToTorso = shoulderPx / Math.max(torsoPx, 1e-4);
  const shoulder = clampRatio(obsShoulderToTorso / Math.max(modelShoulderToTorso, 1e-4));
  const torso = clampRatio((torsoPx / Math.max(shoulderPx, 1e-4)) / Math.max(model.torsoHeight / Math.max(model.shoulderWidth, 1e-4), 1e-4));

  const arm = (observed: number, modelLength: number) => {
    const obsRatio = observed / Math.max(torsoWorld, 1e-4);
    const modelRatio = modelLength / Math.max(model.torsoHeight, 1e-4);
    return clampRatio(obsRatio / Math.max(modelRatio, 1e-4));
  };

  return {
    shoulder,
    torso,
    upperL: arm(median(column(samples, (sample) => sample.upperWorldL)), model.upperArmLengthL),
    upperR: arm(median(column(samples, (sample) => sample.upperWorldR)), model.upperArmLengthR),
    forearmL: arm(median(column(samples, (sample) => sample.forearmWorldL)), model.forearmLengthL),
    forearmR: arm(median(column(samples, (sample) => sample.forearmWorldR)), model.forearmLengthR),
    ready,
    hipWidthPx: median(column(samples, (sample) => sample.hipWidthPx)),
  };
}

export type ProportionCalibrator = {
  push: (sample: ProportionSample) => void;
  current: (model: ModelProportionRef, now: number) => ProportionRatios;
  reset: () => void;
};

export function createProportionCalibrator(): ProportionCalibrator {
  let samples: ProportionSample[] = [];
  let locked: ProportionRatios | null = null;
  return {
    push(sample) {
      if (locked) return;
      if (
        sample.shoulderPx < 12
        || sample.torsoPx < 14
        || sample.torsoWorld < 1e-4
      ) return;
      samples.push(sample);
      const newest = sample.at;
      samples = samples.filter((item) => newest - item.at <= CALIBRATION_WINDOW_MS + 200);
    },
    current(model, now) {
      if (locked) return locked;
      const ratios = ratiosFromSamples(samples, model, now);
      if (!ratios.ready) return { ...IDENTITY_RATIOS, hipWidthPx: ratios.hipWidthPx };
      locked = ratios;
      return locked;
    },
    reset() {
      samples = [];
      locked = null;
    },
  };
}

export function worldLength(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
