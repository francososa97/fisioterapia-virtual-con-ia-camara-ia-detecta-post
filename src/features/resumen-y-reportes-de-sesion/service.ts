// Lógica pura para construir el resumen de la sesión recién completada.
// Sin dependencias de UI ni de I/O para poder testear de forma aislada.

import type {
  CompletedSession,
  ExerciseResult,
  ExerciseSummaryRow,
  PerformanceLevel,
  PostureError,
  SessionSummaryViewModel,
} from './types';

/** Umbrales de precisión (0–100) que definen el nivel de desempeño. */
const LEVEL_THRESHOLDS: Readonly<Record<PerformanceLevel, number>> = {
  excelente: 90,
  bien: 70,
  'a-mejorar': 0,
};

/** Peso de cada severidad para ordenar los errores más relevantes primero. */
const SEVERITY_WEIGHT: Readonly<Record<PostureError['severity'], number>> = {
  grave: 3,
  moderado: 2,
  leve: 1,
};

const MAX_TOP_ERRORS = 3;

/** Divide de forma segura devolviendo 0 cuando el denominador es 0. */
function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

/** Convierte una relación 0–1 en un porcentaje entero 0–100. */
function toPercent(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * 100);
}

/** Deriva el nivel cualitativo a partir de una precisión 0–100. */
export function resolveLevel(accuracy: number): PerformanceLevel {
  if (accuracy >= LEVEL_THRESHOLDS.excelente) {
    return 'excelente';
  }
  if (accuracy >= LEVEL_THRESHOLDS.bien) {
    return 'bien';
  }
  return 'a-mejorar';
}

/** Ordena los errores por severidad y frecuencia, y recorta a los más relevantes. */
function pickTopErrors(errors: readonly PostureError[]): readonly PostureError[] {
  return [...errors]
    .sort((a, b) => {
      const bySeverity = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (bySeverity !== 0) {
        return bySeverity;
      }
      return b.occurrences - a.occurrences;
    })
    .slice(0, MAX_TOP_ERRORS);
}

/** Construye la fila formateada de un ejercicio. */
function buildRow(exercise: ExerciseResult): ExerciseSummaryRow {
  const accuracy = toPercent(safeRatio(exercise.correctReps, exercise.completedReps));
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    region: exercise.region,
    repsLabel: `${exercise.completedReps} / ${exercise.prescribedReps}`,
    accuracy,
    level: resolveLevel(accuracy),
    topErrors: pickTopErrors(exercise.errors),
    completed: exercise.completedReps >= exercise.prescribedReps,
  };
}

/** Formatea una duración en ms a "M min S s" (o "S s" si es menor a 1 min). */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return `${minutes} min ${seconds} s`;
}

/** Genera un mensaje motivacional acorde al nivel global alcanzado. */
export function buildEncouragement(level: PerformanceLevel, overallAccuracy: number): string {
  switch (level) {
    case 'excelente':
      return `¡Excelente trabajo! Mantuviste una técnica correcta en el ${overallAccuracy}% de tus repeticiones. Seguí así.`;
    case 'bien':
      return `Buena sesión: ${overallAccuracy}% de técnica correcta. Prestá atención a las correcciones marcadas para mejorar aún más.`;
    case 'a-mejorar':
    default:
      return `Completaste tu sesión. Revisá las correcciones señaladas: mejorar la técnica evita lesiones y acelera tu recuperación.`;
  }
}

/**
 * Construye el modelo de vista del resumen a partir de la sesión completada.
 * Función pura: mismas entradas producen siempre la misma salida.
 */
export function buildSessionSummary(session: CompletedSession): SessionSummaryViewModel {
  const rows = session.exercises.map(buildRow);

  const totals = session.exercises.reduce(
    (acc, exercise) => ({
      totalReps: acc.totalReps + exercise.completedReps,
      correctReps: acc.correctReps + exercise.correctReps,
      completedExercises:
        acc.completedExercises +
        (exercise.completedReps >= exercise.prescribedReps ? 1 : 0),
    }),
    { totalReps: 0, correctReps: 0, completedExercises: 0 },
  );

  const overallAccuracy = toPercent(safeRatio(totals.correctReps, totals.totalReps));
  const overallLevel = resolveLevel(overallAccuracy);
  const durationMs = Math.max(0, session.endedAt - session.startedAt);

  return {
    sessionId: session.sessionId,
    durationLabel: formatDuration(durationMs),
    totalExercises: session.exercises.length,
    completedExercises: totals.completedExercises,
    totalReps: totals.totalReps,
    correctReps: totals.correctReps,
    overallAccuracy,
    overallLevel,
    encouragement: buildEncouragement(overallLevel, overallAccuracy),
    rows,
  };
}
