/**
 * Tipos del sistema de alertas visuales y sonoras (E3-T1).
 *
 * En cuanto exista `src/shared/types/index.ts` con tipos de dominio
 * (articulaciones, evaluaciones de postura, etc.) estos tipos deberían
 * re-exportarse desde allí. Mientras tanto se definen aquí de forma
 * autocontenida para mantener el feature funcional en TypeScript strict.
 */

/** Severidad de una desviación de técnica detectada por la IA de postura. */
export enum AlertSeverity {
  /** La técnica está dentro del rango correcto. No se emite alerta. */
  Ok = 'ok',
  /** Desviación leve: el paciente debe ajustar, sin riesgo inmediato. */
  Warning = 'warning',
  /** Desviación grave: riesgo de lesión, corregir de inmediato. */
  Critical = 'critical',
}

/** Canales por los que se puede emitir el feedback correctivo. */
export enum AlertChannel {
  Visual = 'visual',
  Sound = 'sound',
}

/**
 * Métrica evaluada de un ejercicio: representa un ángulo articular u otra
 * medida (ej. "flexión de rodilla") comparada contra su rango prescrito.
 */
export interface PostureMetric {
  /** Identificador estable de la métrica (ej. "knee_flexion"). */
  readonly id: string;
  /** Etiqueta legible para mostrar al paciente (ej. "Flexión de rodilla"). */
  readonly label: string;
  /** Valor medido actual (típicamente grados). */
  readonly value: number;
  /** Límite inferior del rango correcto. */
  readonly minCorrect: number;
  /** Límite superior del rango correcto. */
  readonly maxCorrect: number;
  /**
   * Articulaciones (keypoints) implicadas, para resaltarlas en el overlay.
   * Ej. ["left_hip", "left_knee", "left_ankle"].
   */
  readonly joints: readonly string[];
}

/** Snapshot de la evaluación de una repetición/frame de la sesión. */
export interface PostureEvaluation {
  /** Timestamp del frame en milisegundos (performance.now()). */
  readonly timestamp: number;
  /** Métricas evaluadas en este frame. */
  readonly metrics: readonly PostureMetric[];
}

/** Instrucción concreta de feedback visual a renderizar en el overlay. */
export interface VisualAlert {
  readonly channel: AlertChannel.Visual;
  readonly severity: AlertSeverity;
  /** Mensaje correctivo para el paciente. */
  readonly message: string;
  /** Color asociado a la severidad (hex), para bordes/overlays. */
  readonly color: string;
  /** Keypoints a resaltar en la imagen de la cámara. */
  readonly highlightJoints: readonly string[];
  /** Id de la métrica que originó la alerta. */
  readonly metricId: string;
}

/** Instrucción concreta de feedback sonoro. */
export interface SoundAlert {
  readonly channel: AlertChannel.Sound;
  readonly severity: AlertSeverity;
  /** Frecuencia del tono en Hz. */
  readonly frequencyHz: number;
  /** Duración del tono en milisegundos. */
  readonly durationMs: number;
  /** Volumen normalizado 0..1. */
  readonly volume: number;
}

export type Alert = VisualAlert | SoundAlert;

/** Resultado de evaluar un frame: severidad global + alertas a emitir. */
export interface FeedbackResult {
  readonly severity: AlertSeverity;
  readonly visual: readonly VisualAlert[];
  readonly sound: SoundAlert | null;
}

/** Configuración del motor de alertas. */
export interface AlertConfig {
  /**
   * Fracción del ancho del rango correcto que se tolera antes de pasar
   * de `Warning` a `Critical`. Ej. 0.5 => desviarse más de la mitad del
   * ancho del rango se considera crítico.
   */
  readonly criticalRatio: number;
  /**
   * Tiempo mínimo (ms) entre dos alertas sonoras para no saturar al
   * paciente (debounce global del canal sonoro).
   */
  readonly soundThrottleMs: number;
  /** Paleta de colores por severidad. */
  readonly colors: Readonly<Record<AlertSeverity, string>>;
}

/** Configuración por defecto lista para producción. */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  criticalRatio: 0.5,
  soundThrottleMs: 1500,
  colors: {
    [AlertSeverity.Ok]: '#22c55e',
    [AlertSeverity.Warning]: '#f59e0b',
    [AlertSeverity.Critical]: '#ef4444',
  },
};
