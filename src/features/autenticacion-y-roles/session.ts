// Gestión de sesión persistente y perfil básico (E1-T2)
// Épica: Autenticación y Roles
//
// Provee un store de sesión con persistencia en localStorage, tolerante a
// entornos sin `window` (SSR/tests), con suscripción reactiva para que la UI
// (p. ej. PerfilScreen) se actualice ante cambios de sesión o perfil.

/** Roles soportados por la plataforma de fisioterapia virtual. */
export type Rol = 'paciente' | 'fisioterapeuta';

/**
 * Perfil básico del usuario autenticado.
 * NOTA: idealmente vive en `src/shared/types/index.ts`; se define aquí porque
 * ese módulo aún no existe. Al centralizarlo, reexportar desde este archivo.
 */
export interface UsuarioPerfil {
  readonly id: string;
  nombre: string;
  email: string;
  readonly rol: Rol;
  /** URL opcional de avatar. */
  avatarUrl?: string;
}

/** Sesión persistida: perfil + credencial de acceso y su expiración. */
export interface Sesion {
  readonly usuario: UsuarioPerfil;
  readonly token: string;
  /** Epoch en milisegundos en que expira el token. */
  readonly expiraEn: number;
}

/** Listener notificado ante cada cambio del estado de sesión. */
export type SesionListener = (sesion: Sesion | null) => void;

const STORAGE_KEY = 'fv:sesion';

/** Acceso seguro a localStorage (puede no existir en SSR o estar bloqueado). */
function obtenerStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Valida que un valor deserializado tenga la forma de `Sesion`. */
function esSesionValida(valor: unknown): valor is Sesion {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const s = valor as Record<string, unknown>;
  if (typeof s.token !== 'string' || typeof s.expiraEn !== 'number') {
    return false;
  }
  const u = s.usuario as Record<string, unknown> | undefined;
  if (typeof u !== 'object' || u === null) {
    return false;
  }
  return (
    typeof u.id === 'string' &&
    typeof u.nombre === 'string' &&
    typeof u.email === 'string' &&
    (u.rol === 'paciente' || u.rol === 'fisioterapeuta')
  );
}

/** Indica si una sesión sigue vigente según su expiración. */
export function sesionVigente(sesion: Sesion | null, ahora: number = Date.now()): boolean {
  return sesion !== null && sesion.expiraEn > ahora;
}

/**
 * Store de sesión singleton. Mantiene el estado en memoria como fuente de
 * verdad y lo espeja en localStorage para persistir entre recargas.
 */
class SessionStore {
  private sesion: Sesion | null = null;
  private readonly listeners: Set<SesionListener> = new Set();
  private hidratado = false;

  /** Carga la sesión persistida (idempotente). Descarta datos corruptos o vencidos. */
  private hidratar(): void {
    if (this.hidratado) {
      return;
    }
    this.hidratado = true;

    const storage = obtenerStorage();
    if (storage === null) {
      return;
    }
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (esSesionValida(parsed) && sesionVigente(parsed)) {
        this.sesion = parsed;
      } else {
        storage.removeItem(STORAGE_KEY);
      }
    } catch {
      storage.removeItem(STORAGE_KEY);
    }
  }

  /** Devuelve la sesión activa, o `null` si no hay o expiró. */
  obtener(): Sesion | null {
    this.hidratar();
    if (!sesionVigente(this.sesion)) {
      this.limpiar();
      return null;
    }
    return this.sesion;
  }

  /** Perfil del usuario actual, o `null` si no hay sesión vigente. */
  obtenerUsuario(): UsuarioPerfil | null {
    return this.obtener()?.usuario ?? null;
  }

  /** Persiste una nueva sesión y notifica a los suscriptores. */
  guardar(sesion: Sesion): void {
    this.hidratar();
    this.sesion = sesion;
    const storage = obtenerStorage();
    if (storage !== null) {
      storage.setItem(STORAGE_KEY, JSON.stringify(sesion));
    }
    this.emitir();
  }

  /**
   * Actualiza campos editables del perfil (nombre, email, avatar) conservando
   * token, rol e id. Devuelve el perfil resultante o `null` si no hay sesión.
   */
  actualizarPerfil(cambios: Partial<Pick<UsuarioPerfil, 'nombre' | 'email' | 'avatarUrl'>>): UsuarioPerfil | null {
    const actual = this.obtener();
    if (actual === null) {
      return null;
    }
    const usuario: UsuarioPerfil = {
      ...actual.usuario,
      ...cambios,
    };
    this.guardar({ ...actual, usuario });
    return usuario;
  }

  /** Cierra la sesión: limpia memoria, storage y notifica. */
  limpiar(): void {
    const habiaSesion = this.sesion !== null;
    this.sesion = null;
    const storage = obtenerStorage();
    if (storage !== null) {
      storage.removeItem(STORAGE_KEY);
    }
    if (habiaSesion) {
      this.emitir();
    }
  }

  /**
   * Suscribe un listener a cambios de sesión. Se invoca inmediatamente con el
   * estado actual. Devuelve la función para desuscribir.
   */
  suscribir(listener: SesionListener): () => void {
    this.listeners.add(listener);
    listener(this.obtener());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitir(): void {
    const snapshot = this.sesion;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/** Instancia compartida de sesión para toda la aplicación. */
export const sessionStore = new SessionStore();
