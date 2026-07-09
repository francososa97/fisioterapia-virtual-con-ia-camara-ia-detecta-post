/**
 * Definición de landmarks corporales y tipos base para el motor de detección
 * de postura. Los índices siguen el estándar de MediaPipe Pose (33 puntos),
 * que es el formato producido por la capa de captura de cámara (E2 previas).
 */

/** Índices de los landmarks relevantes en el modelo MediaPipe Pose. */
export enum PoseLandmark {
  LeftHip = 23,
  RightHip = 24,
  LeftKnee = 25,
  RightKnee = 26,
  LeftAnkle = 27,
  RightAnkle = 28,
}

/**
 * Un landmark normalizado tal como lo entrega el detector de postura.
 * `x`, `y`, `z` están normalizados al rango [0, 1] respecto al frame.
 * `visibility` es la confianza [0, 1] de que el punto sea visible.
 */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility: number;
}

/** Colección indexable de landmarks devuelta por frame. */
export type PoseLandmarks = ReadonlyArray<Landmark>;

/** Lado del cuerpo a evaluar. */
export type BodySide = 'left' | 'right';

/** Terna de landmarks (cadera, rodilla, tobillo) que forma el ángulo de rodilla. */
export interface KneeJointLandmarks {
  readonly hip: Landmark;
  readonly knee: Landmark;
  readonly ankle: Landmark;
}

/** Confianza mínima aceptable para considerar un landmark fiable. */
export const MIN_VISIBILITY = 0.6;

/**
 * Extrae la terna cadera–rodilla–tobillo para el lado indicado.
 * Devuelve `null` si faltan puntos o su visibilidad es insuficiente.
 */
export function extractKneeJoint(
  landmarks: PoseLandmarks,
  side: BodySide,
): KneeJointLandmarks | null {
  const [hipIdx, kneeIdx, ankleIdx] =
    side === 'left'
      ? [PoseLandmark.LeftHip, PoseLandmark.LeftKnee, PoseLandmark.LeftAnkle]
      : [PoseLandmark.RightHip, PoseLandmark.RightKnee, PoseLandmark.RightAnkle];

  const hip = landmarks[hipIdx];
  const knee = landmarks[kneeIdx];
  const ankle = landmarks[ankleIdx];

  if (hip === undefined || knee === undefined || ankle === undefined) {
    return null;
  }

  if (
    hip.visibility < MIN_VISIBILITY ||
    knee.visibility < MIN_VISIBILITY ||
    ankle.visibility < MIN_VISIBILITY
  ) {
    return null;
  }

  return { hip, knee, ankle };
}
