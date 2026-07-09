// Servicio de gestión de estado de suscripción (E6-T2).
// Controla el acceso a la plataforma según el estado de la suscripción,
// aplicando reglas de expiración, periodo de gracia y jerarquía de planes.

import {
  AccessDecision,
  AccessReason,
  InvalidSubscriptionTransitionError,
  PlatformFeature,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from './types';

/** Días de gracia tras un pago fallido antes de cortar el acceso. */
const GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Transiciones de estado permitidas. Cualquier par no listado es inválido y
 * lanza InvalidSubscriptionTransitionError.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>>> = {
  trialing: ['active', 'expired', 'canceled'],
  active: ['past_due', 'canceled', 'expired'],
  past_due: ['active', 'expired', 'canceled'],
  canceled: ['active', 'expired'],
  expired: ['active', 'trialing'],
};

/** Jerarquía de planes: índice mayor => más privilegios. */
const PLAN_RANK: Readonly<Record<SubscriptionPlan, number>> = {
  free: 0,
  basic: 1,
  premium: 2,
  clinic: 3,
};

/** Plan mínimo requerido por cada funcionalidad de la plataforma. */
const FEATURE_MIN_PLAN: Readonly<Record<PlatformFeature, SubscriptionPlan>> = {
  realtime_pose_correction: 'basic',
  exercise_history: 'basic',
  custom_routines: 'premium',
  therapist_reports: 'premium',
  multi_patient: 'clinic',
};

/**
 * Servicio sin estado (stateless) que evalúa el acceso de un usuario.
 * Recibe el `now` como parámetro para ser determinista y testeable.
 */
export class SubscriptionService {
  /**
   * Calcula el estado efectivo de una suscripción en un instante dado,
   * degradando estados vencidos a `expired` según sus fechas límite.
   */
  public getEffectiveStatus(subscription: Subscription, now: number): SubscriptionStatus {
    switch (subscription.status) {
      case 'trialing': {
        const trialEnd = subscription.trialEnd ?? subscription.currentPeriodEnd;
        return now <= trialEnd ? 'trialing' : 'expired';
      }
      case 'active':
        return now <= subscription.currentPeriodEnd ? 'active' : 'expired';
      case 'canceled':
        // Mantiene acceso hasta el fin del periodo ya pagado.
        return now <= subscription.currentPeriodEnd ? 'canceled' : 'expired';
      case 'past_due': {
        const graceEnd = subscription.currentPeriodEnd + GRACE_PERIOD_DAYS * MS_PER_DAY;
        return now <= graceEnd ? 'past_due' : 'expired';
      }
      case 'expired':
        return 'expired';
      default: {
        // Exhaustividad: si se agrega un estado nuevo, TS obliga a manejarlo.
        const unreachable: never = subscription.status;
        return unreachable;
      }
    }
  }

  /**
   * Determina si el usuario puede acceder a la plataforma (acceso base),
   * devolviendo el motivo, el estado efectivo y los días restantes.
   */
  public evaluateAccess(subscription: Subscription | null, now: number): AccessDecision {
    if (subscription === null) {
      return {
        allowed: false,
        reason: 'no_subscription',
        effectiveStatus: 'expired',
        daysRemaining: null,
      };
    }

    const effectiveStatus = this.getEffectiveStatus(subscription, now);
    const boundary = this.accessBoundary(subscription, effectiveStatus);
    const daysRemaining =
      boundary !== null ? Math.max(0, Math.ceil((boundary - now) / MS_PER_DAY)) : null;

    const reason = this.reasonFor(subscription.status, effectiveStatus);
    const allowed =
      effectiveStatus === 'active' ||
      effectiveStatus === 'trialing' ||
      effectiveStatus === 'past_due' ||
      effectiveStatus === 'canceled';

    return {
      allowed,
      reason,
      effectiveStatus,
      daysRemaining: allowed ? daysRemaining : null,
    };
  }

  /**
   * Verifica el acceso a una funcionalidad concreta: primero exige acceso base
   * y luego que el plan alcance el mínimo requerido por la feature.
   */
  public canAccessFeature(
    subscription: Subscription | null,
    feature: PlatformFeature,
    now: number,
  ): AccessDecision {
    const base = this.evaluateAccess(subscription, now);
    if (!base.allowed || subscription === null) {
      return base;
    }

    const required = FEATURE_MIN_PLAN[feature];
    if (PLAN_RANK[subscription.plan] < PLAN_RANK[required]) {
      return {
        allowed: false,
        reason: 'plan_insufficient',
        effectiveStatus: base.effectiveStatus,
        daysRemaining: null,
      };
    }

    return base;
  }

  /**
   * Aplica una transición de estado validándola contra la máquina de estados.
   * Devuelve una nueva suscripción (inmutable) con el estado actualizado.
   */
  public transition(subscription: Subscription, to: SubscriptionStatus): Subscription {
    const from = subscription.status;
    if (from === to) {
      return subscription;
    }
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new InvalidSubscriptionTransitionError(from, to);
    }
    return { ...subscription, status: to };
  }

  /** Fecha límite (epoch ms) hasta la que el estado efectivo concede acceso. */
  private accessBoundary(
    subscription: Subscription,
    effectiveStatus: SubscriptionStatus,
  ): number | null {
    switch (effectiveStatus) {
      case 'trialing':
        return subscription.trialEnd ?? subscription.currentPeriodEnd;
      case 'active':
      case 'canceled':
        return subscription.currentPeriodEnd;
      case 'past_due':
        return subscription.currentPeriodEnd + GRACE_PERIOD_DAYS * MS_PER_DAY;
      case 'expired':
        return null;
      default: {
        const unreachable: never = effectiveStatus;
        return unreachable;
      }
    }
  }

  /** Traduce el estado declarado y el efectivo a un motivo legible de acceso. */
  private reasonFor(
    declared: SubscriptionStatus,
    effective: SubscriptionStatus,
  ): AccessReason {
    switch (effective) {
      case 'active':
        return 'active_subscription';
      case 'trialing':
        return 'trial_active';
      case 'past_due':
        return 'grace_period';
      case 'canceled':
        return 'canceled_still_valid';
      case 'expired':
        return declared === 'trialing' ? 'trial_expired' : 'period_ended';
      default: {
        const unreachable: never = effective;
        return unreachable;
      }
    }
  }
}

/** Instancia lista para usar por defecto (el servicio es stateless). */
export const subscriptionService = new SubscriptionService();
