import type {
  MovementPhase,
  PoseFrame,
  RepetitionConfig,
  RepetitionCounts,
  RepetitionListener,
  RepetitionResult,
} from './types';

/**
 * Configuración por defecto pensada para una sentadilla evaluando el ángulo
 * de la rodilla (≈170° extendida, ≈70° en el fondo). Ajustar por ejercicio.
 */
export const DEFAULT_REPETITION_CONFIG: RepetitionConfig = {
  topAngleDeg: 160,
  bottomAngleDeg: 90,
  minDepthAngleDeg: 100,
  hysteresisDeg: 5,
  minConfidence: 0.5,
  minDurationMs: 800,
};

/**
 * Estado interno acumulado mientras transcurre una repetición en curso.
 */
interface ActiveRepState {
  /** Timestamp del frame en el que comenzó el descenso. */
  startTimestampMs: number;
  /** Ángulo mínimo (más profundo) observado durante la repetición. */
  deepestAngleDeg: number;
  /** Indica si el usuario llegó a cruzar el umbral de fondo. */
  reachedBottom: boolean;
}

/**
 * Detecta y cuenta repeticiones completas a partir de un flujo de frames de
 * postura, clasificándolas como correctas o incorrectas.
 *
 * El detector implementa una máquina de estados sobre el ángulo articular
 * objetivo:
 *   rest -> descending -> bottom -> ascending -> rest
 * Una repetición se cierra cuando el ángulo vuelve a la posición superior
 * (rest) tras haber pasado por el fondo. En ese momento se evalúan las reglas
 * de calidad (profundidad y tempo) para clasificarla.
 *
 * El diseño es puro/incremental: cada llamada a {@link processFrame} entrega
 * un frame y, si se completó una repetición, devuelve su resultado. Esto
 * permite consumirlo tanto en tiempo real (cámara) como en tests con datos
 * pregrabados.
 */
export class RepetitionCounterService {
  private readonly config: RepetitionConfig;
  private readonly listeners: Set<RepetitionListener> = new Set();

  private phase: MovementPhase = 'rest';
  private active: ActiveRepState | null = null;

  private totalCount = 0;
  private correctCount = 0;
  private incorrectCount = 0;

