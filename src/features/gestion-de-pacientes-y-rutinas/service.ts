// Servicio de asignación de rutinas: el fisioterapeuta selecciona ejercicios
// de la librería y los asigna a un paciente específico (E5-T1).
//
// El servicio es agnóstico del almacenamiento: recibe un `RoutineRepository`
// por inyección de dependencias, lo que permite usar una implementación en
// memoria para tests y otra persistente en producción sin tocar la lógica.

import {
  findExercise,
  listExercises,
  listExercisesByRegion,
} from './exercise-library';
import type {
  AssignRoutineInput,
  BodyRegion,
  Exercise,
  PrescribedExercise,
  Result,
  Routine,
} from './types';

/** Contrato de persistencia para rutinas. */
export interface RoutineRepository {
  save(routine: Routine): Promise<void>;
  findByPatientId(patientId: string): Promise<Routine | undefined>;
}

/** Genera ids únicos para las rutinas. Inyectable para poder testear. */
export interface IdGenerator {
  next(): string;
}

/** Fuente de tiempo inyectable para poder testear `assignedAt`. */
export interface Clock {
  now(): Date;
}

const MAX_REPS = 100;
const MAX_SETS = 20;

/**
 * Orquesta la librería de ejercicios y la asignación de rutinas a pacientes.
 */
export class RoutineService {
  private readonly repository: RoutineRepository;
  private readonly idGenerator: IdGenerator;
  private readonly clock: Clock;

  constructor(
    repository: RoutineRepository,
    idGenerator: IdGenerator,
    clock: Clock = { now: (): Date => new Date() },
  ) {
    this.repository = repository;
    this.idGenerator = idGenerator;
    this.clock = clock;
  }

  /** Expone el catálogo completo de ejercicios disponibles. */
  getAvailableExercises(): readonly Exercise[] {
    return listExercises();
  }

  /** Expone el catálogo filtrado por zona del cuerpo. */
  getAvailableExercisesByRegion(region: BodyRegion): readonly Exercise[] {
    return listExercisesByRegion(region);
  }

  /**
   * Asigna una rutina a un paciente a partir de una selección de ejercicios
   * de la librería. Valida que la selección sea coherente antes de persistir.
   */
  async assignRoutine(input: AssignRoutineInput): Promise<Result<Routine>> {
    const validation = this.validate(input);
    if (!validation.ok) {
      return validation;
    }

    const routine: Routine = {
      id: this.idGenerator.next(),
      patientId: input.patientId,
      therapistId: input.therapistId,
      exercises: validation.value,
      assignedByTherapistId: input.therapistId,
      assignedAt: this.clock.now(),
    } as Routine;

    await this.repository.save(routine);
    return { ok: true, value: routine };
  }

  /** Recupera la rutina actualmente asignada a un paciente, si existe. */
  getPatientRoutine(patientId: string): Promise<Routine | undefined> {
    return this.repository.findByPatientId(patientId);
  }

  /**
   * Valida la entrada de asignación y normaliza cada selección a un
   * `PrescribedExercise` con dosificación concreta.
   */
  private validate(
    input: AssignRoutineInput,
  ): Result<readonly PrescribedExercise[]> {
    if (input.patientId.trim().length === 0) {
      return { ok: false, error: 'El paciente es obligatorio.' };
    }
    if (input.therapistId.trim().length === 0) {
      return { ok: false, error: 'El fisioterapeuta es obligatorio.' };
    }
    if (input.selections.length === 0) {
      return {
        ok: false,
        error: 'Debe seleccionar al menos un ejercicio de la librería.',
      };
    }

    const seen = new Set<string>();
    const prescribed: PrescribedExercise[] = [];

    for (const selection of input.selections) {
      const exercise = findExercise(selection.exerciseId);
      if (exercise === undefined) {
        return {
          ok: false,
          error: `El ejercicio "${selection.exerciseId}" no existe en la librería.`,
        };
      }
      if (seen.has(exercise.id)) {
        return {
          ok: false,
          error: `El ejercicio "${exercise.name}" está duplicado en la rutina.`,
        };
      }
      seen.add(exercise.id);

      const reps = selection.reps ?? exercise.defaultReps;
      const sets = selection.sets ?? exercise.defaultSets;

      if (!Number.isInteger(reps) || reps <= 0 || reps > MAX_REPS) {
        return {
          ok: false,
          error: `Las repeticiones de "${exercise.name}" deben ser un entero entre 1 y ${MAX_REPS}.`,
        };
      }
      if (!Number.isInteger(sets) || sets <= 0 || sets > MAX_SETS) {
        return {
          ok: false,
          error: `Las series de "${exercise.name}" deben ser un entero entre 1 y ${MAX_SETS}.`,
        };
      }

      prescribed.push({ exerciseId: exercise.id, reps, sets });
    }

    return { ok: true, value: prescribed };
  }
}

/** Implementación en memoria del repositorio, útil para tests y prototipos. */
export class InMemoryRoutineRepository implements RoutineRepository {
  private readonly routinesByPatient = new Map<string, Routine>();

  save(routine: Routine): Promise<void> {
    this.routinesByPatient.set(routine.patientId, routine);
    return Promise.resolve();
  }

  findByPatientId(patientId: string): Promise<Routine | undefined> {
    return Promise.resolve(this.routinesByPatient.get(patientId));
  }
}
