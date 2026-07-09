// Tipos del feature de Resumen y Reportes de Sesión.
// Se definen localmente porque src/shared/types/index.ts aún no expone estos
// contratos; cuando existan, reemplazar los tipos de dominio por los compartidos.

/** Identificador de una articulación/zona en rehabilitación. */
export type BodyRegion = 'rodilla' | 'hombro' | 'espalda-baja' | 'cadera' | 'tobillo';

/** Severidad de un error de postura detectado por la IA durante la ejecución. */
export type ErrorSeverity = 'leve' | 'moderado' | 'grave';

/** Error de técnica agregado por tipo dentro de un ejercicio. */
export interface PostureError {
  readonly code: string;
  readonly label: string;
  readonly severity: ErrorSeverity;
  /** Cantidad de repeticiones en las que se detectó este error. */
  readonly occurrences: number;
}

/** Resultado bruto de un ejercicio dentro de una sesión (dato de entrada). */
export interface ExerciseResult {
  readonly exerciseId: string;
  readonly name: string;
  readonly region: BodyRegion;
  readonly prescribedReps: number;
  readonly completedReps: number;
  /** Repeticiones con técnica correcta según la IA. */
  readonly correctReps: number;
  readonly errors: readonly PostureError[];
}

/** Sesión recién completada (dato de entrada al resumen). */
export interface CompletedSession {
  readonly sessionId: string;
  readonly patientId: string;
  /** Marca de tiempo de inicio en epoch ms. */
  readonly startedAt: number;
  /** Marca de tiempo de fin en epoch ms. */
  readonly endedAt: number;
  readonly exercises: readonly ExerciseResult[];
}

/** Nivel cualitativo de desempeño derivado del porcentaje de precisión. */
export type PerformanceLevel = 'excelente' | 'bien' | 'a-mejorar';

/** Fila de ejercicio ya formateada para la pantalla del paciente. */
export interface ExerciseSummaryRow {
  readonly exerciseId: string;
  readonly name: string;
  readonly region: BodyRegion;
  /** "8 / 10" repeticiones completadas sobre prescritas. */
  readonly repsLabel: string;
  /** Precisión de técnica 0–100 redondeada. */
  readonly accuracy: number;
  readonly level: PerformanceLevel;
  /** Errores más relevantes ordenados por severidad y frecuencia. */
  readonly topErrors: readonly PostureError[];
  /** true si completó todas las repeticiones prescritas. */
  readonly completed: boolean;
}

/** Modelo de vista completo listo para renderizar la pantalla de resumen. */
export interface SessionSummaryViewModel {
  readonly sessionId: string;
  /** Duración total de la sesión formateada, p. ej. "12 min 30 s". */
  readonly durationLabel: string;
  readonly totalExercises: number;
  readonly completedExercises: number;
  readonly totalReps: number;
  readonly correctReps: number;
  /** Precisión global de la sesión 0–100 redondeada. */
  readonly overallAccuracy: number;
  readonly overallLevel: PerformanceLevel;
  /** Mensaje motivacional/correctivo para el paciente. */
  readonly encouragement: string;
  readonly rows: readonly ExerciseSummaryRow[];
}
