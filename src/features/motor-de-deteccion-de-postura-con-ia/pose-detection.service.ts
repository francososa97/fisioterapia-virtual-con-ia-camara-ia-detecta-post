// Servicio de detección de postura en tiempo real para el navegador.
//
// Integra MediaPipe Tasks Vision (PoseLandmarker) con acceso a cámara vía
// getUserMedia y un bucle de inferencia basado en requestAnimationFrame.
// Expone un ciclo de vida explícito (initialize -> start -> stop -> dispose)
// y emite resultados tipados por frame, listos para las reglas de corrección
// de ejercicios de la épica "Motor de Detección de Postura con IA".
//
// Dependencia (peer): @mediapipe/tasks-vision
//   npm i @mediapipe/tasks-vision

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
  type NormalizedLandmark,
  type Landmark,
} from '@mediapipe/tasks-vision';

import {
  PoseDetectionError,
  type PoseDetectionConfig,
  type PoseDetectionHandlers,
  type PoseDetectorStatus,
  type PoseFrameResult,
  type PoseLandmark,
  type PartialPoseDetectionConfig,
  type PoseModelComplexity,
} from './pose-detection.types';

const MEDIAPIPE_VERSION = '0.10.14';

const MODEL_URL_BY_COMPLEXITY: Readonly<Record<PoseModelComplexity, string>> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
};

/** Configuración por defecto pensada para rehabilitación individual en desktop/mobile. */
export const DEFAULT_POSE_CONFIG: PoseDetectionConfig = {
  wasmBaseUrl: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
  modelAssetUrl: MODEL_URL_BY_COMPLEXITY.full,
  modelComplexity: 'full',
  numPoses: 1,
  minDetectionConfidence: 0.5,
  minPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  videoConstraints: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'user',
    frameRate: { ideal: 30 },
  },
};

function resolveConfig(overrides?: PartialPoseDetectionConfig): PoseDetectionConfig {
  if (!overrides) {
    return DEFAULT_POSE_CONFIG;
  }
  const complexity: PoseModelComplexity =
    overrides.modelComplexity ?? DEFAULT_POSE_CONFIG.modelComplexity;
  // Si cambia la complejidad y no se pasó una URL explícita, se ajusta el modelo.
  const modelAssetUrl =
    overrides.modelAssetUrl ??
    (overrides.modelComplexity
      ? MODEL_URL_BY_COMPLEXITY[complexity]
      : DEFAULT_POSE_CONFIG.modelAssetUrl);

  return {
    ...DEFAULT_POSE_CONFIG,
    ...overrides,
    modelComplexity: complexity,
    modelAssetUrl,
    videoConstraints: {
      ...DEFAULT_POSE_CONFIG.videoConstraints,
      ...overrides.videoConstraints,
    },
  };
}

function toPoseLandmark(landmark: NormalizedLandmark | Landmark): PoseLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    // visibility puede venir undefined según el build; se normaliza a 0.
    visibility: typeof landmark.visibility === 'number' ? landmark.visibility : 0,
  };
}

function mapResult(
  result: PoseLandmarkerResult,
  timestampMs: number,
  inferenceMs: number,
): PoseFrameResult | null {
  const first = result.landmarks[0];
  if (!first || first.length === 0) {
    return null;
  }
  const worldFirst = result.worldLandmarks[0] ?? [];
  return {
    landmarks: first.map(toPoseLandmark),
    worldLandmarks: worldFirst.map(toPoseLandmark),
    timestampMs,
    inferenceMs,
  };
}

/**
 * Motor de detección de postura en tiempo real.
 *
 * Uso típico:
 * ```ts
 * const service = new PoseDetectionService({
 *   onResult: (frame) => corrector.evaluate(frame),
 *   onError: (err) => console.error(err.code, err.message),
 * });
 * await service.initialize();
 * await service.start(videoElement);
 * // ...
 * service.stop();
 * service.dispose();
 * ```
 */
export class PoseDetectionService {
  private readonly config: PoseDetectionConfig;
  private readonly handlers: PoseDetectionHandlers;

  private landmarker: PoseLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private lastVideoTimeMs = -1;
  private status: PoseDetectorStatus = 'idle';

  constructor(handlers: PoseDetectionHandlers, overrides?: PartialPoseDetectionConfig) {
    this.handlers = handlers;
    this.config = resolveConfig(overrides);
  }

  /** Estado actual del ciclo de vida del detector. */
  public getStatus(): PoseDetectorStatus {
    return this.status;
  }

