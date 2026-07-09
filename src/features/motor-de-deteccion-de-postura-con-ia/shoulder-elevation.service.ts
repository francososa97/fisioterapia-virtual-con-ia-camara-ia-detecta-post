/**
 * Algoritmo de evaluación de ángulos para el ejercicio de elevación de hombro.
 *
 * Dado un conjunto de landmarks de pose (MediaPipe Pose), calcula los ángulos
 * relevantes de la articulación y compara contra los rangos correctos para
 * generar feedback correctivo en tiempo real.
 */

import {
  AngleRange,
  BodySide,
  PoseLandmark,
  PoseLandmarks,
  ShoulderElevationAngles,
  ShoulderElevationCriteria,
  ShoulderElevationEvaluation,
  ShoulderElevationIssue,
  SHOULDER_ELEVATION_LANDMARKS,
} from './shoulder-elevation.types';

/**
 * Criterios por defecto para una elevación de hombro (abducción) segura.
 * Basados en rangos clínicos típicos de rehabilitación: el objetivo es
 * alcanzar ~90° manteniendo el brazo extendido y sin inclinar el tronco.
 */
export const DEFAULT_SHOULDER_ELEVATION_CRITERIA: ShoulderElevationCriteria = {
  shoulderElevation: { min: 80, max: 100 },
  elbowExtension: { min: 150, max: 180 },
  maxTorsoTilt: 12,
  minLandmarkVisibility: 0.5,
};

/** Índices de landmarks resueltos según el lado a evaluar. */
interface SideLandmarkIndices {
  readonly shoulder: number;
  readonly elbow: number;
  readonly wrist: number;
  readonly hip: number;
}

function resolveSideIndices(side: BodySide): SideLandmarkIndices {
  const l = SHOULDER_ELEVATION_LANDMARKS;
  return side === 'left'
    ? { shoulder: l.LEFT_SHOULDER, elbow: l.LEFT_ELBOW, wrist: l.LEFT_WRIST, hip: l.LEFT_HIP }
    : { shoulder: l.RIGHT_SHOULDER, elbow: l.RIGHT_ELBOW, wrist: l.RIGHT_WRIST, hip: l.RIGHT_HIP };
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calcula el ángulo (en grados, [0, 180]) formado en el vértice `b` por los
 * segmentos b→a y b→c, usando el producto punto en el plano de la imagen (x, y).
 */
export function angleAtVertex(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
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

  // Se acota a [-1, 1] para evitar NaN por error de punto flotante.
  const cosine = Math.min(1, Math.max(-1, dot / (magAb * magCb)));
  return Math.acos(cosine) * RAD_TO_DEG;
}

/**
 * Inclinación lateral del torso en grados: ángulo entre la línea de hombros
 * y la horizontal de la imagen. 0° = hombros nivelados.
 */
export function torsoTilt(leftShoulder: PoseLandmark, rightShoulder: PoseLandmark): number {
  const dx = rightShoulder.x - leftShoulder.x;
  const dy = rightShoulder.y - leftShoulder.y;
  if (dx === 0 && dy === 0) {
    return 0;
  }
  return Math.abs(Math.atan2(dy, dx) * RAD_TO_DEG);
}

function getLandmark(landmarks: PoseLandmarks, index: number): PoseLandmark | undefined {
  return landmarks[index];
}

function isVisible(landmark: PoseLandmark, minVisibility: number): boolean {
  return landmark.visibility === undefined || landmark.visibility >= minVisibility;
}

/** Distancia de un valor al rango; 0 si está dentro. */
function distanceToRange(value: number, range: AngleRange): number {
  if (value < range.min) {
    return range.min - value;
  }
  if (value > range.max) {
    return value - range.max;
  }
  return 0;
}

/**
 * Convierte una desviación (en grados) respecto a un rango en una penalización
 * de puntaje acotada a [0, maxPenalty], usando `tolerance` como escala.
 */
function penalty(deviation: number, tolerance: number, maxPenalty: number): number {
  if (deviation <= 0) {
    return 0;
  }
  const ratio = Math.min(1, deviation / tolerance);
  return Math.round(ratio * maxPenalty);
}

/**
 * Evalúa un frame de elevación de hombro y devuelve ángulos, issues y puntaje.
 *
 * @param landmarks Landmarks de pose (mínimo los 33 puntos de MediaPipe Pose).
 * @param side Lado del cuerpo a evaluar.
 * @param criteria Rangos correctos (usa los defaults si se omite).
 */
export function evaluateShoulderElevation(
  landmarks: PoseLandmarks,
  side: BodySide,
  criteria: ShoulderElevationCriteria = DEFAULT_SHOULDER_ELEVATION_CRITERIA,
): ShoulderElevationEvaluation {
  const idx = resolveSideIndices(side);
  const l = SHOULDER_ELEVATION_LANDMARKS;

  const shoulder = getLandmark(landmarks, idx.shoulder);
  const elbow = getLandmark(landmarks, idx.elbow);
  const wrist = getLandmark(landmarks, idx.wrist);
  const hip = getLandmark(landmarks, idx.hip);
  const leftShoulder = getLandmark(landmarks, l.LEFT_SHOULDER);
  const rightShoulder = getLandmark(landmarks, l.RIGHT_SHOULDER);

  const zeroAngles: ShoulderElevationAngles = {
    shoulderElevation: 0,
    elbowExtension: 0,
    torsoTilt: 0,
  };

  if (!shoulder || !elbow || !wrist || !hip || !leftShoulder || !rightShoulder) {
    return {
      side,
      isCorrect: false,
      score: 0,
      angles: zeroAngles,
      issues: [
        {
          code: 'LOW_VISIBILITY',
          severity: 'error',
          message:
            'No se detectan todos los puntos del cuerpo. Ubicate frente a la cámara con el torso y el brazo visibles.',
        },
      ],
    };
  }

  const requiredVisible = [shoulder, elbow, wrist, hip].every((point) =>
    isVisible(point, criteria.minLandmarkVisibility),
  );

  if (!requiredVisible) {
    return {
      side,
      isCorrect: false,
      score: 0,
      angles: zeroAngles,
      issues: [
        {
          code: 'LOW_VISIBILITY',
          severity: 'error',
          message:
            'La cámara no ve con claridad tu brazo. Mejorá la iluminación o alejate un poco para que se vea completo.',
        },
      ],
    };
  }

  const shoulderElevation = angleAtVertex(hip, shoulder, elbow);
  const elbowExtension = angleAtVertex(shoulder, elbow, wrist);
  const tilt = torsoTilt(leftShoulder, rightShoulder);

  const angles: ShoulderElevationAngles = {
    shoulderElevation: Math.round(shoulderElevation * 10) / 10,
    elbowExtension: Math.round(elbowExtension * 10) / 10,
    torsoTilt: Math.round(tilt * 10) / 10,
  };

  const issues: ShoulderElevationIssue[] = [];
  let score = 100;

  const elevationDeviation = distanceToRange(shoulderElevation, criteria.shoulderElevation);
  if (elevationDeviation > 0) {
    if (shoulderElevation < criteria.shoulderElevation.min) {
      issues.push({
        code: 'ELEVATION_TOO_LOW',
        severity: 'warning',
        message: `Estás elevando poco el brazo (${angles.shoulderElevation}°). Subilo hasta la altura del hombro, cerca de ${criteria.shoulderElevation.min}°.`,
      });
    } else {
      issues.push({
        code: 'ELEVATION_TOO_HIGH',
        severity: 'warning',
        message: `Estás elevando demasiado el brazo (${angles.shoulderElevation}°). Bajalo un poco para no forzar el hombro.`,
      });
    }
    score -= penalty(elevationDeviation, 40, 45);
  }

  const elbowDeviation = distanceToRange(elbowExtension, criteria.elbowExtension);
  if (elbowDeviation > 0 && elbowExtension < criteria.elbowExtension.min) {
    issues.push({
      code: 'ELBOW_TOO_BENT',
      severity: 'warning',
      message: `Mantené el codo más extendido (${angles.elbowExtension}°). El brazo debe ir casi recto durante el movimiento.`,
    });
    score -= penalty(elbowDeviation, 50, 25);
  }

  if (tilt > criteria.maxTorsoTilt) {
    issues.push({
      code: 'TORSO_COMPENSATION',
      severity: 'error',
      message: `Estás inclinando el tronco (${angles.torsoTilt}°) para ayudarte. Mantené la espalda recta y el movimiento sólo en el hombro.`,
    });
    score -= penalty(tilt - criteria.maxTorsoTilt, 20, 40);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const isCorrect = issues.every((issue) => issue.severity !== 'error');

  return {
    side,
    isCorrect,
    score: finalScore,
    angles,
    issues,
  };
}
