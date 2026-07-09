// session-history.types.ts
// Tipos del dominio para el historial de sesiones de rehabilitación.
// Estos tipos reutilizan/extienden lo que normalmente vive en
// src/shared/types/index.ts. Se re-exportan aquí de forma local con
// fallback para mantener la feature autocontenida y con TS strict.

/** Identificador de una repetición evaluada por la IA de postura. */
export type RepetitionQuality = 'correcta' | 'aceptable' | 'incorrecta';

/** Estado con el que finalizó una sesión de ejercicios. */
export type SessionStatus = 'completada' | 'abandonada' | 'parcial';

/** Zona corporal en rehabilitación (rodilla, hombro, etc.). */
export type BodyRegion =
  | 'rodilla'
  | 'hombro'
  | 'espalda-baja'
  | 'cadera'
  | 'tobillo'
  | 'cuello'
  | 'otra';

/** Datos mínimos identificatorios de un paciente. */
export interface PatientRef {
  readonly id: string;
  readonly nombre: string;
  readonly region: BodyRegion;
}

/**
 * Resultado por ejercicio dentro de una sesión, tal como lo produce el
 * motor de detección de postura en tiempo real.
 */
export interface ExerciseResult {
  readonly exerciseId: string;
  readonly nombre: string;
  /** Repeticiones planificadas por el fisioterapeuta. */
  readonly repsPlanificadas: number;
  /** Repeticiones efectivamente realizadas. */
  readonly repsRealizadas: number;
  /** Calidad por repetición evaluada por la IA (largo == repsRealizadas). */
  readonly repsQuality: readonly RepetitionQuality[];
}

/** Una sesión de ejercicios completada por un paciente. */
export interface RehabSession {
  readonly id: string;
  readonly patientId: string;
  readonly therapistId: string;
  /** ISO 8601, ej. '2026-07-09T14:32:00.000Z'. */
  readonly startedAt: string;
  /** ISO 8601. */
  readonly finishedAt: string;
  readonly status: SessionStatus;
  readonly routineId: string;
  readonly routineNombre: string;
  readonly exercises: readonly ExerciseResult[];
}

/** Resumen de desempeño calculado para una sesión. */
export interface SessionPerformance {
  readonly totalReps: number;
  readonly correctReps: number;
  readonly acceptableReps: number;
  readonly incorrectReps: number;
  /** 0..100 — porcentaje de reps correctas sobre las realizadas. */
  readonly accuracyPct: number;
  /** 0..100 — adherencia: reps realizadas sobre planificadas. */
  readonly adherencePct: number;
  readonly durationMinutes: number;
}

/** Sesión enriquecida con su resumen, lista para render. */
export interface SessionHistoryRow {
  readonly session: RehabSession;
  readonly patient: PatientRef;
  readonly performance: SessionPerformance;
}

/** Filtros aplicables al listado del dashboard. */
export interface HistoryFilter {
  readonly patientId?: string;
  readonly region?: BodyRegion;
  readonly status?: SessionStatus;
  /** ISO date-time inclusive. */
  readonly from?: string;
  /** ISO date-time inclusive. */
  readonly to?: string;
}

/** Campo por el que se puede ordenar el listado. */
export type HistorySortKey = 'fecha' | 'precision' | 'adherencia' | 'paciente';

export interface HistoryQuery {
  readonly therapistId: string;
  readonly filter?: HistoryFilter;
  readonly sortBy?: HistorySortKey;
  readonly sortDir?: 'asc' | 'desc';
}

/** Métricas agregadas del conjunto filtrado (cabecera del dashboard). */
export interface HistoryAggregate {
  readonly sessionCount: number;
  readonly patientCount: number;
  readonly avgAccuracyPct: number;
  readonly avgAdherencePct: number;
  readonly totalReps: number;
}

/** Resultado completo que consume la vista. */
export interface SessionHistoryView {
  readonly rows: readonly SessionHistoryRow[];
  readonly aggregate: HistoryAggregate;
}

/**
 * Puerto de acceso a datos. La implementación real (API / Firestore /
 * Postgres) se inyecta; el servicio no depende del transporte.
 */
export interface SessionRepository {
  listByTherapist(therapistId: string): Promise<readonly RehabSession[]>;
  listPatients(therapistId: string): Promise<readonly PatientRef[]>;
}
