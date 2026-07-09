/**
 * Punto de entrada público del módulo de evaluación de flexión de rodilla (E2-T4).
 */
export {
  PoseLandmark,
  MIN_VISIBILITY,
  extractKneeJoint,
} from './landmarks';
export type {
  Landmark,
  PoseLandmarks,
  BodySide,
  KneeJointLandmarks,
} from './landmarks';

export {
  computeAngle,
  computeKneeAngle,
  evaluateKneeFlexion,
  DEFAULT_KNEE_FLEXION_RANGE,
} from './knee-flexion';
export type {
  KneeFlexionRange,
  KneeFlexionVerdict,
  KneeFlexionEvaluation,
} from './knee-flexion';
