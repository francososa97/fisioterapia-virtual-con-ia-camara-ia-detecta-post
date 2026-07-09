// Pantalla de resumen para el paciente (E4-T2).
// Muestra el resumen de la sesión recién completada usando el view-model puro
// construido por el service. El componente es de presentación: no calcula métricas.

import { useMemo } from 'react';
import type { JSX } from 'react';
import type {
  CompletedSession,
  ExerciseSummaryRow,
  PerformanceLevel,
} from './types';
import { buildSessionSummary } from './service';

export interface SessionSummaryScreenProps {
  /** Sesión recién completada a resumir. */
  readonly session: CompletedSession;
  /** Callback opcional para volver al inicio / cerrar el resumen. */
  readonly onDone?: () => void;
}

/** Etiqueta legible para cada nivel de desempeño. */
const LEVEL_LABEL: Readonly<Record<PerformanceLevel, string>> = {
  excelente: 'Excelente',
  bien: 'Bien',
  'a-mejorar': 'A mejorar',
};

function ExerciseCard({ row }: { readonly row: ExerciseSummaryRow }): JSX.Element {
  return (
    <li
      className="session-summary__exercise"
      data-level={row.level}
      data-completed={row.completed}
    >
      <div className="session-summary__exercise-head">
        <span className="session-summary__exercise-name">{row.name}</span>
        <span className="session-summary__exercise-reps" aria-label="Repeticiones">
          {row.repsLabel}
        </span>
      </div>

      <div className="session-summary__exercise-meta">
        <span className="session-summary__region">{row.region}</span>
        <span className="session-summary__accuracy">
          {row.accuracy}% técnica correcta · {LEVEL_LABEL[row.level]}
        </span>
      </div>

      {row.topErrors.length > 0 && (
        <ul className="session-summary__errors">
          {row.topErrors.map((error) => (
            <li
              key={error.code}
              className="session-summary__error"
              data-severity={error.severity}
            >
              {error.label} ({error.occurrences}×)
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Renderiza el resumen de la sesión: métricas globales, mensaje motivacional
 * y el detalle por ejercicio con las principales correcciones de técnica.
 */
export function SessionSummaryScreen({
  session,
  onDone,
}: SessionSummaryScreenProps): JSX.Element {
  const summary = useMemo(() => buildSessionSummary(session), [session]);

  return (
    <section className="session-summary" aria-labelledby="session-summary-title">
      <header className="session-summary__header">
        <h1 id="session-summary-title">Resumen de tu sesión</h1>
        <p className="session-summary__encouragement">{summary.encouragement}</p>
      </header>

      <dl className="session-summary__stats">
        <div className="session-summary__stat">
          <dt>Duración</dt>
          <dd>{summary.durationLabel}</dd>
        </div>
        <div className="session-summary__stat">
          <dt>Ejercicios</dt>
          <dd>
            {summary.completedExercises} / {summary.totalExercises} completados
          </dd>
        </div>
        <div className="session-summary__stat">
          <dt>Repeticiones</dt>
          <dd>{summary.totalReps}</dd>
        </div>
        <div className="session-summary__stat" data-level={summary.overallLevel}>
          <dt>Técnica correcta</dt>
          <dd>
            {summary.overallAccuracy}% · {LEVEL_LABEL[summary.overallLevel]}
          </dd>
        </div>
      </dl>

      <h2 className="session-summary__subtitle">Detalle por ejercicio</h2>
      {summary.rows.length > 0 ? (
        <ul className="session-summary__exercises">
          {summary.rows.map((row) => (
            <ExerciseCard key={row.exerciseId} row={row} />
          ))}
        </ul>
      ) : (
        <p className="session-summary__empty">
          No se registraron ejercicios en esta sesión.
        </p>
      )}

      {onDone && (
        <button
          type="button"
          className="session-summary__done"
          onClick={onDone}
        >
          Finalizar
        </button>
      )}
    </section>
  );
}

export default SessionSummaryScreen;
