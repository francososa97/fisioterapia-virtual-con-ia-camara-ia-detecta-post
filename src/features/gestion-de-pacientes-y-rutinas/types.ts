// Tipos de dominio para la gestión de pacientes y rutinas de rehabilitación.
// Estos tipos serían candidatos a moverse a src/shared/types/index.ts si se
// reutilizan en otras features; por ahora viven junto a la feature que los usa.

/** Zona del cuerpo sobre la que trabaja un ejercicio de rehabilitación. */
export type BodyRegion = 'rodilla' | 'hombro' | 'espalda-baja';

/** Nivel de dificultad del ejercicio, usado para progresar al paciente. */
export type DifficultyLevel = 'principiante' | 'intermedio' | 'avanzado';

/**
 * Definición de un ejercicio disponible en la librería.
 * Es inmutable: representa el "catálogo" que el fisioterapeuta consulta.
 */
export interface Exercise {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly bodyRegion: BodyRegion;
  readonly difficulty: DifficultyLevel;
  /** Repeticiones recomendadas por defecto para este ejercicio. */
  readonly defaultReps: number;
  /** Series recomendadas por defecto para este ejercicio. */
  readonly defaultSets: number;
}

/**
 * Ejercicio ya prescrito dentro de una rutina, con la dosificación concreta
 * que el fisioterapeuta define para el paciente (puede diferir de los valores
 * por defecto del catálogo).
 */
export interface PrescribedExercise {
  readonly exerciseId: string;
  readonly reps: number;
  readonly sets: number;
}

/** Rutina asignada a un paciente específico. */
export interface Routine {
  readonly id: string;
  readonly patientId: string;
  readonly exercises: readonly PrescribedExercise[];
  readonly assignedByTherapistId: string;
  readonly assignedAt: Date;
}

/** Datos de entrada para asignar (o reasignar) una rutina a un paciente. */
export interface AssignRoutineInput {
  readonly patientId: string;
  readonly therapistId: string;
  /**
   * Selección de ejercicios de la librería. Cada entrada debe referenciar un
   * `exerciseId` existente. `reps`/`sets` son opcionales: si se omiten se toman
   * los valores por defecto del catálogo.
   */
  readonly selections: readonly ExerciseSelection[];
}

/** Selección de un ejercicio de la librería con dosificación opcional. */
export interface ExerciseSelection {
  readonly exerciseId: string;
  readonly reps?: number;
  readonly sets?: number;
}

/** Resultado de una operación que puede fallar por validación de negocio. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };
