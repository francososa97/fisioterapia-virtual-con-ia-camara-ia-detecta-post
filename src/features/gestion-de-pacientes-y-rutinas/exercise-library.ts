// Librería de ejercicios disponibles (catálogo estático).
// El acceptance criteria de E5-T1 exige exactamente 3 ejercicios disponibles.

import type { Exercise, BodyRegion } from './types';

/**
 * Catálogo inmutable con los 3 ejercicios de rehabilitación disponibles.
 * Se congela para garantizar que ninguna capa superior lo mute en runtime.
 */
export const EXERCISE_LIBRARY: readonly Exercise[] = Object.freeze([
  {
    id: 'ex-rodilla-extension',
    name: 'Extensión de rodilla sentado',
    description:
      'Sentado en una silla, extiende lentamente la rodilla hasta dejar la pierna recta y baja de forma controlada.',
    bodyRegion: 'rodilla',
    difficulty: 'principiante',
    defaultReps: 12,
    defaultSets: 3,
  },
  {
    id: 'ex-hombro-abduccion',
    name: 'Abducción de hombro con banda',
    description:
      'De pie, eleva lateralmente el brazo contra la resistencia de una banda elástica hasta la altura del hombro.',
    bodyRegion: 'hombro',
    difficulty: 'intermedio',
    defaultReps: 10,
    defaultSets: 3,
  },
  {
    id: 'ex-espalda-puente',
    name: 'Puente de glúteos',
    description:
      'Tumbado boca arriba con las rodillas flexionadas, eleva la cadera hasta alinear tronco y muslos y baja controladamente.',
    bodyRegion: 'espalda-baja',
    difficulty: 'principiante',
    defaultReps: 15,
    defaultSets: 3,
  },
]);

/** Índice por id para lookups O(1). */
const LIBRARY_BY_ID: ReadonlyMap<string, Exercise> = new Map(
  EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]),
);

/** Devuelve la lista completa de ejercicios disponibles en la librería. */
export function listExercises(): readonly Exercise[] {
  return EXERCISE_LIBRARY;
}

/** Devuelve los ejercicios filtrados por zona del cuerpo. */
export function listExercisesByRegion(region: BodyRegion): readonly Exercise[] {
  return EXERCISE_LIBRARY.filter((exercise) => exercise.bodyRegion === region);
}

/** Busca un ejercicio por id. Devuelve `undefined` si no existe. */
export function findExercise(exerciseId: string): Exercise | undefined {
  return LIBRARY_BY_ID.get(exerciseId);
}
