// Servicio de optimización de rendimiento en tiempo real (E2-T5).
//
// Objetivo: que la detección de postura corra fluida en dispositivos de gama
// media sin saturar el navegador. Estrategias implementadas:
//   1. Detección de capacidades del dispositivo -> presupuesto de FPS/calidad.
//   2. Scheduler basado en requestAnimationFrame con throttling al FPS objetivo.
//   3. Anti-solapamiento: si un frame aún se está procesando, se descarta el
//      siguiente en lugar de encolar trabajo (evita el "efecto bola de nieve").
//   4. Adaptación dinámica de calidad/FPS según el tiempo real de inferencia.
//
// Diseñado para entorno browser; degrada de forma segura fuera de él.

import type {
  DeviceCapabilities,
  DeviceTier,
  FrameCallback,
  OptimizerConfig,
  PerformanceMetrics,
  PerformanceSample,
  QualityChangeListener,
  QualityLevel,
} from './types';

/** navigator con propiedades opcionales no siempre tipadas por la lib DOM. */
interface ExtendedNavigator extends Navigator {
  readonly deviceMemory?: number;
}

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  minFps: 12,
  maxFps: 30,
  sampleWindow: 30,
  degradeThresholdMs: 45,
  upgradeThresholdMs: 22,
  stabilityFrames: 20,
};

const QUALITY_ORDER: readonly QualityLevel[] = ['minimal', 'balanced', 'full'];

/** Reloj monótono con fallback si `performance` no está disponible. */
function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  // Fallback determinista-friendly; solo se usa en entornos sin `performance`.
  return new Date().getTime();
}

/**
 * Detecta las capacidades del dispositivo y deriva un presupuesto de
 * rendimiento razonable (FPS objetivo, resolución y calidad inicial).
 */
export function detectDeviceCapabilities(): DeviceCapabilities {
  const nav: ExtendedNavigator | undefined =
    typeof navigator !== 'undefined' ? (navigator as ExtendedNavigator) : undefined;

  const logicalCores: number =
    nav && typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;
  const deviceMemoryGb: number =
    nav && typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 4;

  let tier: DeviceTier;
  if (logicalCores <= 2 || deviceMemoryGb <= 2) {
    tier = 'low';
  } else if (logicalCores <= 4 || deviceMemoryGb <= 4) {
    tier = 'medium';
  } else {
    tier = 'high';
  }

  const budget: Record<DeviceTier, Omit<DeviceCapabilities, 'tier' | 'logicalCores' | 'deviceMemoryGb'>> = {
    low: { targetFps: 15, maxInputResolution: 256, initialQuality: 'minimal' },
    medium: { targetFps: 24, maxInputResolution: 368, initialQuality: 'balanced' },
    high: { targetFps: 30, maxInputResolution: 512, initialQuality: 'full' },
  };

  const b = budget[tier];
  return {
    tier,
    logicalCores,
    deviceMemoryGb,
    targetFps: b.targetFps,
    maxInputResolution: b.maxInputResolution,
    initialQuality: b.initialQuality,
  };
}

/**
 * Orquesta el bucle de detección en tiempo real aplicando throttling y
 * adaptación dinámica para no saturar el navegador.
 */
export class RealtimePerformanceOptimizer {
  private readonly config: OptimizerConfig;
  private readonly capabilities: DeviceCapabilities;
  private readonly samples: PerformanceSample[] = [];
  private readonly qualityListeners: Set<QualityChangeListener> = new Set();

  private callback: FrameCallback | null = null;
  private rafId: number | null = null;
  private running = false;
  private processing = false;

  private lastFrameTime = 0;
  private droppedFrames = 0;
  private currentTargetFps: number;
  private currentQuality: QualityLevel;
  private consecutiveSlow = 0;
  private consecutiveFast = 0;

  constructor(
    capabilities: DeviceCapabilities = detectDeviceCapabilities(),
    config: Partial<OptimizerConfig> = {},
  ) {
    this.capabilities = capabilities;
    this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
    this.currentTargetFps = Math.min(
      this.config.maxFps,
      Math.max(this.config.minFps, capabilities.targetFps),
    );
    this.currentQuality = capabilities.initialQuality;
  }

