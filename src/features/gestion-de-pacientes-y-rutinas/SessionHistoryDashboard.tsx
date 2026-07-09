// SessionHistoryDashboard.tsx
// Vista del fisioterapeuta: listado de sesiones completadas por sus
// pacientes con el desempeño resumido (precisión de postura y adherencia).

import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { SessionHistoryService } from './session-history.service';
import type {
  HistoryFilter,
  HistorySortKey,
  SessionHistoryRow,
  SessionHistoryView,
  SessionRepository,
} from './session-history.types';

export interface SessionHistoryDashboardProps {
  readonly therapistId: string;
  /** Repositorio de datos inyectado (API / mock en tests). */
  readonly repository: SessionRepository;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly view: SessionHistoryView };

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString();
}

function accuracyTone(pct: number): string {
  if (pct >= 80) return 'ok';
  if (pct >= 60) return 'warn';
  return 'bad';
}

function SummaryHeader({ view }: { readonly view: SessionHistoryView }): JSX.Element {
  const { aggregate } = view;
  return (
    <header className="session-history__summary" aria-label="Resumen general">
      <div className="metric">
        <span className="metric__value">{aggregate.sessionCount}</span>
        <span className="metric__label">Sesiones</span>
      </div>
      <div className="metric">
        <span className="metric__value">{aggregate.patientCount}</span>
        <span className="metric__label">Pacientes</span>
      </div>
      <div className="metric">
        <span className="metric__value">{aggregate.avgAccuracyPct}%</span>
        <span className="metric__label">Precisión media</span>
      </div>
      <div className="metric">
        <span className="metric__value">{aggregate.avgAdherencePct}%</span>
        <span className="metric__label">Adherencia media</span>
      </div>
    </header>
  );
}

function SessionRow({ row }: { readonly row: SessionHistoryRow }): JSX.Element {
  const { session, patient, performance } = row;
  return (
    <tr className="session-history__row">
      <td>{patient.nombre}</td>
      <td>{patient.region}</td>
      <td>{session.routineNombre}</td>
      <td>{formatDate(session.finishedAt)}</td>
      <td>{session.status}</td>
      <td className={`accuracy accuracy--${accuracyTone(performance.accuracyPct)}`}>
        {performance.accuracyPct}%
      </td>
      <td>{performance.adherencePct}%</td>
      <td>
        {performance.correctReps}/{performance.totalReps}
      </td>
      <td>{performance.durationMinutes} min</td>
    </tr>
  );
}

export function SessionHistoryDashboard(
  props: SessionHistoryDashboardProps,
): JSX.Element {
  const { therapistId, repository } = props;
  const service = useMemo(() => new SessionHistoryService(repository), [repository]);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filter, setFilter] = useState<HistoryFilter>({});
  const [sortBy, setSortBy] = useState<HistorySortKey>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    service
      .getHistory({ therapistId, filter, sortBy, sortDir })
      .then((view) => {
        if (!cancelled) setState({ kind: 'ready', view });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [service, therapistId, filter, sortBy, sortDir]);

  function onSort(key: HistorySortKey): void {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }

  function onStatusFilter(value: string): void {
    setFilter((prev) =>
      value === ''
        ? { ...prev, status: undefined }
        : { ...prev, status: value as HistoryFilter['status'] },
    );
  }

  if (state.kind === 'loading') {
    return <p className="session-history__state">Cargando historial…</p>;
  }
  if (state.kind === 'error') {
    return (
      <p className="session-history__state session-history__state--error" role="alert">
        No se pudo cargar el historial: {state.message}
      </p>
    );
  }

  const { rows } = state.view;

  return (
    <section className="session-history" aria-label="Historial de sesiones">
      <SummaryHeader view={state.view} />

      <div className="session-history__filters">
        <label>
          Estado:{' '}
          <select
            value={filter.status ?? ''}
            onChange={(e) => onStatusFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="completada">Completada</option>
            <option value="parcial">Parcial</option>
            <option value="abandonada">Abandonada</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="session-history__state">No hay sesiones para los filtros seleccionados.</p>
      ) : (
        <table className="session-history__table">
          <thead>
            <tr>
              <th>
                <button type="button" onClick={() => onSort('paciente')}>
                  Paciente
                </button>
              </th>
              <th>Zona</th>
              <th>Rutina</th>
              <th>
                <button type="button" onClick={() => onSort('fecha')}>
                  Fecha
                </button>
              </th>
              <th>Estado</th>
              <th>
                <button type="button" onClick={() => onSort('precision')}>
                  Precisión
                </button>
              </th>
              <th>
                <button type="button" onClick={() => onSort('adherencia')}>
                  Adherencia
                </button>
              </th>
              <th>Reps correctas</th>
              <th>Duración</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SessionRow key={row.session.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
