import {
  AlertChannel,
  AlertConfig,
  AlertSeverity,
  DEFAULT_ALERT_CONFIG,
  FeedbackResult,
  PostureEvaluation,
  PostureMetric,
  SoundAlert,
  VisualAlert,
} from './types';

/**
 * Motor puro (sin side-effects) que traduce una evaluación de postura en
 * alertas visuales y sonoras. Determina la severidad comparando cada métrica
 * contra su rango correcto y aplica un throttle temporal al canal sonoro.
 *
 * Es determinístico dado su estado interno de throttle, lo que lo hace
 * fácil de testear sin DOM ni Web Audio.
 */
export class AlertEngine {
  private readonly config: AlertConfig;
  /** Timestamp (ms) del último tono emitido, para el debounce sonoro. */
  private lastSoundAt: number | null = null;

  constructor(config: AlertConfig = DEFAULT_ALERT_CONFIG) {
    this.config = config;
  }

  /**
   * Evalúa un frame de postura y devuelve las alertas a emitir.
   * No produce sonido ni toca el DOM: solo describe qué hay que mostrar/sonar.
   */
  public evaluate(evaluation: PostureEvaluation): FeedbackResult {
    const visual: VisualAlert[] = [];
    let worst: AlertSeverity = AlertSeverity.Ok;

    for (const metric of evaluation.metrics) {
      const severity = this.classify(metric);
      if (severity === AlertSeverity.Ok) {
        continue;
      }
      worst = this.maxSeverity(worst, severity);
      visual.push(this.buildVisual(metric, severity));
    }

    const sound = this.maybeBuildSound(worst, evaluation.timestamp);
    return { severity: worst, visual, sound };
  }

  /** Reinicia el estado de throttle (ej. al iniciar una nueva sesión). */
  public reset(): void {
    this.lastSoundAt = null;
  }

  /** Clasifica la desviación de una métrica respecto de su rango correcto. */
  private classify(metric: PostureMetric): AlertSeverity {
    const { value, minCorrect, maxCorrect } = metric;
    if (value >= minCorrect && value <= maxCorrect) {
      return AlertSeverity.Ok;
    }

    const deviation =
      value < minCorrect ? minCorrect - value : value - maxCorrect;
    const range = maxCorrect - minCorrect;
    // Si el rango es degenerado (<=0) cualquier desviación es crítica.
    if (range <= 0) {
      return AlertSeverity.Critical;
    }

    const ratio = deviation / range;
    return ratio >= this.config.criticalRatio
      ? AlertSeverity.Critical
      : AlertSeverity.Warning;
  }

  private buildVisual(
    metric: PostureMetric,
    severity: AlertSeverity,
  ): VisualAlert {
    return {
      channel: AlertChannel.Visual,
      severity,
      message: this.buildMessage(metric, severity),
      color: this.config.colors[severity],
      highlightJoints: metric.joints,
      metricId: metric.id,
    };
  }

  private buildMessage(
    metric: PostureMetric,
    severity: AlertSeverity,
  ): string {
    const direction =
      metric.value < metric.minCorrect ? 'Aumentá' : 'Reducí';
    const prefix =
      severity === AlertSeverity.Critical
        ? '¡Corregí ahora!'
        : 'Ajustá';
    return `${prefix} ${metric.label.toLowerCase()}: ${direction} el movimiento.`;
  }

  /**
   * Construye el tono sonoro para la severidad global, respetando el
   * throttle. Devuelve null si no hay desviación o si aún no pasó el
   * intervalo mínimo desde el último tono.
   */
  private maybeBuildSound(
    severity: AlertSeverity,
    timestamp: number,
  ): SoundAlert | null {
    if (severity === AlertSeverity.Ok) {
      return null;
    }
    if (
      this.lastSoundAt !== null &&
      timestamp - this.lastSoundAt < this.config.soundThrottleMs
    ) {
      return null;
    }
    this.lastSoundAt = timestamp;

    const critical = severity === AlertSeverity.Critical;
    return {
      channel: AlertChannel.Sound,
      severity,
      frequencyHz: critical ? 880 : 440,
      durationMs: critical ? 320 : 180,
      volume: critical ? 0.9 : 0.5,
    };
  }

  private maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
    const rank: Record<AlertSeverity, number> = {
      [AlertSeverity.Ok]: 0,
      [AlertSeverity.Warning]: 1,
      [AlertSeverity.Critical]: 2,
    };
    return rank[b] > rank[a] ? b : a;
  }
}
