// Tipos del motor de detección de postura basado en pose estimation.
// Al no existir aún src/shared/types/index.ts, se declaran aquí los contratos
// del feature. Cuando el módulo compartido esté disponible, estos tipos pueden
// re-exportarse desde allí sin romper a los consumidores.

/**
 * Índices de los 33 landmarks del modelo de pose de MediaPipe (BlazePose).
 * Se exponen como enum para referenciar articulaciones por nombre en las
 * reglas de corrección de ejercicios (ej. rodilla, hombro, cadera).
 */
export enum PoseLandmarkIndex {
  Nose = 0,
  LeftEyeInner = 1,
  LeftEye = 2,
  LeftEyeOuter = 3,
  RightEyeInner = 4,
  RightEye = 5,
  RightEyeOuter = 6,
  LeftEar = 7,
  RightEar = 8,
  MouthLeft = 9,
  MouthRight = 10,
  LeftShoulder = 11,
  RightShoulder = 12,
  LeftElbow = 13,
  RightElbow = 14,
  LeftWrist = 15,
  RightWrist = 16,
  LeftPinky = 17,
  RightPinky = 18,
  LeftIndex = 19,
  RightIndex = 20,
  LeftThumb = 21,
  RightThumb = 22,
  LeftHip = 23,
  RightHip = 24,
  LeftKnee = 25,
  RightKnee = 26,
  LeftAnkle = 27,
  RightAnkle = 28,
  LeftHeel = 29,
  RightHeel = 30,
  LeftFootIndex = 31,
  RightFootIndex = 32,
}

/** Punto anatómico normalizado (0..1 relativo al frame) más metadatos. */
export interface PoseLandmark {
  /** Coordenada horizontal normalizada [0, 1]. */
  readonly x: number;
  /** Coordenada vertical normalizada [0, 1]. */
  readonly y: number;
  /** Profundidad relativa a la cadera; negativo = más cerca de la cámara. */
  readonly z: number;
  /** Probabilidad [0, 1] de que el landmark esté presente y sea fiable. */
  readonly visibility: number;
}

/** Resultado de una inferencia sobre un frame de video. */
export interface PoseFrameResult {
  /** Landmarks normalizados al frame (image space). */
  readonly landmarks: readonly PoseLandmark[];
  /** Landmarks en coordenadas del mundo (metros, origen en la cadera). */
  readonly worldLandmarks: readonly PoseLandmark[];
  /** Timestamp del frame en milisegundos (monotónico). */
  readonly timestampMs: number;
  /** Latencia de inferencia del frame en milisegundos. */
  readonly inferenceMs: number;
}

/** Estados del ciclo de vida del detector. */
export type PoseDetectorStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'stopped'
  | 'error';

/** Modo de complejidad del modelo; equilibra precisión vs. rendimiento. */
export type PoseModelComplexity = 'lite' | 'full' | 'heavy';

/** Configuración de inicialización del servicio. */
export interface PoseDetectionConfig {
  /**
   * URL raíz del WASM de MediaPipe Tasks Vision.
   * Por defecto usa el CDN de jsdelivr para la versión fijada.
   */
  readonly wasmBaseUrl: string;
  /** URL del archivo .task del modelo de pose landmarker. */
  readonly modelAssetUrl: string;
  /** Variante del modelo a cargar. */
  readonly modelComplexity: PoseModelComplexity;
  /** Cantidad máxima de personas a detectar (1 para rehabilitación individual). */
  readonly numPoses: number;
  /** Confianza mínima de detección [0, 1]. */
  readonly minDetectionConfidence: number;
  /** Confianza mínima de presencia [0, 1]. */
  readonly minPresenceConfidence: number;
  /** Confianza mínima de tracking entre frames [0, 1]. */
  readonly minTrackingConfidence: number;
  /** Restricciones de video para getUserMedia. */
  readonly videoConstraints: MediaTrackConstraints;
}

/** Callbacks del bucle de inferencia en tiempo real. */
export interface PoseDetectionHandlers {
  /** Se invoca por cada frame procesado con al menos una pose. */
  readonly onResult: (result: PoseFrameResult) => void;
  /** Se invoca ante cualquier error irrecuperable del pipeline. */
  readonly onError?: (error: PoseDetectionError) => void;
  /** Se invoca en cada transición de estado del detector. */
  readonly onStatusChange?: (status: PoseDetectorStatus) => void;
}

/** Códigos de error del motor de detección. */
export type PoseDetectionErrorCode =
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INVALID_STATE';

/** Error tipado del pipeline de pose estimation. */
export class PoseDetectionError extends Error {
  public readonly code: PoseDetectionErrorCode;
  public readonly cause?: unknown;

  constructor(code: PoseDetectionErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PoseDetectionError';
    this.code = code;
    this.cause = cause;
    // Mantiene la cadena de prototipos correcta al transpilar a ES5.
    Object.setPrototypeOf(this, PoseDetectionError.prototype);
  }
}

/** Configuración parcial que puede sobreescribir un consumidor. */
export type PartialPoseDetectionConfig = Partial<PoseDetectionConfig>;
