import { AlertEngine } from './alert-engine';
import {
  AlertConfig,
  DEFAULT_ALERT_CONFIG,
  FeedbackResult,
  PostureEvaluation,
  SoundAlert,
} from './types';

/** Contrato mínimo del reproductor de tonos (permite mockear en tests). */
export interface TonePlayer {
  play(alert: SoundAlert): void;
  dispose(): void;
}

/** Observador que recibe el resultado de feedback de cada frame. */
export type FeedbackListener = (result: FeedbackResult) => void;

/**
 * Reproductor de tonos basado en la Web Audio API. Genera un beep
 * sinusoidal con envolvente para evitar clicks. Aislado detrás de
 * `TonePlayer` para poder correr en entornos sin audio (tests/SSR).
 */
export class WebAudioTonePlayer implements TonePlayer {
  private context: AudioContext | null = null;

  public play(alert: SoundAlert): void {
    const ctx = this.ensureContext();
    if (ctx === null) {
      return;
    }
    const now = ctx.currentTime;
    const durationSec = alert.durationMs / 1000;

    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(alert.frequencyHz, now);

    const gain = ctx.createGain();
    // Envolvente attack/release para un beep limpio.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(alert.volume, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + durationSec);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.02);
  }

  public dispose(): void {
    if (this.context !== null) {
      void this.context.close();
      this.context = null;
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof globalThis.AudioContext === 'undefined') {
      return null;
    }
    if (this.context === null) {
      this.context = new globalThis.AudioContext();
    }
    return this.context;
  }
}

/**
 * Servicio de alto nivel del feature. Orquesta el motor de reglas
 * (`AlertEngine`) con el canal sonoro (`TonePlayer`) y notifica a los
 * suscriptores (ej. la capa de UI que dibuja el overlay) el resultado
 * visual de cada frame.
 *
 * Uso típico por frame de cámara:
 *   const service = new AlertService();
 *   service.subscribe(renderOverlay);
 *   service.process(evaluation); // emite sonido y notifica visual
 */
export class AlertService {
  private readonly engine: AlertEngine;
  private readonly player: TonePlayer;
  private readonly listeners = new Set<FeedbackListener>();

  constructor(
    config: AlertConfig = DEFAULT_ALERT_CONFIG,
    player: TonePlayer = new WebAudioTonePlayer(),
  ) {
    this.engine = new AlertEngine(config);
    this.player = player;
  }

  /** Registra un listener y devuelve la función para desuscribirse. */
  public subscribe(listener: FeedbackListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Procesa un frame de evaluación de postura: emite el tono si corresponde
   * y notifica el feedback visual a todos los suscriptores.
   */
  public process(evaluation: PostureEvaluation): FeedbackResult {
    const result = this.engine.evaluate(evaluation);
    if (result.sound !== null) {
      this.player.play(result.sound);
    }
    for (const listener of this.listeners) {
      listener(result);
    }
    return result;
  }

  /** Reinicia el estado (throttle) al comenzar una nueva sesión/ejercicio. */
  public reset(): void {
    this.engine.reset();
  }

  /** Libera recursos de audio y limpia suscriptores. */
  public dispose(): void {
    this.player.dispose();
    this.listeners.clear();
  }
}
