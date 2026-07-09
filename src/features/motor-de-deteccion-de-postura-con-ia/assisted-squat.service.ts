// Algoritmo de evaluación de ángulos para la sentadilla asistida.
// Recibe los landmarks de un frame (MediaPipe Pose) y devuelve una evaluación
// de técnica con ángulos medidos, severidad y correcciones accionables.

import {
  Landmark,
  PoseLandmarks,
  PoseLandmarkIndex,
  BodySide,
  AngleRange,
  FeedbackSeverity,
  JointAngleResult,
  SquatPhase,
  SquatEvaluation,
} from './assisted-squat.types';
import {
  MIN_LANDMARK_VISIBILITY,
  OUT_OF_RANGE_MARGIN_DEG,
  ASSISTED_SQUAT_JOINT_TRIPLETS,
  ASSISTED_SQUAT_RANGES,
  SQUAT_PHASE_THRESHOLDS,
  SYMMETRY_TOLERANCE,
  SEVERITY_PENALTY,
} from './assisted-squat.config';

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sideEs(side: BodySide | 'center'): string {
  if (side === 'left') return 'izquierda';
  if (side === 'right') return 'derecha';
  return 'central';
}

/** Devuelve el landmark si existe y supera el umbral de visibilidad, o null. */
function getLandmark(pose: PoseLandmarks, index: PoseLandmarkIndex): Landmark | null {
  const lm = pose[index];
  if (lm === undefined) return null;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y) || !Number.isFinite(lm.z)) return null;
  if (lm.visibility < MIN_LANDMARK_VISIBILITY) return null;
  return lm;
}

/**
 * Ángulo (en grados) formado en `vertex` por los segmentos vertex->a y vertex->c,
 * usando las tres dimensiones. Devuelve NaN si algún segmento es degenerado.
 */
export function computeAngle(a: Landmark, vertex: Landmark, c: Landmark): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v1z = a.z - vertex.z;
  const v2x = c.x - vertex.x;
  const v2y = c.y - vertex.y;
  const v2z = c.z - vertex.z;
  const m1 = Math.hypot(v1x, v1y, v1z);
  const m2 = Math.hypot(v2x, v2y, v2z);
  if (m1 === 0 || m2 === 0) return Number.NaN;
  const dot = v1x * v2x + v1y * v2y + v1z * v2z;
  const cos = clamp(dot / (m1 * m2), -1, 1);
  return Math.acos(cos) * RAD_TO_DEG;
}

/** Punto medio entre dos landmarks (visibilidad = mínimo de ambos). */
function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

/**
 * Inclinación del torso respecto de la vertical, en grados.
 * 0° = perfectamente erguido; aumenta al inclinarse hacia adelante/atrás.
 * Usa coordenadas de imagen 2D (y crece hacia abajo).
 */
export function computeTrunkInclination(shoulder: Landmark, hip: Landmark): number {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Number.NaN;
  // Producto punto con el vector 'arriba' (0, -1) = -dy.
  const cos = clamp(-dy / mag, -1, 1);
  return Math.acos(cos) * RAD_TO_DEG;
}

function classifySeverity(angle: number, range: AngleRange): FeedbackSeverity {
  if (Number.isNaN(angle)) return 'error';
  if (angle >= range.min && angle <= range.max) return 'ok';
  const distance = angle < range.min ? range.min - angle : angle - range.max;
  return distance <= OUT_OF_RANGE_MARGIN_DEG ? 'warning' : 'error';
}

function detectPhase(avgKneeAngle: number): SquatPhase {
  if (Number.isNaN(avgKneeAngle)) return 'unknown';
  if (avgKneeAngle >= SQUAT_PHASE_THRESHOLDS.standingKneeAngle) return 'standing';
  if (avgKneeAngle <= SQUAT_PHASE_THRESHOLDS.bottomKneeAngle) return 'bottom';
  return 'transition';
}

function kneeMessage(angle: number, range: AngleRange, side: BodySide, severity: FeedbackSeverity): string {
  const deg = Math.round(angle);
  if (severity === 'ok') return `Rodilla ${sideEs(side)}: profundidad correcta (${deg}°).`;
  if (angle < range.min) {
    return `Rodilla ${sideEs(side)}: estás bajando demasiado (${deg}°). Reducí la profundidad hasta ~${range.ideal}° para proteger la articulación.`;
  }
  return `Rodilla ${sideEs(side)}: no estás bajando lo suficiente (${deg}°). Flexioná más la rodilla hasta ~${range.ideal}°.`;
}

