// Barrel público del feature "Motor de Detección de Postura con IA".
// Los consumidores (UI de sesión de ejercicios, reglas de corrección)
// deben importar exclusivamente desde este punto de entrada.

export {
  PoseDetectionService,
  DEFAULT_POSE_CONFIG,
} from './pose-detection.service';

export {
  PoseLandmarkIndex,
  PoseDetectionError,
} from './pose-detection.types';

export type {
  PoseLandmark,
  PoseFrameResult,
  PoseDetectorStatus,
  PoseModelComplexity,
  PoseDetectionConfig,
  PartialPoseDetectionConfig,
  PoseDetectionHandlers,
  PoseDetectionErrorCode,
} from './pose-detection.types';