  public constructor(config: RepetitionConfig = DEFAULT_REPETITION_CONFIG) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Registra un listener que se invoca cada vez que se completa una repetición.
   * Devuelve una función para desuscribirse.
   */
  public onRepetition(listener: RepetitionListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Procesa un frame de postura. Devuelve el resultado de la repetición si el
   * frame provocó el cierre de una repetición completa; en caso contrario null.
   */
  public processFrame(frame: PoseFrame): RepetitionResult | null {
    // Ignorar frames poco confiables para no contar ruido de detección.
    if (frame.confidence < this.config.minConfidence) {
      return null;
    }

    const angle = frame.measurement.angleDeg;
    const { topAngleDeg, bottomAngleDeg, hysteresisDeg } = this.config;

    // Umbrales con histéresis para evitar rebotes alrededor de los límites.
    const enterDescending = topAngleDeg - hysteresisDeg;
    const enterBottom = bottomAngleDeg + hysteresisDeg;
    const backToTop = topAngleDeg - hysteresisDeg;

    switch (this.phase) {
      case 'rest': {
        // Comienza el descenso cuando el ángulo baja del umbral superior.
        if (angle < enterDescending) {
          this.active = {
            startTimestampMs: frame.timestampMs,
            deepestAngleDeg: angle,
            reachedBottom: false,
          };
          this.phase = 'descending';
          this.trackDepth(angle);
        }
        return null;
      }

      case 'descending': {
        this.trackDepth(angle);
        if (angle <= enterBottom) {
          this.markBottomReached();
          this.phase = 'bottom';
        }
        return null;
      }

      case 'bottom': {
        this.trackDepth(angle);
        // Empieza a subir: se aleja del fondo.
        if (angle > enterBottom) {
          this.phase = 'ascending';
        }
        return null;
      }

      case 'ascending': {
        this.trackDepth(angle);
        // Puede volver a bajar antes de completar: regresa a bottom.
        if (angle <= enterBottom) {
          this.phase = 'bottom';
          return null;
        }
        // Repetición completa: vuelve a la posición superior.
        if (angle >= backToTop) {
          return this.completeRepetition(frame.timestampMs);
        }
        return null;
      }

      default: {
        // Exhaustividad: todos los MovementPhase están cubiertos arriba.
        return null;
      }
    }
  }

  /**
   * Procesa una secuencia completa de frames y devuelve todas las repeticiones
   * detectadas en orden. Útil para análisis batch o tests.
   */
  public processFrames(frames: readonly PoseFrame[]): readonly RepetitionResult[] {
    const results: RepetitionResult[] = [];
    for (const frame of frames) {
      const result = this.processFrame(frame);
      if (result !== null) {
        results.push(result);
      }
    }
    return results;
  }

  /**
   * Devuelve el snapshot actual de conteos y fase.
   */
  public getCounts(): RepetitionCounts {
    return {
      total: this.totalCount,
      correct: this.correctCount,
      incorrect: this.incorrectCount,
      currentPhase: this.phase,
    };
  }

  /**
   * Reinicia el contador y la máquina de estados para una nueva sesión/serie.
   */
  public reset(): void {
    this.phase = 'rest';
    this.active = null;
    this.totalCount = 0;
    this.correctCount = 0;
    this.incorrectCount = 0;
  }

  private trackDepth(angle: number): void {
    if (this.active !== null && angle < this.active.deepestAngleDeg) {
      this.active.deepestAngleDeg = angle;
    }
  }

  private markBottomReached(): void {
    if (this.active !== null) {
      this.active.reachedBottom = true;
    }
  }

  private completeRepetition(endTimestampMs: number): RepetitionResult {
    // active nunca debería ser null aquí, pero se protege por seguridad de tipos.
    const active = this.active;
    this.phase = 'rest';
    this.active = null;

    if (active === null) {
      // Estado inconsistente: no se contabiliza.
      return {
        index: this.totalCount,
        quality: 'incorrect',
        deepestAngleDeg: Number.NaN,
        durationMs: 0,
        reasons: ['estado interno inconsistente'],
      };
    }

    const durationMs = endTimestampMs - active.startTimestampMs;
    const reasons: string[] = [];

    // Regla 1: profundidad. Debe cruzar el fondo y alcanzar la profundidad mínima.
    if (!active.reachedBottom || active.deepestAngleDeg > this.config.minDepthAngleDeg) {
      reasons.push('rango de movimiento insuficiente');
    }

    // Regla 2: tempo. Movimientos demasiado rápidos son técnica deficiente.
    if (durationMs < this.config.minDurationMs) {
      reasons.push('repetición demasiado rápida');
    }

    const quality = reasons.length === 0 ? 'correct' : 'incorrect';

    this.totalCount += 1;
    if (quality === 'correct') {
      this.correctCount += 1;
    } else {
      this.incorrectCount += 1;
    }

    const result: RepetitionResult = {
      index: this.totalCount,
      quality,
      deepestAngleDeg: active.deepestAngleDeg,
      durationMs,
      reasons,
    };

    this.emit(result);
    return result;
  }

  private emit(result: RepetitionResult): void {
    for (const listener of this.listeners) {
      listener(result);
    }
  }

  private validateConfig(config: RepetitionConfig): void {
    if (config.bottomAngleDeg >= config.topAngleDeg) {
      throw new Error('RepetitionConfig inválida: bottomAngleDeg debe ser menor que topAngleDeg');
    }
    if (config.minDepthAngleDeg > config.topAngleDeg || config.minDepthAngleDeg < config.bottomAngleDeg) {
      throw new Error('RepetitionConfig inválida: minDepthAngleDeg debe estar entre bottomAngleDeg y topAngleDeg');
    }
    if (config.hysteresisDeg < 0) {
      throw new Error('RepetitionConfig inválida: hysteresisDeg no puede ser negativo');
    }
    if (config.minConfidence < 0 || config.minConfidence > 1) {
      throw new Error('RepetitionConfig inválida: minConfidence debe estar en [0, 1]');
    }
    if (config.minDurationMs < 0) {
      throw new Error('RepetitionConfig inválida: minDurationMs no puede ser negativo');
    }
  }
}