function hipMessage(angle: number, range: AngleRange, side: BodySide, severity: FeedbackSeverity): string {
  const deg = Math.round(angle);
  if (severity === 'ok') return `Cadera ${sideEs(side)}: bisagra de cadera correcta (${deg}°).`;
  if (angle < range.min) {
    return `Cadera ${sideEs(side)}: estás cerrando demasiado la cadera (${deg}°). Llevá menos el pecho hacia el muslo y mantené el torso más erguido.`;
  }
  return `Cadera ${sideEs(side)}: cadera demasiado extendida (${deg}°). Iniciá el movimiento llevando la cadera hacia atrás (bisagra) hasta ~${range.ideal}°.`;
}

function trunkMessage(angle: number, range: AngleRange, severity: FeedbackSeverity): string {
  const deg = Math.round(angle);
  if (severity === 'ok') return `Torso: postura erguida correcta (${deg}° de inclinación).`;
  return `Torso: inclinación excesiva hacia adelante (${deg}°). Mantené la espalda más erguida y la mirada al frente (máx. ${range.max}°).`;
}

function makeResult(
  joint: JointAngleResult['joint'],
  side: BodySide | 'center',
  angle: number,
  range: AngleRange,
  severity: FeedbackSeverity,
  message: string,
): JointAngleResult {
  return { joint, side, angle: Number.isNaN(angle) ? Number.NaN : round1(angle), range, severity, message };
}

function symmetrySeverity(deviation: number): FeedbackSeverity {
  if (deviation <= SYMMETRY_TOLERANCE.okMax) return 'ok';
  if (deviation <= SYMMETRY_TOLERANCE.warningMax) return 'warning';
  return 'error';
}