  /**
   * Carga el runtime WASM y el modelo de pose. Idempotente: si ya está listo,
   * no vuelve a cargar. Debe llamarse antes de `start`.
   */
  public async initialize(): Promise<void> {
    if (this.landmarker !== null) {
      return;
    }
    if (typeof navigator === 'undefined' || typeof document === 'undefined') {
      throw new PoseDetectionError(
        'UNSUPPORTED_ENVIRONMENT',
        'PoseDetectionService requiere un entorno de navegador (DOM + navigator).',
      );
    }
    this.setStatus('initializing');
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(this.config.wasmBaseUrl);
      this.landmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: this.config.modelAssetUrl,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: this.config.numPoses,
        minPoseDetectionConfidence: this.config.minDetectionConfidence,
        minPosePresenceConfidence: this.config.minPresenceConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });
      this.setStatus('ready');
    } catch (error: unknown) {
      this.setStatus('error');
      throw this.emitError(
        new PoseDetectionError(
          'MODEL_LOAD_FAILED',
          'No se pudo cargar el modelo de pose estimation.',
          error,
        ),
      );
    }
  }

  /**
   * Solicita la cámara, la conecta al elemento de video provisto e inicia el
   * bucle de inferencia en tiempo real. Requiere haber llamado a `initialize`.
   */
  public async start(videoElement: HTMLVideoElement): Promise<void> {
    if (this.landmarker === null) {
      throw this.emitError(
        new PoseDetectionError(
          'INVALID_STATE',
          'Debe llamar a initialize() antes de start().',
        ),
      );
    }
    if (this.status === 'running') {
      return;
    }
    this.videoElement = videoElement;
    await this.acquireCamera(videoElement);
    this.setStatus('running');
    this.lastVideoTimeMs = -1;
    this.scheduleNextFrame();
  }

  /**
   * Detiene el bucle de inferencia y libera los tracks de la cámara,
   * conservando el modelo cargado para poder reanudar con `start`.
   */
  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.releaseCamera();
    if (this.status === 'running') {
      this.setStatus('stopped');
    }
  }

  /**
   * Libera todos los recursos: cámara, bucle y modelo. Tras `dispose` es
   * necesario volver a `initialize` para reutilizar la instancia.
   */
  public dispose(): void {
    this.stop();
    if (this.landmarker !== null) {
      this.landmarker.close();
      this.landmarker = null;
    }
    this.videoElement = null;
    this.setStatus('idle');
  }

  private async acquireCamera(videoElement: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw this.emitError(
        new PoseDetectionError(
          'CAMERA_UNAVAILABLE',
          'La API de mediaDevices.getUserMedia no está disponible en este entorno.',
        ),
      );
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.config.videoConstraints,
        audio: false,
      });
    } catch (error: unknown) {
      const code =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'CAMERA_PERMISSION_DENIED'
          : 'CAMERA_UNAVAILABLE';
      throw this.emitError(
        new PoseDetectionError(code, 'No se pudo acceder a la cámara.', error),
      );
    }
    videoElement.srcObject = this.stream;
    videoElement.playsInline = true;
    videoElement.muted = true;
    await this.waitForVideoReady(videoElement);
    await videoElement.play();
  }

  private waitForVideoReady(videoElement: HTMLVideoElement): Promise<void> {
    if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const onLoaded = (): void => {
        videoElement.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      videoElement.addEventListener('loadedmetadata', onLoaded);
    });
  }

  private releaseCamera(): void {
    if (this.stream !== null) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.videoElement !== null) {
      this.videoElement.srcObject = null;
    }
  }

  private scheduleNextFrame(): void {
    this.rafId = requestAnimationFrame(() => {
      this.processFrame();
    });
  }

  private processFrame(): void {
    const video = this.videoElement;
    const landmarker = this.landmarker;
    if (video === null || landmarker === null || this.status !== 'running') {
      return;
    }

    // Evita reprocesar el mismo frame: sólo inferimos cuando avanza el video.
    if (video.currentTime === this.lastVideoTimeMs || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.scheduleNextFrame();
      return;
    }
    this.lastVideoTimeMs = video.currentTime;

    const timestampMs = video.currentTime * 1000;
    const startedAt = performance.now();
    try {
      landmarker.detectForVideo(video, timestampMs, (raw: PoseLandmarkerResult) => {
        const inferenceMs = performance.now() - startedAt;
        const mapped = mapResult(raw, timestampMs, inferenceMs);
        if (mapped !== null) {
          this.handlers.onResult(mapped);
        }
      });
    } catch (error: unknown) {
      this.setStatus('error');
      this.emitError(
        new PoseDetectionError('INFERENCE_FAILED', 'Falló la inferencia sobre el frame.', error),
      );
      return;
    }
    this.scheduleNextFrame();
  }

  private setStatus(next: PoseDetectorStatus): void {
    if (this.status === next) {
      return;
    }
    this.status = next;
    this.handlers.onStatusChange?.(next);
  }

  private emitError(error: PoseDetectionError): PoseDetectionError {
    this.handlers.onError?.(error);
    return error;
  }
}
