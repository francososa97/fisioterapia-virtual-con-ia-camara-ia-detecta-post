/**
 * Algoritmo de evaluación de ángulos: flexión de rodilla (E2-T4).
 *
 * Calcula el ángulo formado por la terna cadera–rodilla–tobillo y lo compara
 * contra los rangos de técnica correcta definidos para el ejercicio de
 * flexión de rodilla, devolviendo feedback correctivo por repetición.
 *
 * Convención del ángulo: 180° = pierna totalmente extendida,
 * ángulos menores = mayor flexión (90° ≈ flexión profunda de sentadilla).
 */

import {
  extractKneeJoint,
  type BodySide,
  type KneeJointLandmarks,
  type Landmark,
  type PoseLandmarks,
} from './landmarks';

/** Veredicto de la técnica en una lectura puntual. */
export type KneeFlexionVerdict =
  | 'correct'
  | 'insufficient-flexion'
  | 'excessive-flexion'
  | 'not-detected';

/**
 * Rango de ángulos (en grados) que define la técnica correcta.
 * Para flexión de rodilla en rehabilitación se busca alcanzar un rango de
 * flexión seguro sin sobrepasar el punto que carga en exceso la articulación.
 */
export interface KneeFlexionRange {
  /** Ángulo mínimo seguro; por debajo hay flexión excesiva. */
  readonly minAngle: number;
  /** Ángulo máximo para contar como flexión válida; por encima es insuficiente. */
  readonly maxAngle: number;
}

/**
 * Rango por defecto para flexión de rodilla de rehabilitación estándar.
 * Basado en objetivos clínicos habituales: flexión activa entre ~90° y ~130°.
 */
export const DEFAULT_KNEE_FLEXION_RANGE: KneeFlexionRange = {
  minAngle: 90,
  maxAngle: 130,
};

/** Resultado de evaluar la técnica en un frame. */
export interface KneeFlexionEvaluation {
  readonly verdict: KneeFlexionVerdict;
  /** Ángulo medido en grados, o `null` si no se pudo detectar. */
  readonly angle: number | null;
  /** Lado evaluado. */
  readonly side: BodySide;
  /** Mensaje correctivo listo para mostrar al paciente. */
  readonly feedback: string;
  /** `true` si la ejecución fue correcta. */
  readonly isCorrect: boolean;
}

/**
 * Calcula el ángulo interno (en grados) en el vértice `b` formado por los
 * puntos a–b–c usando el producto punto de los vectores. Trabaja en 2D (x, y)
 * porque la flexión de rodilla es un movimiento predominantemente sagital y la
 * coordenada `z` de MediaPipe es menos fiable.
 */
export function computeAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const magAb = Math.hypot(abx, aby);
  const magCb = Math.hypot(cbx, cby);

  if (magAb === 0 || magCb === 0) {
    return 0;
  }

  // Clamp para evitar NaN por errores de redondeo fuera de [-1, 1].
  const cosine = Math.min(1, Math.max(-1, dot / (magAb * magCb)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/** Calcula el ángulo de rodilla a partir de la terna de landmarks. */
export function computeKneeAngle(joint: KneeJointLandmarks): number {
  return computeAngle(joint.hip, joint.knee, joint.ankle);
}

function buildFeedback(verdict: KneeFlexionVerdict, angle: number | null): string {
  switch (verdict) {
    case 'correct':
      return 'Técnica correcta. Mantené el control del movimiento.';
    case 'insufficient-flexion':
      return `Flexioná un poco más la rodilla (ángulo actual ${Math.round(
        angle ?? 0,
      )}°). Bajá con control hasta el rango objetivo.`;
    case 'excessive-flexion':
      return `Estás flexionando demasiado (ángulo actual ${Math.round(
        angle ?? 0,
      )}°). Reducí la flexión para proteger la articulación.`;
    case 'not-detected':
      return 'No se detecta la rodilla con claridad. Ubicate de perfil y asegurá buena iluminación.';
  }
}

/**
 * Evalúa un frame de landmarks y devuelve el veredicto de técnica para la
 * flexión de rodilla del lado indicado.
 */
export function evaluateKneeFlexion(
  landmarks: PoseLandmarks,
  side: BodySide,
  range: KneeFlexionRange = DEFAULT_KNEE_FLEXION_RANGE,
): KneeFlexionEvaluation {
  const joint = extractKneeJoint(landmarks, side);

  if (joint === null) {
    return {
      verdict: 'not-detected',
      angle: null,
      side,
      feedback: buildFeedback('not-detected', null),
      isCorrect: false,
    };
  }

  const angle = computeKneeAngle(joint);

  let verdict: KneeFlexionVerdict;
  if (angle > range.maxAngle) {
    verdict = 'insufficient-flexion';
  } else if (angle < range.minAngle) {
    verdict = 'excessive-flexion';
  } else {
    verdict = 'correct';
  }

  return {
    verdict,
    angle,
    side,
    feedback: buildFeedback(verdict, angle),
    isCorrect: verdict === 'correct',
  };
}