  /** Comienza el bucle de procesamiento con el callback de inferencia dado. */
  start(callback: FrameCallback): void {
    if (this.running) {
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      throw new Error(
        'RealtimePerformanceOptimizer requiere requestAnimationFrame (entorno browser).',
      );
    }
    this.callback = callback;
    this.running = true;
    this.lastFrameTime = now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Detiene el bucle y libera el frame agendado. */
  stop(): void {
    this.running = false;
    this.callback = null;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  /** Suscribe un listener a cambios de calidad/FPS (retorna función de baja). */
  onQualityChange(listener: QualityChangeListener): () => void {
    this.qualityListeners.add(listener);
    return () => {
      this.qualityListeners.delete(listener);
    };
  }

  /** Snapshot de métricas actuales, seguro de exponer a la UI. */
  getMetrics(): PerformanceMetrics {
    const count = this.samples.length;
    let sumFrame = 0;
    let sumInference = 0;
    for (const s of this.samples) {
      sumFrame += s.frameDurationMs;
      sumInference += s.inferenceDurationMs;
    }
    const averageFrameMs = count > 0 ? sumFrame / count : 0;
    const averageInferenceMs = count > 0 ? sumInference / count : 0;
    const fps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;

    return {
      fps: Math.round(fps * 10) / 10,
      averageFrameMs: Math.round(averageFrameMs * 100) / 100,
      averageInferenceMs: Math.round(averageInferenceMs * 100) / 100,
      droppedFrames: this.droppedFrames,
      quality: this.currentQuality,
      deviceTier: this.capabilities.tier,
      targetFps: this.currentTargetFps,
    };
  }

  private readonly loop = (): void => {
    if (!this.running) {
      return;
    }
    this.rafId = requestAnimationFrame(this.loop);

    const timestamp = now();
    const elapsed = timestamp - this.lastFrameTime;
    const targetInterval = 1000 / this.currentTargetFps;

    // Throttling: aún no toca procesar este frame.
    if (elapsed < targetInterval) {
      return;
    }

    // Anti-solapamiento: si la inferencia previa sigue corriendo, descartamos
    // el frame en lugar de acumular trabajo pendiente.
    if (this.processing) {
      this.droppedFrames += 1;
      return;
    }

    // Alineamos al ritmo objetivo sin acumular drift.
    this.lastFrameTime = timestamp - (elapsed % targetInterval);
    void this.processFrame(elapsed);
  };

  private async processFrame(deltaMs: number): Promise<void> {
    const cb = this.callback;
    if (cb === null) {
      return;
    }
    this.processing = true;
    const start = now();
    try {
      await cb(deltaMs, this.getMetrics());
    } finally {
      const inferenceDurationMs = now() - start;
      this.recordSample({ timestamp: start, frameDurationMs: deltaMs, inferenceDurationMs });
      this.adapt(inferenceDurationMs);
      this.processing = false;
    }
  }

  private recordSample(sample: PerformanceSample): void {
    this.samples.push(sample);
    while (this.samples.length > this.config.sampleWindow) {
      this.samples.shift();
    }
  }

  /**
   * Ajusta calidad y FPS objetivo según el costo real de inferencia,
   * exigiendo estabilidad (varios frames seguidos) antes de cambiar de nivel
   * para evitar oscilaciones.
   */
  private adapt(inferenceDurationMs: number): void {
    if (inferenceDurationMs > this.config.degradeThresholdMs) {
      this.consecutiveSlow += 1;
      this.consecutiveFast = 0;
    } else if (inferenceDurationMs < this.config.upgradeThresholdMs) {
      this.consecutiveFast += 1;
      this.consecutiveSlow = 0;
    } else {
      this.consecutiveSlow = 0;
      this.consecutiveFast = 0;
    }

    if (this.consecutiveSlow >= this.config.stabilityFrames) {
      this.consecutiveSlow = 0;
      this.degrade();
    } else if (this.consecutiveFast >= this.config.stabilityFrames) {
      this.consecutiveFast = 0;
      this.upgrade();
    }
  }

  private degrade(): void {
    const qualityIndex = QUALITY_ORDER.indexOf(this.currentQuality);
    let changed = false;

    if (qualityIndex > 0) {
      this.currentQuality = QUALITY_ORDER[qualityIndex - 1];
      changed = true;
    } else if (this.currentTargetFps > this.config.minFps) {
      this.currentTargetFps = Math.max(this.config.minFps, this.currentTargetFps - 3);
      changed = true;
    }

    if (changed) {
      this.emitQualityChange();
    }
  }

  private upgrade(): void {
    const qualityIndex = QUALITY_ORDER.indexOf(this.currentQuality);
    const ceilingFps = Math.min(this.config.maxFps, this.capabilities.targetFps);
    let changed = false;

    if (this.currentTargetFps < ceilingFps) {
      this.currentTargetFps = Math.min(ceilingFps, this.currentTargetFps + 3);
      changed = true;
    } else if (qualityIndex < QUALITY_ORDER.length - 1) {
      this.currentQuality = QUALITY_ORDER[qualityIndex + 1];
      changed = true;
    }

    if (changed) {
      this.emitQualityChange();
    }
  }

  private emitQualityChange(): void {
    for (const listener of this.qualityListeners) {
      listener(this.currentQuality, this.currentTargetFps);
    }
  }
}
