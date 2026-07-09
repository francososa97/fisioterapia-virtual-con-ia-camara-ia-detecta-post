// session-history.service.ts
// Lógica de negocio del dashboard de historial de sesiones para el
// fisioterapeuta: agrega resultados de la IA de postura, filtra, ordena
// y calcula métricas de desempeño. Sin dependencias de UI ni transporte.

import type {
  BodyRegion,
  ExerciseResult,
  HistoryAggregate,
  HistoryQuery,
  HistorySortKey,
  PatientRef,
  RehabSession,
  SessionHistoryRow,
  SessionHistoryView,
  SessionPerformance,
  SessionRepository,
} from './session-history.types';

/** Redondea a un decimal para métricas presentables. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Divide de forma segura devolviendo 0 cuando el divisor es 0. */
function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Suma las repeticiones planificadas de todos los ejercicios. */
function sumPlanned(exercises: readonly ExerciseResult[]): number {
  return exercises.reduce((acc, ex) => acc + ex.repsPlanificadas, 0);
}

/** Cuenta las repeticiones por categoría de calidad en una sesión. */
function countByQuality(exercises: readonly ExerciseResult[]): {
  total: number;
  correct: number;
  acceptable: number;
  incorrect: number;
} {
  let correct = 0;
  let acceptable = 0;
  let incorrect = 0;
  for (const ex of exercises) {
    for (const q of ex.repsQuality) {
      if (q === 'correcta') correct += 1;
      else if (q === 'aceptable') acceptable += 1;
      else incorrect += 1;
    }
  }
  return { total: correct + acceptable + incorrect, correct, acceptable, incorrect };
}

/** Diferencia en minutos entre dos timestamps ISO 8601. */
function durationMinutes(startedAt: string, finishedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return round1((end - start) / 60000);
}

/**
 * Calcula el resumen de desempeño de una sesión a partir de los
 * resultados por ejercicio evaluados por la IA de postura.
 */
export function computePerformance(session: RehabSession): SessionPerformance {
  const { total, correct, acceptable, incorrect } = countByQuality(session.exercises);
  const planned = sumPlanned(session.exercises);
  const accuracyPct = round1(safeDiv(correct, total) * 100);
  const adherencePct = round1(Math.min(safeDiv(total, planned) * 100, 100));
  return {
    totalReps: total,
    correctReps: correct,
    acceptableReps: acceptable,
    incorrectReps: incorrect,
    accuracyPct,
    adherencePct,
    durationMinutes: durationMinutes(session.startedAt, session.finishedAt),
  };
}

function inDateRange(iso: string, from?: string, to?: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (from !== undefined) {
    const f = Date.parse(from);
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (to !== undefined) {
    const e = Date.parse(to);
    if (!Number.isNaN(e) && t > e) return false;
  }
  return true;
}

function matchesFilter(
  row: SessionHistoryRow,
  filter: HistoryQuery['filter'],
): boolean {
  if (filter === undefined) return true;
  const { session, patient } = row;
  if (filter.patientId !== undefined && session.patientId !== filter.patientId) return false;
  if (filter.region !== undefined && patient.region !== filter.region) return false;
  if (filter.status !== undefined && session.status !== filter.status) return false;
  if (!inDateRange(session.finishedAt, filter.from, filter.to)) return false;
  return true;
}

function sortValue(row: SessionHistoryRow, key: HistorySortKey): number | string {
  switch (key) {
    case 'fecha':
      return Date.parse(row.session.finishedAt);
    case 'precision':
      return row.performance.accuracyPct;
    case 'adherencia':
      return row.performance.adherencePct;
    case 'paciente':
      return row.patient.nombre.toLowerCase();
  }
}

function compareRows(
  a: SessionHistoryRow,
  b: SessionHistoryRow,
  key: HistorySortKey,
  dir: 'asc' | 'desc',
): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  let cmp: number;
  if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
  else cmp = Number(va) - Number(vb);
  return dir === 'asc' ? cmp : -cmp;
}

function buildAggregate(rows: readonly SessionHistoryRow[]): HistoryAggregate {
  const patientIds = new Set<string>();
  let accuracySum = 0;
  let adherenceSum = 0;
  let totalReps = 0;
  for (const row of rows) {
    patientIds.add(row.session.patientId);
    accuracySum += row.performance.accuracyPct;
    adherenceSum += row.performance.adherencePct;
    totalReps += row.performance.totalReps;
  }
  const n = rows.length;
  return {
    sessionCount: n,
    patientCount: patientIds.size,
    avgAccuracyPct: round1(safeDiv(accuracySum, n)),
    avgAdherencePct: round1(safeDiv(adherenceSum, n)),
    totalReps,
  };
}

/**
 * Servicio del dashboard de historial de sesiones. Orquesta el
 * repositorio de datos, arma cada fila con su desempeño y aplica los
 * filtros/ordenamiento solicitados por el fisioterapeuta.
 */
export class SessionHistoryService {
  private readonly repo: SessionRepository;

  public constructor(repo: SessionRepository) {
    this.repo = repo;
  }

  /**
   * Construye la vista completa del historial para un fisioterapeuta:
   * filas ordenadas + métricas agregadas de la cabecera.
   */
  public async getHistory(query: HistoryQuery): Promise<SessionHistoryView> {
    const [sessions, patients] = await Promise.all([
      this.repo.listByTherapist(query.therapistId),
      this.repo.listPatients(query.therapistId),
    ]);

    const patientsById = new Map<string, PatientRef>(
      patients.map((p) => [p.id, p]),
    );

    const allRows: SessionHistoryRow[] = sessions
      .filter((s) => s.therapistId === query.therapistId)
      .map((session) => {
        const patient =
          patientsById.get(session.patientId) ?? this.unknownPatient(session.patientId);
        return {
          session,
          patient,
          performance: computePerformance(session),
        };
      });

    const filtered = allRows.filter((row) => matchesFilter(row, query.filter));

    const sortBy: HistorySortKey = query.sortBy ?? 'fecha';
    const sortDir = query.sortDir ?? 'desc';
    const rows = [...filtered].sort((a, b) => compareRows(a, b, sortBy, sortDir));

    return { rows, aggregate: buildAggregate(rows) };
  }

  /** Lista los pacientes del fisioterapeuta (para poblar filtros). */
  public async getPatients(therapistId: string): Promise<readonly PatientRef[]> {
    return this.repo.listPatients(therapistId);
  }

  private unknownPatient(patientId: string): PatientRef {
    const region: BodyRegion = 'otra';
    return { id: patientId, nombre: 'Paciente desconocido', region };
  }
}
