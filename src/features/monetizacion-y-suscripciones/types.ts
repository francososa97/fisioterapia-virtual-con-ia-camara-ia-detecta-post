// Tipos del dominio de suscripciones para la plataforma de fisioterapia virtual.
// Se mantienen aislados para poder reexportarse desde src/shared/types/index.ts
// cuando el barrel compartido esté disponible.

/**
 * Estados posibles del ciclo de vida de una suscripción.
 * - `trialing`: periodo de prueba gratuito vigente.
 * - `active`: suscripción pagada y al día.
 * - `past_due`: el pago falló pero sigue dentro del periodo de gracia.
 * - `canceled`: cancelada por el usuario; conserva acceso hasta `currentPeriodEnd`.
 * - `expired`: sin acceso, requiere renovar/reactivar.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

/** Niveles de plan disponibles. */
export type SubscriptionPlan = 'free' | 'basic' | 'premium' | 'clinic';

/** Funcionalidades de la plataforma que pueden requerir suscripción. */
export type PlatformFeature =
  | 'realtime_pose_correction'
  | 'exercise_history'
  | 'therapist_reports'
  | 'custom_routines'
  | 'multi_patient';

/**
 * Representación de la suscripción de un usuario. Las fechas se modelan como
 * epoch en milisegundos (UTC) para evitar ambigüedades de zona horaria.
 */
export interface Subscription {
  readonly id: string;
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  /** Fin del periodo pagado actual (epoch ms). */
  readonly currentPeriodEnd: number;
  /** Fin del periodo de prueba, si aplica (epoch ms). */
  readonly trialEnd: number | null;
  /** Marca de renovación automática. */
  readonly cancelAtPeriodEnd: boolean;
}

/** Motivos por los que se concede o deniega el acceso. */
export type AccessReason =
  | 'active_subscription'
  | 'trial_active'
  | 'grace_period'
  | 'canceled_still_valid'
  | 'trial_expired'
  | 'period_ended'
  | 'no_subscription'
  | 'plan_insufficient';

/** Resultado de una evaluación de acceso. */
export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: AccessReason;
  /** Estado efectivo tras aplicar reglas de expiración sobre el timestamp dado. */
  readonly effectiveStatus: SubscriptionStatus;
  /** Días restantes de acceso (>= 0); null si no hay acceso. */
  readonly daysRemaining: number | null;
}

/** Error de negocio para transiciones de estado inválidas. */
export class InvalidSubscriptionTransitionError extends Error {
  public readonly from: SubscriptionStatus;
  public readonly to: SubscriptionStatus;

  constructor(from: SubscriptionStatus, to: SubscriptionStatus) {
    super(`Transición de suscripción inválida: '${from}' -> '${to}'`);
    this.name = 'InvalidSubscriptionTransitionError';
    this.from = from;
    this.to = to;
  }
}
