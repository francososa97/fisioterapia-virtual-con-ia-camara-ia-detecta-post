// Tipos del dominio de Monetización y Suscripciones.
// El modelo de negocio: la clínica / fisioterapeuta paga un plan mensual
// por cada paciente activo. Se modela como UNA suscripción de Stripe por
// clínica cuyo `quantity` refleja el número de pacientes activos.

/** Identificador interno de una clínica (fisioterapeuta o centro). */
export type ClinicId = string;

/** Estados de suscripción relevantes para el negocio, derivados de Stripe. */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

/** Configuración requerida por el servicio de suscripciones. */
export interface StripeSubscriptionConfig {
  /** Clave secreta de Stripe (sk_live_... / sk_test_...). */
  readonly apiKey: string;
  /** ID del Price mensual con facturación por `quantity` (per-seat). */
  readonly monthlyPriceId: string;
  /** Secreto para verificar la firma de los webhooks (whsec_...). */
  readonly webhookSecret: string;
  /** Días de trial opcionales al crear la suscripción. */
  readonly trialPeriodDays?: number;
}

/** Datos mínimos de la clínica necesarios para crear el cliente en Stripe. */
export interface ClinicBillingInfo {
  readonly clinicId: ClinicId;
  readonly email: string;
  readonly name: string;
}

/** Resultado normalizado de una suscripción, desacoplado del SDK de Stripe. */
export interface SubscriptionSnapshot {
  readonly clinicId: ClinicId;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly status: SubscriptionStatus;
  /** Cantidad de pacientes activos facturados actualmente. */
  readonly activePatients: number;
  /** Fin del período de facturación actual (epoch en ms). */
  readonly currentPeriodEndMs: number;
  /** Indica si la suscripción se cancelará al final del período. */
  readonly cancelAtPeriodEnd: boolean;
}

/** Eventos de dominio emitidos tras procesar un webhook de Stripe. */
export type BillingEvent =
  | { readonly type: 'subscription.activated'; readonly snapshot: SubscriptionSnapshot }
  | { readonly type: 'subscription.updated'; readonly snapshot: SubscriptionSnapshot }
  | { readonly type: 'subscription.canceled'; readonly snapshot: SubscriptionSnapshot }
  | { readonly type: 'payment.failed'; readonly clinicId: ClinicId; readonly stripeSubscriptionId: string }
  | { readonly type: 'ignored'; readonly stripeEventType: string };

/** Error de dominio del módulo de facturación. */
export class BillingError extends Error {
  public readonly code:
    | 'CONFIG_INVALID'
    | 'STRIPE_ERROR'
    | 'WEBHOOK_SIGNATURE_INVALID'
    | 'SUBSCRIPTION_NOT_FOUND'
    | 'INVALID_QUANTITY';

  constructor(
    code: BillingError['code'],
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}
