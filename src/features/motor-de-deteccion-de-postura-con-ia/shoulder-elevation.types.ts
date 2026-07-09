/**
 * Tipos de dominio para la evaluación de la técnica de elevación de hombro
 * (shoulder abduction / flexion) a partir de landmarks corporales.
 *
 * Los índices de landmarks siguen la convención de MediaPipe Pose (33 puntos).
 * @see https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */

/** Lado del cuerpo a evaluar. */
export type BodySide = 'left' | 'right';

/**
 * Un landmark corporal normalizado devuelto por el modelo de pose.
 * `x` e `y` están normalizados a [0, 1] respecto al frame de la cámara.
 * `visibility` (opcional) indica la confianza del punto en [0, 1].
 */
export interface PoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

/**
 * Colección de landmarks indexada por posición.
 * Debe contener al menos los 33 puntos del modelo MediaPipe Pose.
 */
export type PoseLandmarks = readonly PoseLandmark[];

/**
 * Índices de los landmarks de MediaPipe Pose relevantes para la elevación
 * de hombro. Sólo se listan los que usa este algoritmo.
 */
export const SHOULDER_ELEVATION_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/** Rango cerrado de ángulos (en grados) considerado correcto. */
export interface AngleRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Definición de los rangos de ángulos correctos para la elevación de hombro.
 * Todos los valores están expresados en grados.
 */
export interface ShoulderElevationCriteria {
  /**
   * Ángulo de abducción/flexión en el hombro, medido entre el torso
   * (hombro→cadera) y el brazo (hombro→codo). Es el ángulo objetivo del
   * ejercicio: cuánto se eleva el brazo respecto al costado del cuerpo.
   */
  readonly shoulderElevation: AngleRange;
  /**
   * Ángulo del codo (hombro→codo→muñeca). El brazo debe permanecer
   * razonablemente extendido durante la elevación.
   */
  readonly elbowExtension: AngleRange;
  /**
   * Inclinación lateral máxima del torso (hombros vs. caderas) permitida.
   * Sirve para detectar compensación con el tronco. En grados absolutos.
   */
  readonly maxTorsoTilt: number;
  /** Visibilidad mínima requerida por landmark para confiar en la lectura. */
  readonly minLandmarkVisibility: number;
}

/** Severidad de un problema detectado en la técnica. */
export type IssueSeverity = 'info' | 'warning' | 'error';

/** Código estable para identificar cada tipo de corrección. */
export type ShoulderElevationIssueCode =
  | 'LOW_VISIBILITY'
  | 'ELEVATION_TOO_LOW'
  | 'ELEVATION_TOO_HIGH'
  | 'ELBOW_TOO_BENT'
  | 'TORSO_COMPENSATION';

/** Un problema concreto detectado durante la evaluación. */
export interface ShoulderElevationIssue {
  readonly code: ShoulderElevationIssueCode;
  readonly severity: IssueSeverity;
  /** Mensaje correctivo, en español, dirigido al paciente. */
  readonly message: string;
}

/** Ángulos medidos (en grados) durante una evaluación. */
export interface ShoulderElevationAngles {
  readonly shoulderElevation: number;
  readonly elbowExtension: number;
  readonly torsoTilt: number;
}

/** Resultado completo de evaluar un frame de elevación de hombro. */
export interface ShoulderElevationEvaluation {
  readonly side: BodySide;
  /** `true` si la técnica es correcta (sin issues de severidad 'error'). */
  readonly isCorrect: boolean;
  /** Puntaje de calidad de la repetición en [0, 100]. */
  readonly score: number;
  readonly angles: ShoulderElevationAngles;
  readonly issues: readonly ShoulderElevationIssue[];
}