function maxSeverity(a: FeedbackSeverity, b: FeedbackSeverity): FeedbackSeverity {
  const rank: Record<FeedbackSeverity, number> = { ok: 0, warning: 1, error: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function invalidEvaluation(): SquatEvaluation {
  return {
    isValid: false,
    phase: 'unknown',
    overallSeverity: 'error',
    score: 0,
    joints: [],
    corrections: ['No se detectan los puntos corporales necesarios. Ubicate de perfil y con cuerpo completo visible en cámara.'],
    symmetryDeviation: Number.NaN,
  };
}

/**
 * Evalúa la técnica de sentadilla asistida para un frame de pose.
 *
 * Los ángulos de rodilla y cadera solo penalizan el puntaje en la fase 'bottom'
 * (punto más bajo del movimiento); la inclinación del torso y la simetría se
 * evalúan siempre. Devuelve una evaluación estable e inmutable.
 */
export function evaluateAssistedSquat(pose: PoseLandmarks): SquatEvaluation {
  const leftKneeT = ASSISTED_SQUAT_JOINT_TRIPLETS.knee.left;
  const rightKneeT = ASSISTED_SQUAT_JOINT_TRIPLETS.knee.right;
  const leftHipT = ASSISTED_SQUAT_JOINT_TRIPLETS.hip.left;
  const rightHipT = ASSISTED_SQUAT_JOINT_TRIPLETS.hip.right;

  const leftShoulder = getLandmark(pose, PoseLandmarkIndex.LEFT_SHOULDER);
  const rightShoulder = getLandmark(pose, PoseLandmarkIndex.RIGHT_SHOULDER);
  const leftHip = getLandmark(pose, PoseLandmarkIndex.LEFT_HIP);
  const rightHip = getLandmark(pose, PoseLandmarkIndex.RIGHT_HIP);
  const leftKnee = getLandmark(pose, PoseLandmarkIndex.LEFT_KNEE);
  const rightKnee = getLandmark(pose, PoseLandmarkIndex.RIGHT_KNEE);
  const leftAnkle = getLandmark(pose, PoseLandmarkIndex.LEFT_ANKLE);
  const rightAnkle = getLandmark(pose, PoseLandmarkIndex.RIGHT_ANKLE);

  if (
    leftShoulder === null || rightShoulder === null ||
    leftHip === null || rightHip === null ||
    leftKnee === null || rightKnee === null ||
    leftAnkle === null || rightAnkle === null
  ) {
    return invalidEvaluation();
  }

  const leftKneeAngle = computeAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = computeAngle(rightHip, rightKnee, rightAnkle);
  const leftHipAngle = computeAngle(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = computeAngle(rightShoulder, rightHip, rightKnee);

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const trunkAngle = computeTrunkInclination(shoulderMid, hipMid);

  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const phase = detectPhase(avgKneeAngle);
  const evaluateBottomJoints = phase === 'bottom';

  const joints: JointAngleResult[] = [];
  const corrections: string[] = [];
  let score = 100;
  let overall: FeedbackSeverity = 'ok';

  const kneeRange = ASSISTED_SQUAT_RANGES.kneeBottom;
  const hipRange = ASSISTED_SQUAT_RANGES.hipBottom;
  const trunkRange = ASSISTED_SQUAT_RANGES.trunkInclination;

  const kneeInputs: ReadonlyArray<{ side: BodySide; angle: number }> = [
    { side: 'left', angle: leftKneeAngle },
    { side: 'right', angle: rightKneeAngle },
  ];
  const hipInputs: ReadonlyArray<{ side: BodySide; angle: number }> = [
    { side: 'left', angle: leftHipAngle },
    { side: 'right', angle: rightHipAngle },
  ];

  for (const { side, angle } of kneeInputs) {
    if (evaluateBottomJoints) {
      const severity = classifySeverity(angle, kneeRange);
      const message = kneeMessage(angle, kneeRange, side, severity);
      joints.push(makeResult('knee', side, angle, kneeRange, severity, message));
      score -= SEVERITY_PENALTY[severity];
      overall = maxSeverity(overall, severity);
      if (severity !== 'ok') corrections.push(message);
    } else {
      joints.push(makeResult('knee', side, angle, kneeRange, 'ok', `Rodilla ${sideEs(side)}: ${Math.round(angle)}° (evaluación de profundidad activa en el punto más bajo).`));
    }
  }

  for (const { side, angle } of hipInputs) {
    if (evaluateBottomJoints) {
      const severity = classifySeverity(angle, hipRange);
      const message = hipMessage(angle, hipRange, side, severity);
      joints.push(makeResult('hip', side, angle, hipRange, severity, message));
      score -= SEVERITY_PENALTY[severity];
      overall = maxSeverity(overall, severity);
      if (severity !== 'ok') corrections.push(message);
    } else {
      joints.push(makeResult('hip', side, angle, hipRange, 'ok', `Cadera ${sideEs(side)}: ${Math.round(angle)}° (evaluación de bisagra activa en el punto más bajo).`));
    }
  }

  // Torso: se evalúa siempre.
  const trunkSeverity = classifySeverity(trunkAngle, trunkRange);
  const trunkMsg = trunkMessage(trunkAngle, trunkRange, trunkSeverity);
  joints.push(makeResult('trunk', 'center', trunkAngle, trunkRange, trunkSeverity, trunkMsg));
  score -= SEVERITY_PENALTY[trunkSeverity];
  overall = maxSeverity(overall, trunkSeverity);
  if (trunkSeverity !== 'ok') corrections.push(trunkMsg);

  // Simetría entre rodillas: se evalúa siempre.
  const symmetryDeviation = Math.abs(leftKneeAngle - rightKneeAngle);
  const symSeverity = symmetrySeverity(symmetryDeviation);
  const symRange: AngleRange = { min: 0, max: SYMMETRY_TOLERANCE.okMax, ideal: 0 };
  const symMsg = symSeverity === 'ok'
    ? `Simetría: peso repartido de forma pareja (${round1(symmetryDeviation)}° de diferencia).`
    : `Simetría: diferencia de ${round1(symmetryDeviation)}° entre rodillas. Distribuí el peso de forma pareja entre ambas piernas.`;
  joints.push(makeResult('symmetry', 'center', symmetryDeviation, symRange, symSeverity, symMsg));
  score -= SEVERITY_PENALTY[symSeverity];
  overall = maxSeverity(overall, symSeverity);
  if (symSeverity !== 'ok') corrections.push(symMsg);

  return {
    isValid: true,
    phase,
    overallSeverity: overall,
    score: clamp(Math.round(score), 0, 100),
    joints,
    corrections,
    symmetryDeviation: round1(symmetryDeviation),
  };
}
