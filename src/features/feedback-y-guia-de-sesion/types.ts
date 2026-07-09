// Tipos del contador de repeticiones para la sesión de ejercicios.
// Estos tipos son locales a la feature de feedback y guía de sesión.
// Cuando exista src/shared/types/index.ts, PoseFrame/JointAngles deberían
// reexportarse desde allí y consumirse vía import compartido.

/**
 * Clasificación de una repetición completada según la calidad de la técnica.
 */
export type RepetitionQuality = 'correct' | 'incorrect';

/**
 * Fase del movimiento dentro de una repetición. El ciclo de una repetición
 * es: rest -> descending -> bottom -> ascending -> rest (vuelta al inicio).
 */
export type MovementPhase = 'rest' | 'descending' | 'bottom' | 'ascending';

/**
 * Ángulo articular principal que se evalúa para un ejercicio dado
 * (por ejemplo, el ángulo de la rodilla en una sentadilla).
 */
export interface JointMeasurement {
  /** Nombre de la articulación evaluada, ej. 'knee', 'shoulder', 'elbow'. */
  readonly joint: string;
  /** Ángulo actual de la articulación en grados [0, 180]. */
  readonly angleDeg: number;
}

/**
 * Frame de postura entrante producido por el módulo de detección de pose.
 * Contiene el ángulo objetivo del ejercicio y una marca temporal.
 */
export interface PoseFrame {
  /** Marca temporal del frame en milisegundos (epoch o relativa al inicio). */
  readonly timestampMs: number;
  /** Medición del ángulo articular principal del ejercicio en este frame. */
  readonly measurement: JointMeasurement;
  /**
   * Confianza de la detección de pose en el rango [0, 1]. Frames por debajo
   * del umbral configurado se ignoran para evitar contar ruido.
   */
  readonly confidence: number;
}

/**
 * Configuración de detección de repeticiones para un ejercicio concreto.
 * Los umbrales están expresados en grados del ángulo articular objetivo.
 */
export interface RepetitionConfig {
  /**
   * Ángulo por encima del cual se considera que la articulación está
   * "extendida" / en posición de reposo (inicio de la repetición).
   */
  readonly topAngleDeg: number;
  /**
   * Ángulo por debajo del cual se considera que la articulación alcanzó
   * el punto más profundo del movimiento (fondo de la repetición).
   */
  readonly bottomAngleDeg: number;
  /**
   * Profundidad mínima requerida para clasificar la repetición como correcta.
   * Es el ángulo máximo permitido en el fondo: si el usuario no baja lo
   * suficiente (ángulo del fondo > este valor), la rep es incorrecta.
   */
  readonly minDepthAngleDeg: number;
  /**
   * Histéresis en grados aplicada a los umbrales para evitar rebotes por
   * ruido cuando el ángulo oscila justo alrededor de un umbral.
   */
  readonly hysteresisDeg: number;
  /** Confianza mínima de pose para tener en cuenta un frame. */
  readonly minConfidence: number;
  /**
   * Duración mínima de una repetición en milisegundos. Repeticiones más
   * rápidas se consideran movimientos bruscos / incorrectos.
   */
  readonly minDurationMs: number;
}

/**
 * Resultado de procesar una repetición completa.
 */
export interface RepetitionResult {
  /** Índice de la repetición (1-based) dentro de la sesión. */
  readonly index: number;
  /** Clasificación de calidad de la repetición. */
  readonly quality: RepetitionQuality;
  /** Ángulo más profundo alcanzado durante la repetición, en grados. */
  readonly deepestAngleDeg: number;
  /** Duración total de la repetición en milisegundos. */
  readonly durationMs: number;
  /** Motivos por los que se clasificó como incorrecta (vacío si es correcta). */
  readonly reasons: readonly string[];
}

/**
 * Snapshot del estado actual del contador.
 */
export interface RepetitionCounts {
  readonly total: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly currentPhase: MovementPhase;
}

/**
 * Callback invocado cada vez que se completa una repetición.
 */
export type RepetitionListener = (result: RepetitionResult) => void;
