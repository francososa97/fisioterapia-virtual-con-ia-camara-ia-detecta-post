// Servicio de suscripciones mensuales vía Stripe (E6-T1).
//
// Responsabilidad: permitir que la clínica / fisioterapeuta pague un plan
// mensual por paciente activo. Se implementa una suscripción per-seat: la
// clínica tiene un único Customer + Subscription en Stripe y el `quantity`
// de la línea de facturación equivale al número de pacientes activos.
//
// Dependencia: `stripe` (npm i stripe). No se persiste estado aquí; el
// mapeo clinicId <-> customerId/subscriptionId se resuelve mediante los
// metadatos de Stripe y los callbacks que reciba el consumidor del servicio.

import Stripe from 'stripe';
import {
  BillingError,
  type BillingEvent,
  type ClinicBillingInfo,
  type ClinicId,
  type StripeSubscriptionConfig,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from './types';

const CLINIC_METADATA_KEY = 'clinic_id';

/** Estados de Stripe que consideramos válidos para el modelo de dominio. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
]);

function toSubscriptionStatus(raw: string): SubscriptionStatus {
  return KNOWN_STATUSES.has(raw) ? (raw as SubscriptionStatus) : 'incomplete';
}

export class SubscriptionService {
  private readonly stripe: Stripe;
  private readonly config: StripeSubscriptionConfig;

  constructor(config: StripeSubscriptionConfig, stripeClient?: Stripe) {
    if (!config.apiKey) {
      throw new BillingError('CONFIG_INVALID', 'Falta apiKey de Stripe');
    }
    if (!config.monthlyPriceId) {
      throw new BillingError('CONFIG_INVALID', 'Falta monthlyPriceId de Stripe');
    }
    if (!config.webhookSecret) {
      throw new BillingError('CONFIG_INVALID', 'Falta webhookSecret de Stripe');
    }
    this.config = config;
    this.stripe =
      stripeClient ?? new Stripe(config.apiKey, { apiVersion: '2024-06-20' });
  }

  /**
   * Crea (o reutiliza) el Customer de la clínica en Stripe.
   * Idempotente por email + metadata: si ya existe un Customer con el
   * mismo `clinic_id`, lo devuelve en lugar de duplicarlo.
   */
  public async ensureCustomer(clinic: ClinicBillingInfo): Promise<string> {
    try {
      const existing = await this.findCustomerByClinicId(clinic.clinicId);
      if (existing) {
        return existing.id;
      }
      const customer = await this.stripe.customers.create({
        email: clinic.email,
        name: clinic.name,
        metadata: { [CLINIC_METADATA_KEY]: clinic.clinicId },
      });
      return customer.id;
    } catch (err) {
      throw this.wrap(err, 'No se pudo crear/obtener el Customer de Stripe');
    }
  }

  /**
   * Crea la suscripción mensual per-seat para una clínica.
   * `activePatients` es la cantidad inicial de pacientes activos a facturar.
   * Devuelve un snapshot normalizado del estado de la suscripción.
   */
  public async createSubscription(
    clinic: ClinicBillingInfo,
    activePatients: number,
  ): Promise<SubscriptionSnapshot> {
    this.assertQuantity(activePatients);
    try {
      const customerId = await this.ensureCustomer(clinic);
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: this.config.monthlyPriceId, quantity: activePatients }],
        metadata: { [CLINIC_METADATA_KEY]: clinic.clinicId },
        payment_behavior: 'default_incomplete',
        trial_period_days: this.config.trialPeriodDays,
        expand: ['latest_invoice.payment_intent'],
      });
      return this.toSnapshot(clinic.clinicId, subscription);
    } catch (err) {
      throw this.wrap(err, 'No se pudo crear la suscripción');
    }
  }

  /**
   * Actualiza la cantidad de pacientes activos facturados. Debe llamarse
   * cuando un paciente se activa o se da de baja. Usa proración por defecto
   * de Stripe para ajustar el importe del período en curso.
   */
  public async updateActivePatients(
    stripeSubscriptionId: string,
    activePatients: number,
  ): Promise<SubscriptionSnapshot> {
    this.assertQuantity(activePatients);
    try {
      const current = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      const itemId = current.items.data[0]?.id;
      if (!itemId) {
        throw new BillingError(
          'SUBSCRIPTION_NOT_FOUND',
          `La suscripción ${stripeSubscriptionId} no tiene líneas de facturación`,
        );
      }
      const updated = await this.stripe.subscriptions.update(stripeSubscriptionId, {
        items: [{ id: itemId, quantity: activePatients }],
        proration_behavior: 'create_prorations',
      });
      return this.toSnapshot(this.readClinicId(updated), updated);
    } catch (err) {
      throw this.wrap(err, 'No se pudo actualizar la cantidad de pacientes');
    }
  }

  /**
   * Cancela la suscripción. Por defecto al final del período (para no perder
   * lo ya pagado); con `immediate = true` la corta al instante.
   */
  public async cancelSubscription(
    stripeSubscriptionId: string,
    immediate = false,
  ): Promise<SubscriptionSnapshot> {
    try {
      const subscription = immediate
        ? await this.stripe.subscriptions.cancel(stripeSubscriptionId)
        : await this.stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true,
          });
      return this.toSnapshot(this.readClinicId(subscription), subscription);
    } catch (err) {
      throw this.wrap(err, 'No se pudo cancelar la suscripción');
    }
  }

  /** Obtiene un snapshot actual de la suscripción. */
  public async getSubscription(
    stripeSubscriptionId: string,
  ): Promise<SubscriptionSnapshot> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      return this.toSnapshot(this.readClinicId(subscription), subscription);
    } catch (err) {
      throw this.wrap(err, 'No se pudo obtener la suscripción');
    }
  }

  /**
   * Verifica la firma y traduce un webhook de Stripe a un evento de dominio.
   * `rawBody` DEBE ser el cuerpo crudo (Buffer/string) sin parsear como JSON,
   * de lo contrario la verificación de firma falla.
   */
  public handleWebhook(rawBody: string | Buffer, signature: string): BillingEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.webhookSecret,
      );
    } catch (err) {
      throw new BillingError(
        'WEBHOOK_SIGNATURE_INVALID',
        'Firma de webhook inválida',
        err,
      );
    }

    switch (event.type) {
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        return { type: 'subscription.activated', snapshot: this.toSnapshot(this.readClinicId(sub), sub) };
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        return { type: 'subscription.updated', snapshot: this.toSnapshot(this.readClinicId(sub), sub) };
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        return { type: 'subscription.canceled', snapshot: this.toSnapshot(this.readClinicId(sub), sub) };
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : (invoice.subscription?.id ?? '');
        const clinicId =
          typeof invoice.customer === 'string'
            ? (invoice.metadata?.[CLINIC_METADATA_KEY] ?? '')
            : (invoice.customer?.metadata?.[CLINIC_METADATA_KEY] ?? '');
        return { type: 'payment.failed', clinicId, stripeSubscriptionId: subId };
      }
      default:
        return { type: 'ignored', stripeEventType: event.type };
    }
  }

  // --- Helpers privados ---------------------------------------------------

  private async findCustomerByClinicId(
    clinicId: ClinicId,
  ): Promise<Stripe.Customer | null> {
    const query = `metadata['${CLINIC_METADATA_KEY}']:'${clinicId}'`;
    const result = await this.stripe.customers.search({ query, limit: 1 });
    const first = result.data[0];
    return first && !first.deleted ? first : null;
  }

  private toSnapshot(
    clinicId: ClinicId,
    subscription: Stripe.Subscription,
  ): SubscriptionSnapshot {
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    const quantity = subscription.items.data[0]?.quantity ?? 0;
    return {
      clinicId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: toSubscriptionStatus(subscription.status),
      activePatients: quantity,
      currentPeriodEndMs: subscription.current_period_end * 1000,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  private readClinicId(subscription: Stripe.Subscription): ClinicId {
    return subscription.metadata?.[CLINIC_METADATA_KEY] ?? '';
  }

  private assertQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BillingError(
        'INVALID_QUANTITY',
        `La cantidad de pacientes activos debe ser un entero >= 1 (recibido: ${quantity})`,
      );
    }
  }

  private wrap(err: unknown, message: string): BillingError {
    if (err instanceof BillingError) {
      return err;
    }
    return new BillingError('STRIPE_ERROR', message, err);
  }
}

/** Factory de conveniencia para construir el servicio desde variables de entorno. */
export function createSubscriptionService(
  env: NodeJS.ProcessEnv = process.env,
): SubscriptionService {
  const config: StripeSubscriptionConfig = {
    apiKey: env.STRIPE_API_KEY ?? '',
    monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID ?? '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    trialPeriodDays: env.STRIPE_TRIAL_DAYS ? Number(env.STRIPE_TRIAL_DAYS) : undefined,
  };
  return new SubscriptionService(config);
}
