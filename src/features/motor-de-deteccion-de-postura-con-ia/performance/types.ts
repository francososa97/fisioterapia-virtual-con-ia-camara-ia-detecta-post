// Tipos del subsistema de optimización de rendimiento en tiempo real.
// Reutilizables por el motor de detección de postura. Sin `any`, todo explícito.

/** Clasificación aproximada del dispositivo según sus capacidades de hardware. */
export type DeviceTier = 'low' | 'medium' | 'high';

/** Nivel de calidad de procesamiento aplicado al pipeline de inferencia. */
export type QualityLevel = 'minimal' | 'balanced' | 'full';

/** Muestra puntual de rendimiento tomada tras procesar un frame. */
export interface PerformanceSample {
  readonly timestamp: number;
  readonly frameDurationMs: number;
  readonly inferenceDurationMs: number;
}

/** Métricas agregadas expuestas a la UI y a la lógica de adaptación. */
export interface PerformanceMetrics {
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly averageInferenceMs: number;
  readonly droppedFrames: number;
  readonly quality: QualityLevel;
  readonly deviceTier: DeviceTier;
  readonly targetFps: number;
}

/** Capacidades detectadas del dispositivo y presupuesto de rendimiento derivado. */
export interface DeviceCapabilities {
  readonly tier: DeviceTier;
  readonly logicalCores: number;
  readonly deviceMemoryGb: number;
  readonly targetFps: number;
  readonly maxInputResolution: number;
  readonly initialQuality: QualityLevel;
}

/** Parámetros que gobiernan el bucle adaptativo. */
export interface OptimizerConfig {
  /** FPS mínimo al que se puede degradar antes de rendirse. */
  readonly minFps: number;
  /** FPS máximo permitido aunque el dispositivo dé más. */
  readonly maxFps: number;
  /** Cantidad de muestras usadas para promediar. */
  readonly sampleWindow: number;
  /** Si el tiempo de inferencia supera esto (ms), se degrada. */
  readonly degradeThresholdMs: number;
  /** Si el tiempo de inferencia baja de esto (ms), se puede mejorar. */
  readonly upgradeThresholdMs: number;
  /** Frames consecutivos estables antes de cambiar de nivel. */
  readonly stabilityFrames: number;
}

/** Callback ejecutado en cada frame que efectivamente se procesa. */
export type FrameCallback = (
  deltaMs: number,
  metrics: PerformanceMetrics,
) => void | Promise<void>;

/** Suscriptor a cambios de calidad (para reconfigurar el modelo/resolución). */
export type QualityChangeListener = (
  quality: QualityLevel,
  targetFps: number,
) => void;
