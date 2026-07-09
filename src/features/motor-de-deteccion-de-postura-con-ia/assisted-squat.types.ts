// Tipos del algoritmo de evaluación de ángulos para la sentadilla asistida.
// Se definen localmente porque el feature no depende aún de src/shared/types.
// Están alineados con el formato de salida de MediaPipe Pose (33 landmarks).

/** Un punto corporal detectado por el modelo de pose (coordenadas normalizadas 0..1). */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Confianza de detección del punto, 0..1. */
  readonly visibility: number;
}

/** Colección ordenada de landmarks tal como la entrega MediaPipe Pose. */
export type PoseLandmarks = readonly Landmark[];

/** Índices de landmarks de MediaPipe Pose relevantes para la sentadilla. */
export enum PoseLandmarkIndex {
  NOSE = 0,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
  LEFT_FOOT_INDEX = 31,
  RIGHT_FOOT_INDEX = 32,
}

export type BodySide = 'left' | 'right';

/** Articulaciones/segmentos evaluados en la sentadilla asistida. */
export type SquatJoint = 'knee' | 'hip' | 'trunk' | 'symmetry';

/** Rango angular considerado técnicamente correcto para una articulación. */
export interface AngleRange {
  readonly min: number;
  readonly max: number;
  readonly ideal: number;
}

export type FeedbackSeverity = 'ok' | 'warning' | 'error';

/** Fase del movimiento inferida a partir del ángulo de rodilla. */
export type SquatPhase = 'standing' | 'transition' | 'bottom' | 'unknown';

/** Resultado de evaluar una articulación concreta en un frame. */
export interface JointAngleResult {
  readonly joint: SquatJoint;
  readonly side: BodySide | 'center';
  /** Ángulo medido en grados (redondeado a 1 decimal). NaN si no se pudo calcular. */
  readonly angle: number;
  readonly range: AngleRange;
  readonly severity: FeedbackSeverity;
  /** Mensaje correctivo o de confirmación en español. */
  readonly message: string;
}

/** Evaluación completa de la técnica de sentadilla asistida para un frame. */
export interface SquatEvaluation {
  /** true si hubo landmarks suficientes para evaluar. */
  readonly isValid: boolean;
  readonly phase: SquatPhase;
  readonly overallSeverity: FeedbackSeverity;
  /** Puntaje de técnica 0..100 (100 = ejecución perfecta). */
  readonly score: number;
  readonly joints: readonly JointAngleResult[];
  /** Lista de correcciones accionables (mensajes con severity != 'ok'). */
  readonly corrections: readonly string[];
  /** Diferencia absoluta en grados entre rodilla izquierda y derecha. */
  readonly symmetryDeviation: number;
}
