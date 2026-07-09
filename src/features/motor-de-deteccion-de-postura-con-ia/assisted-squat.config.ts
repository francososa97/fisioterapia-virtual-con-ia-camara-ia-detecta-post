// Definición de landmarks corporales y rangos de ángulos correctos
// para la técnica de sentadilla asistida (rehabilitación).
//
// Los rangos están pensados para una sentadilla PARCIAL y segura de rehab
// (no una sentadilla profunda de fuerza), priorizando la protección articular.

import { AngleRange, PoseLandmarkIndex } from './assisted-squat.types';

/** Confianza mínima para considerar válido un landmark. */
export const MIN_LANDMARK_VISIBILITY = 0.5;

/** Margen (en grados) fuera de rango que se tolera como 'warning' antes de 'error'. */
export const OUT_OF_RANGE_MARGIN_DEG = 10;

/** Triplete de landmarks (a - vértice - c) que define el ángulo de una articulación. */
export interface JointLandmarkTriplet {
  readonly a: PoseLandmarkIndex;
  readonly vertex: PoseLandmarkIndex;
  readonly c: PoseLandmarkIndex;
}

/**
 * Landmarks que forman cada ángulo evaluado, por lado.
 * - knee: cadera - rodilla - tobillo (flexión de rodilla).
 * - hip:  hombro - cadera - rodilla (flexión de cadera / bisagra).
 */
export const ASSISTED_SQUAT_JOINT_TRIPLETS: {
  readonly knee: Record<'left' | 'right', JointLandmarkTriplet>;
  readonly hip: Record<'left' | 'right', JointLandmarkTriplet>;
} = {
  knee: {
    left: { a: PoseLandmarkIndex.LEFT_HIP, vertex: PoseLandmarkIndex.LEFT_KNEE, c: PoseLandmarkIndex.LEFT_ANKLE },
    right: { a: PoseLandmarkIndex.RIGHT_HIP, vertex: PoseLandmarkIndex.RIGHT_KNEE, c: PoseLandmarkIndex.RIGHT_ANKLE },
  },
  hip: {
    left: { a: PoseLandmarkIndex.LEFT_SHOULDER, vertex: PoseLandmarkIndex.LEFT_HIP, c: PoseLandmarkIndex.LEFT_KNEE },
    right: { a: PoseLandmarkIndex.RIGHT_SHOULDER, vertex: PoseLandmarkIndex.RIGHT_HIP, c: PoseLandmarkIndex.RIGHT_KNEE },
  },
} as const;

/**
 * Rangos angulares correctos EN EL PUNTO MÁS BAJO (fase 'bottom').
 * - kneeBottom: flexión de rodilla (cadera-rodilla-tobillo). ~95° = sentadilla asistida a 90°.
 *   < min => baja demasiado (sobreflexión, riesgo articular). > max => no baja lo suficiente.
 * - hipBottom: flexión de cadera (hombro-cadera-rodilla). Controla la bisagra de cadera.
 * - trunkInclination: inclinación del torso respecto de la vertical. 0° = erguido.
 */
export const ASSISTED_SQUAT_RANGES: {
  readonly kneeBottom: AngleRange;
  readonly hipBottom: AngleRange;
  readonly trunkInclination: AngleRange;
} = {
  kneeBottom: { min: 80, max: 110, ideal: 95 },
  hipBottom: { min: 55, max: 100, ideal: 75 },
  trunkInclination: { min: 0, max: 45, ideal: 20 },
} as const;

/** Umbrales de ángulo de rodilla (promedio) para inferir la fase del movimiento. */
export const SQUAT_PHASE_THRESHOLDS: {
  readonly standingKneeAngle: number;
  readonly bottomKneeAngle: number;
} = {
  standingKneeAngle: 160,
  bottomKneeAngle: 120,
} as const;

/**
 * Tolerancia de simetría entre rodilla izquierda y derecha (en grados).
 * dev <= okMax => ok; okMax < dev <= warningMax => warning; dev > warningMax => error.
 */
export const SYMMETRY_TOLERANCE: {
  readonly okMax: number;
  readonly warningMax: number;
} = {
  okMax: 10,
  warningMax: 20,
} as const;

/** Penalización de puntaje por severidad de cada hallazgo. */
export const SEVERITY_PENALTY: Record<'ok' | 'warning' | 'error', number> = {
  ok: 0,
  warning: 10,
  error: 25,
};
